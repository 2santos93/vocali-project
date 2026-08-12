/**
 * The contract every screen in this application is built against.
 *
 * The browser calls `/api/<path>` on its own origin and never learns where the
 * real API lives or what a token looks like. This forwards the call, attaches
 * the bearer token from the httpOnly cookie, and hands back what the API
 * said — its status and its body, unaltered.
 *
 * "Unaltered" is the part that has to be defended. A proxy that catches an
 * upstream 409 and answers 500 destroys the only information the screen had:
 * a conflict is something the user can resolve and a 500 is not, and the two
 * become indistinguishable at exactly the moment the difference matters. So
 * the upstream status is passed through, the upstream body is passed through
 * as bytes rather than re-serialised, and the only status this file invents is
 * for a failure that happened here — a network error reaching the API, or a
 * timeout.
 */

export interface ProxyHttpResponse {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export interface ProxyFetchInit {
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body?: string;
  readonly signal: AbortSignal;
}

export type ProxyFetch = (url: string, init: ProxyFetchInit) => Promise<ProxyHttpResponse>;

export interface ProxyRequest {
  readonly method: string;
  /** The wildcard segment: `transcriptions/01J.../download`, no leading slash. */
  readonly path: string;
  /** The raw query string, without its leading `?`. Forwarded verbatim. */
  readonly query: string;
  /** The raw request body, or null for a method that carries none. */
  readonly body: string | null;
  readonly contentType: string | null;
}

export interface ProxyResult {
  readonly status: number;
  readonly body: string;
  readonly contentType: string | null;
}

export interface ProxyDependencies {
  readonly baseUrl: string;
  readonly accessToken: string;
  readonly fetch: ProxyFetch;
  readonly timeoutMs: number;
}

const JSON_CONTENT_TYPE = 'application/json';

const GATEWAY_FAILURE: ProxyResult = {
  status: 502,
  body: JSON.stringify({
    code: 'API_UNREACHABLE',
    message: 'No hemos podido contactar con el servicio. Vuelve a intentarlo en unos momentos.',
  }),
  contentType: JSON_CONTENT_TYPE,
};

const INVALID_PATH: ProxyResult = {
  status: 400,
  body: JSON.stringify({
    code: 'INVALID_PATH',
    message: 'La dirección solicitada no es válida.',
  }),
  contentType: JSON_CONTENT_TYPE,
};

export async function forwardToBackend(
  dependencies: ProxyDependencies,
  request: ProxyRequest,
): Promise<ProxyResult> {
  const url = buildBackendUrl(dependencies.baseUrl, request.path, request.query);
  if (url === null) return INVALID_PATH;

  /*
   * An explicit timeout on every outbound call, because the default is none.
   * Without it a stalled connection to the API holds a Nitro request open
   * until the platform kills it, and the user watches a spinner that will
   * never stop rather than reading an error they can act on.
   */
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, dependencies.timeoutMs);

  try {
    const response = await dependencies.fetch(url, {
      method: request.method,
      headers: buildHeaders(dependencies.accessToken, request.contentType),
      ...(request.body === null ? {} : { body: request.body }),
      signal: controller.signal,
    });

    return {
      status: response.status,
      body: await response.text(),
      contentType: response.headers.get('content-type'),
    };
  } catch {
    // Reaching here means this server failed, not that the API refused. Every
    // refusal the API expressed came back as a status above and was passed
    // straight through.
    return GATEWAY_FAILURE;
  } finally {
    clearTimeout(timeout);
  }
}

function buildHeaders(accessToken: string, contentType: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    // The whole point of the indirection: the token is added here, on the
    // server, from a cookie the page could not read even if it wanted to.
    authorization: `Bearer ${accessToken}`,
    accept: JSON_CONTENT_TYPE,
  };

  if (contentType !== null) {
    headers['content-type'] = contentType;
  }

  return headers;
}

/**
 * The path arrives from the URL bar, so it is attacker-controlled.
 *
 * Concatenating it onto the base URL without checking is a server-side request
 * forgery: `//evil.example/x` resolves as protocol-relative and sends the
 * bearer token to another host, and `../..` climbs out of the API's own path
 * prefix. Rejecting anything that is not a plain path segment is cheaper than
 * reasoning about URL resolution, and no legitimate call needs more.
 */
export function buildBackendUrl(baseUrl: string, path: string, query: string): string | null {
  const segments = path.split('/');

  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') return null;
    if (segment.includes('\\') || segment.includes(':')) return null;
  }

  const normalisedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const suffix = query === '' ? '' : `?${query}`;

  return `${normalisedBase}/${segments.join('/')}${suffix}`;
}
