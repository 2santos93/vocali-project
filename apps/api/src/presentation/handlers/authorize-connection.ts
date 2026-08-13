import type { AuthorizeConnectionDependencies } from '../types/dependencies.js';
import type {
  ConnectionAuthorizer,
  ConnectionAuthorizerEvent,
  ConnectionAuthorizerResult,
} from '../types/websocket.js';

export const TICKET_QUERY_PARAMETER = 'ticket';

/** Bounded before it reaches a key builder; a real ticket is 43 characters. */
const MAX_TICKET_LENGTH = 256;

/** Not an identity (nothing is authorised under it), but the field is required. */
const ANONYMOUS_PRINCIPAL = 'unauthorized';

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
