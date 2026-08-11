export type Success<T> = { readonly success: true; readonly value: T };
export type Failure<E> = { readonly success: false; readonly error: E };

/**
 * Expected failures are returned as values so that callers must handle them.
 * Exceptions stay reserved for genuinely unexpected conditions.
 */
export type Result<T, E> = Success<T> | Failure<E>;

export function ok<T>(value: T): Success<T> {
  return { success: true, value };
}

export function err<E>(error: E): Failure<E> {
  return { success: false, error };
}
