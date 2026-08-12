import type { Transcription, TranscriptionPrimitives } from '../entities/transcription.js';
import type { ConcurrentModificationError, InvalidCursorError } from '../errors/domain-error.js';
import type { Result } from '../shared/result.js';

export interface TranscriptionPage {
  readonly items: readonly TranscriptionPrimitives[];
  readonly nextCursor: string | null;
}

export interface TranscriptionRepository {
  /**
   * Writes the record, conditional on the store still holding the version the
   * entity was read at. A record that does not exist yet is inserted.
   *
   * The condition is the whole point: three paths write to the same record —
   * the S3 event that starts a job, the provider callback that finishes it,
   * and the callback that fails it — and each holds an entity read before the
   * others wrote. An unconditional write lets a `PROCESSING` entity read a
   * moment too early land on top of a `COMPLETED` record, stranding a finished
   * transcript in storage that nothing points at any more.
   */
  /**
   * `clientSessionId` claims that key for this record in the same write, and
   * only if no other record already holds it. A second save carrying a key
   * already claimed loses, exactly as a stale revision does, which is how a
   * retried dictation ends up as one record rather than two.
   */
  save(
    transcription: Transcription,
    options?: { clientSessionId?: string | undefined },
  ): Promise<Result<void, ConcurrentModificationError>>;
  findById(userId: string, transcriptionId: string): Promise<Transcription | null>;
  /** The record that claimed this key, or null if none has. */
  findByClientSession(userId: string, clientSessionId: string): Promise<Transcription | null>;
  listByUser(input: {
    userId: string;
    limit: number;
    cursor: string | null;
  }): Promise<Result<TranscriptionPage, InvalidCursorError>>;
}
