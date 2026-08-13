/**
 * Lambda entry point for `POST /uploads`.
 *
 * The exported type is AWS's own, so this layer's narrowed event declarations
 * stay checked against the real shape.
 */
import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { createUploadIntentHandler } from '../presentation/handlers/create-upload-intent.js';

const container = getContainer();

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = createUploadIntentHandler({
  useCase: container.createAudioUploadIntent,
  logger: container.logger,
});
