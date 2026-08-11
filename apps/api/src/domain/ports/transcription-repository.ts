import type { Transcription, TranscriptionPrimitives } from '../entities/transcription.js';
import type { InvalidCursorError } from '../errors/domain-error.js';
import type { Result } from '../shared/result.js';

export interface TranscriptionPage {
  readonly items: readonly TranscriptionPrimitives[];
  readonly nextCursor: string | null;
}

export interface TranscriptionRepository {
  save(transcription: Transcription): Promise<void>;
  findById(userId: string, transcriptionId: string): Promise<Transcription | null>;
  findByExternalJobId(externalJobId: string): Promise<Transcription | null>;
  listByUser(input: {
    userId: string;
    limit: number;
    cursor: string | null;
  }): Promise<Result<TranscriptionPage, InvalidCursorError>>;
}
