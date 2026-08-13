import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ConnectionItem, TicketItem } from '../types/dynamo-items.js';

export const CONNECTION_PARTITION_KEY_PREFIX = 'CONN#';

export const TICKET_PARTITION_KEY_PREFIX = 'TICKET#';
export const TICKET_SORT_KEY = 'TICKET';

export const TTL_ATTRIBUTE = 'ttlEpochSeconds';

const MILLISECONDS_PER_SECOND = 1_000;

export function buildConnectionPartitionKey(userId: string): string {
  return `${CONNECTION_PARTITION_KEY_PREFIX}${userId}`;
}

export function buildTicketPartitionKey(ticket: string): string {
  return `${TICKET_PARTITION_KEY_PREFIX}${createHash('sha256').update(ticket, 'utf8').digest('hex')}`;
}

export function toEpochSeconds(instant: Date): number {
  return Math.floor(instant.getTime() / MILLISECONDS_PER_SECOND);
}

export function toConnectionItem(input: {
  userId: string;
  connectionId: string;
  expiresAt: Date;
}): ConnectionItem {
  return {
    PK: buildConnectionPartitionKey(input.userId),
    SK: input.connectionId,
    connectionId: input.connectionId,
    [TTL_ATTRIBUTE]: toEpochSeconds(input.expiresAt),
  };
}

export function toTicketItem(input: {
  ticket: string;
  userId: string;
  expiresAt: Date;
}): TicketItem {
  return {
    PK: buildTicketPartitionKey(input.ticket),
    SK: TICKET_SORT_KEY,
    userId: input.userId,
    expiresAt: input.expiresAt.toISOString(),
    [TTL_ATTRIBUTE]: toEpochSeconds(input.expiresAt),
  };
}

const StoredTicketSchema = z.object({
  userId: z.string().min(1),
  expiresAt: z.string().datetime(),
});

export function toRedeemedTicket(item: unknown): { userId: string; expiresAt: Date } {
  const parsed = StoredTicketSchema.safeParse(item);
  if (!parsed.success) {
    throw new MalformedConnectionTicketError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')} (${issue.code})`).join(', '),
    );
  }

  return { userId: parsed.data.userId, expiresAt: new Date(parsed.data.expiresAt) };
}

export class MalformedConnectionTicketError extends Error {
  readonly code = 'MALFORMED_CONNECTION_TICKET';

  constructor(reason: string) {
    super(`Stored connection ticket is malformed: ${reason}`);
    this.name = 'MalformedConnectionTicketError';
  }
}
