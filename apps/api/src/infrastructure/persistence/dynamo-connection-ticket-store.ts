import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { ConnectionTicketStore } from '../../domain/ports/connection-ticket-store.js';
import {
  buildTicketPartitionKey,
  TICKET_SORT_KEY,
  toRedeemedTicket,
  toTicketItem,
} from './connection.mapper.js';

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
   * `DeleteItem` both spend the ticket and say whose it was, so two `$connect`
   * attempts with the same ticket race inside DynamoDB and exactly one comes
   * back with attributes. A `GetItem` then a `DeleteItem` looks equivalent and
   * is not: between the calls both attempts read the same live ticket and both
   * open a socket.
   *
   * The ticket is spent whether or not it was still valid — one that survived
   * its own rejection could be retried until a clock skew let it through.
   */
  async redeem(input: { ticket: string; now: Date }): Promise<{ userId: string } | null> {
    const response = await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: buildTicketPartitionKey(input.ticket), SK: TICKET_SORT_KEY },
        ReturnValues: 'ALL_OLD',
      }),
    );

    // Never issued, already spent and already swept are one answer on purpose:
    // telling them apart would say which guesses had once been real tickets.
    if (response.Attributes === undefined) return null;

    const stored = toRedeemedTicket(response.Attributes);

    // Checked here rather than left to the table's TTL, which deletes within
    // days of an expiry rather than at it. Relying on it alone would leave a
    // thirty-second credential usable for two more days.
    if (stored.expiresAt.getTime() <= input.now.getTime()) return null;

    return { userId: stored.userId };
  }
}
