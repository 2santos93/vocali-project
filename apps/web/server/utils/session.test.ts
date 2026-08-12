/**
 * @jest-environment node
 */
import {
  ACCESS_TOKEN_COOKIE,
  EMAIL_COOKIE,
  REFRESH_TOKEN_COOKIE,
  SESSION_COOKIE_NAMES,
  SUBJECT_COOKIE,
  type CookieJar,
} from './session-cookie';
import {
  EXPIRY_MARGIN_SECONDS,
  hasSessionCookies,
  resolveActiveSession,
  type SessionRefresher,
} from './session';

const NOW = 1_800_000_000;

/** A token whose payload is readable, with the expiry the test asks for. */
function tokenExpiringAt(expiresAt: number, subject = 'subject-1'): string {
  const payload = Buffer.from(JSON.stringify({ sub: subject, exp: expiresAt })).toString(
    'base64url',
  );

  return `header.${payload}.signature`;
}

function createJar(initial: Record<string, string>): {
  jar: CookieJar;
  store: Map<string, string>;
  erased: string[];
} {
  const store = new Map(Object.entries(initial));
  const erased: string[] = [];

  return {
    store,
    erased,
    jar: {
      read: (name: string): string | undefined => store.get(name),
      write: (name: string, value: string): void => {
        store.set(name, value);
      },
      erase: (name: string): void => {
        store.delete(name);
        erased.push(name);
      },
    },
  };
}

function refresherReturning(accessToken: string): SessionRefresher & { calls: string[][] } {
  const calls: string[][] = [];

  return {
    calls,
    refreshAccessToken: (refreshToken: string, subject: string): Promise<string> => {
      calls.push([refreshToken, subject]);

      return Promise.resolve(accessToken);
    },
  };
}

const REJECTING_REFRESHER: SessionRefresher = {
  refreshAccessToken: () => Promise.reject(new Error('revoked')),
};

const NEVER_CALLED_REFRESHER: SessionRefresher = {
  refreshAccessToken: () => {
    throw new Error('the refresher must not be called');
  },
};

describe('the cheap check for a session', () => {
  it('reports a session when the cookies are there', () => {
    const { jar } = createJar({
      [ACCESS_TOKEN_COOKIE]: tokenExpiringAt(NOW - 99999),
      [SUBJECT_COOKIE]: 'subject-1',
    });

    // True even for a long-expired token: this only asks whether there is
    // something worth refreshing, not whether it still works.
    expect(hasSessionCookies(jar)).toBe(true);
  });

  it('reports none for a browser that has never signed in', () => {
    // The path an anonymous visitor takes to the sign-in page. Answering it
    // without a Parameter Store read is the whole reason it exists.
    expect(hasSessionCookies(createJar({}).jar)).toBe(false);
  });
});

describe('a live access token', () => {
  it('is used as it stands', async () => {
    const accessToken = tokenExpiringAt(NOW + 600);
    const { jar } = createJar({
      [ACCESS_TOKEN_COOKIE]: accessToken,
      [SUBJECT_COOKIE]: 'subject-1',
      [EMAIL_COOKIE]: 'ana@example.com',
    });

    await expect(resolveActiveSession(jar, NEVER_CALLED_REFRESHER, NOW)).resolves.toStrictEqual({
      accessToken,
      subject: 'subject-1',
      email: 'ana@example.com',
    });
  });
});

describe('an access token about to expire', () => {
  /*
   * The margin is not decoration. A token with five seconds left passes a
   * naive check and then spends those five seconds in a TLS handshake, so the
   * API sees an expired token and the user gets a 401 they cannot reproduce.
   */
  it('is refreshed inside the safety margin rather than sent', async () => {
    const { jar } = createJar({
      [ACCESS_TOKEN_COOKIE]: tokenExpiringAt(NOW + EXPIRY_MARGIN_SECONDS - 1),
      [REFRESH_TOKEN_COOKIE]: 'refresh-1',
      [SUBJECT_COOKIE]: 'subject-1',
    });
    const refresher = refresherReturning(tokenExpiringAt(NOW + 900));

    const session = await resolveActiveSession(jar, refresher, NOW);

    expect(refresher.calls).toStrictEqual([['refresh-1', 'subject-1']]);
    expect(session?.accessToken).toBe(tokenExpiringAt(NOW + 900));
  });

  it('is still used just outside the margin', async () => {
    const accessToken = tokenExpiringAt(NOW + EXPIRY_MARGIN_SECONDS + 1);
    const { jar } = createJar({
      [ACCESS_TOKEN_COOKIE]: accessToken,
      [SUBJECT_COOKIE]: 'subject-1',
    });

    const session = await resolveActiveSession(jar, NEVER_CALLED_REFRESHER, NOW);

    expect(session?.accessToken).toBe(accessToken);
  });
});

