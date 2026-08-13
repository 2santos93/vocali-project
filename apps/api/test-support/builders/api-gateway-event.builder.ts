import type { ApiGatewayRequestEvent } from '../../src/presentation/types/http.js';

type Authorizer = NonNullable<ApiGatewayRequestEvent['requestContext']['authorizer']>;

export const TEST_REQUEST_ID = 'request-1';
export const TEST_USER_ID = 'user-1';

interface EventOverrides {
  readonly requestId?: string;
  readonly authorizer?: Authorizer | null;
  readonly headers?: Record<string, string | undefined>;
  readonly pathParameters?: Record<string, string | undefined> | null;
  readonly queryStringParameters?: Record<string, string | undefined> | null;
  readonly body?: string;
  readonly isBase64Encoded?: boolean;
}

export function buildApiGatewayEvent(overrides: EventOverrides = {}): ApiGatewayRequestEvent {
  const authorizer =
    overrides.authorizer === undefined
      ? { jwt: { claims: { sub: TEST_USER_ID } } }
      : overrides.authorizer;

  return {
    requestContext: {
      requestId: overrides.requestId ?? TEST_REQUEST_ID,
      ...(authorizer === null ? {} : { authorizer }),
    },
    headers: overrides.headers ?? {},
    pathParameters: overrides.pathParameters ?? null,
    queryStringParameters: overrides.queryStringParameters ?? null,
    body: overrides.body,
    isBase64Encoded: overrides.isBase64Encoded ?? false,
  };
}

/** The parsed body of a response, for tests that assert on its fields. */
export function parseResponseBody(body: string): Record<string, unknown> {
  return JSON.parse(body) as Record<string, unknown>;
}
