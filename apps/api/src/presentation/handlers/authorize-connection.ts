import type { AuthorizeConnectionDependencies } from '../types/dependencies.js';
import type {
  ConnectionAuthorizer,
  ConnectionAuthorizerEvent,
  ConnectionAuthorizerResult,
} from '../types/websocket.js';

export const TICKET_QUERY_PARAMETER = 'ticket';

/** Bounded before it reaches a key builder; a real ticket is 43 characters. */
const MAX_TICKET_LENGTH = 256;

/** Not an identity — nothing is authorised under it — but the field is required. */
const ANONYMOUS_PRINCIPAL = 'unauthorized';

/**
 * **This is the boundary.** Everything past it treats `userId` as proven, and a
 * browser cannot present a header on a websocket handshake, so this is the one
 * place the platform decides whose socket is being opened.
 *
 * **The authorizer must not be cached.** API Gateway caches a REQUEST
 * authorizer's result against its identity source, which here is the ticket. A
 * cached allow answers a second connect without this function running, so the
 * ticket becomes spendable for as long as the cache lasts and the single-use
 * property exists only in the code. The Terraform sets that TTL to zero.
 */
export function authorizeConnectionHandler(
  dependencies: AuthorizeConnectionDependencies,
): ConnectionAuthorizer {
  return async (event: ConnectionAuthorizerEvent): Promise<ConnectionAuthorizerResult> => {
    const ticket = event.queryStringParameters?.[TICKET_QUERY_PARAMETER];

    if (typeof ticket !== 'string' || ticket === '' || ticket.length > MAX_TICKET_LENGTH) {
      // The ticket is never logged, at any level and on any path: a rejected
      // credential is still a credential until it expires.
      dependencies.logger.warn('Refused a websocket connection presenting no usable ticket');

      return deny(event);
    }

    const resolved = await dependencies.redeemConnectionTicket.execute({ ticket });
    if (resolved === null) {
      dependencies.logger.warn('Refused a websocket connection presenting an unusable ticket');

      return deny(event);
    }

    return {
      principalId: resolved.userId,
      policyDocument: policy('Allow', event.methodArn),
      context: { userId: resolved.userId },
    };
  };
}

/**
 * Denied with a policy rather than by throwing, because a returned policy is a
 * value a test can assert on where a thrown string is matched by a convention
 * inside the service.
 *
 * No `context` on a denial: a user id set on a refused request is a field
 * waiting to be read by something that assumes it means the connection was
 * allowed.
 */
function deny(event: ConnectionAuthorizerEvent): ConnectionAuthorizerResult {
  return {
    principalId: ANONYMOUS_PRINCIPAL,
    policyDocument: policy('Deny', event.methodArn),
  };
}

function policy(
  effect: 'Allow' | 'Deny',
  methodArn: string,
): ConnectionAuthorizerResult['policyDocument'] {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'execute-api:Invoke',
        Effect: effect,
        // The exact ARN of the route being authorised, never a wildcard: a
        // policy granting the whole API authorises every route the day
        // somebody adds one.
        Resource: methodArn,
      },
    ],
  };
}
