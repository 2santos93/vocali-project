import type { ConnectionAuthorizerEvent } from './connection-authorizer-event.js';
import type { ConnectionAuthorizerResult } from './connection-authorizer-result.js';

export type ConnectionAuthorizer = (
  event: ConnectionAuthorizerEvent,
) => Promise<ConnectionAuthorizerResult>;
