import type { WebSocketRequestEvent } from '../types/websocket-request-event.js';

/**
 * The only identity a websocket route may use. Nothing reads a user id from the
 * query string, for the same reason no HTTP handler reads one from a path: the
 * caller chose it.
 */
export function readAuthorizedUserId(event: WebSocketRequestEvent): string | null {
  const userId = event.requestContext.authorizer?.userId;

  return typeof userId === 'string' && userId !== '' ? userId : null;
}
