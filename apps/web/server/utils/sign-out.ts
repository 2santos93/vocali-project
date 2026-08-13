import { describeSignOutFailure, type AuthFailure } from './auth-failures';
import { eraseSessionCookies, type CookieJar } from './session-cookie';
import { resolveActiveSession, type SessionRefresher } from './session';

export interface SignOutGateway extends SessionRefresher {
  signOutEverywhere(accessToken: string): Promise<void>;
}

export async function endSession(
  jar: CookieJar,
  gateway: SignOutGateway,
  nowSeconds: number,
): Promise<AuthFailure | null> {
  const session = await resolveActiveSession(jar, gateway, nowSeconds);

  // No live session to end, and `resolveActiveSession` has already cleared
  // whatever was left behind.
  if (session === null) return null;

  try {
    await gateway.signOutEverywhere(session.accessToken);
  } catch (error) {
    const failure = describeSignOutFailure(error);

    if (failure !== null) {
      eraseSessionCookies(jar);

      return failure;
    }
  }

  eraseSessionCookies(jar);

  return null;
}
