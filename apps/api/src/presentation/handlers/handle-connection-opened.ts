import { readAuthorizedUserId } from '../websocket/websocket-event.js';
import { INTERNAL_SERVER_ERROR, OK, UNAUTHORIZED } from '../http/http-status.js';
import type { HandleConnectionOpenedDependencies } from '../types/dependencies.js';
import type {
  WebSocketHandler,
  WebSocketRequestEvent,
  WebSocketResponse,
} from '../types/websocket.js';

export function handleConnectionOpenedHandler(
  dependencies: HandleConnectionOpenedDependencies,
): WebSocketHandler {
  return async (event: WebSocketRequestEvent): Promise<WebSocketResponse> => {
    const logger = dependencies.logger.withCorrelationId(event.requestContext.requestId);
    const userId = readAuthorizedUserId(event);

    if (userId === null) {
      logger.error('Refused a websocket connection the authorizer resolved no user for');

      return { statusCode: UNAUTHORIZED };
    }

    try {
      await dependencies.registerConnection.execute({
        userId,
        connectionId: event.requestContext.connectionId,
      });
    } catch {
      // The cause is deliberately not spread into the line: it can carry the
      // item being written, which names a user.
      logger.error('Could not record a websocket connection');

      return { statusCode: INTERNAL_SERVER_ERROR };
    }

    return { statusCode: OK };
  };
}
