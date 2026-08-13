import { withAuthenticatedUser } from '../authentication.js';
import { jsonResponse } from '../http-response.js';
import type { AuthenticatedHttpRequest, HttpRequest, HttpResponse } from '../../types/http.js';
import { SilentLogger } from '../../../../test-support/doubles/silent-logger.js';
import {
  buildApiGatewayEvent,
  parseResponseBody,
  TEST_REQUEST_ID,
} from '../../../../test-support/builders/api-gateway-event.builder.js';

/** Records the identity the wrapped handler was given, or that it never ran. */
function buildSubject(): {
  wrapped: (request: HttpRequest) => Promise<HttpResponse>;
  seenUserIds: string[];
} {
  const seenUserIds: string[] = [];
  const wrapped = withAuthenticatedUser((request: AuthenticatedHttpRequest) => {
    seenUserIds.push(request.userId);
    return Promise.resolve(jsonResponse(200, { userId: request.userId }, request.requestId));
  });

  return { wrapped, seenUserIds };
}

function toRequest(event: ReturnType<typeof buildApiGatewayEvent>): HttpRequest {
  return { event, requestId: event.requestContext.requestId, logger: new SilentLogger() };
}

describe('withAuthenticatedUser', () => {
  it('gives the handler the sub claim the authorizer validated', async () => {
    const { wrapped, seenUserIds } = buildSubject();
    const event = buildApiGatewayEvent({
      authorizer: { jwt: { claims: { sub: 'cognito-sub-42' } } },
    });

    const response = await wrapped(toRequest(event));

    expect(response.statusCode).toBe(200);
    expect(seenUserIds).toEqual(['cognito-sub-42']);
  });

  it('answers 401 without running the handler when there is no authorizer', async () => {
    const { wrapped, seenUserIds } = buildSubject();

    const response = await wrapped(toRequest(buildApiGatewayEvent({ authorizer: null })));

    expect(response.statusCode).toBe(401);
    expect(parseResponseBody(response.body).code).toBe('UNAUTHENTICATED');
    expect(parseResponseBody(response.body).requestId).toBe(TEST_REQUEST_ID);
    expect(seenUserIds).toEqual([]);
  });

  it('answers 401 when the authorizer produced claims without a sub', async () => {
    const { wrapped, seenUserIds } = buildSubject();
    const event = buildApiGatewayEvent({
      authorizer: { jwt: { claims: { email: 'medico@clinica.test', scope: 'openid' } } },
    });

    const response = await wrapped(toRequest(event));

    expect(response.statusCode).toBe(401);
    expect(seenUserIds).toEqual([]);
  });

  it.each([
    ['an empty sub', ''],
    ['a numeric sub', 42],
    ['a null sub', null],
  ])('answers 401 for %s', async (_description, sub) => {
    const { wrapped, seenUserIds } = buildSubject();
    const event = buildApiGatewayEvent({ authorizer: { jwt: { claims: { sub } } } });

    const response = await wrapped(toRequest(event));

    expect(response.statusCode).toBe(401);
    expect(seenUserIds).toEqual([]);
  });

  it('never takes an identity from the path, the query string or the body', async () => {
    const { wrapped, seenUserIds } = buildSubject();
    const event = buildApiGatewayEvent({
      authorizer: null,
      pathParameters: { userId: 'victim-user' },
      queryStringParameters: { userId: 'victim-user' },
      body: JSON.stringify({ userId: 'victim-user', sub: 'victim-user' }),
    });

    const response = await wrapped(toRequest(event));

    expect(response.statusCode).toBe(401);
    expect(seenUserIds).toEqual([]);
    expect(response.body).not.toContain('victim-user');
  });

  /**
   * The other half of the same rule: with a valid `sub` present, a different
   * user id supplied by the caller must be ignored rather than preferred.
   */
  it('prefers the sub claim over a conflicting user id supplied by the caller', async () => {
    const { wrapped, seenUserIds } = buildSubject();
    const event = buildApiGatewayEvent({
      authorizer: { jwt: { claims: { sub: 'real-user' } } },
      pathParameters: { userId: 'victim-user' },
      queryStringParameters: { userId: 'victim-user' },
      body: JSON.stringify({ userId: 'victim-user' }),
    });

    const response = await wrapped(toRequest(event));

    expect(seenUserIds).toEqual(['real-user']);
    expect(parseResponseBody(response.body).userId).toBe('real-user');
  });
});
