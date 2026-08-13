/**
 * Lambda entry point for `GET /transcriptions/{transcriptionId}/download`.
 *
 * The exported type is AWS's own, so this layer's narrowed event declarations
 * stay checked against the real shape.
 */
import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { getTranscriptionDownloadUrlHandler } from '../presentation/handlers/get-transcription-download-url.js';

const container = getContainer();

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer =
  getTranscriptionDownloadUrlHandler({
    useCase: container.getTranscriptionDownloadUrl,
    logger: container.logger,
  });
