import type { IdGenerator } from '../../src/domain/ports/id-generator.js';

const COUNTER_WIDTH = 3;

/**
 * Zero-pads the counter so ids stay lexicographically ordered past the ninth
 * one (`01ID010` sorts after `01ID009`), matching the ULID sort-key ordering
 * the real repository adapter relies on.
 */
export class SequentialIdGenerator implements IdGenerator {
  private count = 0;

  next(): string {
    this.count += 1;
    return `01ID${String(this.count).padStart(COUNTER_WIDTH, '0')}`;
  }
}
