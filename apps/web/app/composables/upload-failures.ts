import { readStatusCode } from '../utils/http-failure';
import {
  HTTP_PAYLOAD_TOO_LARGE,
  HTTP_UNAUTHORIZED,
  HTTP_UNSUPPORTED_MEDIA_TYPE,
} from '../utils/http-status';
import { StorageUploadError } from './presigned-post-upload';
import type { FileUploadFailure } from './types/upload';

/**
 * The counterpart of `recording-failures`, gathered here so the answer to
 * "what should the person try next" reads as a set rather than being
 * reconstructed from the four call sites that used to build these.
 */

/**
 * The named statuses say something the user can act on. No status at all means
 * the request never arrived, which is a different problem with a different
 * remedy, so it does not collapse into the generic sentence.
 */
export function describeIntentFailure(error: unknown): FileUploadFailure {
  const status = readStatusCode(error);

  if (status === HTTP_UNAUTHORIZED) {
    return {
      code: 'SESSION_EXPIRED',
      message: { key: 'failure.upload.sessionExpired' },
    };
  }
  if (status === HTTP_PAYLOAD_TOO_LARGE) {
    return {
      code: 'INTENT_REFUSED',
      message: { key: 'failure.upload.tooLarge' },
    };
  }
  if (status === HTTP_UNSUPPORTED_MEDIA_TYPE) {
    return {
      code: 'INTENT_REFUSED',
      message: { key: 'failure.upload.unsupportedFormat' },
    };
  }
  if (status !== null) {
    return {
      code: 'INTENT_REFUSED',
      message: { key: 'failure.upload.refused' },
    };
  }
  return {
    code: 'NETWORK_FAILED',
    message: { key: 'failure.upload.unreachable' },
  };
}

/**
 * `StorageUploadError` already carries a sentence chosen from what S3
 * answered, so it is passed through rather than restated.
 */
export function describeUploadFailure(error: unknown): FileUploadFailure {
  if (error instanceof StorageUploadError) {
    return {
      code: error.code === 'REFUSED' ? 'STORAGE_REFUSED' : 'NETWORK_FAILED',
      message: error.detail,
    };
  }
  return {
    code: 'NETWORK_FAILED',
    message: { key: 'failure.upload.unexpected' },
  };
}

/**
 * The file name is quoted back: this is the one failure where the user picked
 * the wrong thing and needs to know which thing.
 */
export function describeUnsupportedFormat(fileName: string): FileUploadFailure {
  return {
    code: 'UNSUPPORTED_FORMAT',
    message: { key: 'failure.upload.unknownFormat', values: { fileName } },
  };
}

/** Nothing to retry from here: the record is in the history carrying the reason. */
export const TRANSCRIPTION_FAILED: FileUploadFailure = {
  code: 'TRANSCRIPTION_FAILED',
  message: { key: 'failure.upload.transcriptionFailed' },
};
