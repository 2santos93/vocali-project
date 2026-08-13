import type {
  ApiGatewayRequestEvent,
  AuthenticatedHttpRequest,
  HttpRequest,
} from './api-gateway-request.js';
import { errorResponse, type HttpResponse } from './http-response.js';
import { UNAUTHORIZED } from './http-status.js';

const UNAUTHENTICATED_CODE = 'UNAUTHENTICATED';
const UNAUTHENTICATED_MESSAGE = 'This request requires a signed-in user';

/**
 * Supplies the handler with the user id from the authorizer's validated `sub`
 * claim, or answers 401 without ever calling it.
 *
 * `sub` is the only source of identity in this codebase. Not a path
 * parameter, not a query string, not a field in the body — every one of those
 * is chosen by the caller, and accepting any of them as a fallback would let
 * anyone with a valid token of their own read and write another user's
 * records. The API Gateway JWT authorizer has already verified the signature,
 * the issuer, the audience and the expiry by the time this runs; this
 * function's only job is to refuse to invent an identity when the claim is
 * not there.
 *
 * That is also why there is no fallback for a missing claim. An absent `sub`
 * means the route was reached without an authorizer or with one that is
 * misconfigured, and the only safe reading of "I could not tell who this is"
 * is 401.
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
