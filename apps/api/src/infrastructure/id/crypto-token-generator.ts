import { randomBytes } from 'node:crypto';
import type { TokenGenerator } from '../../domain/ports/token-generator.js';

/** 256 bits, matching the digest it is stored under. */
const TOKEN_BYTES = 32;

/**
 * `randomBytes`, never `Math.random`: the latter is seeded per process and
 * predictable from a handful of samples, which for a credential that opens a
 * socket as a named user is the whole vulnerability.
 *
 * `base64url` because the token travels in a query string, where standard
 * base64's `+` becomes a space and `/` a path separator.
 */
export class CryptoTokenGenerator implements TokenGenerator {
  generate(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
  }
}
