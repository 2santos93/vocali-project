import type { IdGenerator } from '../../src/domain/ports/id-generator.js';

export class SequentialIdGenerator implements IdGenerator {
  private count = 0;

  next(): string {
    this.count += 1;
    return `01ID${String(this.count)}`;
  }
}
