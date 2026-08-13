/**
 * A browser cannot set a header on a `WebSocket`, and `$connect` query strings
 * are written to the access log verbatim. So what travels there is a ticket
 * that is worthless by the time anybody reads the log, never the access token.
 */
export interface ConnectionTicketStore {
  /**
   * `expiresAt` is checked on redemption as well as handed to the store's own
   * expiry, because DynamoDB TTL is a sweeper rather than a clock: it deletes
   * within days, so relying on it alone would honour a lapsed ticket.
   */
  issue(input: { ticket: string; userId: string; expiresAt: Date }): Promise<void>;
  /**
   * Spending has to be atomic — the delete that burns the ticket is also the
   * read that resolves it. A read followed by a delete leaves a window in
   * which two `$connect` attempts with the same ticket both succeed.
   */
  redeem(input: { ticket: string; now: Date }): Promise<{ userId: string } | null>;
}
