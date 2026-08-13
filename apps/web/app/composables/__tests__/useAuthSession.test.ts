import { ref } from 'vue';
import type { Ref } from 'vue';
import { SIGN_IN_ROUTE } from '../../utils/route-access';
import { readFailure, useAuthSession } from '../useAuthSession';
import type { AuthenticatedUser } from '../types/session';

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

  it('asks for the session through the fetcher that forwards the request headers', async () => {
    const session = useAuthSession();

    await session.refresh();

    expect(runtime.requestScoped).toEqual([{ path: '/api/auth/session', options: undefined }]);
    expect(runtime.ambient).toEqual([]);
  });

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
   * A failed request still counts as loaded, or every navigation after an
   * outage waits on a request already known to fail.
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
   * One piece of shared state, not one ref per caller: with separate copies
   * the header keeps showing a name after the middleware found nobody there.
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

  it('ends the session in the browser without rejecting when the logout route fails', async () => {
    runtime.logoutAnswer = (): Promise<unknown> =>
      Promise.reject(new Error('one of the other sessions survived'));
    const session = useAuthSession();
    session.adopt(SIGNED_IN);

    await expect(session.signOut()).resolves.toBeUndefined();

    // This browser's session is over either way, so nothing is left claiming
    // otherwise.
    expect(session.user.value).toBeNull();
    expect(runtime.navigations).toEqual(['/login']);
  });

  /*
   * Loaded as well as empty: otherwise the middleware guarding the page being
   * navigated to asks the server a question already answered.
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
   * An empty string reaches the screen as a banner with nothing in it, which
   * reads as the interface being broken rather than the request failing.
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
