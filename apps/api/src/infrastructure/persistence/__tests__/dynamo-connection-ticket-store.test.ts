import { createHash } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { DeleteCommandInput, PutCommandInput } from '@aws-sdk/lib-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { MalformedConnectionTicketError } from '../connection.mapper.js';
import { DynamoConnectionTicketStore } from '../dynamo-connection-ticket-store.js';

const TABLE = 'vocali-transcriptions-test';
const TICKET = 'a-ticket-value';
const NOW = new Date('2026-08-12T09:00:00.000Z');
const EXPIRES_AT = new Date('2026-08-12T09:00:30.000Z');

const dynamo = mockClient(DynamoDBDocumentClient);

function buildStore(): DynamoConnectionTicketStore {
  return new DynamoConnectionTicketStore(
    DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'eu-west-1' })),
    TABLE,
  );
}

beforeEach(() => {
  dynamo.reset();
});

describe('DynamoConnectionTicketStore', () => {
  /*
   * A ticket is a bearer credential, so a table export holding them in the
   * clear is an export of usable credentials.
   *
   * The digest is computed here with `node:crypto` rather than by importing
   * the mapper's builder: importing it would assert the adapter against the
   * same function it uses, and would stay green if that function were changed
   * to return the ticket unchanged.
   */
  it('stores the ticket under a digest rather than under the ticket itself', async () => {
    dynamo.on(PutCommand).resolves({});

    await buildStore().issue({ ticket: TICKET, userId: 'user-1', expiresAt: EXPIRES_AT });

    const input = dynamo.commandCalls(PutCommand)[0]?.args[0].input as PutCommandInput;
    const digest = createHash('sha256').update(TICKET, 'utf8').digest('hex');
    expect(input.Item?.PK).toBe(`TICKET#${digest}`);
    expect(input.Item?.SK).toBe('TICKET');
    expect(JSON.stringify(input.Item)).not.toContain(TICKET);
  });

  it('records the expiry both as an instant and as a TTL in epoch seconds', async () => {
    dynamo.on(PutCommand).resolves({});

    await buildStore().issue({ ticket: TICKET, userId: 'user-1', expiresAt: EXPIRES_AT });

    const input = dynamo.commandCalls(PutCommand)[0]?.args[0].input as PutCommandInput;
    expect(input.Item?.expiresAt).toBe('2026-08-12T09:00:30.000Z');
    expect(input.Item?.ttlEpochSeconds).toBe(1786525230);
  });

  /*
   * One `DeleteItem` with `ReturnValues: 'ALL_OLD'` both spends the ticket and
   * says whose it was. A `GetItem` followed by a `DeleteItem` reads the same
   * and leaves a window in which two `$connect` attempts both see a live
   * ticket, so the absence of any Get on this path is itself the assertion.
   */
  it('spends the ticket with the same call that reads it', async () => {
    dynamo.on(DeleteCommand).resolves({
      Attributes: { userId: 'user-1', expiresAt: EXPIRES_AT.toISOString() },
    });

    const resolved = await buildStore().redeem({ ticket: TICKET, now: NOW });

    expect(resolved).toEqual({ userId: 'user-1' });
    const input = dynamo.commandCalls(DeleteCommand)[0]?.args[0].input as DeleteCommandInput;
    expect(input.ReturnValues).toBe('ALL_OLD');
    expect(dynamo.commandCalls(DeleteCommand)).toHaveLength(1);
  });

  it('resolves nothing when the item was not there', async () => {
    // How DynamoDB answers a delete of an absent item: success, no attributes.
    // Never issued, already spent and already swept are one answer on purpose.
    dynamo.on(DeleteCommand).resolves({});

    expect(await buildStore().redeem({ ticket: TICKET, now: NOW })).toBeNull();
  });

  it('refuses a ticket whose stored expiry has passed', async () => {
    dynamo.on(DeleteCommand).resolves({
      Attributes: { userId: 'user-1', expiresAt: '2026-08-12T08:59:59.000Z' },
    });

    // The table's own TTL deletes expired items within days of their expiry
    // rather than at it, so without this check a thirty-second credential
    // stays usable for two more days.
    expect(await buildStore().redeem({ ticket: TICKET, now: NOW })).toBeNull();
  });

  it('refuses a ticket expiring exactly now', async () => {
    dynamo.on(DeleteCommand).resolves({
      Attributes: { userId: 'user-1', expiresAt: NOW.toISOString() },
    });

    expect(await buildStore().redeem({ ticket: TICKET, now: NOW })).toBeNull();
  });

  it('refuses to resolve an identity from a malformed item', async () => {
    dynamo.on(DeleteCommand).resolves({ Attributes: { expiresAt: EXPIRES_AT.toISOString() } });

    // This value becomes the identity of a websocket connection. The
    // alternative to failing here is opening a socket as whoever a drifted
    // attribute happened to name.
    await expect(buildStore().redeem({ ticket: TICKET, now: NOW })).rejects.toBeInstanceOf(
      MalformedConnectionTicketError,
    );
  });
});
