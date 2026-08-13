import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { ConnectionTicketStore } from '../../domain/ports/connection-ticket-store.js';
import {
  buildTicketPartitionKey,
  TICKET_SORT_KEY,
  toRedeemedTicket,
  toTicketItem,
} from './connection.mapper.js';

/**
 * Connection tickets, in the same table under their own partition.
 *
 * The item holds a digest of the ticket rather than the ticket, and its own
 * TTL, so an unredeemed ticket disappears without anything having to sweep it.
 */
export class DynamoConnectionTicketStore implements ConnectionTicketStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async issue(input: { ticket: string; userId: string; expiresAt: Date }): Promise<void> {
    await this.client.send(
      new PutCommand({ TableName: this.tableName, Item: toTicketItem(input) }),
    );
  }

  /**
   * **The delete is the read.** `ReturnValues: 'ALL_OLD'` makes one
   * `DeleteItem` both spend the ticket and say whose it was, which is what
   * makes single use real: two `$connect` attempts arriving with the same
   * ticket race on one conditional write inside DynamoDB, and exactly one of
   * them comes back with attributes.
   *
   * A `GetItem` followed by a `DeleteItem` would look equivalent and would not
   * be. Between the two calls there is a window in which both attempts have
   * read the same live ticket, and both open a socket. The window is small and
   * it is on the one path where the platform decides who a connection belongs
   * to.
   *
   * The ticket is spent whether or not it was still valid. A lapsed ticket
   * that survived its own rejection could be retried until a clock skew let it
   * through.
   */
  async redeem(input: { ticket: string; now: Date }): Promise<{ userId: string } | null> {
    const response = await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: buildTicketPartitionKey(input.ticket), SK: TICKET_SORT_KEY },
        ReturnValues: 'ALL_OLD',
      }),
    );

    // Absent attributes mean the item was not there: never issued, already
    // spent, or already swept. All three are one answer on purpose — telling
    // them apart would say which guesses had once been real tickets.
    if (response.Attributes === undefined) return null;

    const stored = toRedeemedTicket(response.Attributes);

    // Checked here rather than left to the table's TTL, which deletes expired
    // items within days of their expiry rather than at it. Relying on it alone
    // would leave a thirty-second credential usable for two more days.
    if (stored.expiresAt.getTime() <= input.now.getTime()) return null;

    return { userId: stored.userId };
  }
}
