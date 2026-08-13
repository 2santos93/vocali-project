/**
 * The short-lived, single-use credential a browser exchanges for a websocket
 * connection.
 *
 * It exists because a browser cannot set a header on a `WebSocket`. The usual
 * answer to that is to put the access token in the query string, and this
 * platform has already refused that once: the provider callback authenticates
 * with a header rather than a signed query string, precisely so the secret
 * never reaches a log. A query string on `$connect` is written to the API's
 * access log verbatim, so what travels there is a ticket that is worthless by
 * the time anybody reads the log.
 *
 * The same shape as the realtime provider credential, for the same reason:
 * short life, one use, and the long-lived secret never leaves the server.
 */
export interface ConnectionTicketStore {
  /**
   * Records a ticket against the user who asked for it.
   *
   * `expiresAt` is checked on redemption as well as being handed to the
   * store's own expiry, because that expiry is a sweeper rather than a clock:
   * DynamoDB deletes expired items within days, not at the instant they lapse,
   * so a store that only relied on it would honour a ticket long after it
   * should have stopped.
   */
  issue(input: { ticket: string; userId: string; expiresAt: Date }): Promise<void>;
  /**
   * Spends the ticket and returns whose it was, or null if it was never
   * issued, has already been spent, or has expired.
   *
   * Spending is the point, and it has to be atomic: two `$connect` attempts
   * arriving with the same ticket must not both succeed, so the delete that
   * burns it is also the read that resolves it. A read followed by a delete
   * would leave a window in which a replayed ticket is honoured twice.
   */
  redeem(input: { ticket: string; now: Date }): Promise<{ userId: string } | null>;
}
