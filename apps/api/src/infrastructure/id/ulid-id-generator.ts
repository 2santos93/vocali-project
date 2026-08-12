import { monotonicFactory } from 'ulid';
import type { IdGenerator } from '../../domain/ports/id-generator.js';

/**
 * ULIDs, because the whole history query depends on the id sorting the way
 * time runs: `SK = TRANS#<id>` with a descending DynamoDB query *is* the
 * newest-first ordering, with no sort in memory and no secondary index.
 *
 * The monotonic factory, not the plain `ulid()`, for the same reason. Two ids
 * minted in the same millisecond share a timestamp prefix and plain ULIDs
 * then fall back to random entropy, so their relative order is a coin toss —
 * and a page of history would come back subtly out of sequence. The monotonic
 * factory increments the previous value's random component instead, so ids
 * issued inside one millisecond still sort in the order they were issued.
 */
export class UlidIdGenerator implements IdGenerator {
  private readonly nextUlid = monotonicFactory();

  next(): string {
    return this.nextUlid();
  }
}
