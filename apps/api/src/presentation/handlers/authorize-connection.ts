import type { RedeemConnectionTicket } from '../../application/use-cases/redeem-connection-ticket.js';
import type { Logger } from '../../domain/ports/logger.js';

/**
 * The query string parameter the browser puts the ticket in.
 *
 * A `WebSocket` cannot carry a header, which is the whole reason a ticket
 * exists rather than the access token being sent here.
 */
export const TICKET_QUERY_PARAMETER = 'ticket';

/** Bounded before it reaches a key builder; a real ticket is 43 characters. */
const MAX_TICKET_LENGTH = 256;

/**
 * The principal named on a denial. It is not an identity — nothing is
 * authorised under it — but the field is required and must be non-empty.
 */
const ANONYMOUS_PRINCIPAL = 'unauthorized';

/**
 * A websocket `$connect` request as a Lambda REQUEST authorizer sees it.
 */
export interface ConnectionAuthorizerEvent {
  /** The route being authorised. The policy is scoped to exactly this. */
  readonly methodArn: string;
  readonly queryStringParameters?: Record<string, string | undefined> | null;
}

export interface ConnectionAuthorizerResult {
  readonly principalId: string;
  /**
   * Mutable, unlike everything else this layer declares, and deliberately so:
   * AWS's own `APIGatewayAuthorizerResult` types the statements as a mutable
   * array, and a `readonly` one here is not assignable to it. The entry point
   * declares the export as AWS's type, so keeping this assignable is what
   * makes that declaration a real check rather than a comment.
   */
  readonly policyDocument: {
    Version: string;
    Statement: {
      Action: string;
      Effect: 'Allow' | 'Deny';
      Resource: string;
    }[];
  };
  /**
   * Carried onto the connection: API Gateway hands this back on `$connect` and
   * on every later route of the same connection, which is how `$disconnect`
   * knows whose socket closed without trusting anything the client sent.
   *
   * Values are strings because API Gateway stringifies them anyway, and a
   * number that silently arrives as `"1"` is a bug found at run time.
   */
  readonly context?: Record<string, string>;
}

export type ConnectionAuthorizer = (
  event: ConnectionAuthorizerEvent,
) => Promise<ConnectionAuthorizerResult>;

interface Dependencies {
  readonly redeemConnectionTicket: RedeemConnectionTicket;
  readonly logger: Logger;
}

/**
 * Authorises `$connect` by spending a connection ticket.
 *
 * **This is the boundary.** Everything past it treats `userId` as proven, and
 * a browser cannot present a header on a websocket handshake, so this is the
 * one place the platform decides whose socket is being opened.
 *
 * The ticket travels in the query string because there is nowhere else to put
 * it, and a query string is written verbatim into the API's access log. That
 * is survivable only because of what the ticket is: valid for thirty seconds,
 * spendable once, and useless for anything but opening one socket. An access
 * token here would be a session anyone reading the log could assume — which is
 * the same reasoning that put the provider callback's credential in a header
 * rather than a signed query string.
 *
 * **The authorizer must not be cached.** API Gateway caches a REQUEST
 * authorizer's result against its identity source, and the identity source
 * here is the ticket. A cached allow would answer a second connect with the
 * same ticket without this function running, so the ticket would be spendable
 * as many times as the cache lasted and the single-use property would exist
 * only in the code. The Terraform sets the result TTL to zero and says so.
 */
export function authorizeConnectionHandler(dependencies: Dependencies): ConnectionAuthorizer {
  return async (event: ConnectionAuthorizerEvent): Promise<ConnectionAuthorizerResult> => {
    const ticket = event.queryStringParameters?.[TICKET_QUERY_PARAMETER];

    if (typeof ticket !== 'string' || ticket === '' || ticket.length > MAX_TICKET_LENGTH) {
      // The ticket itself is never logged, at any level and on any path. It is
      // a credential, and a rejected one is still a credential until it
      // expires.
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
 * Denied with a policy rather than by throwing. A thrown `Unauthorized`
 * produces a 401 and a policy produces a 403, and the difference matters less
 * than the determinism: a returned policy is a value a test can assert on,
 * where a thrown string is matched by a convention inside the service.
 *
 * No `context` on a denial. Nothing downstream runs, and a context carrying a
 * user id on a request that was refused is a field waiting to be read by
 * something that assumes it is only ever set when the connection was allowed.
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
        // The exact ARN of the route being authorised, never a wildcard. A
        // policy granting the whole API is the same mistake as a Lambda
        // permission with a trailing `*`: it authorises every route the day
        // somebody adds one.
        Resource: methodArn,
      },
    ],
  };
}
