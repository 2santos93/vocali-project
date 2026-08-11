import { TranscriptionNotFoundError } from '../../domain/errors/domain-error.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import { canTransition } from '../../domain/value-objects/transcription-status.js';

interface FailTranscriptionInput {
  readonly userId: string;
  readonly transcriptionId: string;
  readonly externalJobId: string;
  readonly reason: string;
}

type FailTranscriptionError = TranscriptionNotFoundError;

/**
 * Applies a provider failure webhook.
 *
 * Looked up by primary key for the same reason as `CompleteTranscription`:
 * the callback URL carries `(userId, transcriptionId)`, so no secondary
 * index is involved and the read is strongly consistent.
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

    // COMPLETED is terminal and FAILED has no self-loop, so this covers a
    // late failure signal for work that already succeeded and a redelivered
    // failure webhook for work already marked failed — both are
    // acknowledged without mutating anything, the same idempotency rule
    // already applied to duplicate S3 events and completion webhooks.
    if (!canTransition(primitives.status, 'FAILED')) {
      return ok(undefined);
    }

    const transition = transcription.markAsFailed(input.reason, this.clock.now());
    if (!transition.success) {
      // Unreachable: `canTransition` was checked immediately above and nothing
      // mutates this transcription in between. Since no reachable path
      // produces it, it is not part of this use case's error union — a failure
      // here is an invariant violation, not an outcome a caller must handle,
      // so it throws rather than returning err. Same reasoning, and the same
      // shape, as `StartFileTranscription`.
      throw new Error(
        `Invariant violated: transcription ${primitives.id} could not transition from ${primitives.status} to FAILED (${transition.error.message})`,
      );
    }

    await this.repository.save(transcription);

    return ok(undefined);
  }
}
