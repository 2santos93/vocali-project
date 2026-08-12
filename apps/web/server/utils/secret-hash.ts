import { createHmac } from 'node:crypto';

/**
 * The `SECRET_HASH` every call to a confidential Cognito app client carries.
 *
 * The app client is confidential — it holds a secret — because it is only ever
 * used from this server, never from the browser. Cognito's price for that is
 * that each user-facing call must prove possession of the secret with an
 * HMAC over the username concatenated with the client id, base64 encoded.
 *
 * The order matters and is not symmetric: it is HMAC(username + clientId),
 * keyed by the secret. Swapping the two operands produces a hash Cognito
 * rejects with the same `NotAuthorizedException` it uses for a wrong password,
 * which is why this is worth its own tested function rather than three
 * inlined copies.
 */
export function computeSecretHash(
  username: string,
  clientId: string,
  clientSecret: string,
): string {
  return createHmac('sha256', clientSecret).update(`${username}${clientId}`).digest('base64');
}
