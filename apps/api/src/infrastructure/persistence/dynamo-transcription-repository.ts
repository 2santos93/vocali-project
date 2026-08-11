import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { Transcription } from '../../domain/entities/transcription.js';
import { InvalidCursorError } from '../../domain/errors/domain-error.js';
import type {
  TranscriptionPage,
  TranscriptionRepository,
} from '../../domain/ports/transcription-repository.js';
import { err, ok, type Result } from '../../domain/shared/result.js';
import {
  buildPartitionKey,
  buildTranscriptionSortKey,
  toTranscriptionItem,
  toTranscriptionPrimitives,
  TRANSCRIPTION_SORT_KEY_PREFIX,
} from './transcription.mapper.js';

interface CursorPayload {
  readonly userId: string;
  readonly id: string;
}

/**
 * A single table keyed `PK = USER#<userId>`, `SK = TRANS#<id>`, with no
 * secondary index and no `Scan`. Ruling R13 removed the only query that
 * wanted one: the provider callback now carries the record's identity, so
 * the webhook resolves by primary key.
 *
 * Ids are ULIDs, so sort-key order is chronological order and newest-first
 * history is a descending query rather than a sort in memory.
 */
export class DynamoTranscriptionRepository implements TranscriptionRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async save(transcription: Transcription): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: toTranscriptionItem(transcription.toPrimitives()),
      }),
    );
  }

  async findById(userId: string, transcriptionId: string): Promise<Transcription | null> {
    const response = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        // Isolation is structural: the partition key is built from the
        // requesting user, so another user's id addresses an item that does
        // not exist rather than one that has to be filtered out afterwards.
        Key: {
          PK: buildPartitionKey(userId),
          SK: buildTranscriptionSortKey(transcriptionId),
        },
        // The provider callback can arrive within milliseconds of the record
        // being written, and an eventually consistent read would report the
        // transcription as missing and lose a finished transcript.
        ConsistentRead: true,
      }),
    );

    if (response.Item === undefined) return null;

    return Transcription.fromPrimitives(toTranscriptionPrimitives(response.Item));
  }

  async listByUser(input: {
    userId: string;
    limit: number;
    cursor: string | null;
  }): Promise<Result<TranscriptionPage, InvalidCursorError>> {
    const startKey = this.resolveStartKey(input.userId, input.cursor);
    if (!startKey.success) return startKey;

    const response = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        // `begins_with` on the sort key rather than the partition alone, so
        // the history never picks up a non-transcription item that a later
        // access pattern stores under the same user.
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :transcriptionPrefix)',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: {
          ':pk': buildPartitionKey(input.userId),
          ':transcriptionPrefix': TRANSCRIPTION_SORT_KEY_PREFIX,
        },
        ScanIndexForward: false,
        // One more than the page is requested so the existence of a following
        // record is known rather than inferred. DynamoDB returns a
        // `LastEvaluatedKey` whenever it stops because it reached `Limit`,
        // including when nothing follows, so a `Limit` of exactly the page
        // size would hand the client a cursor leading to an empty page — and
        // the contract is that `nextCursor` is null only when the history
        // genuinely ends.
        Limit: input.limit + 1,
        ...(startKey.value === undefined ? {} : { ExclusiveStartKey: startKey.value }),
      }),
    );

    const rows = response.Items ?? [];
    const items = rows.slice(0, input.limit).map(toTranscriptionPrimitives);
    const lastItem = items[items.length - 1];

    // The `LastEvaluatedKey` term covers the other reason a query stops
    // early: a page that reached the 1 MB response limit before the item
    // limit. Returning a cursor there costs one extra request; omitting it
    // would truncate the user's history.
    const hasMore = rows.length > input.limit || response.LastEvaluatedKey !== undefined;
    const nextCursor =
      hasMore && lastItem !== undefined
        ? encodeCursor({ userId: input.userId, id: lastItem.id })
        : null;

    return ok({ items, nextCursor });
  }

  private resolveStartKey(
    userId: string,
    cursor: string | null,
  ): Result<Record<string, string> | undefined, InvalidCursorError> {
    if (cursor === null) return ok(undefined);

    const decoded = decodeCursor(cursor);
    if (!decoded.success) return decoded;

    if (decoded.value.userId !== userId) {
      // A cursor minted for another user would otherwise be turned into an
      // `ExclusiveStartKey` on this user's partition, silently skipping the
      // start of their history.
      return err(new InvalidCursorError('cursor was not issued for the requesting user'));
    }

    return ok({
      PK: buildPartitionKey(userId),
      SK: buildTranscriptionSortKey(decoded.value.id),
    });
  }
}

/**
 * The base64url of `{userId, id}`, byte for byte what the in-memory double
 * emits, so the two implementations stay substitutable and a cursor issued by
 * either is accepted by the other. The raw DynamoDB key never leaves the
 * adapter: the client is handed an opaque token bound to a user, not a
 * storage address it could edit.
 */
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
