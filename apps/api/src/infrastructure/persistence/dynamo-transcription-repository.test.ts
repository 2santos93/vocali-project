import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import type {
  GetCommandInput,
  PutCommandInput,
  QueryCommandInput,
  TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoTranscriptionRepository } from './dynamo-transcription-repository.js';
import { MalformedTranscriptionRecordError, toTranscriptionItem } from './transcription.mapper.js';
import { buildTranscription } from '../../../test/builders/transcription.builder.js';
import { InMemoryTranscriptionRepository } from '../../../test/doubles/in-memory-transcription-repository.js';
import type { InvalidCursorError } from '../../domain/errors/domain-error.js';
import type { TranscriptionPage } from '../../domain/ports/transcription-repository.js';
import type { Result } from '../../domain/shared/result.js';

const TABLE = 'vocali-transcriptions-test';

type Item = Record<string, unknown>;

interface QueryResult {
  Items: Item[];
  LastEvaluatedKey?: Item;
}

/**
 * Reproduces the two DynamoDB behaviours this adapter exists to handle, so
 * the tests are not written against a store more forgiving than the real one:
 *
 * - a `LastEvaluatedKey` is returned whenever the query stops because it
 *   reached `Limit`, including when nothing at all follows,
 * - `ExclusiveStartKey` resumes strictly after the given sort key, whether or
 *   not an item with that key still exists.
 *
 * It rejects anything it was not built to model rather than answering
 * plausibly, so a change in how the adapter queries surfaces here instead of
 * quietly producing the wrong page.
 */
class FakeDynamoTable {
  private readonly items = new Map<string, Item>();

  put(item: Item): void {
    this.items.set(`${String(item.PK)} ${String(item.SK)}`, item);
  }

  get(key: Item | undefined): Item | undefined {
    if (key === undefined) throw new Error('a get needs a key');

    return this.items.get(`${String(key.PK)} ${String(key.SK)}`);
  }

  query(input: QueryCommandInput): QueryResult {
    const values = input.ExpressionAttributeValues ?? {};
    const partitionKey: unknown = values[':pk'];
    const sortKeyPrefix: unknown = values[':transcriptionPrefix'];
    if (typeof partitionKey !== 'string' || typeof sortKeyPrefix !== 'string') {
      throw new Error('the fake table only models a partition key plus a sort key prefix');
    }
    if (input.ScanIndexForward !== false) {
      throw new Error('the history must be queried newest first');
    }

    const matching = [...this.items.values()]
      .filter((item) => item.PK === partitionKey && String(item.SK).startsWith(sortKeyPrefix))
      .sort((left, right) => (String(right.SK) < String(left.SK) ? -1 : 1));

    const startKey = input.ExclusiveStartKey;
    const remaining =
      startKey === undefined
        ? matching
        : matching.filter((item) => String(item.SK) < String(startKey.SK));

    const limit = input.Limit ?? remaining.length;
    const page = remaining.slice(0, limit);
    const lastItem = page[page.length - 1];

    // The whole point of the fake: DynamoDB cannot tell "I stopped at the
    // limit and more follows" from "I stopped at the limit and that was
    // everything", so it reports a start key in both cases.
    if (page.length === limit && lastItem !== undefined) {
      return { Items: page, LastEvaluatedKey: { PK: lastItem.PK, SK: lastItem.SK } };
    }

    return { Items: page };
  }

  /**
   * All items or none, with every condition evaluated first — the property the
   * idempotent realtime save depends on. A fake that wrote the record and then
   * discovered the claim was taken would leave the table in a state the real
   * transaction cannot produce, and the orphan it left would never be seen.
   */
  transactWrite(input: TransactWriteCommandInput): void {
    const puts = (input.TransactItems ?? []).map((entry) => {
      const put = entry.Put;
      if (put === undefined) throw new Error('the fake table only models Put in a transaction');

      return put;
    });

    const failed = puts.filter((put) => !this.conditionHolds(put));
    if (failed.length > 0) {
      throw new TransactionCanceledException({
        $metadata: {},
        message: 'transaction cancelled',
        CancellationReasons: puts.map((put) => ({
          Code: this.conditionHolds(put) ? 'None' : 'ConditionalCheckFailed',
        })),
      });
    }

    for (const put of puts) this.put(put.Item ?? {});
  }

