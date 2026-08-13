import type { TokenGenerator } from '../../src/domain/ports/token-generator.js';

/**
 * Predictable tokens, which is the one property the real generator must not
 * have. That is the point: a test asserting on a value cannot assert on a
 * random one, and the randomness itself is pinned where it lives, against
 * `CryptoTokenGenerator`.
 */
export class SequentialTokenGenerator implements TokenGenerator {
  private counter = 0;

  constructor(private readonly prefix = 'ticket') {}

  generate(): string {
    this.counter += 1;

    // Padded for the same reason `SequentialIdGenerator` is: unpadded counters
    // sort '10' before '2', and a test that happens to order tokens would
    // freeze the wrong order as its expectation.
    return `${this.prefix}-${String(this.counter).padStart(3, '0')}`;
  }
}
