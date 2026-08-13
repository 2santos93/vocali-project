/**
 * Lambda entry point for `POST /realtime-sessions`.
 *
 * The exported type is AWS's own, so this layer's narrowed event declarations
 * stay checked against the real shape.
 */
import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { createRealtimeSessionHandler } from '../presentation/handlers/create-realtime-session.js';

const container = getContainer();

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = createRealtimeSessionHandler({
  useCase: container.createRealtimeSession,
  logger: container.logger,
});
