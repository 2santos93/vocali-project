import type { APIGatewayRequestAuthorizerHandler } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { authorizeConnectionHandler } from '../presentation/handlers/authorize-connection.js';

const container = getContainer();

export const handler: APIGatewayRequestAuthorizerHandler = authorizeConnectionHandler({
  redeemConnectionTicket: container.redeemConnectionTicket,
  logger: container.logger,
});
