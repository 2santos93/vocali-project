/**
 * Lambda entry point for `POST /transcriptions/realtime`.
 *
 * The dependency graph is built here, at module scope, so it is created once
 * per execution environment rather than once per request. Keeping that line
 * out of the handler module is what lets the handler be built from doubles in
 * a test without an AWS environment to read.
 *
 * The exported type is AWS's own, so the narrowed event declarations this
 * layer's handlers are written against stay checked against the real shape.
 */
import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { saveRealtimeTranscriptionHandler } from '../presentation/handlers/save-realtime-transcription.js';

const container = getContainer();

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = saveRealtimeTranscriptionHandler({
  useCase: container.saveRealtimeTranscription,
  logger: container.logger,
});
