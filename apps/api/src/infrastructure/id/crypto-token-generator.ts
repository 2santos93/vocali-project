import { randomBytes } from 'node:crypto';
import type { TokenGenerator } from '../../domain/ports/token-generator.js';

/** 256 bits, matching the digest it is stored under. */
const TOKEN_BYTES = 32;

export class CryptoTokenGenerator implements TokenGenerator {
  generate(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
  }
}
