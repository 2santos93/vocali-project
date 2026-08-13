import type { SessionState } from '../../server/api/auth/session.get';
import type { AuthenticatedUser, AuthSession } from './types/session';
import type { FailureDetail } from './types/upload';

/**
 * `useState` rather than a module-level ref: a module-level ref on a server
 * rendering two requests at once is one user seeing another user's name.
 */
export function useAuthSession(): AuthSession {
  const user = useState<AuthenticatedUser | null>('auth.user', () => null);

  // Distinct from `user === null`, which is also what "signed out" looks like.
  // Without it the middleware asks the server again on every navigation.
  const loaded = useState<boolean>('auth.loaded', () => false);

  const request = useRequestFetch();

  async function refresh(): Promise<void> {
    try {
      const state = await request<SessionState>('/api/auth/session');
      user.value = state.user;
    } catch {
      user.value = null;
    } finally {
      loaded.value = true;
    }
  }

  async function ensureLoaded(): Promise<void> {
    if (loaded.value) return;

    await refresh();
  }

  /** Records the user the sign-in route just returned, avoiding a round trip. */
  function adopt(signedIn: AuthenticatedUser): void {
    user.value = signedIn;
    loaded.value = true;
  }

  async function signOut(): Promise<void> {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // The local session is cleared below whether or not the route answered.
    }

    // The route clears the cookies before it can fail, so this browser's
    // session is over either way.
    user.value = null;
    loaded.value = true;
    await navigateTo(SIGN_IN_ROUTE);
  }

  return { user, ensureLoaded, refresh, adopt, signOut };
}

export function readFailure(error: unknown): FailureDetail {
  if (typeof error !== 'object' || error === null) return { code: null, message: null };

  const data: unknown = (error as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return { code: null, message: null };

  const code: unknown = (data as { code?: unknown }).code;
  const message: unknown = (data as { message?: unknown }).message;

  return {
    code: typeof code === 'string' && code !== '' ? code : null,
    message: typeof message === 'string' && message !== '' ? message : null,
  };
}
