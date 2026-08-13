import type { TTL_ATTRIBUTE } from '../persistence/connection.mapper.js';

export interface TicketItem {
  readonly PK: string;
  readonly SK: string;
  readonly userId: string;
  readonly expiresAt: string;
  readonly [TTL_ATTRIBUTE]: number;
}
