import type { ApiGatewayRequestEvent } from '../types/http.js';

export function readRawBody(event: ApiGatewayRequestEvent): string | undefined {
  const raw = event.body;
  if (raw === undefined || raw === '') return raw;

  return event.isBase64Encoded === true ? Buffer.from(raw, 'base64').toString('utf8') : raw;
}
