import type { MessageKey, TranslatableMessage } from '../i18n/types';
import type { AuthFailureCode } from '../../server/utils/auth-failures';

/**
 * The routes answer with a stable code; rendering it through this map is what
 * lets somebody reading in English see an English refusal without the server
 * ever being told which language they chose.
 *
 * A type-only import of the code union, so nothing from `server/` reaches the
 * browser bundle — but a failure added there and not given words here fails
 * the type check.
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
 * `code` arrives as an unvalidated string: it has crossed HTTP, and a request
 * that never reached the server carries no code at all.
 *
 * @param code     the `code` field of the failure body, or null
 * @param fallback what this screen says when it has learned nothing useful
 */
export function authFailureMessage(code: string | null, fallback: MessageKey): TranslatableMessage {
  const known = AUTH_FAILURE_CODE_LIST.find((candidate) => candidate === code);

  return { key: known === undefined ? fallback : AUTH_FAILURE_KEYS[known] };
}

/*
 * `Object.keys` rather than a second literal: a list written out by hand is a
 * second place to add a code to, and the one that would be forgotten.
 */
const AUTH_FAILURE_CODE_LIST = Object.keys(AUTH_FAILURE_KEYS) as readonly AuthFailureCode[];
