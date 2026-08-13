import type { Failure, Success } from '../types/result.js';

export function ok<T>(value: T): Success<T> {
  return { success: true, value };
}

export function err<E>(error: E): Failure<E> {
  return { success: false, error };
}
