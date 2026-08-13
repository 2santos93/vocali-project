import { readStatusCode } from '../utils/http-failure';
import { HTTP_UNAUTHORIZED } from '../utils/http-status';
import { MicrophoneError } from './audio-capture';
import {
  CLOSE_INTERNAL_ERROR,
  CLOSE_JOB_ERROR,
  CLOSE_NOT_AUTHORISED,
  CLOSE_QUOTA_EXCEEDED,
} from './realtime-provider-protocol';
import type { RecordingFailure } from './types/recording';

export function describeCloseCode(code: number): RecordingFailure {
  if (code === CLOSE_NOT_AUTHORISED) {
    return {
      code: 'SESSION_EXPIRED',
      message: { key: 'failure.dictation.credentialExpired' },
      recoverable: true,
    };
  }
  if (code === CLOSE_QUOTA_EXCEEDED) {
    return {
      code: 'PROVIDER_QUOTA_EXCEEDED',
      message: { key: 'failure.dictation.quotaExceeded' },
      recoverable: true,
    };
  }
  if (code === CLOSE_JOB_ERROR || code === CLOSE_INTERNAL_ERROR) {
    return {
      code: 'PROVIDER_FAILED',
      message: { key: 'failure.dictation.providerFailed' },
      recoverable: true,
    };
  }
  return {
    code: 'CONNECTION_LOST',
    message: { key: 'failure.dictation.connectionLost' },
    recoverable: true,
  };
}

/**
 * The provider session could not be minted, so nothing has been recorded yet.
 * Not recoverable, and not a judgement call: there is no text to offer back.
 */
export function describeSessionFailure(error: unknown): RecordingFailure {
  return readStatusCode(error) === HTTP_UNAUTHORIZED
    ? {
        code: 'SESSION_EXPIRED',
        message: { key: 'failure.dictation.sessionExpired' },
        recoverable: false,
      }
    : {
        code: 'SESSION_UNAVAILABLE',
        message: { key: 'failure.dictation.sessionUnavailable' },
        recoverable: false,
      };
}

/**
 * Which of the two device failures it was is decided in `audio-capture`, the
 * layer that can still see what the browser rejected with.
 */
export function describeMicrophoneFailure(error: unknown): RecordingFailure {
  const code = error instanceof MicrophoneError ? error.code : 'CAPTURE_FAILED';

  return {
    code: code === 'PERMISSION_DENIED' ? 'MICROPHONE_DENIED' : 'MICROPHONE_UNAVAILABLE',
    message:
      error instanceof MicrophoneError ? error.detail : { key: 'failure.microphone.unavailable' },
    recoverable: false,
  };
}

/**
 * Not recoverable because there is nothing to recover: offering to save an
 * empty dictation invites a press on a button that cannot work.
 */
export const NOTHING_TO_SAVE: RecordingFailure = {
  code: 'NOTHING_TO_SAVE',
  message: { key: 'failure.dictation.nothingHeard' },
  recoverable: false,
};

export function describeSaveFailure(error: unknown): RecordingFailure {
  return {
    code: 'SAVE_FAILED',
    message:
      readStatusCode(error) === HTTP_UNAUTHORIZED
        ? { key: 'failure.dictation.saveSessionExpired' }
        : { key: 'failure.dictation.saveFailed' },
    recoverable: true,
  };
}
