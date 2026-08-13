// Lambda entry point for GET /transcriptions.
import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { listTranscriptionsHandler } from '../presentation/handlers/list-transcriptions.js';

const container = getContainer();

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = listTranscriptionsHandler({
  useCase: container.listUserTranscriptions,
  logger: container.logger,
});
