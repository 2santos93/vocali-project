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
import type { TranscriptionPage } from '../../domain/types/transcription.js';
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
      if (cause instanceof ConditionalCheckFailedException || isConditionalCancellation(cause)) {
        return err(new ConcurrentModificationError(primitives.id));
      }
      throw cause;
    }

    return ok(undefined);
  }

  async findById(userId: string, transcriptionId: string): Promise<Transcription | null> {
    const response = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: buildPartitionKey(userId),
          SK: buildTranscriptionSortKey(transcriptionId),
        },
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
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :transcriptionPrefix)',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
        ExpressionAttributeValues: {
          ':pk': buildPartitionKey(input.userId),
          ':transcriptionPrefix': TRANSCRIPTION_SORT_KEY_PREFIX,
        },
        ScanIndexForward: false,
        Limit: input.limit + 1,
        ...(startKey.value === undefined ? {} : { ExclusiveStartKey: startKey.value }),
      }),
    );

    const rows = response.Items ?? [];
    const items = rows.slice(0, input.limit).map(toTranscriptionPrimitives);
    const lastItem = items[items.length - 1];

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
      return err(new InvalidCursorError('cursor was not issued for the requesting user'));
    }

    return ok({
      PK: buildPartitionKey(userId),
      SK: buildTranscriptionSortKey(decoded.value.id),
    });
  }
}

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

function isConditionalCancellation(cause: unknown): boolean {
  return (
    cause instanceof TransactionCanceledException &&
    (cause.CancellationReasons ?? []).some((reason) => reason.Code === 'ConditionalCheckFailed')
  );
}
