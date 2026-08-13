/**
 * Lambda entry point for the websocket `$connect` authorizer.
 *
 * Necessarily of the REQUEST kind: a browser cannot set a header on a
 * `WebSocket`, so there is no token identity source for a TOKEN authorizer.
 */
import type { APIGatewayRequestAuthorizerHandler } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { authorizeConnectionHandler } from '../presentation/handlers/authorize-connection.js';

const container = getContainer();

export const handler: APIGatewayRequestAuthorizerHandler = authorizeConnectionHandler({
  redeemConnectionTicket: container.redeemConnectionTicket,
  logger: container.logger,
});
