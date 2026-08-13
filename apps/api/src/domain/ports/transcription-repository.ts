import type { Transcription } from '../entities/transcription.js';
import type { ConcurrentModificationError, InvalidCursorError } from '../errors/domain-error.js';
import type { Result } from '../types/result.js';
import type { TranscriptionPage } from '../types/transcription.js';

export interface TranscriptionRepository {
  /**
   * Conditional on the store still holding the version the entity was read at;
   * a record that does not exist yet is inserted. Three paths write to the same
   * record — the S3 event, the completion callback, the failure callback — so an
   * unconditional write lets a stale `PROCESSING` entity land on top of a
   * `COMPLETED` one and strand a finished transcript nothing points at.
   *
   * `clientSessionId` claims that key in the same write, and only if no other
   * record holds it, so a retried dictation becomes one record rather than two.
   */
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
