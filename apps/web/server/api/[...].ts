import type { H3Event } from 'h3';
import { useServerRuntime } from '../utils/auth-runtime';
import { SESSION_EXPIRED } from '../utils/auth-failures';
import { forwardToBackend, type ProxyFetch } from '../utils/backend-proxy';
import { createCookieJar, respondWithFailure, type AuthFailureBody } from '../utils/http';
import { hasSessionCookies, resolveActiveSession } from '../utils/session';

/**
 * The single route every screen in this application talks to.
 *
 * `$fetch('/api/transcriptions')` in a page becomes a request to this handler,
 * which attaches the bearer token from the httpOnly cookie and forwards it to
 * the real API. The browser never sees the API's address and never holds a
 * token, and no page has to remember to authenticate — there is no code path
 * in which it could forget.
 *
 * The explicit routes under `server/api/auth/` win over this wildcard, so
 * signing in and signing out never pass through here. Everything else does.
 *
 * What comes back is what the API said. Status, body and content type are
 * passed through untouched: the screens branch on a 404 against a 409 against
 * a 413, and a proxy that flattened those into 500 would make every one of
 * those distinctions unavailable at the point they matter. The only status
 * this handler invents is for something that went wrong inside it — no
 * session, an unusable path, or the API not answering at all.
 */

/** The API is a Lambda behind API Gateway; ten seconds covers a cold start. */
const BACKEND_TIMEOUT_MS = 10_000;

const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD', 'DELETE', 'OPTIONS']);

/**
 * Adapts the platform's `fetch` to the narrow shape the forwarding logic is
 * written against, which is what lets that logic be tested with a plain
 * function instead of a mocked global.
 */
const proxyFetch: ProxyFetch = (url, init) =>
  fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    signal: init.signal,
  });

export default defineEventHandler(async (event): Promise<string | AuthFailureBody> => {
  const jar = createCookieJar(event);

  // Answered before any configuration is read, so a request with no cookies at
  // all costs no Parameter Store call and no Cognito client. It is also what
  // lets an unconfigured deployment still say "sign in" rather than "500".
  if (!hasSessionCookies(jar)) return respondWithFailure(event, SESSION_EXPIRED);

  const { gateway, apiBaseUrl } = await useServerRuntime();

  const session = await resolveActiveSession(jar, gateway, nowInSeconds());

  /*
   * 401, never a redirect.
   *
   * These calls are made by script, not by the address bar. A 302 to /login
   * would be followed by `fetch` and hand the caller an HTML page parsed as
   * JSON, so the screen would report a parse error where the truth is "your
   * session ended". The status goes back as a status, the route middleware
   * moves the user on the next navigation, and the two concerns stay apart.
   *
   * Reaching here means the refresh token is gone or revoked as well: an
   * expired access token alone would have been renewed above.
   */
  if (session === null) return respondWithFailure(event, SESSION_EXPIRED);

  const body = METHODS_WITHOUT_BODY.has(event.method) ? null : await readRequestBody(event);

  const result = await forwardToBackend(
    {
      baseUrl: apiBaseUrl,
      accessToken: session.accessToken,
      fetch: proxyFetch,
      timeoutMs: BACKEND_TIMEOUT_MS,
    },
    {
      method: event.method,
      path: readWildcardPath(event),
      // Forwarded verbatim rather than parsed and rebuilt. An opaque DynamoDB
      // cursor survives that; it does not always survive a round trip through
      // a parser that re-encodes what it does not recognise.
      query: readQueryString(event),
      body,
      contentType: getRequestHeader(event, 'content-type') ?? null,
    },
  );

  setResponseStatus(event, result.status);
  if (result.contentType !== null) {
    setResponseHeader(event, 'content-type', result.contentType);
  }

  // Returned as the string it arrived as. Parsing it in order to re-serialise
  // it would reorder keys, lose the distinction between an empty body and
  // `null`, and corrupt any response that was never JSON.
  return result.body;
});

async function readRequestBody(event: H3Event): Promise<string | null> {
  return (await readRawBody(event, 'utf8')) ?? null;
}

/**
 * The part of the path after `/api/`.
 *
 * Taken from the router's own wildcard parameter rather than by slicing the
 * URL, so it is the same value whatever prefix the deployment mounts the
 * application under.
 */
function readWildcardPath(event: H3Event): string {
  return getRouterParams(event)['_'] ?? '';
}

function readQueryString(event: H3Event): string {
  const separator = event.path.indexOf('?');

  return separator === -1 ? '' : event.path.slice(separator + 1);
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
