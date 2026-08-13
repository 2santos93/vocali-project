import { randomBytes } from 'node:crypto';
import type { TokenGenerator } from '../../domain/ports/token-generator.js';

/**
 * Thirty-two bytes, which is 256 bits of entropy — the same size as the digest
 * it is stored under, so the hash is not the weaker half.
 *
 * The number is not a guess about how much is enough for a thirty-second
 * credential; it is the point past which guessing is not the attack anyone
 * would try. A shorter token would still be impractical to guess and would
 * invite the question every time somebody read this line.
 */
const TOKEN_BYTES = 32;

/**
 * `randomBytes`, never `Math.random`. The latter is seeded per process and its
 * output is predictable from a handful of samples, which for a credential that
 * opens a socket as a named user is the whole vulnerability.
 *
 * `base64url` because the token travels in a query string: standard base64
 * would put `+` and `/` in a URL, where one becomes a space and the other a
 * path separator once something in the chain decodes it.
 */
export class CryptoTokenGenerator implements TokenGenerator {
  generate(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
  }
}
