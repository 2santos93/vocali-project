import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DeleteCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { ConnectionRegistry } from '../../domain/ports/connection-registry.js';
import type { UserConnection } from '../../domain/types/connection.js';
import { buildConnectionPartitionKey, toConnectionItem } from './connection.mapper.js';

/**
 * Every key this class builds begins with `CONN#`, and that is a policy
 * boundary rather than a naming convention: the IAM grants for these three
 * operations carry `LeadingKeys: CONN#*`, so a key built outside the prefix is
 * denied by the table rather than silently reaching a transcription.
 */
export class DynamoConnectionRegistry implements ConnectionRegistry {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async add(input: { userId: string; connectionId: string; expiresAt: Date }): Promise<void> {
    // Unconditional: a connection id is minted by API Gateway and unique for
    // the life of the API, so a condition would add a failure mode to the one
    // moment the socket has to be recorded or the connection is useless.
    await this.client.send(
      new PutCommand({ TableName: this.tableName, Item: toConnectionItem(input) }),
    );
  }

  async remove(userId: string, connectionId: string): Promise<void> {
    // Deleting an absent item succeeds, which is what this path wants:
    // `$disconnect` can arrive after the entry expired, and the 410 cleanup can
    // race a second completion publishing to the same departed connection.
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: buildConnectionPartitionKey(userId), SK: connectionId },
      }),
    );
  }

  async listByUser(userId: string): Promise<readonly UserConnection[]> {
    const response = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        // No `begins_with` term, because this partition holds nothing but the
        // user's connections. The transcription history needs one; its items
        // share a partition with the idempotency claims.
        KeyConditionExpression: '#pk = :pk',
        ExpressionAttributeNames: { '#pk': 'PK' },
        ExpressionAttributeValues: { ':pk': buildConnectionPartitionKey(userId) },
        // A socket is opened moments before the completion that has to reach
        // it, so an eventually consistent read is exactly the read that misses
        // it.
        ConsistentRead: true,
      }),
    );

    // An item with no usable id is dropped rather than yielding
    // `{ connectionId: undefined }`, which the publisher would send to the
    // management API as the literal string "undefined".
    return (response.Items ?? []).flatMap((item): UserConnection[] => {
      const connectionId: unknown = item.connectionId;

      return typeof connectionId === 'string' && connectionId !== '' ? [{ connectionId }] : [];
    });
  }
}
