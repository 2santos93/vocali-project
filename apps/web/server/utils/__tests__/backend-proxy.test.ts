/**
 * @jest-environment node
 */
import {
  buildBackendUrl,
  forwardToBackend,
  type ProxyFetch,
  type ProxyFetchInit,
  type ProxyRequest,
  type ProxyHttpResponse,
} from '../backend-proxy';

interface RecordedCall {
  readonly url: string;
  readonly init: ProxyFetchInit;
}

function respondWith(
  status: number,
  body: string,
  contentType: string | null = 'application/json',
): ProxyHttpResponse {
  return {
    status,
    headers: {
      get: (name: string): string | null => (name === 'content-type' ? contentType : null),
    },
    text: () => Promise.resolve(body),
  };
}

function recordingFetch(response: ProxyHttpResponse): {
  fetch: ProxyFetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];

  return {
    calls,
    fetch: (url: string, init: ProxyFetchInit): Promise<ProxyHttpResponse> => {
      calls.push({ url, init });

      return Promise.resolve(response);
    },
  };
}

const DEPENDENCIES = {
  baseUrl: 'https://api.example.com/v1',
  accessToken: 'the-access-token',
  timeoutMs: 1000,
};

const GET_TRANSCRIPTIONS: ProxyRequest = {
  method: 'GET',
  path: 'transcriptions',
  query: '',
  body: null,
  contentType: null,
};

describe('attaching the session', () => {
  it('sends the access token as a bearer header the page never saw', async () => {
    const { fetch, calls } = recordingFetch(respondWith(200, '{"items":[]}'));

    await forwardToBackend({ ...DEPENDENCIES, fetch }, GET_TRANSCRIPTIONS);

    expect(calls[0]?.init.headers['authorization']).toBe('Bearer the-access-token');
  });

  it('forwards the caller content type only when there is a body to describe', async () => {
    const { fetch, calls } = recordingFetch(respondWith(201, '{}'));

    await forwardToBackend(
      { ...DEPENDENCIES, fetch },
      {
        method: 'POST',
        path: 'uploads',
        query: '',
        body: '{"fileName":"a.wav"}',
        contentType: 'application/json',
      },
    );

    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.body).toBe('{"fileName":"a.wav"}');
    expect(calls[0]?.init.headers['content-type']).toBe('application/json');
  });

  it('omits the body entirely for a request that carries none', async () => {
    const { fetch, calls } = recordingFetch(respondWith(200, '[]'));

    await forwardToBackend({ ...DEPENDENCIES, fetch }, GET_TRANSCRIPTIONS);

    expect(calls[0]?.init.body).toBeUndefined();
    expect(calls[0]?.init.headers['content-type']).toBeUndefined();
  });
});

describe('passing the upstream answer through', () => {
  it.each([200, 201, 204, 400, 401, 403, 404, 409, 413, 429, 500, 503])(
    'returns %i as %i rather than as its own status',
    async (status) => {
      const { fetch } = recordingFetch(respondWith(status, '{"code":"X","message":"y"}'));

      const result = await forwardToBackend({ ...DEPENDENCIES, fetch }, GET_TRANSCRIPTIONS);

      expect(result.status).toBe(status);
    },
  );

  it('returns the upstream body verbatim, not re-serialised', async () => {
    const body = '{"nextCursor":"eyJwayI6ICJVU0VSIn0=","items":[]}';
    const { fetch } = recordingFetch(respondWith(200, body));

    const result = await forwardToBackend({ ...DEPENDENCIES, fetch }, GET_TRANSCRIPTIONS);

    // An opaque cursor does not always survive being parsed and rebuilt by
    // something that re-encodes what it does not know.
    expect(result.body).toBe(body);
  });

  it('carries the upstream content type back with it', async () => {
    const { fetch } = recordingFetch(respondWith(200, 'texto plano', 'text/plain; charset=utf-8'));

    const result = await forwardToBackend({ ...DEPENDENCIES, fetch }, GET_TRANSCRIPTIONS);

    expect(result.contentType).toBe('text/plain; charset=utf-8');
  });

  it('tolerates an upstream response that declares no content type', async () => {
    const { fetch } = recordingFetch(respondWith(204, '', null));

    const result = await forwardToBackend({ ...DEPENDENCIES, fetch }, GET_TRANSCRIPTIONS);

    expect(result.contentType).toBeNull();
    expect(result.body).toBe('');
  });
});

describe('the API not answering', () => {
  it('is reported as a gateway failure, which is what actually happened', async () => {
    const failing: ProxyFetch = () => Promise.reject(new Error('ECONNREFUSED'));

    const result = await forwardToBackend({ ...DEPENDENCIES, fetch: failing }, GET_TRANSCRIPTIONS);

    expect(result.status).toBe(502);
    expect(JSON.parse(result.body)).toStrictEqual({
      code: 'API_UNREACHABLE',
      message: expect.stringContaining('Vuelve a intentarlo'),
    });
  });

  it('gives every outbound call a deadline, and abandons it when that passes', async () => {
    // Without an explicit timeout a stalled connection holds the request open
    // until the platform kills it, and the spinner never stops.
    const stalling: ProxyFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      });

    const result = await forwardToBackend(
      { ...DEPENDENCIES, fetch: stalling, timeoutMs: 5 },
      GET_TRANSCRIPTIONS,
    );

    expect(result.status).toBe(502);
  });
});

describe('building the upstream URL', () => {
  it('joins the base, the path and the query string', () => {
    expect(buildBackendUrl('https://api.example.com/v1', 'transcriptions', 'cursor=abc')).toBe(
      'https://api.example.com/v1/transcriptions?cursor=abc',
    );
  });

  it.each([
    ['POST /uploads', 'uploads', 'https://api.example.com/uploads'],
    ['POST /realtime-sessions', 'realtime-sessions', 'https://api.example.com/realtime-sessions'],
    [
      'POST /transcriptions/realtime',
      'transcriptions/realtime',
      'https://api.example.com/transcriptions/realtime',
    ],
    ['GET /transcriptions', 'transcriptions', 'https://api.example.com/transcriptions'],
    [
      'GET /transcriptions/{id}',
      'transcriptions/01J9ABCDEF',
      'https://api.example.com/transcriptions/01J9ABCDEF',
    ],
    [
      'GET /transcriptions/{id}/download',
      'transcriptions/01J9ABCDEF/download',
      'https://api.example.com/transcriptions/01J9ABCDEF/download',
    ],
  ])('forwards %s unchanged', (_name, path, expected) => {
    expect(buildBackendUrl('https://api.example.com', path, '')).toBe(expected);
  });

  it('tolerates a base URL with a trailing slash', () => {
    expect(buildBackendUrl('https://api.example.com/', 'transcriptions', '')).toBe(
      'https://api.example.com/transcriptions',
    );
  });

  it.each([
    ['a protocol-relative path', '/evil.example/steal'],
    ['a path that climbs out', '../../admin'],
    ['a current-directory segment', './transcriptions'],
    ['an absolute URL', 'https://evil.example/steal'],
    ['a backslash', 'transcriptions\\..\\admin'],
    ['a trailing empty segment', 'transcriptions/'],
  ])('refuses %s', (_name, path) => {
    expect(buildBackendUrl('https://api.example.com', path, '')).toBeNull();
  });

  it('refuses the request outright rather than forwarding a rejected path', async () => {
    const { fetch, calls } = recordingFetch(respondWith(200, '{}'));

    const result = await forwardToBackend(
      { ...DEPENDENCIES, fetch },
      { ...GET_TRANSCRIPTIONS, path: '/evil.example/steal' },
    );

    expect(result.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
