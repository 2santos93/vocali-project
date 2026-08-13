import type {
  ApiGatewayRequestEvent,
  AuthenticatedHttpRequest,
  HttpRequest,
  HttpResponse,
} from '../types/http.js';
import { errorResponse } from './http-response.js';
import { UNAUTHORIZED } from './http-status.js';

const UNAUTHENTICATED_CODE = 'UNAUTHENTICATED';
const UNAUTHENTICATED_MESSAGE = 'This request requires a signed-in user';

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
