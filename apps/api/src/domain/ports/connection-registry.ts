import type { UserConnection } from '../types/connection.js';

export interface ConnectionRegistry {
  /**
   * `expiresAt` exists because a client that vanishes without a close frame
   * sends no disconnect, so the entry would otherwise be published to for ever.
   */
  add(input: { userId: string; connectionId: string; expiresAt: Date }): Promise<void>;
  remove(userId: string, connectionId: string): Promise<void>;
  listByUser(userId: string): Promise<readonly UserConnection[]>;
}
