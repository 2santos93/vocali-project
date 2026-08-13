import { TranscriptionNotFoundError } from '../../domain/errors/domain-error.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { FileStorage } from '../../domain/ports/file-storage.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { TranscriptionProvider } from '../../domain/ports/transcription-provider.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import { err, ok } from '../../domain/shared/result.js';
import type { Result } from '../../domain/types/result.js';
import { canTransition } from '../../domain/value-objects/transcription-status.js';
import { AUDIO_READ_URL_TTL_SECONDS } from '../constants.js';
import type {
  StartFileTranscriptionConfig,
  StartFileTranscriptionInput,
} from '../types/transcription-inputs.js';
import type { StartFileTranscriptionError } from '../types/transcription-errors.js';
import { parseAudioObjectKey } from './object-keys.js';

export function buildProviderCallbackUrl(
  baseUrl: string,
  identity: { userId: string; transcriptionId: string },
): string {
  const url = new URL(baseUrl);
  url.searchParams.set('transcriptionId', identity.transcriptionId);
  url.searchParams.set('userId', identity.userId);
  return url.toString();
}

export class StartFileTranscription {
  constructor(
    private readonly repository: TranscriptionRepository,
    private readonly storage: FileStorage,
    private readonly provider: TranscriptionProvider,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly config: StartFileTranscriptionConfig,
  ) {}

  async execute(
    input: StartFileTranscriptionInput,
  ): Promise<Result<void, StartFileTranscriptionError>> {
    const location = parseAudioObjectKey(input.audioObjectKey);
    if (location === null) {
      return err(new TranscriptionNotFoundError(input.audioObjectKey));
    }

    const transcription = await this.repository.findById(location.userId, location.transcriptionId);
    if (transcription === null) {
      return err(new TranscriptionNotFoundError(location.transcriptionId));
    }

    const primitives = transcription.toPrimitives();

    if (primitives.audioObjectKey !== input.audioObjectKey) {
      return err(new TranscriptionNotFoundError(input.audioObjectKey));
    }

    if (!canTransition(primitives.status, 'PROCESSING')) {
      this.logger.info('Ignoring duplicate transcription start event', {
        transcriptionId: primitives.id,
        status: primitives.status,
      });
      return ok(undefined);
    }

    const audioUrl = await this.storage.createPresignedRead({
      objectKey: input.audioObjectKey,
      expiresInSeconds: AUDIO_READ_URL_TTL_SECONDS,
    });

    const job = await this.provider.submitFileJob({
      audioUrl,
      callbackUrl: buildProviderCallbackUrl(this.config.callbackBaseUrl, {
        userId: primitives.userId,
        transcriptionId: primitives.id,
      }),
    });

    const transition = transcription.markAsProcessing(job.externalJobId, this.clock.now());
    if (!transition.success) {
      throw new Error(
        `Invariant violated: transcription ${primitives.id} could not transition from ${primitives.status} to PROCESSING (${transition.error.message})`,
      );
    }

    await this.repository.save(transcription);

    return ok(undefined);
  }
}
