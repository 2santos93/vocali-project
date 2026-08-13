import type { Logger } from '../../domain/ports/logger.js';
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

/**
 * The body as the sender wrote it, with API Gateway's own encoding undone.
 *
 * Base64 is a transport detail of this integration and of nothing below it:
 * API Gateway encodes the body whenever the content type is not on its text
 * list, so a client sending JSON under an unexpected content type arrives as a
 * string of base64. Decoding here means every reader downstream — a schema, or
 * an adapter handed a raw payload — sees what was actually sent.
 */
export function readRawBody(event: ApiGatewayRequestEvent): string | undefined {
  const raw = event.body;
  if (raw === undefined || raw === '') return raw;

  return event.isBase64Encoded === true ? Buffer.from(raw, 'base64').toString('utf8') : raw;
}

export interface HttpRequest {
  readonly event: ApiGatewayRequestEvent;
  /** The API Gateway request id, echoed to the client in the body and the header. */
  readonly requestId: string;
  /**
   * Already bound to `requestId`, so a handler correlates its lines by using
   * this logger rather than by remembering to put the id in every context it
   * writes. Handed down rather than reached for: the one built in the
   * composition root has no request to correlate with.
   */
  readonly logger: Logger;
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
