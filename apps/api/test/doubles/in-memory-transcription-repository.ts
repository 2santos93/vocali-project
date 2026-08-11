import type {
  Transcription,
  TranscriptionPrimitives,
} from '../../src/domain/entities/transcription.js';
import { Transcription as TranscriptionEntity } from '../../src/domain/entities/transcription.js';
import { InvalidCursorError } from '../../src/domain/errors/domain-error.js';
import type {
  TranscriptionPage,
  TranscriptionRepository,
} from '../../src/domain/ports/transcription-repository.js';
import { err, ok, type Result } from '../../src/domain/shared/result.js';

interface CursorPayload {
  readonly userId: string;
  readonly id: string;
}

/**
 * Mirrors the ordering and cursor semantics of the DynamoDB adapter: newest
 * first by sort key, and a cursor that encodes the last returned key (like
 * DynamoDB's `LastEvaluatedKey`) rather than an array offset. As a result:
 * - a record inserted between two pages cannot shift or repeat items,
 * - a malformed cursor or one minted for a different user never yields a
 *   silent empty page: `listByUser` returns `err(InvalidCursorError)`, since
 *   an attacker-controlled cursor is an expected failure the caller must
 *   handle — not an exception. `failNextWith`, by contrast, still throws:
 *   it models infrastructure blowing up, a genuinely unexpected condition.
 *
 * `nextCursor` is null only when there is genuinely nothing left to page
 * through, even when the current page holds exactly `limit` items. DynamoDB
 * returns a `LastEvaluatedKey` whenever it stops because it hit `Limit`,
 * regardless of whether more items actually follow, so the Phase 2 DynamoDB
 * adapter is responsible for normalising to this contract — e.g. by
 * confirming a following item exists before returning a cursor.
 */
export class InMemoryTranscriptionRepository implements TranscriptionRepository {
  private readonly recordsByUser = new Map<string, Map<string, TranscriptionPrimitives>>();

  /** Set to make the next call reject with this error; cleared after one use. */
  failNextWith?: Error | undefined;

  save(transcription: Transcription): Promise<void> {
    const failure = this.consumeFailure();
    if (failure) return Promise.reject(failure);

    const primitives = transcription.toPrimitives();
    const userRecords =
      this.recordsByUser.get(primitives.userId) ?? new Map<string, TranscriptionPrimitives>();
    userRecords.set(primitives.id, primitives);
    this.recordsByUser.set(primitives.userId, userRecords);
    return Promise.resolve();
  }

  findById(userId: string, transcriptionId: string): Promise<Transcription | null> {
    const failure = this.consumeFailure();
    if (failure) return Promise.reject(failure);

    const found = this.recordsByUser.get(userId)?.get(transcriptionId);
    return Promise.resolve(found ? TranscriptionEntity.fromPrimitives(found) : null);
  }

  findByExternalJobId(externalJobId: string): Promise<Transcription | null> {
    const failure = this.consumeFailure();
    if (failure) return Promise.reject(failure);

    for (const userRecords of this.recordsByUser.values()) {
      for (const record of userRecords.values()) {
        if (record.externalJobId === externalJobId) {
          return Promise.resolve(TranscriptionEntity.fromPrimitives(record));
        }
      }
    }
    return Promise.resolve(null);
  }

  listByUser(input: {
    userId: string;
    limit: number;
    cursor: string | null;
  }): Promise<Result<TranscriptionPage, InvalidCursorError>> {
    const failure = this.consumeFailure();
    if (failure) return Promise.reject(failure);

    const ordered = [...(this.recordsByUser.get(input.userId)?.values() ?? [])].sort(
      (left, right) => right.id.localeCompare(left.id),
    );

    let remaining = ordered;
    if (input.cursor !== null) {
      const decoded = decodeCursor(input.cursor);
      if (!decoded.success) return Promise.resolve(decoded);
      if (decoded.value.userId !== input.userId) {
        return Promise.resolve(
          err(new InvalidCursorError('cursor was not issued for the requesting user')),
        );
      }
      const cursor = decoded.value;
      remaining = ordered.filter((record) => record.id.localeCompare(cursor.id) < 0);
    }

    const items = remaining.slice(0, input.limit);
    const lastItem = items[items.length - 1];
    const nextCursor =
      remaining.length > items.length && lastItem !== undefined
        ? encodeCursor({ userId: input.userId, id: lastItem.id })
        : null;

    return Promise.resolve(ok({ items, nextCursor }));
  }

  private consumeFailure(): Error | undefined {
    const failure = this.failNextWith;
    this.failNextWith = undefined;
    return failure;
  }
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): Result<CursorPayload, InvalidCursorError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return err(new InvalidCursorError('cursor is not valid base64url-encoded JSON'));
  }

  if (!isCursorPayload(parsed)) {
    return err(new InvalidCursorError('cursor payload is missing userId or id'));
  }

  return ok(parsed);
}

function isCursorPayload(value: unknown): value is CursorPayload {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.userId === 'string' && typeof record.id === 'string';
}
