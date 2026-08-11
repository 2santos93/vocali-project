import { TranscriptionNotFoundError } from '../../domain/errors/domain-error.js';
import type { InvalidStatusTransitionError } from '../../domain/errors/domain-error.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { FileStorage } from '../../domain/ports/file-storage.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { TranscriptionProvider } from '../../domain/ports/transcription-provider.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import { canTransition } from '../../domain/value-objects/transcription-status.js';

/** The provider needs long enough to fetch the audio, but no longer than necessary. */
const AUDIO_READ_URL_TTL_SECONDS = 3_600;

interface StartFileTranscriptionInput {
  readonly audioObjectKey: string;
}

interface StartFileTranscriptionConfig {
  /** Base webhook URL; the transcription identity is appended as query parameters per job. */
  readonly callbackBaseUrl: string;
}

type StartFileTranscriptionError = TranscriptionNotFoundError | InvalidStatusTransitionError;

/** Object keys follow `audio/{userId}/{transcriptionId}/{fileName}`. */
export function parseAudioObjectKey(
  objectKey: string,
): { userId: string; transcriptionId: string } | null {
  const segments = objectKey.split('/');
  const [prefix, userId, transcriptionId] = segments;

  if (prefix !== 'audio' || userId === undefined || transcriptionId === undefined) {
    return null;
  }

  return { userId, transcriptionId };
}

/**
 * Appends the transcription's identity to the callback URL as query
 * parameters, so the webhook can be resolved by primary key even if the
 * `externalJobId` was never persisted (for example, a provider job that
 * submitted successfully but whose `PROCESSING` save then failed). A
 * strongly consistent `(userId, transcriptionId)` lookup also sidesteps the
 * eventual consistency of the `externalJobId` secondary index.
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
 * Submits an uploaded file to the transcription provider once S3 confirms the
 * object exists.
 *
 * S3 delivers upload events at least once, so a redelivered event for a
 * transcription that has already moved past `PENDING_UPLOAD` is not a
 * failure: it is logged and acknowledged with `ok` so Lambda does not retry
 * it, storage and the provider are never contacted, and no duplicate job
 * consumes provider quota.
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
      language: primitives.language,
      callbackUrl: buildProviderCallbackUrl(this.config.callbackBaseUrl, {
        userId: primitives.userId,
        transcriptionId: primitives.id,
      }),
    });

    const transition = transcription.markAsProcessing(job.externalJobId, this.clock.now());
    if (!transition.success) {
      // Unreachable in practice: the transition was already validated above
      // and nothing else mutates this transcription in between, but the
      // entity still models the outcome as a Result, so this branch is
      // honored rather than assumed away.
      return err(transition.error);
    }

    await this.repository.save(transcription);

    return ok(undefined);
  }
}
