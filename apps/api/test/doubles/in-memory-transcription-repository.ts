import type {
  Transcription,
  TranscriptionPrimitives,
} from '../../src/domain/entities/transcription.js';
import { Transcription as TranscriptionEntity } from '../../src/domain/entities/transcription.js';
import type {
  TranscriptionPage,
  TranscriptionRepository,
} from '../../src/domain/ports/transcription-repository.js';

/**
 * Mirrors the ordering and cursor semantics of the DynamoDB adapter: newest
 * first by sort key, and an opaque pagination cursor the caller cannot
 * interpret. Use cases tested against this double behave the same in
 * production.
 */
export class InMemoryTranscriptionRepository implements TranscriptionRepository {
  private readonly records = new Map<string, TranscriptionPrimitives>();

  save(transcription: Transcription): Promise<void> {
    const primitives = transcription.toPrimitives();
    this.records.set(`${primitives.userId}#${primitives.id}`, primitives);
    return Promise.resolve();
  }

  findById(userId: string, transcriptionId: string): Promise<Transcription | null> {
    const found = this.records.get(`${userId}#${transcriptionId}`);
    return Promise.resolve(found ? TranscriptionEntity.fromPrimitives(found) : null);
  }

  findByExternalJobId(externalJobId: string): Promise<Transcription | null> {
    const found = [...this.records.values()].find(
      (record) => record.externalJobId === externalJobId,
    );
    return Promise.resolve(found ? TranscriptionEntity.fromPrimitives(found) : null);
  }

  listByUser(input: {
    userId: string;
    limit: number;
    cursor: string | null;
  }): Promise<TranscriptionPage> {
    const ordered = [...this.records.values()]
      .filter((record) => record.userId === input.userId)
      .sort((left, right) => right.id.localeCompare(left.id));

    const startIndex = input.cursor === null ? 0 : Number.parseInt(decodeCursor(input.cursor), 10);
    const items = ordered.slice(startIndex, startIndex + input.limit);
    const nextIndex = startIndex + items.length;
    const nextCursor = nextIndex < ordered.length ? encodeCursor(String(nextIndex)) : null;

    return Promise.resolve({ items, nextCursor });
  }
}

function encodeCursor(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64url').toString('utf8');
}
