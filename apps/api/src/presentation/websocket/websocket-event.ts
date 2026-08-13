import type { WebSocketRequestEvent } from '../types/websocket.js';

export function readAuthorizedUserId(event: WebSocketRequestEvent): string | null {
  const userId = event.requestContext.authorizer?.userId;

  return typeof userId === 'string' && userId !== '' ? userId : null;
}
