import type { TranslatableMessage } from '../i18n/translate';
import { readStatusCode } from '../utils/http-failure';
import { HTTP_UNAUTHORIZED } from '../utils/http-status';
import { MicrophoneError } from './audio-capture';
import {
  CLOSE_INTERNAL_ERROR,
  CLOSE_JOB_ERROR,
  CLOSE_NOT_AUTHORISED,
  CLOSE_QUOTA_EXCEEDED,
} from './realtime-provider-protocol';

/**
 * How a dictation can end, and what the user is told when it ends badly.
 *
 * Gathered for the same reason `server/utils/auth-failures.ts` gathers the
 * Cognito ones. These were being built at six separate points in the flow, so
 * `recoverable` — the flag deciding whether a clinician is offered their
 * transcribed text back or shown a dead end — was being decided at six
 * separate points too. It is the highest-consequence field on this screen, and
 * it is now set once per failure, beside the sentence that goes with it.
 *
 * The phase is here rather than with the recorder because `failed` is one of
 * its members: the panel reads the phase and the failure as one pair, and a
 * consumer that wants to render an ended dictation should not have to import
 * the state machine that drives it to find out what ended. `useAudioRecorder`
 * is the flow that moves through these; this is the vocabulary it moves
 * through.
 *
 * Nothing in this file knows about sockets or microphones. These are values;
 * acting on one is the recorder's job.
 */

export type RecordingPhase =
  | 'idle'
  /** Minting the provider session. */
  | 'preparing'
  /** Socket open, waiting for the provider to acknowledge `StartRecognition`. */
  | 'connecting'
  | 'recording'
  /** `EndOfStream` sent, waiting for the last words. */
  | 'finishing'
  | 'saving'
  | 'saved'
  | 'failed';

export type RecordingFailureCode =
  | 'MICROPHONE_DENIED'
  | 'MICROPHONE_UNAVAILABLE'
  | 'SESSION_UNAVAILABLE'
  | 'SESSION_EXPIRED'
  | 'CONNECTION_LOST'
  | 'PROVIDER_QUOTA_EXCEEDED'
  | 'PROVIDER_FAILED'
  | 'NOTHING_TO_SAVE'
  | 'SAVE_FAILED';

export interface RecordingFailure {
  readonly code: RecordingFailureCode;
  /**
   * Which sentence to show, not the sentence itself. Every catalogue phrases
   * it specifically enough to act on; which catalogue is decided where it is
   * rendered.
   */
  readonly message: TranslatableMessage;
  /**
   * Whether there is transcribed text still on screen that the user can save.
   *
   * Losing a clinician's dictation to a dropped socket is the worst thing this
   * screen can do, so a failure that leaves text behind is treated as a
   * recovery offer rather than as a dead end.
   */
  readonly recoverable: boolean;
}

/**
 * Turns the provider's way of hanging up into the sentence the user reads.
 *
 * Every close is recoverable, and that is not an oversight: by the time a
 * socket drops there is usually text on screen, and the whole point of keeping
 * it is that a lost connection costs the user time rather than their dictation.
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
 * The microphone could not be opened. Which of the two device failures it was
 * is decided in `audio-capture`, the layer that can still see what the browser
 * rejected with; this only decides how it reads on screen.
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
 * Nothing was heard worth keeping. Not recoverable because there is nothing to
 * recover — offering to save an empty dictation is an invitation to press a
 * button that cannot work.
 */
export const NOTHING_TO_SAVE: RecordingFailure = {
  code: 'NOTHING_TO_SAVE',
  message: { key: 'failure.dictation.nothingHeard' },
  recoverable: false,
};

/**
 * The save itself failed.
 *
 * Recoverable, and this is the case that matters most: it is the one moment
 * where the dictation exists only in this tab, so the message has to invite
 * another attempt rather than read as a dead end.
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