describe('an expired access token', () => {
  it('is replaced, and the new one is written back to the cookie', async () => {
    const renewed = tokenExpiringAt(NOW + 900);
    const { jar, store } = createJar({
      [ACCESS_TOKEN_COOKIE]: tokenExpiringAt(NOW - 60),
      [REFRESH_TOKEN_COOKIE]: 'refresh-1',
      [SUBJECT_COOKIE]: 'subject-1',
      [EMAIL_COOKIE]: 'ana@example.com',
    });

    const session = await resolveActiveSession(jar, refresherReturning(renewed), NOW);

    expect(session).toStrictEqual({
      accessToken: renewed,
      subject: 'subject-1',
      email: 'ana@example.com',
    });
    expect(store.get(ACCESS_TOKEN_COOKIE)).toBe(renewed);
  });

  it('refreshes against the subject, not against the address', async () => {
    const { jar } = createJar({
      [ACCESS_TOKEN_COOKIE]: tokenExpiringAt(NOW - 60),
      [REFRESH_TOKEN_COOKIE]: 'refresh-1',
      [SUBJECT_COOKIE]: 'subject-1',
      [EMAIL_COOKIE]: 'ana@example.com',
    });
    const refresher = refresherReturning(tokenExpiringAt(NOW + 900));

    await resolveActiveSession(jar, refresher, NOW);

    // Cognito computes a refresh secret hash over the pool's generated
    // username, which is the subject. Passing the address produces the same
    // NotAuthorizedException an expired token does, so the mistake presents as
    // users being signed out at random.
    expect(refresher.calls[0]?.[1]).toBe('subject-1');
    expect(refresher.calls[0]?.[1]).not.toBe('ana@example.com');
  });

  it('ends the session when there is no refresh token to spend', async () => {
    const { jar, erased } = createJar({
      [ACCESS_TOKEN_COOKIE]: tokenExpiringAt(NOW - 60),
      [SUBJECT_COOKIE]: 'subject-1',
    });

    await expect(resolveActiveSession(jar, NEVER_CALLED_REFRESHER, NOW)).resolves.toBeNull();
    expect(erased).toStrictEqual([...SESSION_COOKIE_NAMES]);
  });
});

describe('a refresh token Cognito refuses', () => {
  /*
   * This is what a global sign-out in another browser looks like from here,
   * and it is the reason signing out is real rather than cosmetic: the token
   * is revoked at Cognito, so the next refresh anywhere fails.
   */
  it('ends the session and clears every cookie', async () => {
    const { jar, erased, store } = createJar({
      [ACCESS_TOKEN_COOKIE]: tokenExpiringAt(NOW - 60),
      [REFRESH_TOKEN_COOKIE]: 'revoked',
      [SUBJECT_COOKIE]: 'subject-1',
      [EMAIL_COOKIE]: 'ana@example.com',
    });

    await expect(resolveActiveSession(jar, REJECTING_REFRESHER, NOW)).resolves.toBeNull();

    expect(erased).toStrictEqual([...SESSION_COOKIE_NAMES]);
    expect(store.size).toBe(0);
  });
});

describe('an unreadable access token', () => {
  it('is treated as expired rather than as a fatal error', async () => {
    const renewed = tokenExpiringAt(NOW + 900);
    const { jar } = createJar({
      [ACCESS_TOKEN_COOKIE]: 'not-a-token',
      [REFRESH_TOKEN_COOKIE]: 'refresh-1',
      [SUBJECT_COOKIE]: 'subject-1',
    });

    const session = await resolveActiveSession(jar, refresherReturning(renewed), NOW);

    expect(session?.accessToken).toBe(renewed);
  });
});

describe('no session at all', () => {
  it('reports none and clears any partial remains', async () => {
    const { jar, erased } = createJar({ [REFRESH_TOKEN_COOKIE]: 'orphan' });

    await expect(resolveActiveSession(jar, NEVER_CALLED_REFRESHER, NOW)).resolves.toBeNull();

    // A refresh token with no subject beside it can never be spent, and
    // leaving it would have the browser resend it for eight hours.
    expect(erased).toStrictEqual([...SESSION_COOKIE_NAMES]);
  });
});
