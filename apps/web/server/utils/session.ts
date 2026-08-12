import {
  eraseSessionCookies,
  readSessionCookies,
  writeAccessTokenCookie,
  type CookieJar,
} from './session-cookie';
import { readTokenClaims } from './token-claims';

/**
 * Turning the cookies into an access token that is worth sending, or into
 * nothing at all.
 *
 * Everything that answers 401 goes through here, so there is one definition of
 * "signed in" rather than one per route.
 */

/**
 * A token with twenty seconds left is treated as expired.
 *
 * Cognito issues access tokens for fifteen minutes. Without a margin, a
 * request that passes this check and then spends its remaining life in a TLS
 * handshake reaches the API already expired, and the user sees a random 401
 * with no way to reproduce it.
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
 * Whether there is anything here worth authenticating with.
 *
 * A cheap check that costs no network call, so a request from a browser with
 * no cookies — an anonymous visitor loading the sign-in page, a crawler
 * walking `/api/**` — is answered without building a Cognito client, which
 * means without a Parameter Store read. It says nothing about whether the
 * token is still valid; `resolveActiveSession` decides that.
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
    // Nothing usable, but there may still be a stray cookie from a partial
    // write. Clearing costs nothing and stops the browser resending it.
    eraseSessionCookies(jar);
    return null;
  }

  const claims = readTokenClaims(stored.accessToken);

  // Unreadable claims are treated exactly like expiry rather than as a hard
  // failure: the refresh token may still be good, and the alternative is
  // signing a user out because a token format changed.
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
     * The only correct reading of a failed refresh is that the session is
     * over: the refresh token has expired, or it was revoked by a global
     * sign-out — possibly the one this user performed in another browser.
     *
     * The failure is deliberately not distinguished from expiry and
     * deliberately not surfaced. Leaving the cookies in place would leave the
     * browser retrying a dead session on every request for the next eight
     * hours.
     */
    eraseSessionCookies(jar);
    return null;
  }
}
