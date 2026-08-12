import type { SessionState } from '../../server/api/auth/session.get';

/**
 * Who is signed in, as far as the browser is allowed to know.
 *
 * There is no token here and there is nowhere one could be put: the session
 * lives in httpOnly cookies the server sets and script cannot read. What this
 * holds is an address to render and an identifier, both of which the server
 * hands back on request, and both of which are useless to anyone who steals
 * them.
 *
 * The state is shared through `useState` rather than through a module-level
 * ref, because a module-level ref on a server rendering two requests at once
 * is one user seeing another user's name.
 */

export interface AuthenticatedUser {
  readonly email: string;
  readonly subject: string;
}

export interface AuthSession {
  readonly user: Readonly<Ref<AuthenticatedUser | null>>;
  ensureLoaded(): Promise<void>;
  refresh(): Promise<void>;
  adopt(user: AuthenticatedUser): void;
  signOut(): Promise<void>;
}

export function useAuthSession(): AuthSession {
  const user = useState<AuthenticatedUser | null>('auth.user', () => null);

  // Distinct from `user === null`, which is also what "signed out" looks like.
  // Without it the middleware asks the server again on every navigation.
  const loaded = useState<boolean>('auth.loaded', () => false);

  /*
   * `useRequestFetch`, not `$fetch`.
   *
   * During server rendering, `$fetch` calls the Nitro handler directly and
   * carries none of the incoming request's headers — including the cookie the
   * whole session depends on. The first render of every page would then decide
   * that nobody is signed in and redirect to /login, and the client would
   * correct it a moment later. `useRequestFetch` forwards the headers, so the
   * server and the browser reach the same answer.
   */
  const request = useRequestFetch();

  async function refresh(): Promise<void> {
    try {
      const state = await request<SessionState>('/api/auth/session');
      user.value = state.user;
    } catch {
      // The session route answers 200 with a null user when nobody is signed
      // in, so reaching here means the request itself failed. Treating that as
      // signed out is the safe reading: the alternative is showing application
      // chrome to someone the server has not identified.
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
    } finally {
      /*
       * Cleared even when the route reported a failure.
       *
       * The route only fails after it has already cleared the cookies, and it
       * fails to say that the *other* sessions are still open — this browser's
       * is over either way. Leaving the header showing a signed-in user after
       * that would be a lie the next request would contradict.
       */
      user.value = null;
      loaded.value = true;
      await navigateTo('/login');
    }
  }

  return { user, ensureLoaded, refresh, adopt, signOut };
}

export interface FailureDetail {
  readonly code: string | null;
  readonly message: string | null;
}

/**
 * Reads the `{ code, message }` body every non-2xx from `/api/**` carries.
 *
 * Read structurally rather than asserted. A rejected `$fetch` is not obliged
 * to be a `FetchError` at all — a connection that never opened rejects with a
 * `TypeError` — and casting the rejection would put `undefined` where the page
 * is about to render a sentence.
 *
 * The `code` is what a screen branches on. The `message` is already in Spanish
 * and already says what to do next, because the server wrote it that way; a
 * page that rewrites it here is a second place for the wording to live.
 */
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
