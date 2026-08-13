import type { Failure } from './failure.js';
import type { Success } from './success.js';

/**
 * Expected failures are returned as values so that callers must handle them.
 * Exceptions stay reserved for genuinely unexpected conditions.
 */
export type Result<T, E> = Success<T> | Failure<E>;
