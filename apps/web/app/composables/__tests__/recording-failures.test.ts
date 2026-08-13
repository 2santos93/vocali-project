import { MicrophoneError } from '../audio-capture';
import {
  describeCloseCode,
  describeMicrophoneFailure,
  describeSaveFailure,
  describeSessionFailure,
  NOTHING_TO_SAVE,
} from '../recording-failures';

function httpError(statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error('request failed'), { statusCode });
}

describe('describeCloseCode', () => {
  /*
   * Every close is recoverable, and that is not an oversight: by the time a
   * socket drops there is usually text on screen worth keeping.
   */
  it.each([
    ['the provider refusing the credential', 4001, 'SESSION_EXPIRED', 'credentialExpired'],
    ['the account being out of quota', 4005, 'PROVIDER_QUOTA_EXCEEDED', 'quotaExceeded'],
    ['the provider failing the job', 4013, 'PROVIDER_FAILED', 'providerFailed'],
    ['the provider failing internally', 1011, 'PROVIDER_FAILED', 'providerFailed'],
    ['a normal close nobody asked for', 1000, 'CONNECTION_LOST', 'connectionLost'],
    ['the connection simply going away', 1006, 'CONNECTION_LOST', 'connectionLost'],
    ['a code this client has never seen', 4999, 'CONNECTION_LOST', 'connectionLost'],
  ])('reads %s as something the user can come back from', (_name, code, failureCode, key) => {
    expect(describeCloseCode(code)).toEqual({
      code: failureCode,
      message: { key: `failure.dictation.${key}` },
      recoverable: true,
    });
  });
});

describe('describeSessionFailure', () => {
  /*
   * Nothing has been recorded yet, so an offer to save here is an invitation
   * to press a button that cannot work.
   */
  it('tells an ended session apart from a provider that could not be reached', () => {
    expect(describeSessionFailure(httpError(401))).toEqual({
      code: 'SESSION_EXPIRED',
      message: { key: 'failure.dictation.sessionExpired' },
      recoverable: false,
    });

    expect(describeSessionFailure(httpError(503))).toEqual({
      code: 'SESSION_UNAVAILABLE',
      message: { key: 'failure.dictation.sessionUnavailable' },
      recoverable: false,
    });
  });

  it('treats a rejection carrying no status as the provider being unavailable', () => {
    expect(describeSessionFailure(new TypeError('Failed to fetch')).code).toBe(
      'SESSION_UNAVAILABLE',
    );
  });
});

describe('describeMicrophoneFailure', () => {
  /*
   * "You said no" and "there is nothing to say yes with" are fixed in
   * different places, so the device error's message is passed through.
   */
  it('passes the device failure through with the remedy that fits it', () => {
    const denied = new MicrophoneError('PERMISSION_DENIED', { key: 'failure.microphone.denied' });

    expect(describeMicrophoneFailure(denied)).toEqual({
      code: 'MICROPHONE_DENIED',
      message: { key: 'failure.microphone.denied' },
      recoverable: false,
    });
  });

  it.each([
    ['no microphone at all', 'NO_MICROPHONE', 'failure.microphone.missing'],
    ['a device that could not be opened', 'CAPTURE_FAILED', 'failure.microphone.busy'],
  ] as const)('reports %s as unavailable rather than as refused', (_name, code, key) => {
    expect(describeMicrophoneFailure(new MicrophoneError(code, { key }))).toEqual({
      code: 'MICROPHONE_UNAVAILABLE',
      message: { key },
      recoverable: false,
    });
  });

  it.each([
    ['a plain error', new Error('AudioContext is not defined')],
    ['a DOM exception this file knows nothing about', new TypeError('not a function')],
    ['a rejection that is not an error at all', 'the device fell over'],
    ['nothing', undefined],
    ['null', null],
  ])('still has something to say when the capture rejects with %s', (_name, rejection: unknown) => {
    expect(describeMicrophoneFailure(rejection)).toEqual({
      code: 'MICROPHONE_UNAVAILABLE',
      message: { key: 'failure.microphone.unavailable' },
      recoverable: false,
    });
  });
});

describe('NOTHING_TO_SAVE', () => {
  it('is a dead end, because there is genuinely nothing to recover', () => {
    expect(NOTHING_TO_SAVE).toEqual({
      code: 'NOTHING_TO_SAVE',
      message: { key: 'failure.dictation.nothingHeard' },
      recoverable: false,
    });
  });
});

describe('describeSaveFailure', () => {
  /*
   * The one moment where the dictation exists only in this tab, so the message
   * has to invite another attempt rather than read as a dead end.
   */
  it('invites another attempt whatever went wrong', () => {
    expect(describeSaveFailure(httpError(401))).toEqual({
      code: 'SAVE_FAILED',
      message: { key: 'failure.dictation.saveSessionExpired' },
      recoverable: true,
    });

    expect(describeSaveFailure(httpError(500))).toEqual({
      code: 'SAVE_FAILED',
      message: { key: 'failure.dictation.saveFailed' },
      recoverable: true,
    });
  });

  it('says the session ended only when it actually did', () => {
    expect(describeSaveFailure(new Error('network down')).message).toEqual({
      key: 'failure.dictation.saveFailed',
    });
  });
});
