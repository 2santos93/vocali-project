import { monotonicFactory } from 'ulid';
import type { IdGenerator } from '../../domain/ports/id-generator.js';

export class UlidIdGenerator implements IdGenerator {
  private readonly nextUlid = monotonicFactory();

  next(): string {
    return this.nextUlid();
  }
}
