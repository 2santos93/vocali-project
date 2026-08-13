import type { S3EventHandler, S3ObjectCreatedEvent } from '../types/events.js';
import type { StartTranscriptionJobDependencies } from '../types/dependencies.js';

export function startTranscriptionJobHandler(
  dependencies: StartTranscriptionJobDependencies,
): S3EventHandler {
  return async (event: S3ObjectCreatedEvent): Promise<void> => {
    for (const record of event.Records) {
      const objectKey = decodeS3ObjectKey(record.s3.object.key);

      if (objectKey === null) {
        dependencies.logger.info('Ignoring an upload event whose object key could not be decoded', {
          rawObjectKey: record.s3.object.key,
        });
        continue;
      }

      const result = await dependencies.useCase.execute({ audioObjectKey: objectKey });

      if (!result.success) {
        dependencies.logger.info('Ignoring an upload event with no matching transcription', {
          objectKey,
          code: result.error.code,
        });
      }
    }
  };
}

export function decodeS3ObjectKey(key: string): string | null {
  try {
    return decodeURIComponent(key.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}
