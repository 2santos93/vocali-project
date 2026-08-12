import { useServerRuntime } from '../../utils/auth-runtime';
import { createCookieJar, respondWithFailure, type AuthFailureBody } from '../../utils/http';
import { endSession } from '../../utils/sign-out';

export interface SignedOut {
  readonly status: 'SIGNED_OUT';
}

/**
 * Ends the session at Cognito, then clears the cookies. In that order, and see
 * `endSession` for why the order is the whole point.
 */
export default defineEventHandler(async (event): Promise<SignedOut | AuthFailureBody> => {
  const { gateway } = await useServerRuntime();

  const failure = await endSession(createCookieJar(event), gateway, nowInSeconds());
  if (failure !== null) return respondWithFailure(event, failure);

  return { status: 'SIGNED_OUT' };
});

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
