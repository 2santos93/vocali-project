import type { S3EventHandler, S3ObjectCreatedEvent } from '../types/events.js';
import type { StartTranscriptionJobDependencies } from '../types/dependencies.js';

/**
 * An infrastructure failure is allowed to propagate so Lambda retries the whole
 * notification, which is safe because the use case is idempotent.
 *
 * An event resolving to no record is logged and acknowledged instead. Retrying
 * cannot help — the record is written before the client is handed an upload
 * URL, so a miss means a stray object, not a race — and throwing puts the
 * notification into an endless redelivery loop and then a dead-letter queue.
 */
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

/**
 * S3 event notifications deliver the object key URL-encoded, with a space as
 * `+` rather than `%20`: `informe radiología.mp3` arrives as
 * `informe+radiolog%C3%ADa.mp3`. Without decoding, the key never matches the
 * stored `audioObjectKey`, the upload sits at `PENDING_UPLOAD` for ever, and no
 * error surfaces. Accents and spaces are the ordinary case for a Spanish
 * clinical product, so this breaks most uploads while ASCII fixtures stay green.
 *
 * The `+` is replaced *before* decoding: `%2B` is a literal plus in the file
 * name, and decoding first would turn it into a `+` the replacement destroys.
 *
 * An undecodable key returns null rather than throwing, so one malformed object
 * cannot take a whole batch of notifications down on every retry.
 */
export function decodeS3ObjectKey(key: string): string | null {
  try {
    return decodeURIComponent(key.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}
