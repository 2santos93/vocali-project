import type { TokenGenerator } from '../../src/domain/ports/token-generator.js';

/**
 * Predictable, which is the one property the real generator must not have. The
 * randomness is pinned against `CryptoTokenGenerator` instead.
 */
export class SequentialTokenGenerator implements TokenGenerator {
  private counter = 0;

  constructor(private readonly prefix = 'ticket') {}

  generate(): string {
    this.counter += 1;

    return `${this.prefix}-${String(this.counter).padStart(3, '0')}`;
  }
}
