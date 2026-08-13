import type { BackoffSchedule, RetryPolicy } from '../types/http-retry.js';

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

export function parseRetryAfterMs(header: string | null, now: Date): number | null {
  if (header === null) return null;

  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1_000;

  const retryAt = Date.parse(trimmed);
  if (Number.isNaN(retryAt)) return null;

  return Math.max(0, retryAt - now.getTime());
}
