/**
 * @jest-environment node
 */
import {
  ACCESS_TOKEN_COOKIE,
  EMAIL_COOKIE,
  eraseSessionCookies,
  readSessionCookies,
  REFRESH_TOKEN_COOKIE,
  SESSION_COOKIE_NAMES,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieOptions,
  SUBJECT_COOKIE,
  writeAccessTokenCookie,
  writeSessionCookies,
  type CookieJar,
  type SessionCookieOptions,
} from './session-cookie';

interface WrittenCookie {
  readonly name: string;
  readonly value: string;
  readonly options: SessionCookieOptions;
}

function createRecordingJar(initial: Record<string, string> = {}): {
  jar: CookieJar;
  written: WrittenCookie[];
  erased: string[];
} {
  const store = new Map(Object.entries(initial));
  const written: WrittenCookie[] = [];
  const erased: string[] = [];

  return {
    written,
    erased,
    jar: {
      read: (name: string): string | undefined => store.get(name),
      write: (name: string, value: string, options: SessionCookieOptions): void => {
        store.set(name, value);
        written.push({ name, value, options });
      },
      erase: (name: string): void => {
        store.delete(name);
        erased.push(name);
      },
    },
  };
}

const TOKENS = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  subject: '11111111-2222-3333-4444-555555555555',
  email: 'ana@example.com',
};

describe('session cookie flags', () => {
  /*
   * The test the whole authentication design exists to make true, and the one
   * acceptance criterion F5 is checked against: a token that JavaScript in the
   * page cannot read.
   *
   * It asserts every flag on every cookie rather than sampling one, because
   * the failure mode is a fourth cookie added later without them.
   */
  it('writes every session cookie httpOnly, secure, sameSite lax and rooted at /', () => {
    const { jar, written } = createRecordingJar();

    writeSessionCookies(jar, TOKENS);

    expect(written).toHaveLength(SESSION_COOKIE_NAMES.length);

    for (const cookie of written) {
      expect(cookie.options.httpOnly).toBe(true);
      expect(cookie.options.secure).toBe(true);
      expect(cookie.options.sameSite).toBe('lax');
      expect(cookie.options.path).toBe('/');
    }
  });

  it('writes the access token itself with those flags, not merely some cookie', () => {
    const { jar, written } = createRecordingJar();

    writeSessionCookies(jar, TOKENS);

    const accessCookie = written.find((cookie) => cookie.name === ACCESS_TOKEN_COOKIE);

    expect(accessCookie).toBeDefined();
    expect(accessCookie?.value).toBe('access-token');
    expect(accessCookie?.options).toStrictEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  });

  it('refreshes the access token cookie with the same flags', () => {
    const { jar, written } = createRecordingJar();

    writeAccessTokenCookie(jar, 'renewed');

    expect(written).toStrictEqual([
      { name: ACCESS_TOKEN_COOKIE, value: 'renewed', options: sessionCookieOptions() },
    ]);
  });

  it('does not rewrite the refresh token when only the access token is renewed', () => {
    const { jar, written } = createRecordingJar();

    writeAccessTokenCookie(jar, 'renewed');

    // Rewriting it would push the session's eight-hour ceiling forward on
    // every request, so a browser left open would never have to sign in again.
    expect(written.map((cookie) => cookie.name)).not.toContain(REFRESH_TOKEN_COOKIE);
  });

  it('gives the session the refresh token lifetime rather than the access token one', () => {
    expect(sessionCookieOptions().maxAge).toBe(8 * 60 * 60);
  });
});

describe('writing a session', () => {
  it('stores the tokens, the subject and the address under their own names', () => {
    const { jar, written } = createRecordingJar();

    writeSessionCookies(jar, TOKENS);

    expect(Object.fromEntries(written.map((cookie) => [cookie.name, cookie.value]))).toStrictEqual({
      [ACCESS_TOKEN_COOKIE]: 'access-token',
      [REFRESH_TOKEN_COOKIE]: 'refresh-token',
      [SUBJECT_COOKIE]: '11111111-2222-3333-4444-555555555555',
      [EMAIL_COOKIE]: 'ana@example.com',
    });
  });
});

describe('erasing a session', () => {
  it('erases every cookie it could have written', () => {
    const { jar, erased } = createRecordingJar();

    eraseSessionCookies(jar);

    // Anything left behind is a cookie the browser keeps sending after a sign
    // out, and one of them is a refresh token.
    expect(erased).toStrictEqual([...SESSION_COOKIE_NAMES]);
  });
});

describe('reading a session', () => {
  it('reads back what was written', () => {
    const { jar } = createRecordingJar({
      [ACCESS_TOKEN_COOKIE]: 'access-token',
      [REFRESH_TOKEN_COOKIE]: 'refresh-token',
      [SUBJECT_COOKIE]: 'subject',
      [EMAIL_COOKIE]: 'ana@example.com',
    });

    expect(readSessionCookies(jar)).toStrictEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      subject: 'subject',
      email: 'ana@example.com',
    });
  });

  it('reports no session when the access token is missing', () => {
    const { jar } = createRecordingJar({ [SUBJECT_COOKIE]: 'subject' });

    expect(readSessionCookies(jar)).toBeNull();
  });

  it('reports no session when the subject is missing', () => {
    // Without it there is no username to compute a refresh secret hash over,
    // so the refresh token is unusable and the session is not recoverable.
    const { jar } = createRecordingJar({ [ACCESS_TOKEN_COOKIE]: 'access-token' });

    expect(readSessionCookies(jar)).toBeNull();
  });

  it('treats an empty cookie as absent', () => {
    const { jar } = createRecordingJar({
      [ACCESS_TOKEN_COOKIE]: '',
      [SUBJECT_COOKIE]: 'subject',
    });

    expect(readSessionCookies(jar)).toBeNull();
  });

  it('reports a session with no refresh token rather than no session', () => {
    const { jar } = createRecordingJar({
      [ACCESS_TOKEN_COOKIE]: 'access-token',
      [SUBJECT_COOKIE]: 'subject',
      [REFRESH_TOKEN_COOKIE]: '',
      [EMAIL_COOKIE]: '',
    });

    // The access token is still worth spending until it expires.
    expect(readSessionCookies(jar)).toStrictEqual({
      accessToken: 'access-token',
      refreshToken: null,
      subject: 'subject',
      email: null,
    });
  });
});
