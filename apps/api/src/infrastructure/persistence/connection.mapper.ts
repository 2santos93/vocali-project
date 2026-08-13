import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ConnectionItem } from '../types/connection-item.js';
import type { TicketItem } from '../types/ticket-item.js';

/**
 * **The partition is chosen for the IAM policy, not for the query.** DynamoDB
 * lets IAM condition on the partition key and not on the sort key, so a
 * partition of their own is what lets the delete grant carry
 * `LeadingKeys: CONN#*` and reach nothing else. Filing them beside the user's
 * transcriptions answers the query identically and leaves that grant
 * unconditionable. See `docs/adr/0011`.
 */
export const CONNECTION_PARTITION_KEY_PREFIX = 'CONN#';

/**
 * `PK = TICKET#<sha256 of the ticket>`. Its own partition because the
 * `$connect` authorizer holds the ticket and nothing else, so the ticket alone
 * must address the item.
 *
 * A digest is stored rather than the ticket: it is a bearer credential, and a
 * table export of those in the clear is a set of usable credentials. An
 * unsalted SHA-256 is right here for the reason it is wrong for passwords —
 * the input is 256 bits this platform generated, so there is no dictionary.
 */
export const TICKET_PARTITION_KEY_PREFIX = 'TICKET#';
export const TICKET_SORT_KEY = 'TICKET';

/**
 * Epoch *seconds*, which is what the service requires and is not what
 * `Date.now()` returns. A value in milliseconds is accepted by the table and
 * read as a date fifty thousand years out, so the item never expires and
 * nothing reports a problem.
 */
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
    // Redemption compares against this, not the TTL attribute: TTL is a
    // sweeper that deletes within days rather than at the instant an item
    // lapses, so trusting it as a clock would honour a lapsed ticket.
    expiresAt: input.expiresAt.toISOString(),
    [TTL_ATTRIBUTE]: toEpochSeconds(input.expiresAt),
  };
}

const StoredTicketSchema = z.object({
  userId: z.string().min(1),
  expiresAt: z.string().datetime(),
});

/**
 * A ticket item whose shape has drifted must not resolve to a user: this value
 * becomes the identity of a websocket connection, and the alternative to
 * failing here is opening a socket as whoever a malformed attribute named.
 */
export function toRedeemedTicket(item: unknown): { userId: string; expiresAt: Date } {
  const parsed = StoredTicketSchema.safeParse(item);
  if (!parsed.success) {
    throw new MalformedConnectionTicketError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')} (${issue.code})`).join(', '),
    );
  }

  return { userId: parsed.data.userId, expiresAt: new Date(parsed.data.expiresAt) };
}

/**
 * Not a `DomainError`: `DomainErrorCode` is the closed union the front end
 * branches on, and no client can act on schema drift. What matters is that it
 * arrives with a stable `code` rather than as a `TypeError`.
 */
export class MalformedConnectionTicketError extends Error {
  readonly code = 'MALFORMED_CONNECTION_TICKET';

  constructor(reason: string) {
    super(`Stored connection ticket is malformed: ${reason}`);
    this.name = 'MalformedConnectionTicketError';
  }
}
