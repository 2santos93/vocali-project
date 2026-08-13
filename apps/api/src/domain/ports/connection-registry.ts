/**
 * The websocket connections a user currently holds open.
 *
 * A user has several more often than not: two tabs is normal, and a phone left
 * on the history screen while a laptop uploads is the case this platform was
 * built for. So every method here is plural by nature — `listByUser` returns a
 * set, and a completion is delivered to all of it.
 *
 * Nothing in here is a socket. API Gateway holds the connection; a connection
 * id is a handle the management API accepts, and it is only ever a string as
 * far as this codebase is concerned.
 */
export interface UserConnection {
  readonly connectionId: string;
}

export interface ConnectionRegistry {
  /**
   * Records the connection, with the instant after which it may be forgotten.
   *
   * `expiresAt` is not a policy this port enforces — the store does, by
   * expiring the entry on its own. It is here because a connection whose
   * client vanished without a close frame is invisible: no disconnect ever
   * arrives, and without an expiry the entry would be published to for ever.
   */
  add(input: { userId: string; connectionId: string; expiresAt: Date }): Promise<void>;
  remove(userId: string, connectionId: string): Promise<void>;
  listByUser(userId: string): Promise<readonly UserConnection[]>;
}
