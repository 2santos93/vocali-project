import { ref } from 'vue';
import type { Ref } from 'vue';
import { SIGN_IN_ROUTE } from '../utils/route-access';
import { readFailure, useAuthSession } from './useAuthSession';
import type { AuthenticatedUser } from './useAuthSession';

/*
 * This composable is one of four that ask Nuxt for something at runtime rather
 * than taking it as a collaborator, and it is the only way it could work: the
 * shared state and the request-scoped fetch are the Nuxt runtime, not calls
 * that could be passed in. Auto-imports are plain global bindings once the
 * module is compiled, so the runtime is stood in for by installing globals of
 * the same names — the same substitution Nuxt itself performs, with doubles
 * that record.
 *
 * `useState` is reproduced faithfully rather than approximated: one ref per
 * key, shared by every caller, created from the initialiser only the first
 * time. A fake that handed each caller its own ref would let the header and
 * the middleware disagree about who is signed in and no test could see it.
 */
const sharedState = new Map<string, Ref<unknown>>();

function fakeUseState<T>(key: string, initialise: () => T): Ref<T> {
  const existing = sharedState.get(key);
  if (existing !== undefined) {
    return existing as Ref<T>;
  }

  const created = ref(initialise()) as unknown as Ref<T>;
  sharedState.set(key, created);
  return created;
}

interface RecordedCall {
  readonly path: string;
  readonly options: { method?: string } | undefined;
}

interface Runtime {
  /** What `useRequestFetch()` returned was asked for. Carries the cookie under SSR. */
  readonly requestScoped: RecordedCall[];
  /** What plain `$fetch` was asked for. Carries no incoming header. */
  readonly ambient: RecordedCall[];
  readonly navigations: string[];
  sessionAnswer: () => Promise<unknown>;
  logoutAnswer: () => Promise<unknown>;
}

function installRuntime(): Runtime {
  const runtime: Runtime = {
    requestScoped: [],
    ambient: [],
    navigations: [],
    sessionAnswer: () => Promise.resolve({ user: null }),
    logoutAnswer: () => Promise.resolve({}),
  };

  Object.assign(globalThis, {
    useState: fakeUseState,

    useRequestFetch(): (path: string, options?: { method?: string }) => Promise<unknown> {
      return (path: string, options?: { method?: string }): Promise<unknown> => {
        runtime.requestScoped.push({ path, options });
        return runtime.sessionAnswer();
      };
    },

    $fetch(path: string, options?: { method?: string }): Promise<unknown> {
      runtime.ambient.push({ path, options });
      return runtime.logoutAnswer();
    },

    navigateTo(to: string): Promise<void> {
      runtime.navigations.push(to);
      return Promise.resolve();
    },

    // The real value, taken from the module that owns it, because the
    // composable reads it as an auto-import and would otherwise find nothing.
    // The assertions below still spell `/login` out, so changing the route
    // means changing two files deliberately rather than one silently.
    SIGN_IN_ROUTE,
  });

  return runtime;
}

const SIGNED_IN: AuthenticatedUser = {
  email: 'lucia.martin@clinica.test',
  subject: '7f1c0b6e-2a44-4f0e-9a2a-1b6f0d3c5e88',
};

