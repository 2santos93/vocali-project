import type { TTL_ATTRIBUTE } from '../persistence/connection.mapper.js';

export interface ConnectionItem {
  readonly PK: string;
  readonly SK: string;
  readonly connectionId: string;
  readonly [TTL_ATTRIBUTE]: number;
}
