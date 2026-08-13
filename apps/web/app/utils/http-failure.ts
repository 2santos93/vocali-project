import type { TranslatableMessage } from '../i18n/types';
import { HTTP_UNAUTHORIZED } from './http-status';

/**
 * Uploading, dictating and browsing the history all have to tell an ended
 * session from a failed request, and they must all tell it the same way.
 */

/**
 * ofetch attaches `statusCode` to what it throws, but a rejection is not
 * obliged to be an ofetch error — a connection that never opened rejects with
 * a `TypeError` — so the property is checked for rather than assumed.
 */
export function readStatusCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) {
    return null;
  }
  const { statusCode } = error;
  return typeof statusCode === 'number' ? statusCode : null;
}

/**
 * The BFF proxy refreshes an expired access token before it would surface, so
 * a 401 reaching this side means the session is genuinely over. Telling a
 * clinician to check their connection sends them to the wrong remedy.
 */
export function isSessionExpired(error: unknown): boolean {
  return readStatusCode(error) === HTTP_UNAUTHORIZED;
}

/**
 * A key rather than the sentence: which language it is read in is settled when
 * it reaches the screen, not when the request failed.
 */
export const SESSION_EXPIRED_MESSAGE: TranslatableMessage = { key: 'failure.sessionExpired' };