describe('useAuthSession', () => {
  let runtime: Runtime;

  beforeEach(() => {
    sharedState.clear();
    runtime = installRuntime();
  });

  it('holds nobody until it has asked', () => {
    const session = useAuthSession();

    expect(session.user.value).toBeNull();
    expect(runtime.requestScoped).toEqual([]);
  });

  it('adopts the user the session route reports', async () => {
    runtime.sessionAnswer = (): Promise<unknown> => Promise.resolve({ user: SIGNED_IN });
    const session = useAuthSession();

    await session.refresh();

    expect(session.user.value).toEqual(SIGNED_IN);
  });

  /*
   * `useRequestFetch`, not `$fetch`, and this is the test that says so.
   *
   * During server rendering `$fetch` calls the Nitro handler directly and
   * carries none of the incoming request's headers — including the cookie the
   * whole session depends on. Every first render would then decide nobody is
   * signed in and redirect to the sign-in page, with the browser correcting it
   * a moment later. Nothing else in the suite can tell the two apart, so the
   * two fetchers are recorded separately here and the ambient one is asserted
   * to have gone unused.
   */
  it('asks for the session through the fetcher that forwards the request headers', async () => {
    const session = useAuthSession();

    await session.refresh();

    expect(runtime.requestScoped).toEqual([{ path: '/api/auth/session', options: undefined }]);
    expect(runtime.ambient).toEqual([]);
  });

  /*
   * The route answers 200 with a null user when nobody is signed in, so a
   * rejection means the request itself failed. Treating that as signed out is
   * the safe reading: the alternative is application chrome, and a user's
   * name, shown to somebody the server has not identified.
   */
  it('treats a session request that failed outright as signed out', async () => {
    runtime.sessionAnswer = (): Promise<unknown> => Promise.resolve({ user: SIGNED_IN });
    const session = useAuthSession();
    await session.refresh();
    expect(session.user.value).toEqual(SIGNED_IN);

    runtime.sessionAnswer = (): Promise<unknown> =>
      Promise.reject(new Error('the gateway never answered'));
    await session.refresh();

    expect(session.user.value).toBeNull();
  });

  it('asks once and then stops asking, however many times it is loaded', async () => {
    const session = useAuthSession();

    await session.ensureLoaded();
    await session.ensureLoaded();
    await session.ensureLoaded();

    expect(runtime.requestScoped).toHaveLength(1);
  });

  /*
   * A failed request still counts as loaded. Without that, every navigation
   * after an outage would ask again and the middleware would sit on a request
   * that is already known to fail.
   */
  it('counts a failed load as loaded rather than retrying on every navigation', async () => {
    runtime.sessionAnswer = (): Promise<unknown> =>
      Promise.reject(new Error('the gateway never answered'));
    const session = useAuthSession();

    await session.ensureLoaded();
    await session.ensureLoaded();

    expect(runtime.requestScoped).toHaveLength(1);
  });

  it('takes the user the sign-in route returned instead of asking again', async () => {
    const session = useAuthSession();

    session.adopt(SIGNED_IN);
    await session.ensureLoaded();

    expect(session.user.value).toEqual(SIGNED_IN);
    expect(runtime.requestScoped).toEqual([]);
  });

  /*
   * One piece of shared state, not one ref per caller. The header, the
   * middleware and the account menu each call this composable, and if they
   * held separate copies the header would keep showing a name after the
   * middleware had established there was nobody there.
   */
  it('gives every caller the same session rather than a copy each', async () => {
    runtime.sessionAnswer = (): Promise<unknown> => Promise.resolve({ user: SIGNED_IN });
    const header = useAuthSession();
    const middleware = useAuthSession();

    await middleware.ensureLoaded();

    expect(header.user.value).toEqual(SIGNED_IN);
    // The second caller finds the work already done rather than repeating it.
    await header.ensureLoaded();
    expect(runtime.requestScoped).toHaveLength(1);
  });

  it('signs out through the route that clears the cookies, and leaves for the sign-in page', async () => {
    const session = useAuthSession();
    session.adopt(SIGNED_IN);

    await session.signOut();

    expect(runtime.ambient).toEqual([{ path: '/api/auth/logout', options: { method: 'POST' } }]);
    expect(session.user.value).toBeNull();
    expect(runtime.navigations).toEqual(['/login']);
  });

  /*
   * The branch this file exists for.
   *
   * The logout route only fails after it has already cleared this browser's
   * cookies — it fails to report that the *other* sessions are still open.
   * This browser's session is over either way, so leaving the header showing a
   * signed-in user would be a lie the very next request contradicts, and
   * leaving the user on an application page would be a screen they no longer
   * have a session for.
   */
  it('ends the session in the browser without rejecting when the logout route fails', async () => {
    runtime.logoutAnswer = (): Promise<unknown> =>
      Promise.reject(new Error('one of the other sessions survived'));
    const session = useAuthSession();
    session.adopt(SIGNED_IN);

    /*
     * That it resolves is the assertion, not a formality on the way to the two
     * below.
     *
     * This line previously read `.rejects.toThrow(...)`, pinning the behaviour
     * as it was: the clearing sat in a `finally` with no `catch`, so the
     * rejection was re-thrown after the state had been cleared and the
     * navigation made. `signOut` is reached from a template event handler with
     * only a `finally` of its own, so nothing caught it and a failed sign-out
     * arrived as an unhandled rejection in the console. That comment said it
     * should be changed on purpose the day the rejection was handled; this is
     * that change.
     *
     * What it pins now is a decision as much as a mechanism. The failure is
     * handled and the user is told nothing: all that is left to tell them is
     * that sessions elsewhere may still be open, on the sign-in screen they
     * have already reached, with no remedy but to sign in again in order to
     * sign out again. The route reports it as a 502 `SIGN_OUT_INCOMPLETE` to
     * the people who can act on it. Restore the `finally` and this line fails.
     */
    await expect(session.signOut()).resolves.toBeUndefined();

    // The half that matters, and the half that is right: this browser's
    // session is over either way, so nothing is left claiming otherwise.
    expect(session.user.value).toBeNull();
    expect(runtime.navigations).toEqual(['/login']);
  });

  /*
   * Signing out marks the session loaded as well as empty. If it did not, the
   * route middleware guarding the page being navigated to would ask the server
   * again — during a navigation the sign-out has already decided the answer to.
   */
  it('does not ask the server again on the way out', async () => {
    const session = useAuthSession();
    session.adopt(SIGNED_IN);

    await session.signOut();
    await session.ensureLoaded();

    expect(runtime.requestScoped).toEqual([]);
    expect(session.user.value).toBeNull();
  });
});

