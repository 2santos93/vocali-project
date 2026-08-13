/**
 * Lambda entry point for the websocket `$connect` authorizer.
 *
 * The exported type is AWS's own `APIGatewayRequestAuthorizerHandler`, so the
 * narrowed event and result declarations this layer is written against stay
 * checked against the real shapes — the same arrangement the HTTP entry points
 * use.
 *
 * A websocket authorizer is necessarily of the REQUEST kind: a browser cannot
 * set a header on a `WebSocket`, so there is no token identity source to build
 * a TOKEN authorizer on.
 */
import type { APIGatewayRequestAuthorizerHandler } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { authorizeConnectionHandler } from '../presentation/handlers/authorize-connection.js';

const container = getContainer();

export const handler: APIGatewayRequestAuthorizerHandler = authorizeConnectionHandler({
  redeemConnectionTicket: container.redeemConnectionTicket,
  logger: container.logger,
});
