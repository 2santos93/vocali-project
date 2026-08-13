// Lambda entry point for POST /webhooks/transcription-provider.
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { handleProviderCallbackHandler } from '../presentation/handlers/handle-provider-callback.js';

const container = getContainer();

export const handler: APIGatewayProxyHandlerV2 = handleProviderCallbackHandler({
  completeTranscription: container.completeTranscription,
  failTranscription: container.failTranscription,
  publishTranscriptionUpdate: container.publishTranscriptionUpdate,
  transcriptionProvider: container.transcriptionProvider,
  secrets: container.secrets,
  webhookSecretName: container.config.speechmatics.webhookSecretName,
  logger: container.logger,
});
