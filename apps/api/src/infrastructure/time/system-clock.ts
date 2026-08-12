import type { Clock } from '../../domain/ports/clock.js';

/**
 * The one place in the running system that reads the wall clock.
 *
 * Everything else takes the `Clock` port, which is what lets a test assert an
 * exact `createdAt` or an exact expiry instant instead of a tolerance window.
 * A single `new Date()` reached for inside a use case would quietly undo that
 * for every assertion downstream of it.
 */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
