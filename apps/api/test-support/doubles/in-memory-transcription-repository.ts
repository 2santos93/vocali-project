import type { Transcription } from '../../src/domain/entities/transcription.js';
import type {
  TranscriptionPrimitives,
  TranscriptionPage,
} from '../../src/domain/types/transcription.js';
import { Transcription as TranscriptionEntity } from '../../src/domain/entities/transcription.js';
import {
  ConcurrentModificationError,
  InvalidCursorError,
} from '../../src/domain/errors/domain-error.js';
import type { TranscriptionRepository } from '../../src/domain/ports/transcription-repository.js';
import { err, ok } from '../../src/domain/shared/result.js';
import type { Result } from '../../src/domain/types/result.js';

interface CursorPayload {
  readonly userId: string;
  readonly id: string;
}

type RepositoryMethod = 'save' | 'findById' | 'findByClientSession' | 'listByUser';

export class InMemoryTranscriptionRepository implements TranscriptionRepository {
  private readonly recordsByUser = new Map<string, Map<string, TranscriptionPrimitives>>();

  /** The `IDEM#<clientSessionId>` items, nested by user for the same reason. */
  private readonly claimsByUser = new Map<string, Map<string, string>>();

  /** Set to make the next call reject with this error; cleared after one use. */
  failNextWith?: Error | undefined;

  private readonly failOnMethod = new Map<RepositoryMethod, Error>();

  failOn(method: RepositoryMethod, error: Error): void {
    this.failOnMethod.set(method, error);
  }

  save(
    transcription: Transcription,
    options: { clientSessionId?: string | undefined } = {},
  ): Promise<Result<void, ConcurrentModificationError>> {
    const failure = this.consumeFailure('save');
    if (failure) return Promise.reject(failure);

    const primitives = transcription.toPrimitives();
    const userRecords =
      this.recordsByUser.get(primitives.userId) ?? new Map<string, TranscriptionPrimitives>();
    const stored = userRecords.get(primitives.id);

    if (stored !== undefined && stored.version !== primitives.version) {
      return Promise.resolve(err(new ConcurrentModificationError(primitives.id)));
    }

    const userClaims = this.claimsByUser.get(primitives.userId) ?? new Map<string, string>();
    if (options.clientSessionId !== undefined && userClaims.has(options.clientSessionId)) {
      return Promise.resolve(err(new ConcurrentModificationError(primitives.id)));
    }

    userRecords.set(primitives.id, { ...primitives, version: primitives.version + 1 });
    this.recordsByUser.set(primitives.userId, userRecords);

    if (options.clientSessionId !== undefined) {
      userClaims.set(options.clientSessionId, primitives.id);
      this.claimsByUser.set(primitives.userId, userClaims);
    }

    return Promise.resolve(ok(undefined));
  }

  findById(userId: string, transcriptionId: string): Promise<Transcription | null> {
    const failure = this.consumeFailure('findById');
    if (failure) return Promise.reject(failure);

    const found = this.recordsByUser.get(userId)?.get(transcriptionId);
    return Promise.resolve(found ? TranscriptionEntity.fromPrimitives(found) : null);
  }

  findByClientSession(userId: string, clientSessionId: string): Promise<Transcription | null> {
    const failure = this.consumeFailure('findByClientSession');
    if (failure) return Promise.reject(failure);

    const claimedId = this.claimsByUser.get(userId)?.get(clientSessionId);
    if (claimedId === undefined) return Promise.resolve(null);

    const found = this.recordsByUser.get(userId)?.get(claimedId);
    return Promise.resolve(found ? TranscriptionEntity.fromPrimitives(found) : null);
  }

  listByUser(input: {
    userId: string;
    limit: number;
    cursor: string | null;
  }): Promise<Result<TranscriptionPage, InvalidCursorError>> {
    const failure = this.consumeFailure('listByUser');
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

  private consumeFailure(method: RepositoryMethod): Error | undefined {
    const scoped = this.failOnMethod.get(method);
    if (scoped) {
      this.failOnMethod.delete(method);
      return scoped;
    }

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
