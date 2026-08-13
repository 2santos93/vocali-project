/**
 * The parts of an API Gateway websocket event this layer reads, and nothing
 * else — the same narrowing, for the same reasons, as
 * `ApiGatewayRequestEvent` applies to the HTTP API.
 *
 * The compatibility check is not lost by narrowing: the entry points in
 * `src/lambda/` declare their exports as AWS's own websocket handler types, so
 * if any declaration here stops matching the real event shape those modules
 * stop compiling.
 */
export interface WebSocketRequestEvent {
  readonly requestContext: {
    /** API Gateway's handle for the socket. The management API accepts it. */
    readonly connectionId: string;
    readonly requestId: string;
    /**
     * The context the `$connect` authorizer returned, flattened — a REQUEST
     * authorizer's context arrives directly under `authorizer` rather than
     * under a `jwt` key as the HTTP API's does.
     *
     * Optional, and that is the point. API Gateway carries the `$connect`
     * authorizer's context forward onto the connection's later routes, so
     * `$disconnect` normally has it; treating that as a certainty would turn
     * an absent context into a `TypeError` on a route whose only job is to
     * tidy up.
     */
    readonly authorizer?: Record<string, unknown> | null;
  };
  readonly queryStringParameters?: Record<string, string | undefined> | null;
}

/**
 * What a websocket route returns. Only the status is meaningful: on
 * `$connect` a non-2xx refuses the handshake, and on `$disconnect` nothing is
 * listening at all.
 */
export interface WebSocketResponse {
  readonly statusCode: number;
}

export type WebSocketHandler = (event: WebSocketRequestEvent) => Promise<WebSocketResponse>;

/**
 * The user the `$connect` authorizer resolved, or null.
 *
 * This is the only identity a websocket route may use. Nothing reads a user id
 * from the query string, for the same reason no HTTP handler reads one from a
 * path: the caller chose it.
 */
export function readAuthorizedUserId(event: WebSocketRequestEvent): string | null {
  const userId = event.requestContext.authorizer?.userId;

  return typeof userId === 'string' && userId !== '' ? userId : null;
}
