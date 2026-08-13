import { TranscriptionNotFoundError } from '../../domain/errors/domain-error.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import { err, ok } from '../../domain/shared/result.js';
import type { Result } from '../../domain/types/result.js';
import { canTransition } from '../../domain/value-objects/transcription-status.js';
import type { FailTranscriptionError } from '../types/transcription-errors.js';
import type { FailTranscriptionInput } from '../types/transcription-inputs.js';

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

    if (!canTransition(primitives.status, 'FAILED')) {
      return ok(undefined);
    }

    const transition = transcription.markAsFailed(input.reason, this.clock.now());
    if (!transition.success) {
      throw new Error(
        `Invariant violated: transcription ${primitives.id} could not transition from ${primitives.status} to FAILED (${transition.error.message})`,
      );
    }

    await this.repository.save(transcription);

    return ok(undefined);
  }
}
