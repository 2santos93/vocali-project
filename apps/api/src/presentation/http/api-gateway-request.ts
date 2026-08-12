import type { HttpResponse } from './http-response.js';

/**
 * The parts of an API Gateway HTTP API v2 event this layer reads, and nothing
 * else. AWS's own `APIGatewayProxyEventV2WithJWTAuthorizer` describes dozens
 * of fields no handler here touches, and a test would have to build all of
 * them to exercise one.
 *
 * The compatibility check is not lost by narrowing: every entry point in
 * `src/lambda/` declares its export as AWS's `APIGatewayProxyHandlerV2WithJWTAuthorizer`,
 * so if any declaration below stops matching the real event shape, those eight
 * modules stop compiling.
 *
 * `authorizer` is optional here where AWS's type has it required. That
 * difference is the point: at runtime the field is simply absent whenever a
 * route is reached without an authorizer attached, and declaring it required
 * would make the `sub` lookup read as a certainty — turning a missing claim
 * into a `TypeError` deep in a handler rather than the 401 it has to be.
 */
export interface ApiGatewayRequestEvent {
  readonly requestContext: {
    readonly requestId: string;
    readonly authorizer?: {
      readonly jwt?: {
        readonly claims?: Record<string, unknown> | null;
      };
    };
  };
  readonly headers: Record<string, string | undefined>;
  readonly pathParameters?: Record<string, string | undefined> | null;
  readonly queryStringParameters?: Record<string, string | undefined> | null;
  readonly body?: string | undefined;
  readonly isBase64Encoded?: boolean;
}

export type ApiGatewayRequestHandler = (event: ApiGatewayRequestEvent) => Promise<HttpResponse>;

export interface HttpRequest {
  readonly event: ApiGatewayRequestEvent;
  /** The API Gateway request id, echoed to the client and stamped on every log line. */
  readonly requestId: string;
}

/**
 * A request whose `userId` came from the authorizer's validated `sub` claim.
 *
 * The type exists so that "authenticated" is something a handler receives
 * rather than something it remembers to check. A handler that wants a user id
 * has to be wrapped in `withAuthenticatedUser` to be given one, and there is
 * no other constructor for this shape anywhere in the layer.
 */
export interface AuthenticatedHttpRequest extends HttpRequest {
  readonly userId: string;
}
