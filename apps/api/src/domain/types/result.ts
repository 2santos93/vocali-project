export type Success<T> = { readonly success: true; readonly value: T };

export type Failure<E> = { readonly success: false; readonly error: E };

/**
 * Expected failures are returned as values so that callers must handle them.
 * Exceptions stay reserved for genuinely unexpected conditions.
 */
export type Result<T, E> = Success<T> | Failure<E>;
