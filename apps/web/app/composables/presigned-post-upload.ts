import type { TranslatableMessage } from '../i18n/types/TranslatableMessage';
import { HTTP_FORBIDDEN, HTTP_MULTIPLE_CHOICES, HTTP_OK } from '../utils/http-status';
import type { PresignedPostUpload } from './types/PresignedPostUpload';
import type { StorageUploadFailureCode } from './types/StorageUploadFailureCode';

/**
 * The only part of the upload flow that leaves the application: everything
 * else goes through the BFF proxy, and this posts straight at a bucket. Kept
 * apart from `useFileUpload` because the part order, the field name and the
 * status ranges below belong to S3's presigned POST contract, not to us.
 */

const PERCENT = 100;

export class StorageUploadError extends Error {
  public readonly code: StorageUploadFailureCode;

  /** The sentence is produced from this at the moment it is rendered. */
  public readonly detail: TranslatableMessage;

  constructor(code: StorageUploadFailureCode, detail: TranslatableMessage) {
    super(detail.key);
    this.name = 'StorageUploadError';
    this.code = code;
    this.detail = detail;
  }
}

/**
 * **The policy fields must precede the file, which is why this exists rather
 * than three lines at the call site.** S3 parses the multipart body in order
 * and stops collecting form fields at the file part, so a body that puts the
 * file first arrives with no policy, no signature and no key — and fails,
 * after however long the file took to send, for a reason S3 does not state.
 *
 * `file` is the part name the contract requires; it is not a choice.
 */
export function buildPresignedPostForm(
  fields: Readonly<Record<string, string>>,
  file: File,
): FormData {
  const form = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    form.append(name, value);
  }

  form.append('file', file, file.name);

  return form;
}

function describeStorageRefusal(status: number): TranslatableMessage {
  if (status === HTTP_FORBIDDEN) {
    return { key: 'failure.upload.storageRefused' };
  }
  return { key: 'failure.upload.storageUnavailable' };
}

/**
 * `XMLHttpRequest` rather than `fetch` for one reason: `fetch` cannot report
 * upload progress at all — it exposes a stream for the response and nothing
 * for the request, so a `fetch` upload can only show a bar moving on a timer.
 */
export function uploadToPresignedPost(
  upload: PresignedPostUpload,
  createRequest: () => XMLHttpRequest = (): XMLHttpRequest => new XMLHttpRequest(),
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = createRequest();
    request.open('POST', upload.url);

    request.upload.addEventListener('progress', (event: ProgressEvent) => {
      // `total` is 0 until the request has a length, so the first event of
      // every upload would otherwise divide by zero and report NaN.
      if (!event.lengthComputable || event.total === 0) {
        return;
      }
      upload.onProgress?.((event.loaded / event.total) * PERCENT);
    });

    request.addEventListener('load', () => {
      if (request.status >= HTTP_OK && request.status < HTTP_MULTIPLE_CHOICES) {
        // The last progress event can fall short of the total, and a bar frozen
        // at 98% next to a finished upload reads as a hang.
        upload.onProgress?.(PERCENT);
        resolve();
        return;
      }
      reject(new StorageUploadError('REFUSED', describeStorageRefusal(request.status)));
    });

    request.addEventListener('error', () => {
      reject(new StorageUploadError('NETWORK_FAILED', { key: 'failure.upload.connectionLost' }));
    });

    request.addEventListener('timeout', () => {
      reject(new StorageUploadError('NETWORK_FAILED', { key: 'failure.upload.timedOut' }));
    });

    request.addEventListener('abort', () => {
      reject(new StorageUploadError('ABORTED', { key: 'failure.upload.aborted' }));
    });

    request.send(buildPresignedPostForm(upload.fields, upload.file));
  });
}
