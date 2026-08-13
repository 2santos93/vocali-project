/**
 * Only the parts of an HTTP API v2 event this layer reads. Narrowing loses no
 * compatibility check: the HTTP entry points in `src/lambda/` each declare
 * their export as one of AWS's own handler types, so a declaration below that
 * stops matching the real event shape stops those modules compiling.
 *
 * `authorizer` is optional here where AWS's type has it required, and that
 * difference is the point: at runtime the field is absent whenever a route is
 * reached without an authorizer, and declaring it required would turn a
 * missing claim into a `TypeError` deep in a handler rather than the 401 it
 * has to be.
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
