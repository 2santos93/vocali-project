import type { StartFileTranscription } from '../../application/use-cases/start-file-transcription.js';
import type { Logger } from '../../domain/ports/logger.js';

/**
 * The one field of an S3 event notification this handler reads. The entry
 * point in `src/lambda/` declares AWS's `S3Handler`, so this narrowing is
 * still checked against the real event shape.
 */
export interface S3ObjectCreatedEvent {
  readonly Records: readonly {
    readonly s3: { readonly object: { readonly key: string } };
  }[];
}

export type S3EventHandler = (event: S3ObjectCreatedEvent) => Promise<void>;

interface Dependencies {
  readonly useCase: StartFileTranscription;
  readonly logger: Logger;
}

/**
 * Submits a freshly uploaded object to the transcription provider.
 *
 * Records are processed one at a time and an infrastructure failure is
 * allowed to propagate, so Lambda retries the whole notification. That is
 * safe because the use case is idempotent: a redelivered event for a
 * transcription already past `PENDING_UPLOAD` is acknowledged without
 * contacting storage or the provider, so a retry cannot produce a second
 * provider job or spend quota twice.
 *
 * An event that resolves to no record is logged and acknowledged rather than
 * retried. Retrying cannot help — the record is written before the client is
 * ever handed an upload URL, so a miss means a stray object, not a race — and
 * throwing would put the notification into an endless redelivery loop and
 * then a dead-letter queue.
 */
export function startTranscriptionJobHandler(dependencies: Dependencies): S3EventHandler {
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
 * S3 event notifications deliver the object key URL-encoded, and encode a
 * space as `+` rather than `%20`. A file named `informe radiología.mp3`
 * arrives as `informe+radiolog%C3%ADa.mp3`.
 *
 * Without this, the decoded key never matches the `audioObjectKey` stored on
 * the record, `StartFileTranscription` reports the record as not found, and
 * the upload sits at `PENDING_UPLOAD` for ever — no error surfaces, the user
 * simply watches a transcription that never starts. On a Spanish clinical
 * product, file names carrying an accent or a space are the ordinary case,
 * not the edge case, so this would silently break most uploads while every
 * test with an ASCII fixture stayed green.
 *
 * The `+` is replaced before decoding, not after: `%2B` is a literal plus in
 * the file name, and decoding first would turn it into a `+` that the
 * replacement then destroyed.
 *
 * A key that cannot be decoded — a stray `%` in an object written by
 * something other than this platform — returns null rather than throwing, so
 * one malformed object cannot fail an entire batch of notifications and take
 * the valid uploads in it down on every retry.
 */
export function decodeS3ObjectKey(key: string): string | null {
  try {
    return decodeURIComponent(key.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}
