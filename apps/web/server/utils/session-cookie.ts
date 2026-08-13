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

  jar.write(SUBJECT_COOKIE, tokens.subject, options);

  jar.write(EMAIL_COOKIE, tokens.email, options);
}

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
