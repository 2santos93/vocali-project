import { TranscriptionNotFoundError } from '../../domain/errors/domain-error.js';
import type { InvalidStatusTransitionError } from '../../domain/errors/domain-error.js';
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

type FailTranscriptionError = TranscriptionNotFoundError | InvalidStatusTransitionError;

/**
 * Applies a provider failure webhook.
 *
 * Looked up by primary key for the same reason as `CompleteTranscription`:
 * the callback URL carries `(userId, transcriptionId)`, and a strongly
 * consistent primary-key read is both faster and immune to the job-id
 * secondary index's eventual consistency.
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
      // Unreachable in practice: the transition was already validated above.
      return err(transition.error);
    }

    await this.repository.save(transcription);

    return ok(undefined);
  }
}
