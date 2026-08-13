/**
 * The single place the session cookie flags are decided. None is decorative:
 *
 *   httpOnly  `document.cookie` never sees these names, so an injected script
 *             cannot read a token, keep one, or send one anywhere else.
 *   secure    Withheld from a plaintext request, so a stray `http://` link
 *             cannot leak a session over the wire.
 *   sameSite  `lax` — not sent on a cross-site POST or a framed request. Not
 *             `strict`, which would drop the cookie on a normal inbound link
 *             and show a signed-in user the sign-in page.
 *   path      One path for all four, so signing out clears exactly what
 *             signing in wrote and leaves no orphan the browser keeps sending.
 *
 * Written against a `CookieJar` rather than an `H3Event` so the flags are
 * assertable under Jest without booting Nitro.
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
 * Browsers treat `http://localhost` as a secure context, so nothing is lost
 * locally, and a `!isDevelopment` conditional is one wrong environment
 * variable away from a session cookie travelling in the clear.
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
   * The subject travels separately because Cognito needs it: on a pool keyed
   * by email the generated username equals the `sub`, and the `SECRET_HASH` on
   * a refresh is computed over that rather than the address typed at sign-in.
   * Storing it removes an unverified token decode from the refresh path.
   */
  jar.write(SUBJECT_COOKIE, tokens.subject, options);

  /*
   * Display text only, because an access token carries no address and the id
   * token that would is a credential in its own right, deliberately not kept.
   * Same flags as the tokens so signing out clears one whole set.
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

  // A refresh token on its own is unusable: its secret hash needs the subject.
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
