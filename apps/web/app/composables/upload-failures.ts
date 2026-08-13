import { readStatusCode } from '../utils/http-failure';
import {
  HTTP_PAYLOAD_TOO_LARGE,
  HTTP_UNAUTHORIZED,
  HTTP_UNSUPPORTED_MEDIA_TYPE,
} from '../utils/http-status';
import { StorageUploadError } from './presigned-post-upload';
import type { FileUploadFailure } from './types/upload';

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
