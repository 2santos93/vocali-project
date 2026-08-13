import { TranscriptionNotFoundError } from '../../domain/errors/domain-error.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import { err, ok } from '../../domain/shared/result.js';
import type { Result } from '../../domain/types/result.js';
import { canTransition } from '../../domain/value-objects/transcription-status.js';
import type { FailTranscriptionError } from '../types/transcription-errors.js';
import type { FailTranscriptionInput } from '../types/transcription-inputs.js';

/**
 * Looked up by primary key for the same reason as `CompleteTranscription`: the
 * callback URL carries `(userId, transcriptionId)`, so no eventually
 * consistent secondary index is involved.
 */
export class FailTranscription {
  constructor(
    private readonly repository: TranscriptionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: FailTranscriptionInput): Promise<Result<void, FailTranscriptionError>> {
    const transcription = await this.repository.findById(input.userId, input.transcriptionId);
    if (transcription === null) {
      return err(new TranscriptionNotFoundError(input.transcriptionId));
    }

    const primitives = transcription.toPrimitives();

    if (primitives.externalJobId !== null && primitives.externalJobId !== input.externalJobId) {
      return err(new TranscriptionNotFoundError(input.transcriptionId));
    }

    // COMPLETED is terminal and FAILED has no self-loop, so a late failure for
    // work that already succeeded and a redelivered failure webhook are both
    // acknowledged without mutating anything.
    if (!canTransition(primitives.status, 'FAILED')) {
      return ok(undefined);
    }

    const transition = transcription.markAsFailed(input.reason, this.clock.now());
    if (!transition.success) {
      // Unreachable: `canTransition` was checked immediately above. Kept out of
      // the error union and thrown, because an invariant violation is not an
      // outcome a caller can handle.
      throw new Error(
        `Invariant violated: transcription ${primitives.id} could not transition from ${primitives.status} to FAILED (${transition.error.message})`,
      );
    }

    // A lost race is deliberately not branched on: another writer advanced the
    // record between the read and this write, so what this webhook would have
    // applied is already applied or superseded.
    await this.repository.save(transcription);

    return ok(undefined);
  }
}