  private conditionHolds(
    put: NonNullable<TransactWriteCommandInput['TransactItems']>[number]['Put'] & object,
  ): boolean {
    const existing = this.get({ PK: put.Item?.PK, SK: put.Item?.SK });

    switch (put.ConditionExpression) {
      case 'attribute_not_exists(SK)':
        return existing === undefined;
      case 'attribute_not_exists(SK) OR #version = :expectedVersion':
        return (
          existing === undefined ||
          existing.version === put.ExpressionAttributeValues?.[':expectedVersion']
        );
      default:
        throw new Error(
          `the fake table does not model the condition ${String(put.ConditionExpression)}`,
        );
    }
  }
}

const ddbMock = mockClient(DynamoDBDocumentClient);

function buildRepository(table: FakeDynamoTable): DynamoTranscriptionRepository {
  ddbMock.on(PutCommand).callsFake((input: PutCommandInput): Record<string, never> => {
    table.put(input.Item ?? {});
    return {};
  });
  ddbMock.on(GetCommand).callsFake((input: GetCommandInput): { Item: Item | undefined } => ({
    Item: table.get(input.Key),
  }));
  ddbMock.on(QueryCommand).callsFake((input: QueryCommandInput): QueryResult => table.query(input));
  ddbMock
    .on(TransactWriteCommand)
    .callsFake((input: TransactWriteCommandInput): Record<string, never> => {
      table.transactWrite(input);
      return {};
    });

  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: 'eu-west-1',
      credentials: { accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'secret' },
    }),
  );

  return new DynamoTranscriptionRepository(client, TABLE);
}

function seed(table: FakeDynamoTable, userId: string, ids: readonly string[]): void {
  for (const id of ids) {
    table.put({ ...toTranscriptionItem(buildTranscription({ id, userId }).toPrimitives()) });
  }
}

function expectOk(result: Result<TranscriptionPage, InvalidCursorError>): TranscriptionPage {
  if (!result.success) throw new Error(`expected an ok result, got: ${result.error.message}`);

  return result.value;
}

