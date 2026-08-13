import type { CreateRealtimeSession } from '../../application/use-cases/create-realtime-session.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { ApiGatewayRequestHandler } from '../http/api-gateway-request.js';
import { withAuthenticatedUser } from '../http/authentication.js';
import { withErrorMapping } from '../http/error-mapping.js';
import { jsonResponse } from '../http/http-response.js';
import { OK } from '../http/http-status.js';

interface Dependencies {
  readonly useCase: CreateRealtimeSession;
  readonly logger: Logger;
}

/**
 * `POST /realtime-sessions` — mints a short-lived provider credential for the
 * browser to open its websocket with.
 *
 * There is no request body: the audio format and the credential lifetime are
 * platform decisions, not per-session negotiation, so there is nothing for a
 * client to ask for. It still requires a signed-in user, because the
 * credential it returns spends the platform's provider quota — an
 * unauthenticated route here is an open tap on a metered account, even though
 * no record is read or written.
 */
export function createRealtimeSessionHandler(dependencies: Dependencies): ApiGatewayRequestHandler {
  return withErrorMapping(
    dependencies.logger,
    withAuthenticatedUser(async (request) => {
      const session = await dependencies.useCase.execute();

      return jsonResponse(OK, session, request.requestId);
    }),
  );
}
