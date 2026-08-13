import type { H3Event } from 'h3';
import type { AuthFailure } from './auth-failures';
import type { CookieJar, SessionCookieOptions } from './session-cookie';

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

export function respondWithFailure(event: H3Event, failure: AuthFailure): AuthFailureBody {
  setResponseStatus(event, failure.statusCode);

  return { code: failure.code, message: failure.message };
}

export interface AuthFailureBody {
  readonly code: string;
  readonly message: string;
}
