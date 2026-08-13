/** Lambda entry point for the websocket `$connect` route. */
import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { handleConnectionOpenedHandler } from '../presentation/handlers/handle-connection-opened.js';

const container = getContainer();

export const handler: APIGatewayProxyWebsocketHandlerV2 = handleConnectionOpenedHandler({
  registerConnection: container.registerConnection,
  logger: container.logger,
});
