// Lambda entry point for GET /transcriptions/{transcriptionId}.
import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { getTranscriptionHandler } from '../presentation/handlers/get-transcription.js';

const container = getContainer();

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = getTranscriptionHandler({
  useCase: container.getTranscription,
  logger: container.logger,
});
