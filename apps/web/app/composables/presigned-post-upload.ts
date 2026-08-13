import type { TranslatableMessage } from '../i18n/translate';
import { HTTP_FORBIDDEN, HTTP_MULTIPLE_CHOICES, HTTP_OK } from '../utils/http-status';

/**
 * Sending the file itself to S3, with a bar that means something.
 *
 * The only part of the upload flow that leaves the application: everything
 * else goes through the BFF proxy, and this posts a multipart body straight at
 * a bucket using fields the API signed. It is separate from `useFileUpload`
 * because it belongs to S3's presigned POST contract rather than to this
 * product — the part order, the field name, the status ranges and the progress
 * events are all things Amazon decided.
 */

/** The percentage denominator, named so the arithmetic below reads as intent. */
const PERCENT = 100;

export interface PresignedPostUpload {
  readonly url: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly file: File;
  readonly onProgress?: (percentage: number) => void;
}

export type StorageUploadFailureCode = 'REFUSED' | 'NETWORK_FAILED' | 'ABORTED';

export class StorageUploadError extends Error {
  public readonly code: StorageUploadFailureCode;

  /**
   * What the reader is told. `Error.message` is a string by construction and a
   * developer reads it in a stack trace, so it carries the key; the sentence
   * is produced from `detail` at the moment it is rendered.
   */
  public readonly detail: TranslatableMessage;

  constructor(code: StorageUploadFailureCode, detail: TranslatableMessage) {
    super(detail.key);
    this.name = 'StorageUploadError';
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Assembles the multipart body of a presigned POST.
 *
 * **The policy fields must precede the file, and that is the entire reason
 * this function exists rather than three lines at the call site.** S3 parses
 * the multipart body in order and stops collecting form fields the moment it
 * reaches the file part; anything after it is ignored. A body that puts the
 * file first therefore arrives with no policy, no signature and no key, and
 * S3 answers with a policy error that names none of that. The upload simply
 * fails, at the end of however long the file took to send, for a reason the
 * response does not state.
 *
 * `file` is the part name the presigned POST contract requires; it is not a
 * choice.
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
 * POSTs the file straight to S3, reporting how much of it has been sent.
 *
 * `XMLHttpRequest` rather than `fetch` for one reason: `fetch` cannot report
 * upload progress at all. It exposes a stream for the response and nothing for
 * the request, so a `fetch`-based upload can only show a bar that moves on a
 * timer — which tells the user something the code does not know. On a 20 MB
 * file over a clinic's connection that difference is a minute of either
 * genuine feedback or a fiction.
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
        // The last progress event can arrive a little short of the total, and
        // a bar frozen at 98% next to a finished upload reads as a hang.
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
