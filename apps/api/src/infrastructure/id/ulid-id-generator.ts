import { monotonicFactory } from 'ulid';
import type { IdGenerator } from '../../domain/ports/id-generator.js';

/**
 * ULIDs, because `SK = TRANS#<id>` queried descending *is* the newest-first
 * history: no sort in memory and no secondary index.
 *
 * The monotonic factory rather than plain `ulid()` for the same reason. Two
 * ids minted in the same millisecond share a timestamp prefix, and plain ULIDs
 * then fall back to random entropy, so a page of history comes back subtly out
 * of sequence.
 */
export class UlidIdGenerator implements IdGenerator {
  private readonly nextUlid = monotonicFactory();

  next(): string {
    return this.nextUlid();
  }
}
