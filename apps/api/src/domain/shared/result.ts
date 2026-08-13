import type { Failure } from '../types/failure.js';
import type { Success } from '../types/success.js';

export function ok<T>(value: T): Success<T> {
  return { success: true, value };
}

export function err<E>(error: E): Failure<E> {
  return { success: false, error };
}
