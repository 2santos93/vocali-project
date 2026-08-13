/**
 * Retryability is a property of the operation — whether performing it twice can
 * produce a second effect — not of the HTTP call carrying it, which is why each
 * call site declares its own policy instead of inheriting a global rule.
 */

import type { BackoffSchedule, RetryPolicy } from '../types/http-retry.js';

/**
 * 408 and 429 say the request was never accepted, so neither can have been
 * acted on and both are safe to send again whatever the operation does. Every
 * other 4xx describes the request itself and will be rejected identically the
 * second time, spending quota and holding a Lambda open for nothing.
 */
const REQUEST_NOT_ACCEPTED_STATUS_CODES = new Set([408, 429]);

const FIRST_SERVER_FAULT_STATUS = 500;

/**
 * Minting a temporary key twice costs one unused key that expires within the
 * minute, so an unknown outcome is worth another attempt.
 */
export const REPEATABLE_OPERATION_RETRY_POLICY: RetryPolicy = {
  onUnansweredRequest: true,
  onServerFault: true,
};

/**
 * `POST /v2/jobs/` creates a resource and Speechmatics documents no idempotency
 * key, so a second attempt cannot be recognised as the same submission. An
 * attempt that reached the provider and then timed out — or that an edge proxy
 * answered 5xx after the job was created — would leave two jobs transcribing
 * the same audio: minutes spent twice, and a callback carrying a job id that
 * does not match the stored one. So an unknown outcome is reported as a
 * failure the caller can act on, never retried.
 */
export const JOB_SUBMISSION_RETRY_POLICY: RetryPolicy = {
  onUnansweredRequest: false,
  onServerFault: false,
};

export function isRetryableStatus(status: number, policy: RetryPolicy): boolean {
  return (
    REQUEST_NOT_ACCEPTED_STATUS_CODES.has(status) ||
    (policy.onServerFault && status >= FIRST_SERVER_FAULT_STATUS)
  );
}

/**
 * Equal jitter: half exponential, half random. Full jitter can return almost
 * zero and stampede the provider again immediately; no jitter puts every
 * concurrent Lambda back on the wire in the same millisecond. `Retry-After`
 * wins outright — the provider knows when its quota window rolls over.
 */
export function backoffDelayMs(
  schedule: BackoffSchedule,
  attempt: number,
  retryAfterMs: number | null,
): number {
  if (retryAfterMs !== null) return Math.min(retryAfterMs, schedule.maxDelayMs);

  const exponential = schedule.baseDelayMs * 2 ** (attempt - 1);
  const capped = Math.min(exponential, schedule.maxDelayMs);

  return Math.round(capped / 2 + (capped / 2) * schedule.random());
}

/**
 * `Retry-After` is either whole seconds or an HTTP date. The date form resolves
 * against the injected clock so the wait is deterministic under test, and a
 * value in the past becomes zero rather than a negative delay that would skip
 * the backoff entirely.
 */
export function parseRetryAfterMs(header: string | null, now: Date): number | null {
  if (header === null) return null;

  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1_000;

  const retryAt = Date.parse(trimmed);
  if (Number.isNaN(retryAt)) return null;

  return Math.max(0, retryAt - now.getTime());
}
