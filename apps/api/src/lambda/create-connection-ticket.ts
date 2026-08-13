/** Lambda entry point for `POST /connection-tickets`. */
import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { createConnectionTicketHandler } from '../presentation/handlers/create-connection-ticket.js';

const container = getContainer();

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = createConnectionTicketHandler({
  useCase: container.issueConnectionTicket,
  logger: container.logger,
});
