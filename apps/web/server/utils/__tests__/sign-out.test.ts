/**
 * @jest-environment node
 */
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  SESSION_COOKIE_NAMES,
  SUBJECT_COOKIE,
  type CookieJar,
} from '../session-cookie';
import { endSession, type SignOutGateway } from '../sign-out';

const NOW = 1_800_000_000;

function tokenExpiringAt(expiresAt: number): string {
  const payload = Buffer.from(JSON.stringify({ sub: 'subject-1', exp: expiresAt })).toString(
    'base64url',
  );

  return `header.${payload}.signature`;
}

/** Every event in order, so the sequence itself can be asserted. */
type Event = { readonly kind: 'revoke' | 'refresh' | 'erase'; readonly detail: string };

function createHarness(
  cookies: Record<string, string>,
  behaviour: {
    revoke?: () => Promise<void>;
    refresh?: () => Promise<string>;
  } = {},
): { jar: CookieJar; gateway: SignOutGateway; events: Event[]; store: Map<string, string> } {
  const store = new Map(Object.entries(cookies));
  const events: Event[] = [];

  return {
    store,
    events,
    jar: {
      read: (name: string): string | undefined => store.get(name),
      write: (name: string, value: string): void => {
        store.set(name, value);
      },
      erase: (name: string): void => {
        store.delete(name);
        events.push({ kind: 'erase', detail: name });
      },
    },
    gateway: {
      signOutEverywhere: (accessToken: string): Promise<void> => {
        events.push({ kind: 'revoke', detail: accessToken });

        return behaviour.revoke?.() ?? Promise.resolve();
      },
      refreshAccessToken: (): Promise<string> => {
        events.push({ kind: 'refresh', detail: '' });

        return behaviour.refresh?.() ?? Promise.reject(new Error('no refresh configured'));
      },
    },
  };
}

const LIVE_SESSION = {
  [ACCESS_TOKEN_COOKIE]: tokenExpiringAt(NOW + 600),
  [REFRESH_TOKEN_COOKIE]: 'refresh-1',
  [SUBJECT_COOKIE]: 'subject-1',
};

describe('signing out revokes the session at Cognito', () => {
  /*
   * `GlobalSignOut` invalidates the refresh token everywhere, not only in this
   * browser. Without the call, clearing the cookies leaves that token valid
   * for the rest of its eight hours wherever a copy exists, and the user has
   * been told they signed out when they did not.
   */
  it('calls the global sign-out with the access token', async () => {
    const { jar, gateway, events } = createHarness(LIVE_SESSION);

    await expect(endSession(jar, gateway, NOW)).resolves.toBeNull();

    expect(events.filter((event) => event.kind === 'revoke')).toStrictEqual([
      { kind: 'revoke', detail: tokenExpiringAt(NOW + 600) },
    ]);
  });

  it('revokes before it clears, not after', async () => {
    const { jar, gateway, events } = createHarness(LIVE_SESSION);

    await endSession(jar, gateway, NOW);

    // Clearing first would throw away the token the revocation authenticates
    // with, and the call would fail on a session that is still live.
    expect(events[0]?.kind).toBe('revoke');
    expect(events.slice(1).every((event) => event.kind === 'erase')).toBe(true);
  });

  it('clears every session cookie once the session is revoked', async () => {
    const { jar, gateway, store } = createHarness(LIVE_SESSION);

    await endSession(jar, gateway, NOW);

    expect(store.size).toBe(0);
  });

  it('renews an expired access token first, so the revocation can authenticate', async () => {
    // Cognito refuses `GlobalSignOut` with an expired token, so skipping the
    // renewal leaves the refresh token alive for anybody who waited sixteen
    // minutes before pressing the button.
    const renewed = tokenExpiringAt(NOW + 900);
    const { jar, gateway, events } = createHarness(
      { ...LIVE_SESSION, [ACCESS_TOKEN_COOKIE]: tokenExpiringAt(NOW - 60) },
      { refresh: () => Promise.resolve(renewed) },
    );

    await expect(endSession(jar, gateway, NOW)).resolves.toBeNull();

    expect(events[0]?.kind).toBe('refresh');
    expect(events[1]).toStrictEqual({ kind: 'revoke', detail: renewed });
  });
});

describe('when there is no session to end', () => {
  it('reports success without calling Cognito', async () => {
    const { jar, gateway, events } = createHarness({});

    await expect(endSession(jar, gateway, NOW)).resolves.toBeNull();

    expect(events.some((event) => event.kind === 'revoke')).toBe(false);
  });

  it('reports success when the refresh token has already been revoked', async () => {
    const { jar, gateway, events, store } = createHarness(
      { ...LIVE_SESSION, [ACCESS_TOKEN_COOKIE]: tokenExpiringAt(NOW - 60) },
      { refresh: () => Promise.reject(new Error('revoked')) },
    );

    // Signing out somewhere else already ended it. There is nothing left to
    // revoke, and the cookies still have to go.
    await expect(endSession(jar, gateway, NOW)).resolves.toBeNull();
    expect(events.some((event) => event.kind === 'revoke')).toBe(false);
    expect(store.size).toBe(0);
  });
});

describe('when Cognito refuses the revocation', () => {
  it('treats an already-invalid token as a completed sign-out', async () => {
    const alreadyInvalid = Object.assign(new Error('gone'), { name: 'NotAuthorizedException' });
    const { jar, gateway, store } = createHarness(LIVE_SESSION, {
      revoke: () => Promise.reject(alreadyInvalid),
    });

    await expect(endSession(jar, gateway, NOW)).resolves.toBeNull();
    expect(store.size).toBe(0);
  });

  it('reports honestly when Cognito could not be reached, and still clears', async () => {
    const unreachable = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    const { jar, gateway, store } = createHarness(LIVE_SESSION, {
      revoke: () => Promise.reject(unreachable),
    });

    const failure = await endSession(jar, gateway, NOW);

    // The refresh token is still live wherever a copy exists, so returning
    // null here would be a cookie-only sign-out.
    expect(failure?.code).toBe('SIGN_OUT_INCOMPLETE');
    expect(failure?.statusCode).toBe(502);
    expect(store.size).toBe(0);
  });

  it('clears every cookie name, not merely the access token', async () => {
    const unreachable = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    const { jar, gateway, events } = createHarness(LIVE_SESSION, {
      revoke: () => Promise.reject(unreachable),
    });

    await endSession(jar, gateway, NOW);

    expect(
      events.filter((event) => event.kind === 'erase').map((event) => event.detail),
    ).toStrictEqual([...SESSION_COOKIE_NAMES]);
  });
});
