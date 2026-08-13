import {
  eraseSessionCookies,
  readSessionCookies,
  writeAccessTokenCookie,
  type CookieJar,
} from './session-cookie';
import { readTokenClaims } from './token-claims';

export const EXPIRY_MARGIN_SECONDS = 20;

export interface SessionRefresher {
  refreshAccessToken(refreshToken: string, subject: string): Promise<string>;
}

export function hasSessionCookies(jar: CookieJar): boolean {
  return readSessionCookies(jar) !== null;
}

export interface ActiveSession {
  readonly accessToken: string;
  readonly subject: string;
  /** Display text for the header. Null when the cookie predates it. */
  readonly email: string | null;
}

export async function resolveActiveSession(
  jar: CookieJar,
  refresher: SessionRefresher,
  nowSeconds: number,
): Promise<ActiveSession | null> {
  const stored = readSessionCookies(jar);
  if (stored === null) {
    // A stray cookie from a partial write may still be here; clearing costs
    // nothing and stops the browser resending it.
    eraseSessionCookies(jar);
    return null;
  }

  const claims = readTokenClaims(stored.accessToken);

  const usable = claims !== null && claims.expiresAt - EXPIRY_MARGIN_SECONDS > nowSeconds;

  if (usable) {
    return { accessToken: stored.accessToken, subject: stored.subject, email: stored.email };
  }

  if (stored.refreshToken === null) {
    eraseSessionCookies(jar);
    return null;
  }

  try {
    const accessToken = await refresher.refreshAccessToken(stored.refreshToken, stored.subject);
    writeAccessTokenCookie(jar, accessToken);

    return { accessToken, subject: stored.subject, email: stored.email };
  } catch {
    eraseSessionCookies(jar);
    return null;
  }
}
