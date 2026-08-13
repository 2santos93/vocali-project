import { err, ok } from '../result.js';
import { TranscriptionNotFoundError } from '../../errors/domain-error.js';
import type { Result } from '../../types/result.js';

/**
 * Not redundant. `ok()`/`err()` return `Success<T>`/`Failure<E>` and
 * control-flow analysis keeps that literal type through a `const` even under
 * an explicit annotation, so `if (result.success)` would check a literal
 * `true`. A call's return type is not narrowed that way, so routing through
 * this identity function is what produces the wide `Result<T, E>` real callers
 * see.
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
