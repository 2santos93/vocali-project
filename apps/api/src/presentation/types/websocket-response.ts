/**
 * What a websocket route returns. Only the status is meaningful: on
 * `$connect` a non-2xx refuses the handshake, and on `$disconnect` nothing is
 * listening at all.
 */
export interface WebSocketResponse {
  readonly statusCode: number;
}
