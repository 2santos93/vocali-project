import { HTTP_UNAUTHORIZED } from './http-status';

/**
 * What the browser can learn from a rejected request.
 *
 * Three composables were each reading a status off a thrown value with their
 * own private copy of the same eight lines — two of them called `statusCodeOf`
 * and one `readStatusCode` — and two of those copies carried a comment saying
 * they were the same as another. A rule this small, repeated three times, is a
 * rule that will be corrected in one place and left wrong in the other two.
 *
 * None of it belongs to any one screen: uploading, dictating and browsing the
 * history all have to tell an ended session from a failed request, and they
 * must all tell it the same way.
 */

/**
 * Reads an HTTP status off a rejected request without asserting a type onto it.
 *
 * ofetch attaches `statusCode` to what it throws, but a rejection is not
 * obliged to be an ofetch error at all — a connection that never opened
 * rejects with a `TypeError`. So the property is checked for at run time
 * rather than assumed, which also keeps this file free of a Nuxt import.
 */
export function readStatusCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) {
    return null;
  }
  const { statusCode } = error;
  return typeof statusCode === 'number' ? statusCode : null;
}

/**
 * Whether the session is over rather than the request having failed.
 *
 * The BFF proxy passes the API's status through and refreshes an expired
 * access token before it would ever surface, so a 401 reaching this side means
 * the session is genuinely over — not merely stale. That is a different fact
 * from "the request failed", and telling a clinician to check their connection
 * when they simply need to sign in again sends them to the wrong remedy.
 */
export function isSessionExpired(error: unknown): boolean {
  return readStatusCode(error) === HTTP_UNAUTHORIZED;
}

/** Shown on every screen that can meet an ended session, so it reads the same on each. */
export const SESSION_EXPIRED_MESSAGE = 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
