/**
 * Lambda entry point for `S3 ObjectCreated notification on the audio/ prefix`.
 *
 * The exported type is AWS's own, so this layer's narrowed event declarations
 * stay checked against the real shape.
 */
import type { S3Handler } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { startTranscriptionJobHandler } from '../presentation/handlers/start-transcription-job.js';

const container = getContainer();

export const handler: S3Handler = startTranscriptionJobHandler({
  useCase: container.startFileTranscription,
  logger: container.logger,
});