describe('DynamoTranscriptionRepository', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  describe('save', () => {
    it('writes the record into its owner partition under a transcription sort key', async () => {
      const table = new FakeDynamoTable();
      await buildRepository(table).save(buildTranscription({ id: '01A', userId: 'user-1' }));

      const calls = ddbMock.commandCalls(PutCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.args[0].input.TableName).toBe(TABLE);
      expect(calls[0]?.args[0].input.Item).toMatchObject({
        PK: 'USER#user-1',
        SK: 'TRANS#01A',
        id: '01A',
        userId: 'user-1',
        status: 'PENDING_UPLOAD',
        source: 'FILE',
        // Written as a null rather than left off the item: the attribute has
        // to exist for the read schema to find it, and an upload has no
        // language until the provider identifies one.
        language: null,
      });
    });

    it('conditions the write on the revision it was read at, so a stale entity cannot win', async () => {
      const table = new FakeDynamoTable();
      await buildRepository(table).save(buildTranscription({ id: '01A', userId: 'user-1' }));

      const input = ddbMock.commandCalls(PutCommand)[0]?.args[0].input;

      // Hardcoded rather than built from the helper: loosening the condition
      // is the whole defect, so the assertion must not follow it there.
      expect(input?.ConditionExpression).toBe(
        'attribute_not_exists(SK) OR #version = :expectedVersion',
      );
      expect(input?.ExpressionAttributeNames).toEqual({ '#version': 'version' });
      expect(input?.ExpressionAttributeValues).toEqual({ ':expectedVersion': 0 });
      // Stored one ahead of the revision read, or the next writer would match
      // a version nobody advanced and every stale write would be accepted.
      expect(input?.Item?.version).toBe(1);
    });

    it('reports a rejected condition as a lost race rather than throwing', async () => {
      // Built first: the helper installs its own PutCommand behaviour, so a
      // rejection set before it would be overwritten and the test would pass
      // against a write that never failed.
      const repository = buildRepository(new FakeDynamoTable());
      ddbMock
        .on(PutCommand)
        .rejects(
          new ConditionalCheckFailedException({ $metadata: {}, message: 'condition failed' }),
        );

      const result = await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONCURRENT_MODIFICATION');
      }
    });

    it('propagates an infrastructure failure instead of reporting it as a lost race', async () => {
      // A throttle is not a race. Reporting it as one would tell the caller a
      // write was safely superseded when it simply never happened.
      const repository = buildRepository(new FakeDynamoTable());
      ddbMock.on(PutCommand).rejects(new Error('table is throttled'));

      await expect(
        repository.save(buildTranscription({ id: '01A', userId: 'user-1' })),
      ).rejects.toThrow('table is throttled');
    });
  });

  describe('save with a client session id', () => {
    const SESSION = 'session-abc';

    it('claims the session id in the same transaction as the record', async () => {
      const table = new FakeDynamoTable();

      await buildRepository(table).save(buildTranscription({ id: '01A', userId: 'user-1' }), {
        clientSessionId: SESSION,
      });

      // A separate write for the claim, in either order, has an outcome the
      // transaction does not: a claim pointing at a record that was never
      // stored, or a record no retry can ever find again.
      expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
      const items = ddbMock.commandCalls(TransactWriteCommand)[0]?.args[0].input.TransactItems;
      expect(items).toHaveLength(2);
      expect(items?.[0]?.Put?.Item).toMatchObject({ PK: 'USER#user-1', SK: 'TRANS#01A' });
      expect(items?.[1]?.Put?.Item).toEqual({
        PK: 'USER#user-1',
        SK: 'IDEM#session-abc',
        transcriptionId: '01A',
      });
      // Hardcoded rather than derived: weakening this condition is the defect,
      // so the assertion must not follow it there.
      expect(items?.[1]?.Put?.ConditionExpression).toBe('attribute_not_exists(SK)');
    });

    it('keeps the claim out of the history, which reads transcription keys only', async () => {
      const table = new FakeDynamoTable();
      const repository = buildRepository(table);
      await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }), {
        clientSessionId: SESSION,
      });

      const page = expectOk(
        await repository.listByUser({ userId: 'user-1', limit: 10, cursor: null }),
      );

      // `IDEM#` sorts before `TRANS#`, so without the sort-key prefix on the
      // query the user's first history page would be full of claim items that
      // the mapper cannot turn into transcriptions.
      expect(page.items.map((item) => item.id)).toEqual(['01A']);
    });

    it('reports a session id already claimed as a lost race', async () => {
      const table = new FakeDynamoTable();
      const repository = buildRepository(table);
      await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }), {
        clientSessionId: SESSION,
      });

      const result = await repository.save(buildTranscription({ id: '01B', userId: 'user-1' }), {
        clientSessionId: SESSION,
      });

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('CONCURRENT_MODIFICATION');
      // The whole transaction was refused, so the second record was not stored
      // either — a retry left no residue at all.
      expect(await repository.findById('user-1', '01B')).toBeNull();
    });

    it('propagates a cancellation that is not a failed condition', async () => {
      // A transaction cancelled by a throttle or a conflicting transaction is
      // infrastructure, not a claim someone else won. Reported as a lost race
      // it would tell the caller a retry had already been stored when nothing
      // had been written at all.
      const repository = buildRepository(new FakeDynamoTable());
      ddbMock.on(TransactWriteCommand).rejects(
        new TransactionCanceledException({
          $metadata: {},
          message: 'transaction cancelled',
          CancellationReasons: [{ Code: 'TransactionConflict' }, { Code: 'None' }],
        }),
      );

      await expect(
        repository.save(buildTranscription({ id: '01A', userId: 'user-1' }), {
          clientSessionId: SESSION,
        }),
      ).rejects.toThrow(TransactionCanceledException);
    });
  });

  describe('findByClientSession', () => {
    const SESSION = 'session-abc';

    it('resolves the claim to the record that holds it', async () => {
      const table = new FakeDynamoTable();
      const repository = buildRepository(table);
      await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }), {
        clientSessionId: SESSION,
      });

      const found = await repository.findByClientSession('user-1', SESSION);

      expect(found?.toPrimitives().id).toBe('01A');
      const claimLookup = ddbMock.commandCalls(GetCommand)[0]?.args[0].input;
      expect(claimLookup?.Key).toEqual({ PK: 'USER#user-1', SK: 'IDEM#session-abc' });
      // A retry can follow the original by milliseconds, and an eventually
      // consistent read would report the key as unclaimed — producing exactly
      // the duplicate this path exists to prevent.
      expect(claimLookup?.ConsistentRead).toBe(true);
    });

    it('returns null when nothing has claimed the session id', async () => {
      expect(
        await buildRepository(new FakeDynamoTable()).findByClientSession('user-1', SESSION),
      ).toBeNull();
    });

    it('looks in the requesting user partition, so a shared session id stays private', async () => {
      const table = new FakeDynamoTable();
      const repository = buildRepository(table);
      await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }), {
        clientSessionId: SESSION,
      });

      // Session ids are short client-generated strings, so two users picking
      // the same one is plausible. Nothing about it may be global.
      expect(await repository.findByClientSession('user-2', SESSION)).toBeNull();
    });

    it('refuses a claim that names no transcription rather than resolving it', async () => {
      const table = new FakeDynamoTable();
      table.put({ PK: 'USER#user-1', SK: 'IDEM#session-abc', transcriptionId: '' });

      await expect(buildRepository(table).findByClientSession('user-1', SESSION)).rejects.toThrow(
        MalformedTranscriptionRecordError,
      );
    });
  });

  describe('findById', () => {
    it('returns the stored record, rebuilt as an entity', async () => {
      const table = new FakeDynamoTable();
      seed(table, 'user-1', ['01A']);

      const found = await buildRepository(table).findById('user-1', '01A');

      expect(found?.toPrimitives().id).toBe('01A');
      expect(found?.toPrimitives().userId).toBe('user-1');
      expect(found?.status).toBe('PENDING_UPLOAD');
    });

    it('addresses the item with the requesting user, so another user cannot be read', async () => {
      const table = new FakeDynamoTable();
      seed(table, 'user-1', ['01A']);

      // Asserted on the key that was sent, not only on the null that came
      // back: a null is also what an empty table returns, so it cannot tell
      // an isolated lookup from a lookup that simply found nothing.
      const found = await buildRepository(table).findById('user-2', '01A');

      expect(found).toBeNull();
      expect(ddbMock.commandCalls(GetCommand)[0]?.args[0].input.Key).toEqual({
        PK: 'USER#user-2',
        SK: 'TRANS#01A',
      });
    });

    it('returns null when no such record exists', async () => {
      const table = new FakeDynamoTable();

      expect(await buildRepository(table).findById('user-1', '01A')).toBeNull();
    });

    it('reads consistently, so a callback arriving at once still finds the record', async () => {
      const table = new FakeDynamoTable();
      seed(table, 'user-1', ['01A']);

      await buildRepository(table).findById('user-1', '01A');

      expect(ddbMock.commandCalls(GetCommand)[0]?.args[0].input.ConsistentRead).toBe(true);
    });

    it('rejects a malformed stored record instead of building a broken entity', async () => {
      const table = new FakeDynamoTable();
      table.put({ PK: 'USER#user-1', SK: 'TRANS#01A', id: '01A', status: 'ARCHIVED' });

      await expect(buildRepository(table).findById('user-1', '01A')).rejects.toBeInstanceOf(
        MalformedTranscriptionRecordError,
      );
    });
  });

  describe('listByUser', () => {
    it('returns the history newest first in a single query', async () => {
      const table = new FakeDynamoTable();
      seed(table, 'user-1', ['01A', '01B', '01C']);

      const page = expectOk(
        await buildRepository(table).listByUser({ userId: 'user-1', limit: 10, cursor: null }),
      );

      expect(page.items.map((item) => item.id)).toEqual(['01C', '01B', '01A']);
      // One request and one command type: no follow-up read per row, and no
      // Scan, which would return every user's records to be filtered here.
      expect(ddbMock.calls()).toHaveLength(1);
      expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(1);
    });

    it('returns no cursor when the history holds exactly one page', async () => {
      const table = new FakeDynamoTable();
      seed(table, 'user-1', ['01A', '01B']);

      const page = expectOk(
        await buildRepository(table).listByUser({ userId: 'user-1', limit: 2, cursor: null }),
      );

      expect(page.items.map((item) => item.id)).toEqual(['01B', '01A']);
      // DynamoDB hands back a start key whenever it stops at the limit, even
      // with nothing behind it. Passing that through would offer the client a
      // "next page" that is always empty.
      expect(page.nextCursor).toBeNull();
    });

    it('pages through a longer history without repeating or skipping a record', async () => {
      const table = new FakeDynamoTable();
      seed(table, 'user-1', ['01A', '01B', '01C', '01D', '01E']);
      const repository = buildRepository(table);

      const first = expectOk(
        await repository.listByUser({ userId: 'user-1', limit: 2, cursor: null }),
      );
      expect(first.items.map((item) => item.id)).toEqual(['01E', '01D']);
      expect(first.nextCursor).not.toBeNull();

      const second = expectOk(
        await repository.listByUser({ userId: 'user-1', limit: 2, cursor: first.nextCursor }),
      );
      expect(second.items.map((item) => item.id)).toEqual(['01C', '01B']);

      const third = expectOk(
        await repository.listByUser({ userId: 'user-1', limit: 2, cursor: second.nextCursor }),
      );
      expect(third.items.map((item) => item.id)).toEqual(['01A']);
      expect(third.nextCursor).toBeNull();
    });

    it('keeps its place when a record is created while the caller is paging', async () => {
      const table = new FakeDynamoTable();
      seed(table, 'user-1', ['01A', '01B', '01C']);
      const repository = buildRepository(table);

      const first = expectOk(
        await repository.listByUser({ userId: 'user-1', limit: 2, cursor: null }),
      );
      expect(first.items.map((item) => item.id)).toEqual(['01C', '01B']);

      seed(table, 'user-1', ['01D']);

      const second = expectOk(
        await repository.listByUser({ userId: 'user-1', limit: 2, cursor: first.nextCursor }),
      );
      expect(second.items.map((item) => item.id)).toEqual(['01A']);
    });

    it("queries only the requesting user's partition", async () => {
      const table = new FakeDynamoTable();
      seed(table, 'user-1', ['01A']);
      seed(table, 'user-2', ['01Z']);

      const page = expectOk(
        await buildRepository(table).listByUser({ userId: 'user-1', limit: 10, cursor: null }),
      );

      expect(page.items.map((item) => item.id)).toEqual(['01A']);
      expect(
        ddbMock.commandCalls(QueryCommand)[0]?.args[0].input.ExpressionAttributeValues?.[':pk'],
      ).toBe('USER#user-1');
    });

    it('offers a cursor when the query stopped on the response size limit', async () => {
      const table = new FakeDynamoTable();
      seed(table, 'user-1', ['01A']);
      const repository = buildRepository(table);
      // A page cut short by the 1 MB response limit returns fewer items than
      // asked for and still reports a start key. Treating that as the end of
      // the history would truncate what the user can reach.
      ddbMock.on(QueryCommand).resolves({
        Items: [{ ...toTranscriptionItem(buildTranscription({ id: '01A' }).toPrimitives()) }],
        LastEvaluatedKey: { PK: 'USER#user-1', SK: 'TRANS#01A' },
      });

      const page = expectOk(
        await repository.listByUser({ userId: 'user-1', limit: 10, cursor: null }),
      );

      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).not.toBeNull();
    });

    it('rejects a malformed cursor rather than silently starting from the top', async () => {
      const result = await buildRepository(new FakeDynamoTable()).listByUser({
        userId: 'user-1',
        limit: 10,
        cursor: 'not-a-cursor',
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('INVALID_CURSOR');
      expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(0);
    });

    it('rejects a cursor that decodes to JSON which is not an object', async () => {
      const result = await buildRepository(new FakeDynamoTable()).listByUser({
        userId: 'user-1',
        limit: 10,
        cursor: Buffer.from('null').toString('base64url'),
      });

      // The case above dies inside JSON.parse and never reaches the shape
      // guard. This one parses cleanly, so without the guard the adapter reads
      // .userId off null: an attacker-controlled query parameter becomes an
      // uncaught TypeError and a 500 rather than INVALID_CURSOR and a 400.
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('INVALID_CURSOR');
      expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(0);
    });

    it('rejects a cursor minted for another user instead of resuming their page', async () => {
      const table = new FakeDynamoTable();
      seed(table, 'user-1', ['01A', '01B', '01C']);
      const repository = buildRepository(table);

      const foreign = expectOk(
        await repository.listByUser({ userId: 'user-1', limit: 2, cursor: null }),
      ).nextCursor;

      const result = await repository.listByUser({
        userId: 'user-2',
        limit: 2,
        cursor: foreign,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('INVALID_CURSOR');
    });

    it('accepts a cursor issued by the in-memory double, and the double accepts its own', async () => {
      const table = new FakeDynamoTable();
      seed(table, 'user-1', ['01A', '01B', '01C']);
      const double = new InMemoryTranscriptionRepository();
      for (const id of ['01A', '01B', '01C']) {
        await double.save(buildTranscription({ id, userId: 'user-1' }));
      }

      // The double is the behaviour every use-case test is written against,
      // so a cursor the two encode differently would mean the suite is
      // verifying a contract production does not implement.
      const fromDouble = expectOk(
        await double.listByUser({ userId: 'user-1', limit: 2, cursor: null }),
      ).nextCursor;
      const fromAdapter = expectOk(
        await buildRepository(table).listByUser({ userId: 'user-1', limit: 2, cursor: null }),
      ).nextCursor;

      expect(fromAdapter).toBe(fromDouble);

      const resumed = expectOk(
        await buildRepository(table).listByUser({ userId: 'user-1', limit: 2, cursor: fromDouble }),
      );
      expect(resumed.items.map((item) => item.id)).toEqual(['01A']);
    });
  });
});
