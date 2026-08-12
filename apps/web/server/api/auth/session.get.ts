import { useServerRuntime } from '../../utils/auth-runtime';
import { createCookieJar } from '../../utils/http';
import { hasSessionCookies, resolveActiveSession } from '../../utils/session';

export interface SessionState {
  readonly user: { readonly email: string; readonly subject: string } | null;
}

const NOBODY: SessionState = { user: null };

/**
 * Who, if anyone, is signed in — the one question the browser is allowed to
 * ask about the session.
 *
 * It answers 200 with `user: null` rather than 401 when there is no session.
 * The route middleware calls this on every navigation, including the first one
 * to the sign-in page, and a 401 there would be an error every page had to
 * swallow before it could render normally. "Nobody is signed in" is an answer,
 * not a failure.
 *
 * The reply carries an address and an identifier and no token. There is
 * nothing here that could be replayed against the API.
 */
export default defineEventHandler(async (event): Promise<SessionState> => {
  const jar = createCookieJar(event);

  // Short-circuited before the runtime is built, because this is the request
  // an anonymous visitor makes on the way to the sign-in page. Reading a
  // Parameter Store secret in order to answer "nobody" would put an AWS call
  // on the path of every unauthenticated page load.
  if (!hasSessionCookies(jar)) return NOBODY;

  const { gateway } = await useServerRuntime();

  const session = await resolveActiveSession(jar, gateway, nowInSeconds());
  if (session === null) return NOBODY;

  return {
    user: {
      email: session.email ?? '',
      subject: session.subject,
    },
  };
});

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
