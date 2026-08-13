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

    if (stored.expiresAt.getTime() <= input.now.getTime()) return null;

    return { userId: stored.userId };
  }
}
