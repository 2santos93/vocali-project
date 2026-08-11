import { err, ok, type Result } from './result.js';
import { TranscriptionNotFoundError } from '../errors/domain-error.js';

/**
 * `ok()`/`err()` return `Success<T>`/`Failure<E>` directly, and TypeScript's
 * control-flow analysis keeps tracking that literal type through a `const`
 * even under an explicit `Result<T, E>` annotation, so `if (result.success)`
 * would still check a literal `true`/`false`. A function call's return type
 * is not narrowed this way, so routing the value through this identity
 * function is what actually produces a `result` real callers get: the wide,
 * genuinely-boolean-discriminated `Result<T, E>`.
 */
function asResult<T, E>(result: Result<T, E>): Result<T, E> {
  return result;
}

describe('Result', () => {
  it('carries the value when successful', () => {
    const result = asResult(ok(42));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe(42);
    }
  });

  it('carries the error when unsuccessful', () => {
    const result = asResult(err(new TranscriptionNotFoundError('01ABC')));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TRANSCRIPTION_NOT_FOUND');
      expect(result.error.message).toContain('01ABC');
    }
  });
});
