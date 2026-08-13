import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * `PK = CONN#<userId>`, `SK = <connectionId>` — a partition of their own, one
 * per user.
 *
 * **The partition is chosen for the IAM policy, not for the query.** DynamoDB
 * lets IAM condition on the partition key and not on the sort key, so a
 * partition of their own is what lets the delete grant carry
 * `LeadingKeys: CONN#*` and reach nothing else. Filing them beside the user's
 * transcriptions would answer the query identically and leave that grant
 * unconditionable. See `docs/adr/0011`.
 *
 * The sort key is the bare connection id. The partition holds one kind of item
 * and no other code builds this prefix, so a discriminating prefix on the sort
 * key would be describing an ambiguity that does not exist.
 */
export const CONNECTION_PARTITION_KEY_PREFIX = 'CONN#';

/**
 * `PK = TICKET#<sha256 of the ticket>`, `SK = TICKET`.
 *
 * Its own partition, and it has to be: the `$connect` authorizer holds the
 * ticket and nothing else — no user, no token — so the ticket alone must
 * address the item.
 *
 * What is stored is a digest, not the ticket. The ticket is a bearer
 * credential, and storing bearer credentials in the clear means a table export
 * is a set of usable credentials. Hashing costs nothing here because the
 * lookup is by exact value rather than by comparison, and SHA-256 without a
 * salt is right for the same reason it is wrong for passwords: the input is
 * 256 bits of entropy this platform generated, not something a human chose, so
 * there is no dictionary to precompute.
 */
export const TICKET_PARTITION_KEY_PREFIX = 'TICKET#';
export const TICKET_SORT_KEY = 'TICKET';

/**
 * The attribute DynamoDB's TTL is configured against, in epoch *seconds* —
 * which is what the service requires and is not what `Date.now()` returns. A
 * value in milliseconds is accepted by the table and read as a date roughly
 * fifty thousand years out, so the item simply never expires and nothing
 * reports a problem.
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

export interface ConnectionItem {
  readonly PK: string;
  readonly SK: string;
  readonly connectionId: string;
  readonly [TTL_ATTRIBUTE]: number;
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

export interface TicketItem {
  readonly PK: string;
  readonly SK: string;
  readonly userId: string;
  readonly expiresAt: string;
  readonly [TTL_ATTRIBUTE]: number;
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
    // Stored as an ISO string as well as in the TTL attribute, and read from
    // here. The TTL attribute is a sweeper's instruction — DynamoDB deletes
    // expired items within days, not at the instant they lapse — so a store
    // that trusted it as a clock would honour a lapsed ticket. The redemption
    // compares against this value.
    expiresAt: input.expiresAt.toISOString(),
    [TTL_ATTRIBUTE]: toEpochSeconds(input.expiresAt),
  };
}

const StoredTicketSchema = z.object({
  userId: z.string().min(1),
  expiresAt: z.string().datetime(),
});

/**
 * Reads a spent ticket back, refusing anything that is not one.
 *
 * A ticket item whose shape has drifted must not resolve to a user: this value
 * becomes the identity of a websocket connection, and the alternative to
 * failing here is opening a socket as whoever a malformed attribute happened
 * to name.
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
 * Not a `DomainError`, for the same reason `MalformedTranscriptionRecordError`
 * is not: `DomainErrorCode` is the closed union the front end branches on, and
 * no client can act on schema drift. What matters is that it arrives as a
 * deliberate failure with a stable `code` rather than as a `TypeError`.
 */
export class MalformedConnectionTicketError extends Error {
  readonly code = 'MALFORMED_CONNECTION_TICKET';

  constructor(reason: string) {
    super(`Stored connection ticket is malformed: ${reason}`);
    this.name = 'MalformedConnectionTicketError';
  }
}
