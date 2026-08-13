import type { RegisterConnection } from '../../application/use-cases/register-connection.js';
import type { Logger } from '../../domain/ports/logger.js';
import {
  readAuthorizedUserId,
  type WebSocketHandler,
  type WebSocketRequestEvent,
  type WebSocketResponse,
} from '../websocket/websocket-event.js';
import { INTERNAL_SERVER_ERROR, OK, UNAUTHORIZED } from '../http/http-status.js';

interface Dependencies {
  readonly registerConnection: RegisterConnection;
  readonly logger: Logger;
}

/**
 * `$connect` — records the socket so completions have somewhere to go.
 *
 * The authorizer has already run and already spent the ticket, so the user id
 * here is resolved rather than claimed. Nothing in this event is trusted for
 * identity; a connection whose context carries no user is refused rather than
 * filed under a guess.
 *
 * A non-2xx from this route refuses the handshake, which is the right answer
 * when the entry could not be written: a socket that is open but unrecorded
 * receives nothing, for ever, and the browser has no way to tell. Better to
 * fail the connect and let the client fall back to polling, which is exactly
 * what it does.
 */
export function handleConnectionOpenedHandler(dependencies: Dependencies): WebSocketHandler {
  return async (event: WebSocketRequestEvent): Promise<WebSocketResponse> => {
    const logger = dependencies.logger.withCorrelationId(event.requestContext.requestId);
    const userId = readAuthorizedUserId(event);

    if (userId === null) {
      // Only reachable if the route were attached without its authorizer, or
      // with one that stopped returning a context. Both are configuration
      // faults, and the safe reading of "I cannot tell whose socket this is"
      // is to refuse it.
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
      // item being written, which names a user. The correlation id is enough
      // to find the SDK's own log entry.
      logger.error('Could not record a websocket connection');

      return { statusCode: INTERNAL_SERVER_ERROR };
    }

    return { statusCode: OK };
  };
}
