/**
 * Lambda entry point for the websocket `$disconnect` route.
 *
 * Best-effort by API Gateway's own definition: it is not delivered when a
 * connection dies with the network rather than with a close frame, which is
 * why every recorded connection also carries an expiry.
 */
import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { handleConnectionClosedHandler } from '../presentation/handlers/handle-connection-closed.js';

const container = getContainer();

export const handler: APIGatewayProxyWebsocketHandlerV2 = handleConnectionClosedHandler({
  deregisterConnection: container.deregisterConnection,
  logger: container.logger,
});
