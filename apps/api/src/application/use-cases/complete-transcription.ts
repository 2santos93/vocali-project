import {
  InvalidStatusTransitionError,
  TranscriptionNotFoundError,
} from '../../domain/errors/domain-error.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { FileStorage } from '../../domain/ports/file-storage.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import { canTransition } from '../../domain/value-objects/transcription-status.js';
import { buildTranscriptObjectKey } from './object-keys.js';

interface CompleteTranscriptionInput {
  readonly userId: string;
  readonly transcriptionId: string;
  readonly externalJobId: string;
  readonly text: string;
  readonly durationSeconds: number;
}

type CompleteTranscriptionError = TranscriptionNotFoundError | InvalidStatusTransitionError;

/**
 * Applies a provider completion webhook.
 *
 * The record is looked up by primary key `(userId, transcriptionId)` — both
 * carried in the callback URL — rather than by `externalJobId`. That is why no
 * secondary index on `externalJobId` exists: such an index would be eventually
 * consistent, so a fast webhook could miss a record that had already been
 * written.
 *
 * It also recovers the case where the provider accepted a job but the save
 * that would have recorded its id failed. That record is still
 * `PENDING_UPLOAD` with no `externalJobId`, so a lookup by job id alone would
 * never find it.
 */
export class CompleteTranscription {
  constructor(
    private readonly repository: TranscriptionRepository,
    private readonly storage: FileStorage,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: CompleteTranscriptionInput,
  ): Promise<Result<void, CompleteTranscriptionError>> {
    const transcription = await this.repository.findById(input.userId, input.transcriptionId);
    if (transcription === null) {
      return err(new TranscriptionNotFoundError(input.transcriptionId));
    }

    const primitives = transcription.toPrimitives();

    // Defence in depth, not the primary control: the handler verifies the
    // provider's shared secret in constant time before this runs. This check
    // only rejects a callback whose job id contradicts one already on record,
    // and is necessarily void while `externalJobId` is null — which is every
    // PENDING_UPLOAD record, the case the repair branch below exists to serve.
    // Reported as not found rather than a distinct error, so the response
    // cannot be used to probe for records.
    if (primitives.externalJobId !== null && primitives.externalJobId !== input.externalJobId) {
      return err(new TranscriptionNotFoundError(input.transcriptionId));
    }

    // A redelivered webhook for a job already completed with the same id: the
    // provider only needs a 2xx to stop retrying, and there is nothing left
    // to change. Handled before touching storage so a stray redelivery can
    // never overwrite a good transcript.
    if (primitives.status === 'COMPLETED') {
      return ok(undefined);
    }

    if (primitives.status === 'PENDING_UPLOAD') {
      // Orphan repair: the provider accepted the job, but the save that
      // would have recorded PROCESSING and the job id failed. Recording it
      // now, through the normal transition, closes that gap without any
      // change to the state machine.
      const recovered = transcription.markAsProcessing(input.externalJobId, this.clock.now());
      if (!recovered.success) {
        // Unreachable: PENDING_UPLOAD always permits PROCESSING. An invariant
        // violation, not a caller's problem, so it throws — see
        // `StartFileTranscription` for the full reasoning.
        throw new Error(
          `Invariant violated: transcription ${input.transcriptionId} could not transition from PENDING_UPLOAD to PROCESSING (${recovered.error.message})`,
        );
      }
    }

    const currentStatus = transcription.toPrimitives().status;
    if (!canTransition(currentStatus, 'COMPLETED')) {
      return err(new InvalidStatusTransitionError(currentStatus, 'COMPLETED'));
    }

    const transcriptObjectKey = buildTranscriptObjectKey(
      input.userId,
      input.transcriptionId,
      'txt',
    );
    const jsonObjectKey = buildTranscriptObjectKey(input.userId, input.transcriptionId, 'json');

    await this.storage.putText({
      objectKey: transcriptObjectKey,
      body: input.text,
      contentType: 'text/plain',
    });
    await this.storage.putText({
      objectKey: jsonObjectKey,
      body: JSON.stringify({ text: input.text, durationSeconds: input.durationSeconds }),
      contentType: 'application/json',
    });

    const transition = transcription.markAsCompleted({
      transcriptObjectKey,
      text: input.text,
      durationSeconds: input.durationSeconds,
      at: this.clock.now(),
    });
    if (!transition.success) {
      // Unreachable: `canTransition` was checked immediately above. Throws for
      // the same reason as the recovery branch. The error union keeps
      // `InvalidStatusTransitionError` because that one *is* reachable, from
      // the explicit check above, which a corrupted stored status can trigger.
      throw new Error(
        `Invariant violated: transcription ${input.transcriptionId} could not transition from ${currentStatus} to COMPLETED (${transition.error.message})`,
      );
    }

    await this.repository.save(transcription);

    return ok(undefined);
  }
}
