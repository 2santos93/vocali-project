import type { ApiGatewayRequestEvent } from '../types/http.js';

/**
 * API Gateway base64-encodes the body whenever the content type is not on its
 * text list, so a client sending JSON under an unexpected content type arrives
 * encoded. Decoding here means every reader downstream sees what was sent.
 */
export function readRawBody(event: ApiGatewayRequestEvent): string | undefined {
  const raw = event.body;
  if (raw === undefined || raw === '') return raw;

  return event.isBase64Encoded === true ? Buffer.from(raw, 'base64').toString('utf8') : raw;
}
