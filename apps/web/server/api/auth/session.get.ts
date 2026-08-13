import { useServerRuntime } from '../../utils/auth-runtime';
import { createCookieJar } from '../../utils/http';
import { hasSessionCookies, resolveActiveSession } from '../../utils/session';

export interface SessionState {
  readonly user: { readonly email: string; readonly subject: string } | null;
}

const NOBODY: SessionState = { user: null };

export default defineEventHandler(async (event): Promise<SessionState> => {
  const jar = createCookieJar(event);

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
