import { readAuthorizedUserId } from '../websocket/websocket-event.js';
import { OK } from '../http/http-status.js';
import type { HandleConnectionClosedDependencies } from '../types/dependencies.js';
import type {
  WebSocketHandler,
  WebSocketRequestEvent,
  WebSocketResponse,
} from '../types/websocket.js';

export function handleConnectionClosedHandler(
  dependencies: HandleConnectionClosedDependencies,
): WebSocketHandler {
  return async (event: WebSocketRequestEvent): Promise<WebSocketResponse> => {
    const logger = dependencies.logger.withCorrelationId(event.requestContext.requestId);
    const userId = readAuthorizedUserId(event);

    if (userId === null) {
      logger.warn('Closed a websocket connection carrying no resolved user; leaving it to expire');

      return { statusCode: OK };
    }

    try {
      await dependencies.deregisterConnection.execute({
        userId,
        connectionId: event.requestContext.connectionId,
      });
    } catch {
      logger.warn('Could not forget a closed websocket connection; leaving it to expire');
    }

    return { statusCode: OK };
  };
}
