import type { IssueConnectionTicket } from '../../application/use-cases/issue-connection-ticket.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { ApiGatewayRequestHandler } from '../http/api-gateway-request.js';
import { withAuthenticatedUser } from '../http/authentication.js';
import { withErrorMapping } from '../http/error-mapping.js';
import { jsonResponse } from '../http/http-response.js';
import { CREATED } from '../http/http-status.js';

interface Dependencies {
  readonly useCase: IssueConnectionTicket;
  readonly logger: Logger;
}

/**
 * `POST /connection-tickets` — exchanges a proven session for a credential
 * safe to put in a websocket's query string.
 *
 * Behind the JWT authorizer, like every other route but the provider webhook,
 * so the `sub` this hands to the use case has already had its signature,
 * issuer, audience and expiry checked at the edge. That is the entire value
 * the endpoint adds: it is the only place the platform can turn a header-borne
 * identity into a query-string-borne one without the long-lived secret making
 * the trip.
 *
 * There is no request body. The lifetime and the endpoint are decisions this
 * side makes, exactly as with `POST /realtime-sessions`.
 *
 * 201, because it mints something: each call produces a new ticket, and the
 * previous one is not returned or reused.
 */
export function createConnectionTicketHandler(
  dependencies: Dependencies,
): ApiGatewayRequestHandler {
  return withErrorMapping(
    dependencies.logger,
    withAuthenticatedUser(async (request) => {
      const ticket = await dependencies.useCase.execute({ userId: request.userId });

      return jsonResponse(CREATED, ticket, request.requestId);
    }),
  );
}
