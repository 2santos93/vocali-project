import type { DeregisterConnection } from '../../application/use-cases/deregister-connection.js';
import type { Logger } from '../../domain/ports/logger.js';
import {
  readAuthorizedUserId,
  type WebSocketHandler,
  type WebSocketRequestEvent,
  type WebSocketResponse,
} from '../websocket/websocket-event.js';
import { OK } from '../http/http-status.js';

interface Dependencies {
  readonly deregisterConnection: DeregisterConnection;
  readonly logger: Logger;
}

/**
 * `$disconnect` — forgets a socket the client closed.
 *
 * **Always answers 200, whatever happened.** Nothing is listening: the
 * connection is already gone by the time this runs, so a failure status
 * changes nothing a client can observe and only adds a Lambda error to the
 * metrics. The entry it failed to delete is not stranded either — every entry
 * carries an expiry precisely because this route is best-effort by API
 * Gateway's own definition, and is simply not delivered when a connection dies
 * with the network rather than with a close frame.
 *
 * The user comes from the `$connect` authorizer's context, which API Gateway
 * carries forward onto the connection's later routes. When it is missing there
 * is nothing to do: the entry is keyed by user, so without one there is no key
 * to delete, and the expiry collects it.
 */
export function handleConnectionClosedHandler(dependencies: Dependencies): WebSocketHandler {
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
