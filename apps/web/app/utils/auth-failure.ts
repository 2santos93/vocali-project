import type { MessageKey, TranslatableMessage } from '../i18n/translate';
import type { AuthFailureCode } from '../../server/utils/auth-failures';

/**
 * The sentence a rejected authentication request is shown as.
 *
 * The routes answer with a stable code and a Spanish sentence. The code is the
 * part the interface uses: it is the same in every language, it is what the
 * server documents, and rendering it through this map is what lets somebody
 * reading in English see an English refusal without the server ever being told
 * which language they chose.
 *
 * A type-only import of the code union, so nothing from `server/` reaches the
 * browser bundle — but a failure added there and not given words here fails
 * the type check, which is the point of the union existing at all.
 */
const AUTH_FAILURE_KEYS: Record<AuthFailureCode, MessageKey> = {
  RATE_LIMITED: 'authFailure.RATE_LIMITED',
  AUTH_UNAVAILABLE: 'authFailure.AUTH_UNAVAILABLE',
  INVALID_CREDENTIALS: 'authFailure.INVALID_CREDENTIALS',
  ACCOUNT_NOT_CONFIRMED: 'authFailure.ACCOUNT_NOT_CONFIRMED',
  WEAK_PASSWORD: 'authFailure.WEAK_PASSWORD',
  INVALID_REGISTRATION: 'authFailure.INVALID_REGISTRATION',
  CODE_DELIVERY_FAILED: 'authFailure.CODE_DELIVERY_FAILED',
  CODE_EXPIRED: 'authFailure.CODE_EXPIRED',
  CODE_REJECTED: 'authFailure.CODE_REJECTED',
  SESSION_EXPIRED: 'authFailure.SESSION_EXPIRED',
  INVALID_INPUT: 'authFailure.INVALID_INPUT',
  PASSWORD_RESET_REQUIRED: 'authFailure.PASSWORD_RESET_REQUIRED',
  SIGN_OUT_INCOMPLETE: 'authFailure.SIGN_OUT_INCOMPLETE',
};

/**
 * Which message a rejection is shown as, given the code it carried.
 *
 * `code` arrives as an unvalidated string: it has crossed HTTP, and a request
 * that never reached the server carries no code at all. Anything unrecognised
 * falls back to the screen's own general failure, which is a sentence that
 * fits every case rather than a gap where one should be.
 *
 * @param code     the `code` field of the failure body, or null
 * @param fallback what this screen says when it has learned nothing useful
 */
export function authFailureMessage(code: string | null, fallback: MessageKey): TranslatableMessage {
  const known = AUTH_FAILURE_CODE_LIST.find((candidate) => candidate === code);

  return { key: known === undefined ? fallback : AUTH_FAILURE_KEYS[known] };
}

/*
 * The keys of the map above, as a runtime list.
 *
 * `Object.keys` rather than a second literal: a list written out by hand is a
 * second place to add a code to, and the one that would be forgotten.
 */
const AUTH_FAILURE_CODE_LIST = Object.keys(AUTH_FAILURE_KEYS) as readonly AuthFailureCode[];
