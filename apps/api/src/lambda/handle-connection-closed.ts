/** Lambda entry point for the websocket `$disconnect` route. */
import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { handleConnectionClosedHandler } from '../presentation/handlers/handle-connection-closed.js';

const container = getContainer();

export const handler: APIGatewayProxyWebsocketHandlerV2 = handleConnectionClosedHandler({
  deregisterConnection: container.deregisterConnection,
  logger: container.logger,
});
