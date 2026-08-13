import type { ApiError } from '@vocali/contracts';
import type { HttpResponse } from '../types/http.js';

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
