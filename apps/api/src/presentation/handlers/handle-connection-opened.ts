import { readAuthorizedUserId } from '../websocket/websocket-event.js';
import { INTERNAL_SERVER_ERROR, OK, UNAUTHORIZED } from '../http/http-status.js';
import type { HandleConnectionOpenedDependencies } from '../types/dependencies.js';
import type {
  WebSocketHandler,
  WebSocketRequestEvent,
  WebSocketResponse,
} from '../types/websocket.js';

/**
 * `$connect` — records the socket so completions have somewhere to go.
 *
 * A non-2xx here refuses the handshake, which is the right answer when the
 * entry could not be written: a socket that is open but unrecorded receives
 * nothing, for ever, and the browser has no way to tell. Failing the connect
 * lets the client fall back to polling instead.
 */
export function handleConnectionOpenedHandler(
  dependencies: HandleConnectionOpenedDependencies,
): WebSocketHandler {
  return async (event: WebSocketRequestEvent): Promise<WebSocketResponse> => {
    const logger = dependencies.logger.withCorrelationId(event.requestContext.requestId);
    const userId = readAuthorizedUserId(event);

    if (userId === null) {
      // Only reachable if the route were attached without its authorizer, or
      // with one that stopped returning a context. The safe reading of "I
      // cannot tell whose socket this is" is to refuse it.
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
