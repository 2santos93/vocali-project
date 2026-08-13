import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DeleteCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { ConnectionRegistry } from '../../domain/ports/connection-registry.js';
import type { UserConnection } from '../../domain/types/connection.js';
import { buildConnectionPartitionKey, toConnectionItem } from './connection.mapper.js';

export class DynamoConnectionRegistry implements ConnectionRegistry {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async add(input: { userId: string; connectionId: string; expiresAt: Date }): Promise<void> {
    await this.client.send(
      new PutCommand({ TableName: this.tableName, Item: toConnectionItem(input) }),
    );
  }

  async remove(userId: string, connectionId: string): Promise<void> {
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
        KeyConditionExpression: '#pk = :pk',
        ExpressionAttributeNames: { '#pk': 'PK' },
        ExpressionAttributeValues: { ':pk': buildConnectionPartitionKey(userId) },
        // A socket is opened moments before the completion that has to reach
        // it, so an eventually consistent read is exactly the read that misses
        // it.
        ConsistentRead: true,
      }),
    );

    return (response.Items ?? []).flatMap((item): UserConnection[] => {
      const connectionId: unknown = item.connectionId;

      return typeof connectionId === 'string' && connectionId !== '' ? [{ connectionId }] : [];
    });
  }
}
