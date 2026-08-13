import type { Transcription as TranscriptionDto } from '@vocali/contracts';
import { TranscriptionNotFoundError } from '../../domain/errors/domain-error.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import { err, ok } from '../../domain/shared/result.js';
import type { Result } from '../../domain/types/result.js';
import type { GetTranscriptionInput } from '../types/transcription-inputs.js';
import { toPublicTranscription } from './public-transcription.js';

export class GetTranscription {
  constructor(private readonly repository: TranscriptionRepository) {}

  async execute(
    input: GetTranscriptionInput,
  ): Promise<Result<TranscriptionDto, TranscriptionNotFoundError>> {
    const transcription = await this.repository.findById(input.userId, input.transcriptionId);
    if (transcription === null) {
      return err(new TranscriptionNotFoundError(input.transcriptionId));
    }

    return ok(toPublicTranscription(transcription.toPrimitives()));
  }
}
