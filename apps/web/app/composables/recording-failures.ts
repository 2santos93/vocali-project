import { readStatusCode } from '../utils/http-failure';
import { HTTP_UNAUTHORIZED } from '../utils/http-status';
import { MicrophoneError } from './audio-capture';
import {
  CLOSE_INTERNAL_ERROR,
  CLOSE_JOB_ERROR,
  CLOSE_NOT_AUTHORISED,
  CLOSE_QUOTA_EXCEEDED,
} from './realtime-provider-protocol';
import type { RecordingFailure } from './types/RecordingFailure';

/**
 * Gathered here so `recoverable` — the flag deciding whether a clinician is
 * offered their transcribed text back or shown a dead end — is set once per
 * failure rather than at the six points in the flow that used to build these.
 */

/**
 * Every close is recoverable, and that is not an oversight: by the time a
 * socket drops there is usually text on screen, and a lost connection should
 * cost the user time rather than their dictation.
 */
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

/**
 * Recoverable, and the case that matters most: this is the one moment where
 * the dictation exists only in this tab, so the message has to invite another
 * attempt rather than read as a dead end.
 */
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
