import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DeleteCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { ConnectionRegistry, UserConnection } from '../../domain/ports/connection-registry.js';
import { buildConnectionPartitionKey, toConnectionItem } from './connection.mapper.js';

/**
 * The user's open websockets, in the same table under a partition of their
 * own: `PK = CONN#<userId>`, `SK = <connectionId>`.
 *
 * No secondary index and no `Scan`, exactly as with the records: every read
 * here is "which sockets does this one user have open", which the primary key
 * already answers.
 *
 * Every key this class builds begins with `CONN#`, and that is a policy
 * boundary rather than a naming convention — the IAM grants for these three
 * operations carry `LeadingKeys: CONN#*`, so a key built outside that prefix is
 * denied by the table rather than silently reaching a transcription. See the
 * note on the mapper.
 */
export class DynamoConnectionRegistry implements ConnectionRegistry {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async add(input: { userId: string; connectionId: string; expiresAt: Date }): Promise<void> {
    // Unconditional. A connection id is minted by API Gateway and is unique
    // for the life of the API, so there is no existing item to race with, and
    // a condition here would only add a failure mode to the one moment the
    // socket has to be recorded or the whole connection is useless.
    await this.client.send(
      new PutCommand({ TableName: this.tableName, Item: toConnectionItem(input) }),
    );
  }

  async remove(userId: string, connectionId: string): Promise<void> {
    // Deleting an item that is not there succeeds, which is the behaviour this
    // path wants: `$disconnect` is best-effort and can arrive after the entry
    // has already expired, and the 410 cleanup can race a second completion
    // publishing to the same departed connection.
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
        // The whole partition, and no `begins_with` term, because the
        // partition holds nothing but this user's connections. The
        // transcription history needs one — its items share a partition with
        // the idempotency claims — and that difference is the repartition
        // doing its job.
        KeyConditionExpression: '#pk = :pk',
        ExpressionAttributeNames: { '#pk': 'PK' },
        ExpressionAttributeValues: { ':pk': buildConnectionPartitionKey(userId) },
        // A socket is opened moments before the completion that has to reach
        // it — the browser connects, then uploads — so an eventually
        // consistent read is exactly the read that misses it.
        ConsistentRead: true,
      }),
    );

    // `flatMap` rather than filter-then-map so the narrowing is the same
    // expression that builds the result. An item with no usable id is dropped
    // rather than yielding `{ connectionId: undefined }`, which the publisher
    // would send to the management API as the literal string "undefined".
    return (response.Items ?? []).flatMap((item): UserConnection[] => {
      const connectionId: unknown = item.connectionId;

      return typeof connectionId === 'string' && connectionId !== '' ? [{ connectionId }] : [];
    });
  }
}
