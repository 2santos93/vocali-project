import { describeSignOutFailure, type AuthFailure } from './auth-failures';
import { eraseSessionCookies, type CookieJar } from './session-cookie';
import { resolveActiveSession, type SessionRefresher } from './session';

/**
 * Ending a session, in the order that makes it an ending.
 *
 * Deleting the cookies is the easy half and, on its own, is not signing out. A
 * Cognito refresh token stays valid until it expires no matter what the
 * browser forgets, so a sign-out that only clears cookies leaves a live
 * session behind for anybody holding a copy of the token — which is exactly
 * the failure acceptance criterion A3 is written to catch. `GlobalSignOut`
 * revokes it at the identity provider, in this browser and every other.
 *
 * This lives apart from the route so the order is assertable: a test can watch
 * the revocation happen before the cookies go, and fail if the revocation
 * stops happening at all.
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
   * The access token is resolved first, and refreshed if it has expired,
   * because `GlobalSignOut` authenticates with it. Handing Cognito a token
   * that expired four minutes ago fails the call and leaves the refresh token
   * alive for the rest of its eight hours — a sign-out that looks like one
   * from the browser and is not one anywhere else.
   */
  const session = await resolveActiveSession(jar, gateway, nowSeconds);

  // No live session to end. `resolveActiveSession` has already cleared
  // whatever was left behind, so the sign-out is complete by definition.
  if (session === null) return null;

  try {
    await gateway.signOutEverywhere(session.accessToken);
  } catch (error) {
    const failure = describeSignOutFailure(error);

    if (failure !== null) {
      // The cookies still go. The user asked to leave this browser and that
      // much is honoured; the caller reports plainly that the other sessions
      // are still open, rather than claiming a sign-out that did not happen.
      eraseSessionCookies(jar);

      return failure;
    }
  }

  eraseSessionCookies(jar);

  return null;
}
