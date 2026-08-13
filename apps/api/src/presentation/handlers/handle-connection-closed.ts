import { readAuthorizedUserId } from '../websocket/websocket-event.js';
import { OK } from '../http/http-status.js';
import type { HandleConnectionClosedDependencies } from '../types/handle-connection-closed-dependencies.js';
import type { WebSocketHandler } from '../types/websocket-handler.js';
import type { WebSocketRequestEvent } from '../types/websocket-request-event.js';
import type { WebSocketResponse } from '../types/websocket-response.js';

/**
 * `$disconnect` — forgets a socket the client closed.
 *
 * **Always answers 200, whatever happened.** The connection is already gone by
 * the time this runs, so a failure status changes nothing a client can observe
 * and only adds a Lambda error to the metrics. An entry it failed to delete is
 * not stranded: every entry carries an expiry, precisely because this route is
 * best-effort by API Gateway's own definition.
 *
 * The user comes from the `$connect` authorizer's context. When it is missing
 * there is no key to delete, and the expiry collects the entry.
 */
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