/*
 * Every non-2xx from `/api/**` carries `{ code, message }`, and this is what
 * reads it. The `message` is already in Spanish and already says what to do
 * next; the `code` is what a screen branches on. Everything here is a way that
 * body can fail to arrive, and every one of them has to end as a null rather
 * than as `undefined` rendered into a sentence a clinician is reading.
 */
describe('readFailure', () => {
  it('reads the code and the message the API sent', () => {
    const failure = readFailure({
      data: { code: 'AUDIO_FILE_TOO_LARGE', message: 'El archivo supera los 20 MB.' },
    });

    expect(failure).toEqual({
      code: 'AUDIO_FILE_TOO_LARGE',
      message: 'El archivo supera los 20 MB.',
    });
  });

  /*
   * A rejected `$fetch` is not obliged to be a `FetchError` at all — a
   * connection that never opened rejects with a `TypeError`, and a browser
   * extension can reject with a string. Casting the rejection would put
   * `undefined` where the page is about to render a sentence.
   */
  it.each([
    ['a rejection that is not an object', 'connection refused'],
    ['a rejection that is null', null],
    ['a rejection with no body', new TypeError('Failed to fetch')],
    ['a body that is not an object', { data: 'Bad Gateway' }],
    ['a body that is null', { data: null }],
  ])('reports nothing to say for %s', (_name: string, rejection: unknown) => {
    expect(readFailure(rejection)).toEqual({ code: null, message: null });
  });

  /*
   * An empty string is not a message. Left as one it would reach the screen as
   * a banner with nothing written in it, which reads as the interface being
   * broken rather than as the request having failed.
   */
  it.each([
    ['empty strings', { code: '', message: '' }],
    ['values of the wrong type', { code: 42, message: { es: 'Vaya.' } }],
    ['nothing at all', {}],
  ])('refuses %s in the body', (_name: string, data: unknown) => {
    expect(readFailure({ data })).toEqual({ code: null, message: null });
  });

  it('keeps whichever half the body actually carried', () => {
    expect(readFailure({ data: { code: 'TRANSCRIPTION_NOT_FOUND' } })).toEqual({
      code: 'TRANSCRIPTION_NOT_FOUND',
      message: null,
    });
    expect(readFailure({ data: { message: 'Vuelve a intentarlo.' } })).toEqual({
      code: null,
      message: 'Vuelve a intentarlo.',
    });
  });
});
