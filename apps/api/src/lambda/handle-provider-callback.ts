/**
 * Lambda entry point for `POST /webhooks/transcription-provider, with no JWT authorizer`.
 *
 * The dependency graph is built here, at module scope, so it is created once
 * per execution environment rather than once per request. Keeping that line
 * out of the handler module is what lets the handler be built from doubles in
 * a test without an AWS environment to read.
 *
 * The exported type is AWS's own, so the narrowed event declarations this
 * layer's handlers are written against stay checked against the real shape.
 */
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { handleProviderCallbackHandler } from '../presentation/handlers/handle-provider-callback.js';

const container = getContainer();

export const handler: APIGatewayProxyHandlerV2 = handleProviderCallbackHandler({
  completeTranscription: container.completeTranscription,
  failTranscription: container.failTranscription,
  secrets: container.secrets,
  webhookSecretName: container.config.speechmatics.webhookSecretName,
  logger: container.logger,
});
