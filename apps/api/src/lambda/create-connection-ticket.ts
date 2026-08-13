/**
 * Lambda entry point for `POST /connection-tickets`, behind the JWT authorizer.
 *
 * The dependency graph is built here, at module scope, so it is created once
 * per execution environment rather than once per request.
 */
import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { createConnectionTicketHandler } from '../presentation/handlers/create-connection-ticket.js';

const container = getContainer();

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = createConnectionTicketHandler({
  useCase: container.issueConnectionTicket,
  logger: container.logger,
});
