import { withAuthenticatedUser } from '../http/authentication.js';
import { withErrorMapping } from '../http/error-mapping.js';
import { jsonResponse } from '../http/http-response.js';
import { OK } from '../http/http-status.js';
import type { ApiGatewayRequestHandler } from '../types/http.js';
import type { CreateRealtimeSessionDependencies } from '../types/dependencies.js';

// POST /realtime-sessions
export function createRealtimeSessionHandler(
  dependencies: CreateRealtimeSessionDependencies,
): ApiGatewayRequestHandler {
  return withErrorMapping(
    dependencies.logger,
    withAuthenticatedUser(async (request) => {
      const session = await dependencies.useCase.execute();

      return jsonResponse(OK, session, request.requestId);
    }),
  );
}
