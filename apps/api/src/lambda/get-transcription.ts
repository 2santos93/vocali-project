/**
 * Lambda entry point for `GET /transcriptions/{transcriptionId}`.
 *
 * The exported type is AWS's own, so this layer's narrowed event declarations
 * stay checked against the real shape.
 */
import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { getTranscriptionHandler } from '../presentation/handlers/get-transcription.js';

const container = getContainer();

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = getTranscriptionHandler({
  useCase: container.getTranscription,
  logger: container.logger,
});
