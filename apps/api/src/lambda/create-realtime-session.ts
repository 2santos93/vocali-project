// Lambda entry point for POST /realtime-sessions.
import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { createRealtimeSessionHandler } from '../presentation/handlers/create-realtime-session.js';

const container = getContainer();

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = createRealtimeSessionHandler({
  useCase: container.createRealtimeSession,
  logger: container.logger,
});
