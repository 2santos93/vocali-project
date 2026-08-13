import { withAuthenticatedUser } from '../http/authentication.js';
import { withErrorMapping } from '../http/error-mapping.js';
import { jsonResponse } from '../http/http-response.js';
import { CREATED } from '../http/http-status.js';
import type { ApiGatewayRequestHandler } from '../types/api-gateway-request-handler.js';
import type { CreateConnectionTicketDependencies } from '../types/create-connection-ticket-dependencies.js';

/**
 * `POST /connection-tickets` — exchanges a proven session for a credential
 * safe to put in a websocket's query string. No request body: the lifetime is
 * a decision this side makes.
 */
export function createConnectionTicketHandler(
  dependencies: CreateConnectionTicketDependencies,
): ApiGatewayRequestHandler {
  return withErrorMapping(
    dependencies.logger,
    withAuthenticatedUser(async (request) => {
      const ticket = await dependencies.useCase.execute({ userId: request.userId });

      return jsonResponse(CREATED, ticket, request.requestId);
    }),
  );
}
