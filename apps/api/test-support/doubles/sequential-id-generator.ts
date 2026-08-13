import type { IdGenerator } from '../../src/domain/ports/id-generator.js';

const COUNTER_WIDTH = 3;

export class SequentialIdGenerator implements IdGenerator {
  private count = 0;

  next(): string {
    this.count += 1;
    return `01ID${String(this.count).padStart(COUNTER_WIDTH, '0')}`;
  }
}
