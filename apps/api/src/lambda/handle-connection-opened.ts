/**
 * Lambda entry point for the websocket `$connect` route.
 *
 * Runs after the authorizer has validated and spent the connection ticket, so
 * the user id on the event's authorizer context is resolved rather than
 * claimed.
 */
import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { handleConnectionOpenedHandler } from '../presentation/handlers/handle-connection-opened.js';

const container = getContainer();

export const handler: APIGatewayProxyWebsocketHandlerV2 = handleConnectionOpenedHandler({
  registerConnection: container.registerConnection,
  logger: container.logger,
});
