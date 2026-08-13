// Lambda entry point for POST /transcriptions/realtime.
import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { saveRealtimeTranscriptionHandler } from '../presentation/handlers/save-realtime-transcription.js';

const container = getContainer();

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = saveRealtimeTranscriptionHandler({
  useCase: container.saveRealtimeTranscription,
  logger: container.logger,
});
