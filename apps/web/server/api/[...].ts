import type { H3Event } from 'h3';
import { useServerRuntime } from '../utils/auth-runtime';
import { SESSION_EXPIRED } from '../utils/auth-failures';
import { forwardToBackend, type ProxyFetch } from '../utils/backend-proxy';
import { createCookieJar, respondWithFailure, type AuthFailureBody } from '../utils/http';
import { hasSessionCookies, resolveActiveSession } from '../utils/session';

/** The API is a Lambda behind API Gateway; ten seconds covers a cold start. */
const BACKEND_TIMEOUT_MS = 10_000;

const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD', 'DELETE', 'OPTIONS']);

/**
 * Adapts the platform's `fetch` to the narrow shape the forwarding logic is
 * written against, so that logic is testable with a plain function.
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

  if (!hasSessionCookies(jar)) return respondWithFailure(event, SESSION_EXPIRED);

  const { gateway, apiBaseUrl } = await useServerRuntime();

  const session = await resolveActiveSession(jar, gateway, nowInSeconds());

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
      // Forwarded verbatim: an opaque DynamoDB cursor does not always survive
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

  return result.body;
});

async function readRequestBody(event: H3Event): Promise<string | null> {
  return (await readRawBody(event, 'utf8')) ?? null;
}

/**
 * From the router's own wildcard parameter rather than by slicing the URL, so
 * it is the same value whatever prefix the deployment mounts under.
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
