import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { DeleteCommandInput, PutCommandInput, QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoConnectionRegistry } from '../dynamo-connection-registry.js';

const TABLE = 'vocali-transcriptions-test';

const dynamo = mockClient(DynamoDBDocumentClient);

function buildRegistry(): DynamoConnectionRegistry {
  return new DynamoConnectionRegistry(
    DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'eu-west-1' })),
    TABLE,
  );
}

beforeEach(() => {
  dynamo.reset();
});

describe('DynamoConnectionRegistry', () => {
  it('files a connection in a partition of its own, not the user transcription partition', async () => {
    dynamo.on(PutCommand).resolves({});

    await buildRegistry().add({
      userId: 'user-1',
      connectionId: 'connection-a',
      expiresAt: new Date('2026-08-12T11:15:00.000Z'),
    });

    const input = dynamo.commandCalls(PutCommand)[0]?.args[0].input as PutCommandInput;
    expect(input.Item?.PK).toBe('CONN#user-1');
    expect(input.Item?.SK).toBe('connection-a');
    // The partition a transcription would be in. Asserted explicitly because
    // this is the whole reason for the layout: an item written under `USER#`
    // would be covered by a grant that also reaches clinical records.
    expect(input.Item?.PK).not.toBe('USER#user-1');
  });

  /*
   * DynamoDB's TTL attribute is epoch *seconds*. A value in milliseconds is
   * accepted without complaint and read as a date fifty thousand years out, so
   * the item never expires and nothing reports a problem.
   *
   * Asserted as a literal rather than derived from the input: deriving it with
   * the same `/ 1000` the adapter uses would assert the adapter against itself.
   */
  it('writes the expiry in epoch seconds, not milliseconds', async () => {
    dynamo.on(PutCommand).resolves({});

    await buildRegistry().add({
      userId: 'user-1',
      connectionId: 'connection-a',
      expiresAt: new Date('2026-08-12T11:15:00.000Z'),
    });

    const input = dynamo.commandCalls(PutCommand)[0]?.args[0].input as PutCommandInput;
    expect(input.Item?.ttlEpochSeconds).toBe(1786533300);
  });

  /*
   * No `begins_with` term is needed, because the partition holds nothing but
   * this user's connections. Under the old layout it was load-bearing: the
   * query returned every transcription and claim the user had, each then
   * treated as a connection id and published to.
   */
  it('reads one user connections from their own partition, consistently', async () => {
    dynamo.on(QueryCommand).resolves({ Items: [] });

    await buildRegistry().listByUser('user-1');

    const input = dynamo.commandCalls(QueryCommand)[0]?.args[0].input as QueryCommandInput;
    expect(input.KeyConditionExpression).toBe('#pk = :pk');
    expect(input.ExpressionAttributeValues).toEqual({ ':pk': 'CONN#user-1' });
    // A socket is opened moments before the completion that must reach it, so
    // an eventually consistent read is the read that misses it.
    expect(input.ConsistentRead).toBe(true);
  });

  it('returns the connection ids the query found', async () => {
    dynamo.on(QueryCommand).resolves({
      Items: [
        { PK: 'CONN#user-1', SK: 'a', connectionId: 'a' },
        { PK: 'CONN#user-1', SK: 'b', connectionId: 'b' },
      ],
    });

    expect(await buildRegistry().listByUser('user-1')).toEqual([
      { connectionId: 'a' },
      { connectionId: 'b' },
    ]);
  });

  it('skips an item with no usable connection id rather than publishing to undefined', async () => {
    dynamo.on(QueryCommand).resolves({
      Items: [{ PK: 'CONN#user-1', SK: 'a' }, { connectionId: 'b' }],
    });

    expect(await buildRegistry().listByUser('user-1')).toEqual([{ connectionId: 'b' }]);
  });

  it('deletes by the same key it wrote', async () => {
    dynamo.on(DeleteCommand).resolves({});

    await buildRegistry().remove('user-1', 'connection-a');

    const input = dynamo.commandCalls(DeleteCommand)[0]?.args[0].input as DeleteCommandInput;
    expect(input.Key).toEqual({ PK: 'CONN#user-1', SK: 'connection-a' });
    // No condition: `$disconnect` is best-effort and can arrive after the
    // entry has expired, and the 410 cleanup can race a second completion.
    expect(input.ConditionExpression).toBeUndefined();
  });
});

/*
 * The grant, from the side that can be run. The three IAM statements this
 * adapter needs each carry `dynamodb:LeadingKeys: ["CONN#*"]`, and nothing here
 * can evaluate an IAM policy, so what is checked is that every key the adapter
 * builds falls inside that prefix. A key outside it is denied by the table in
 * production, which is an upload that completes and is never announced.
 *
 * The prefix is a literal on purpose: it is the same literal that appears in
 * `infra/modules/functions/main.tf`, nothing compares the two, and importing
 * the constant here would assert `constant === constant` and leave the
 * Terraform unrepresented on both sides.
 */
describe('DynamoConnectionRegistry — every key the narrowed grant has to permit', () => {
  const ALLOWED_PARTITION_PREFIX = 'CONN#';

  it('builds every partition key inside the prefix the grant allows', async () => {
    dynamo.on(PutCommand).resolves({});
    dynamo.on(QueryCommand).resolves({ Items: [] });
    dynamo.on(DeleteCommand).resolves({});
    const registry = buildRegistry();

    await registry.add({
      userId: 'user-1',
      connectionId: 'connection-a',
      expiresAt: new Date('2026-08-12T11:15:00.000Z'),
    });
    await registry.listByUser('user-1');
    await registry.remove('user-1', 'connection-a');

    const partitionKeys = [
      (dynamo.commandCalls(PutCommand)[0]?.args[0].input as PutCommandInput).Item?.PK,
      (dynamo.commandCalls(QueryCommand)[0]?.args[0].input as QueryCommandInput)
        .ExpressionAttributeValues?.[':pk'],
      (dynamo.commandCalls(DeleteCommand)[0]?.args[0].input as DeleteCommandInput).Key?.PK,
    ];

    // Three operations, three keys — a count assertion as well, so an operation
    // that stopped issuing a command would not pass by having nothing to check.
    expect(partitionKeys).toHaveLength(3);
    for (const partitionKey of partitionKeys) {
      expect(typeof partitionKey).toBe('string');
      expect((partitionKey as string).startsWith(ALLOWED_PARTITION_PREFIX)).toBe(true);
    }
  });
});
