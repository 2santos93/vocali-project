import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { Transcription } from '../../domain/entities/transcription.js';
import {
  ConcurrentModificationError,
  InvalidCursorError,
} from '../../domain/errors/domain-error.js';
import type { TranscriptionRepository } from '../../domain/ports/transcription-repository.js';
import type { TranscriptionPage } from '../../domain/types/transcription-page.js';
import { err, ok } from '../../domain/shared/result.js';
import type { Result } from '../../domain/types/result.js';
import { decodeCursor, encodeCursor } from './pagination-cursor.js';
import {
  buildClientSessionSortKey,
  buildPartitionKey,
  buildTranscriptionSortKey,
  toClaimedTranscriptionId,
  toClientSessionItem,
  toTranscriptionItem,
  toTranscriptionPrimitives,
  TRANSCRIPTION_SORT_KEY_PREFIX,
} from './transcription.mapper.js';

/**
 * `PK = USER#<userId>`, `SK = TRANS#<id>`, with no secondary index and no
 * `Scan` — the provider callback carries the record's identity, so the only
 * query that ever wanted an index resolves by primary key instead.
 *
 * Ids are ULIDs, so sort-key order is chronological order and newest-first
 * history is a descending query rather than a sort in memory.
 */
export class DynamoTranscriptionRepository implements TranscriptionRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async save(
    transcription: Transcription,
    options: { clientSessionId?: string | undefined } = {},
  ): Promise<Result<void, ConcurrentModificationError>> {
    const primitives = transcription.toPrimitives();
    // The stored `version` counts writes, so the item goes back one ahead of
    // the revision it was read at.
    const item = toTranscriptionItem({ ...primitives, version: primitives.version + 1 });
    const versionCondition = buildVersionCondition(primitives.version);

    const clientSessionId = options.clientSessionId;

    try {
      if (clientSessionId === undefined) {
        await this.client.send(
          new PutCommand({ TableName: this.tableName, Item: item, ...versionCondition }),
        );
      } else {
        await this.client.send(
          new TransactWriteCommand({
            // One transaction, so the record and the claim on its client
            // session id are both written or neither is. Claiming first would
            // leave a key pointing at a record that does not exist, and every
            // retry of that dictation would resolve to nothing.
            TransactItems: [
              { Put: { TableName: this.tableName, Item: item, ...versionCondition } },
              {
                Put: {
                  TableName: this.tableName,
                  Item: toClientSessionItem({
                    userId: primitives.userId,
                    clientSessionId,
                    transcriptionId: primitives.id,
                  }),
                  ConditionExpression: 'attribute_not_exists(SK)',
                },
              },
            ],
          }),
        );
      }
    } catch (cause: unknown) {
      // `instanceof` here, unlike anywhere a domain error is recognised: that
      // ban exists because esbuild renames our own classes. These are the
      // SDK's, imported by exactly one copy of the client, and report no
      // `code` of their own.
      //
      // A transaction reports a failed condition as a cancellation rather than
      // as `ConditionalCheckFailedException`, so both are recognised.
      if (cause instanceof ConditionalCheckFailedException || isConditionalCancellation(cause)) {
        return err(new ConcurrentModificationError(primitives.id));
      }
      // Everything else — a throttle, a timeout, a missing table — is
      // infrastructure failing rather than a race, and must not be reported as
      // a lost write the caller can safely ignore.
      throw cause;
    }

    return ok(undefined);
  }

  async findById(userId: string, transcriptionId: string): Promise<Transcription | null> {
    const response = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        // Isolation is structural: the partition key is built from the
        // requesting user, so another user's id addresses an item that does not
        // exist rather than one that has to be filtered out afterwards.
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

  async findByClientSession(
    userId: string,
    clientSessionId: string,
  ): Promise<Transcription | null> {
    const response = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: buildPartitionKey(userId),
          SK: buildClientSessionSortKey(clientSessionId),
        },
        // A retry can follow the original write by milliseconds, and an
        // eventually consistent read would report the key as unclaimed —
        // producing the duplicate this whole path exists to prevent.
        ConsistentRead: true,
      }),
    );

    if (response.Item === undefined) return null;

    return this.findById(userId, toClaimedTranscriptionId(response.Item));
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
        // `begins_with` on the sort key rather than the partition alone, so the
        // history never picks up a non-transcription item that a later access
        // pattern stores under the same user.
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :transcriptionPrefix)',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: {
          ':pk': buildPartitionKey(input.userId),
          ':transcriptionPrefix': TRANSCRIPTION_SORT_KEY_PREFIX,
        },
        ScanIndexForward: false,
        // One more than the page, so a following record is known rather than
        // inferred. DynamoDB returns a `LastEvaluatedKey` whenever it stops at
        // `Limit`, including when nothing follows, so a `Limit` of exactly the
        // page size hands the client a cursor leading to an empty page — and
        // `nextCursor` is null only when the history genuinely ends.
        Limit: input.limit + 1,
        ...(startKey.value === undefined ? {} : { ExclusiveStartKey: startKey.value }),
      }),
    );

    const rows = response.Items ?? [];
    const items = rows.slice(0, input.limit).map(toTranscriptionPrimitives);
    const lastItem = items[items.length - 1];

    // The `LastEvaluatedKey` term covers the other reason a query stops early:
    // a page that hit the 1 MB response limit first. Returning a cursor there
    // costs one extra request; omitting it truncates the user's history.
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
 * `attribute_not_exists(SK)` is what permits the first insert: a new entity
 * carries version 0 and no item exists to compare against. After that only a
 * writer holding the current revision can replace it, so a save derived from a
 * stale read is rejected by the table rather than silently winning.
 *
 * `version` is a DynamoDB reserved word, hence the `#version` alias.
 */
function buildVersionCondition(expectedVersion: number): {
  ConditionExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, number>;
} {
  return {
    ConditionExpression: 'attribute_not_exists(SK) OR #version = :expectedVersion',
    ExpressionAttributeNames: { '#version': 'version' },
    ExpressionAttributeValues: { ':expectedVersion': expectedVersion },
  };
}

/**
 * Distinguishes a cancellation caused by a failed condition from one caused by
 * a throttle, a conflicting transaction or an item-size limit. Only the first
 * is a lost race the caller resolves by re-reading.
 */
function isConditionalCancellation(cause: unknown): boolean {
  return (
    cause instanceof TransactionCanceledException &&
    (cause.CancellationReasons ?? []).some((reason) => reason.Code === 'ConditionalCheckFailed')
  );
}
