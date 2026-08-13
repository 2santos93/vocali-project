import { monotonicFactory } from 'ulid';
import type { IdGenerator } from '../../domain/ports/id-generator.js';

/**
 * `SK = TRANS#<id>` queried descending *is* the newest-first history, so the
 * monotonic factory rather than plain `ulid()`: two ids minted in the same
 * millisecond share a timestamp prefix, and plain ULIDs order the rest by
 * random entropy.
 */
export class UlidIdGenerator implements IdGenerator {
  private readonly nextUlid = monotonicFactory();

  next(): string {
    return this.nextUlid();
  }
}
