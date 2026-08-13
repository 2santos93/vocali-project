/**
 * Reads claims **without verifying** the token. Nothing here checks a
 * signature and nothing here may ever be the reason a request is allowed:
 * the API Gateway JWT authorizer verifies before any handler runs.
 *
 * This exists for the two decisions the BFF makes on its own — when to
 * refresh, and which address to show in the header. The worst a tampered
 * token achieves is a wrong name or a needless refresh.
 */

const JWT_SEGMENT_COUNT = 3;

export interface TokenClaims {
  /** Cognito's `sub`: the user id, and the username of a pool keyed by email. */
  readonly subject: string;
  /** `exp`, in seconds since the epoch. */
  readonly expiresAt: number;
  /** Present on an id token, absent from an access token. */
  readonly email: string | null;
}

export function readTokenClaims(token: string): TokenClaims | null {
  const payload = decodePayload(token);
  if (payload === null) return null;

  const subject = payload['sub'];
  const expiresAt = payload['exp'];
  const email = payload['email'];

  // Validated rather than asserted: `as TokenClaims` over `JSON.parse` hands
  // the rest of the server a `subject` that is undefined at runtime and a
  // string to the type checker.
  if (typeof subject !== 'string' || subject === '') return null;
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null;

  return {
    subject,
    expiresAt,
    email: typeof email === 'string' && email !== '' ? email : null,
  };
}

function decodePayload(token: string): Record<string, unknown> | null {
  const segments = token.split('.');
  if (segments.length !== JWT_SEGMENT_COUNT) return null;

  const payloadSegment = segments[1];
  if (payloadSegment === undefined || payloadSegment === '') return null;

  try {
    const decoded: unknown = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8'));

    // `typeof null` is 'object', and an array is an object too. Both would
    // survive a bare typeof check and then index to undefined.
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) return null;

    return decoded as Record<string, unknown>;
  } catch {
    // A malformed request, not a crash: the caller reads null as no session.
    return null;
  }
}
