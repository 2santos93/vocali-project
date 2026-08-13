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
    // Reaching here means this server failed, not that the API refused: every
    // refusal the API expressed came back as a status and passed straight
    // through.
    return GATEWAY_FAILURE;
  } finally {
    clearTimeout(timeout);
  }
}

function buildHeaders(accessToken: string, contentType: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    // The whole point of the indirection: the token is added here, from a
    // cookie the page could not read even if it wanted to.
    authorization: `Bearer ${accessToken}`,
    accept: JSON_CONTENT_TYPE,
  };

  if (contentType !== null) {
    headers['content-type'] = contentType;
  }

  return headers;
}

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
