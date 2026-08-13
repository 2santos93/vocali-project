import type { TranslatableMessage } from '../i18n/translate';
import { readStatusCode } from '../utils/http-failure';
import {
  HTTP_PAYLOAD_TOO_LARGE,
  HTTP_UNAUTHORIZED,
  HTTP_UNSUPPORTED_MEDIA_TYPE,
} from '../utils/http-status';
import { StorageUploadError } from './presigned-post-upload';

/**
 * How an upload can end, and what the user is told when it ends badly.
 *
 * The counterpart of `recording-failures`, and gathered for the same reason:
 * these were being built at four separate points in the flow, and the question
 * each one answers is the same — the file did not get transcribed, so what
 * should the person try next. Keeping them together is what makes it possible
 * to read that answer as a set rather than reconstruct it from four call
 * sites.
 *
 * The phase is here rather than with the composable for the same reason it is
 * in `recording-failures`: `failed` and `stillProcessing` are two of its
 * members, and the panel reads the phase and the failure as one pair.
 * `useFileUpload` is the flow that moves through these; this is the vocabulary
 * it moves through.
 */

export type FileUploadPhase =
  | 'idle'
  | 'requesting'
  | 'uploading'
  | 'processing'
  /** Transcribed and stored. */
  | 'completed'
  /** The attempt ended badly; `failure` says how. */
  | 'failed'
  /**
   * Uploaded and accepted, but still being transcribed when the watch budget
   * ran out. Distinct from `failed` because nothing went wrong.
   */
  | 'stillProcessing';

export type FileUploadFailureCode =
  | 'SESSION_EXPIRED'
  | 'UNSUPPORTED_FORMAT'
  | 'INTENT_REFUSED'
  | 'STORAGE_REFUSED'
  | 'NETWORK_FAILED'
  | 'TRANSCRIPTION_FAILED';

export interface FileUploadFailure {
  readonly code: FileUploadFailureCode;
  /** Spanish, and phrased so it says what to do next. */
  readonly message: TranslatableMessage;
}

/**
 * The API refused to issue an upload intent.
 *
 * The three statuses that are named say something the user can act on — sign
 * in again, choose a smaller file, choose a different format. Everything else
 * with a status collapses into one sentence, and no status at all means the
 * request never arrived, which is a different problem with a different remedy.
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
 * The transfer to the bucket failed. `StorageUploadError` already carries a
 * sentence chosen from what S3 answered, so it is passed through rather than
 * restated; anything else reaching here is not something this code predicted.
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
 * The browser reported a type the contract does not name. Caught before
 * anything is sent, so the file name is quoted back — it is the one failure
 * where the user picked the wrong thing and needs to know which thing.
 */
export function describeUnsupportedFormat(fileName: string): FileUploadFailure {
  return {
    code: 'UNSUPPORTED_FORMAT',
    message: { key: 'failure.upload.unknownFormat', values: { fileName } },
  };
}

/**
 * The upload arrived and the transcription itself failed. Nothing to retry
 * from here: the record is in the history carrying the reason.
 */
export const TRANSCRIPTION_FAILED: FileUploadFailure = {
  code: 'TRANSCRIPTION_FAILED',
  message: { key: 'failure.upload.transcriptionFailed' },
};
