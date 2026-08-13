import {
  InvalidStatusTransitionError,
  TranscriptionNotFoundError,
} from '../../domain/errors/domain-error.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { FileStorage } from '../../domain/ports/file-storage.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import { err, ok } from '../../domain/shared/result.js';
import type { Result } from '../../domain/types/result.js';
import { canTransition } from '../../domain/value-objects/transcription-status.js';
import type { CompleteTranscriptionError } from '../types/transcription-errors.js';
import type { CompleteTranscriptionInput } from '../types/transcription-inputs.js';
import { buildTranscriptObjectKey } from './object-keys.js';

/**
 * Looked up by primary key `(userId, transcriptionId)`, both carried in the
 * callback URL, rather than by `externalJobId`. A secondary index would be
 * eventually consistent, so a fast webhook could miss a record already written
 * — and a job accepted by the provider whose save then failed has no
 * `externalJobId` to find it by at all.
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

    // Defence in depth; the handler verifies the shared secret before this
    // runs. Reported as not found rather than a distinct error, so the
    // response cannot be used to probe for records.
    if (primitives.externalJobId !== null && primitives.externalJobId !== input.externalJobId) {
      return err(new TranscriptionNotFoundError(input.transcriptionId));
    }

    // A redelivery only needs a 2xx to stop. Answered before touching storage
    // so it can never overwrite a good transcript.
    if (primitives.status === 'COMPLETED') {
      return ok(undefined);
    }

    if (primitives.status === 'PENDING_UPLOAD') {
      // Orphan repair: the provider accepted the job, but the save that would
      // have recorded PROCESSING and the job id failed.
      const recovered = transcription.markAsProcessing(input.externalJobId, this.clock.now());
      if (!recovered.success) {
        // Unreachable: PENDING_UPLOAD always permits PROCESSING. An invariant
        // violation, not a caller's problem, so it throws rather than
        // returning an error the caller would have to pretend to handle.
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
      language: input.language,
      at: this.clock.now(),
    });
    if (!transition.success) {
      // Unreachable: `canTransition` was checked immediately above, so this
      // throws for the same reason as the recovery branch. The error union
      // still carries `InvalidStatusTransitionError` because the explicit
      // check above *is* reachable, from a corrupted stored status.
      throw new Error(
        `Invariant violated: transcription ${input.transcriptionId} could not transition from ${currentStatus} to COMPLETED (${transition.error.message})`,
      );
    }

    // A lost race is deliberately not branched on: another writer advanced the
    // record between the read and this write, so what this webhook would have
    // applied is already applied or superseded, and the sender only needs a
    // success to stop retrying.
    await this.repository.save(transcription);

    return ok(undefined);
  }
}
