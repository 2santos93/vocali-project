import type { ApiError } from '@vocali/contracts';

export interface HttpResponse {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

/**
 * `no-store` because these bodies carry presigned URLs and clinical metadata.
 * A presigned URL held in a shared cache is a credential held in a shared
 * cache, and a cached history page is one user's records served to whoever
 * asks next through the same proxy.
 *
 * `x-request-id` is on every response, not only the failures: a user
 * reporting "the page was empty" needs the same correlation handle as a user
 * reporting an error, and only the failure body has room for one.
 */
export function jsonResponse(statusCode: number, body: unknown, requestId: string): HttpResponse {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-request-id': requestId,
    },
    body: JSON.stringify(body),
  };
}

export function errorResponse(statusCode: number, error: ApiError): HttpResponse {
  return jsonResponse(statusCode, error, error.requestId);
}
