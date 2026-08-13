import { describeSignOutFailure, type AuthFailure } from './auth-failures';
import { eraseSessionCookies, type CookieJar } from './session-cookie';
import { resolveActiveSession, type SessionRefresher } from './session';

/**
 * A refresh token stays valid until it expires no matter what the browser
 * forgets, so clearing cookies alone leaves a live session for anybody holding
 * a copy. `GlobalSignOut` revokes it at the identity provider.
 *
 * Apart from the route so the order is assertable: a test can watch the
 * revocation happen before the cookies go.
 */

export interface SignOutGateway extends SessionRefresher {
  signOutEverywhere(accessToken: string): Promise<void>;
}

export async function endSession(
  jar: CookieJar,
  gateway: SignOutGateway,
  nowSeconds: number,
): Promise<AuthFailure | null> {
  /*
   * The access token is resolved first, and refreshed if expired, because
   * `GlobalSignOut` authenticates with it. An expired one fails the call and
   * leaves the refresh token alive for the rest of its eight hours.
   */
  const session = await resolveActiveSession(jar, gateway, nowSeconds);

  // No live session to end, and `resolveActiveSession` has already cleared
  // whatever was left behind.
  if (session === null) return null;

  try {
    await gateway.signOutEverywhere(session.accessToken);
  } catch (error) {
    const failure = describeSignOutFailure(error);

    if (failure !== null) {
      // The cookies still go: the user asked to leave this browser. The caller
      // reports that the other sessions are still open rather than claiming a
      // sign-out that did not happen.
      eraseSessionCookies(jar);

      return failure;
    }
  }

  eraseSessionCookies(jar);

  return null;
}
