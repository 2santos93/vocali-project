/**
 * The session cookies, and the single place their flags are decided.
 *
 * This is the security property the whole front end rests on. The tokens are
 * written by this server into cookies the browser will not expose to script,
 * so a cross-site scripting bug in the application yields no session: an
 * injected script can make requests as the user while it runs, but it cannot
 * read a token, keep one, or send one anywhere else.
 *
 * The flags are not decorative:
 *
 *   httpOnly  `document.cookie` never sees these names. This is the flag
 *             acceptance criterion F5 is checked against.
 *   secure    The cookie is withheld from a plaintext request, so a stray
 *             `http://` link cannot leak a session over the wire.
 *   sameSite  `lax` — not sent on a cross-site POST or a framed request, so
 *             another origin cannot spend the session by causing a request.
 *             Not `strict`, which would drop the cookie on a normal inbound
 *             link and show a signed-in user the sign-in page.
 *   path      One path for all three, so signing out clears exactly what
 *             signing in wrote. A mismatch here leaves an orphan cookie the
 *             browser keeps sending.
 *
 * Written against a `CookieJar` rather than against an `H3Event` on purpose:
 * these flags are then assertable under Jest without booting Nitro, which is
 * what makes a test that fails when one of them is removed possible at all.
 */

export const ACCESS_TOKEN_COOKIE = 'vocali_access_token';
export const REFRESH_TOKEN_COOKIE = 'vocali_refresh_token';
export const SUBJECT_COOKIE = 'vocali_subject';
export const EMAIL_COOKIE = 'vocali_email';

export const SESSION_COOKIE_NAMES = [
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  SUBJECT_COOKIE,
  EMAIL_COOKIE,
] as const;

/**
 * Eight hours: the Cognito refresh token's lifetime, from
 * `infra/modules/auth`. The access token expires in fifteen minutes and is
 * refreshed in place, so pinning its cookie to fifteen minutes would only
 * throw away the value this server is about to replace.
 */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export interface SessionCookieOptions {
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite: 'lax';
  readonly path: string;
  readonly maxAge: number;
}

export interface CookieJar {
  read(name: string): string | undefined;
  write(name: string, value: string, options: SessionCookieOptions): void;
  erase(name: string): void;
}

export interface SessionTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly subject: string;
  readonly email: string;
}

export interface StoredSession {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly subject: string;
  readonly email: string | null;
}

/**
 * `secure` is unconditional rather than switched off for development.
 *
 * Browsers treat `http://localhost` as a secure context and accept a `Secure`
 * cookie there, so nothing is lost locally. A `!isDevelopment` conditional
 * would be one wrong environment variable away from shipping a session cookie
 * that travels in the clear, and it would make the flag untestable as a
 * constant.
 */
export function sessionCookieOptions(): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function writeSessionCookies(jar: CookieJar, tokens: SessionTokens): void {
  const options = sessionCookieOptions();

  jar.write(ACCESS_TOKEN_COOKIE, tokens.accessToken, options);
  jar.write(REFRESH_TOKEN_COOKIE, tokens.refreshToken, options);

  /*
   * The subject travels separately because Cognito needs it, not because the
   * browser does.
   *
   * A pool whose username attribute is the email address gives every user a
   * generated username equal to their `sub`, and the `SECRET_HASH` on a
   * refresh has to be computed over that username — not over the address the
   * user typed at sign-in. Storing it removes an unverified decode of the
   * access token from the refresh path.
   */
  jar.write(SUBJECT_COOKIE, tokens.subject, options);

  /*
   * The address, because a Cognito access token does not carry one. Its
   * `username` claim on a pool keyed by email is the generated subject, and
   * the address only appears in the id token — which is a credential in its
   * own right and is deliberately not kept.
   *
   * This is display text and nothing else: it fills the header, and no
   * decision anywhere depends on it. It gets the same flags as the tokens so
   * that signing out clears one set of cookies rather than most of a set.
   */
  jar.write(EMAIL_COOKIE, tokens.email, options);
}

/**
 * Only the access token is replaced. A refresh returns no new refresh token,
 * and rewriting the refresh cookie with its own value would extend a session
 * past the eight hours it was granted, one request at a time.
 */
export function writeAccessTokenCookie(jar: CookieJar, accessToken: string): void {
  jar.write(ACCESS_TOKEN_COOKIE, accessToken, sessionCookieOptions());
}

export function eraseSessionCookies(jar: CookieJar): void {
  for (const name of SESSION_COOKIE_NAMES) {
    jar.erase(name);
  }
}

export function readSessionCookies(jar: CookieJar): StoredSession | null {
  const accessToken = jar.read(ACCESS_TOKEN_COOKIE);
  const subject = jar.read(SUBJECT_COOKIE);

  // Without both, there is nothing to authenticate with and nothing to refresh
  // under. A refresh token on its own is unusable: its secret hash needs the
  // subject.
  if (accessToken === undefined || accessToken === '') return null;
  if (subject === undefined || subject === '') return null;

  const refreshToken = jar.read(REFRESH_TOKEN_COOKIE);
  const email = jar.read(EMAIL_COOKIE);

  return {
    accessToken,
    refreshToken: refreshToken === undefined || refreshToken === '' ? null : refreshToken,
    subject,
    email: email === undefined || email === '' ? null : email,
  };
}
