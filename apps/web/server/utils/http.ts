import type { H3Event } from 'h3';
import type { AuthFailure } from './auth-failures';
import type { CookieJar, SessionCookieOptions } from './session-cookie';

/**
 * The adapter between h3 and the parts of this server that are worth testing.
 *
 * Everything else on the server side is written against `CookieJar` and plain
 * values, which is what lets the cookie flags, the refresh logic and the proxy
 * run under Jest with no Nitro, no event and no network. This file is the
 * seam, and it is kept to the two functions that cannot be anything else.
 */

export function createCookieJar(event: H3Event): CookieJar {
  return {
    read(name: string): string | undefined {
      return getCookie(event, name);
    },
    write(name: string, value: string, options: SessionCookieOptions): void {
      setCookie(event, name, value, options);
    },
    erase(name: string): void {
      // The path has to match the one the cookie was written with, or the
      // browser keeps the original and the "deletion" adds a second cookie of
      // the same name. `deleteCookie` sends the expiry, so the flags beyond
      // path are irrelevant here.
      deleteCookie(event, name, { path: '/' });
    },
  };
}

/**
 * An expected failure, answered as data rather than thrown.
 *
 * `createError` would wrap the message in h3's own envelope — `statusMessage`,
 * a `data` field, sometimes a stack — and the page would have to reach two
 * levels deep for a sentence to show the user. Setting the status and
 * returning the body keeps one shape for every non-2xx this application
 * produces, `{ code, message }`, which is the same shape the API's own errors
 * arrive in through the proxy. `$fetch` still rejects on the status, so the
 * caller's `catch` is unchanged.
 */
export function respondWithFailure(event: H3Event, failure: AuthFailure): AuthFailureBody {
  setResponseStatus(event, failure.statusCode);

  return { code: failure.code, message: failure.message };
}

export interface AuthFailureBody {
  readonly code: string;
  readonly message: string;
}
