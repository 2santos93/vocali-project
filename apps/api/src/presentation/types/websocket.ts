/**
 * The same narrowing, for the same reasons, as `ApiGatewayRequestEvent` applies
 * to the HTTP API: the websocket entry points in `src/lambda/` declare their
 * exports as AWS's own handler types, so a declaration here that stops matching
 * the real event shape stops those modules compiling.
 */
export interface WebSocketRequestEvent {
  readonly requestContext: {
    /** API Gateway's handle for the socket; the management API accepts it. */
    readonly connectionId: string;
    readonly requestId: string;
    /**
     * Flattened: a REQUEST authorizer's context arrives directly under
     * `authorizer` rather than under a `jwt` key as the HTTP API's does.
     *
     * Optional, and that is the point. Treating the carried-forward context as
     * a certainty would turn an absent one into a `TypeError` on a route whose
     * only job is to tidy up.
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
 * A websocket `$connect` request as a Lambda REQUEST authorizer sees it.
 */
export interface ConnectionAuthorizerEvent {
  /** The route being authorised. The policy is scoped to exactly this. */
  readonly methodArn: string;
  readonly queryStringParameters?: Record<string, string | undefined> | null;
}

export interface ConnectionAuthorizerResult {
  readonly principalId: string;
  /**
   * Mutable, unlike everything else this layer declares, and deliberately so:
   * AWS's `APIGatewayAuthorizerResult` types the statements as a mutable array
   * and a `readonly` one is not assignable to it. The entry point declares its
   * export as AWS's type, so keeping this assignable is what makes that
   * declaration a real check.
   */
  readonly policyDocument: {
    Version: string;
    Statement: {
      Action: string;
      Effect: 'Allow' | 'Deny';
      Resource: string;
    }[];
  };
  /**
   * API Gateway hands this back on every later route of the same connection,
   * which is how `$disconnect` knows whose socket closed without trusting
   * anything the client sent. Values are strings because API Gateway
   * stringifies them anyway, and a number arriving as `"1"` is a run-time bug.
   */
  readonly context?: Record<string, string>;
}

export type ConnectionAuthorizer = (
  event: ConnectionAuthorizerEvent,
) => Promise<ConnectionAuthorizerResult>;
