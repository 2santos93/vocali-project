import type { ApiError } from '@vocali/contracts';
import type { HttpResponse } from '../types/http.js';

/**
 * `no-store` because a presigned URL in a shared cache is a credential in a
 * shared cache, and a cached history page is one user's records served to
 * whoever asks next. `x-request-id` is on every response, not only failures:
 * only the failure body has room for one.
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
