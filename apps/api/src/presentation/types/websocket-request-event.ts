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
