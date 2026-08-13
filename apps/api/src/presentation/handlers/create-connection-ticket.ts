import { withAuthenticatedUser } from '../http/authentication.js';
import { withErrorMapping } from '../http/error-mapping.js';
import { jsonResponse } from '../http/http-response.js';
import { CREATED } from '../http/http-status.js';
import type { ApiGatewayRequestHandler } from '../types/http.js';
import type { CreateConnectionTicketDependencies } from '../types/dependencies.js';

// POST /connection-tickets
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
