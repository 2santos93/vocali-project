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
import type { StartFileTranscriptionConfig } from '../types/start-file-transcription-config.js';
import type { StartFileTranscriptionError } from '../types/start-file-transcription-error.js';
import type { StartFileTranscriptionInput } from '../types/start-file-transcription-input.js';
import { parseAudioObjectKey } from './object-keys.js';

/**
 * The identity travels in the callback URL so the webhook resolves by primary
 * key even when `externalJobId` was never persisted — a job that submitted
 * successfully but whose `PROCESSING` save then failed. This is what removes
 * the need for a secondary index on `externalJobId`.
 */
export function buildProviderCallbackUrl(
  baseUrl: string,
  identity: { userId: string; transcriptionId: string },
): string {
  const url = new URL(baseUrl);
  url.searchParams.set('transcriptionId', identity.transcriptionId);
  url.searchParams.set('userId', identity.userId);
  return url.toString();
}

/**
 * S3 delivers upload events at least once, so a redelivery for a transcription
 * already past `PENDING_UPLOAD` is acknowledged with `ok` rather than failed:
 * Lambda does not retry it, and no duplicate job consumes provider quota.
 */
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

    // The key resolves a record by its `{userId}/{transcriptionId}` segments
    // alone, so without an exact match any object parked under that prefix —
    // same ids, different file name — is transcribed into this user's record.
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
      // Unreachable: the transition was validated above and nothing mutates
      // this transcription in between. Deliberately absent from the error
      // union — an invariant violation is not an outcome a caller can handle,
      // and an `err` here would make every caller pretend otherwise.
      throw new Error(
        `Invariant violated: transcription ${primitives.id} could not transition from ${primitives.status} to PROCESSING (${transition.error.message})`,
      );
    }

    // A lost race is deliberately not branched on: another writer advanced the
    // record between the read and this write, so what this notification would
    // have applied is already applied or superseded, and S3 only needs a
    // success to stop retrying.
    await this.repository.save(transcription);

    return ok(undefined);
  }
}
