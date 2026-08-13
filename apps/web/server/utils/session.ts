import {
  eraseSessionCookies,
  readSessionCookies,
  writeAccessTokenCookie,
  type CookieJar,
} from './session-cookie';
import { readTokenClaims } from './token-claims';

/**
 * A token with twenty seconds left is treated as expired: without a margin, a
 * request that passes this check and then spends its remaining life in a TLS
 * handshake reaches the API already expired, as an unreproducible 401.
 */
export const EXPIRY_MARGIN_SECONDS = 20;

export interface SessionRefresher {
  /**
   * Exchanges a refresh token for a new access token. Rejects when the
   * refresh token has expired or been revoked, which is what a global sign-out
   * elsewhere produces.
   */
  refreshAccessToken(refreshToken: string, subject: string): Promise<string>;
}

/**
 * Costs no network call, so a browser with no cookies is answered without
 * building a Cognito client and therefore without a Parameter Store read. It
 * says nothing about validity; `resolveActiveSession` decides that.
 */
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

  // Unreadable claims are treated like expiry rather than a hard failure: the
  // refresh token may still be good, and the alternative signs a user out
  // because a token format changed.
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
    /*
     * A failed refresh means the session is over — expired, or revoked by a
     * global sign-out elsewhere. Not distinguished from expiry, and the
     * cookies are cleared: leaving them retries a dead session for eight hours.
     */
    eraseSessionCookies(jar);
    return null;
  }
}
