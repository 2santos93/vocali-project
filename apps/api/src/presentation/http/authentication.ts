import type { ApiGatewayRequestEvent } from '../types/api-gateway-request-event.js';
import type { AuthenticatedHttpRequest } from '../types/authenticated-http-request.js';
import type { HttpRequest } from '../types/http-request.js';
import type { HttpResponse } from '../types/http-response.js';
import { errorResponse } from './http-response.js';
import { UNAUTHORIZED } from './http-status.js';

const UNAUTHENTICATED_CODE = 'UNAUTHENTICATED';
const UNAUTHENTICATED_MESSAGE = 'This request requires a signed-in user';

/**
 * `sub` is the only source of identity in this codebase. Not a path parameter,
 * not a query string, not a field in the body — every one of those is chosen
 * by the caller, and accepting any as a fallback would let anyone holding a
 * valid token read and write another user's records.
 *
 * That is also why a missing claim has no fallback: it means the route was
 * reached without an authorizer or with a misconfigured one, and the only safe
 * reading of "I could not tell who this is" is 401.
 */
export function withAuthenticatedUser(
  handler: (request: AuthenticatedHttpRequest) => Promise<HttpResponse>,
): (request: HttpRequest) => Promise<HttpResponse> {
  return (request: HttpRequest): Promise<HttpResponse> => {
    const userId = readSubjectClaim(request.event);
    if (userId === null) {
      return Promise.resolve(
        errorResponse(UNAUTHORIZED, {
          code: UNAUTHENTICATED_CODE,
          message: UNAUTHENTICATED_MESSAGE,
          requestId: request.requestId,
        }),
      );
    }

    return handler({ ...request, userId });
  };
}

function readSubjectClaim(event: ApiGatewayRequestEvent): string | null {
  const subject = event.requestContext.authorizer?.jwt?.claims?.sub;

  return typeof subject === 'string' && subject !== '' ? subject : null;
}
