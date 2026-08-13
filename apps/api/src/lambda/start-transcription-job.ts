import type { S3Handler } from 'aws-lambda';
import { getContainer } from '../composition-root.js';
import { startTranscriptionJobHandler } from '../presentation/handlers/start-transcription-job.js';

const container = getContainer();

export const handler: S3Handler = startTranscriptionJobHandler({
  useCase: container.startFileTranscription,
  logger: container.logger,
});
