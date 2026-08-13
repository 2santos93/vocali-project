import type { Transcription } from '../entities/transcription.js';
import type { ConcurrentModificationError, InvalidCursorError } from '../errors/domain-error.js';
import type { Result } from '../types/result.js';
import type { TranscriptionPage } from '../types/transcription.js';

export interface TranscriptionRepository {
  save(
    transcription: Transcription,
    options?: { clientSessionId?: string | undefined },
  ): Promise<Result<void, ConcurrentModificationError>>;
  findById(userId: string, transcriptionId: string): Promise<Transcription | null>;
  findByClientSession(userId: string, clientSessionId: string): Promise<Transcription | null>;
  listByUser(input: {
    userId: string;
    limit: number;
    cursor: string | null;
  }): Promise<Result<TranscriptionPage, InvalidCursorError>>;
}
