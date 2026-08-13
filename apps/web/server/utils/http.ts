import type { H3Event } from 'h3';
import type { AuthFailure } from './auth-failures';
import type { CookieJar, SessionCookieOptions } from './session-cookie';

/**
 * The seam between h3 and the rest of the server, which is written against
 * `CookieJar` and plain values so it runs under Jest with no Nitro. Kept to
 * the two functions that cannot be anything else.
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
      // The path must match the one the cookie was written with, or the browser
      // keeps the original and the "deletion" adds a second cookie of the
      // same name.
      deleteCookie(event, name, { path: '/' });
    },
  };
}

/**
 * Answered as data rather than thrown: `createError` wraps the message in
 * h3's own envelope, and the page would reach two levels deep for a sentence.
 * Returning the body keeps one `{ code, message }` shape for every non-2xx,
 * matching what the API's own errors arrive as through the proxy.
 */
export function respondWithFailure(event: H3Event, failure: AuthFailure): AuthFailureBody {
  setResponseStatus(event, failure.statusCode);

  return { code: failure.code, message: failure.message };
}

export interface AuthFailureBody {
  readonly code: string;
  readonly message: string;
}
