import { createHmac } from 'node:crypto';

/**
 * The order matters and is not symmetric: HMAC(username + clientId), keyed by
 * the secret. Swapping the operands produces a hash Cognito rejects with the
 * same `NotAuthorizedException` it uses for a wrong password, which is why
 * this is a tested function rather than three inlined copies.
 */
export function computeSecretHash(
  username: string,
  clientId: string,
  clientSecret: string,
): string {
  return createHmac('sha256', clientSecret).update(`${username}${clientId}`).digest('base64');
}
