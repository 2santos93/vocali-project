import type { Clock } from '../../domain/ports/clock.js';

/**
 * The one place in the running system that reads the wall clock. Everything
 * else takes the `Clock` port, which is what lets a test assert an exact
 * expiry instant rather than a tolerance window.
 */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
