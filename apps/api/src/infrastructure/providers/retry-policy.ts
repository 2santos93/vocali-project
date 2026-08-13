/**
 * When an outbound provider request is worth sending again, and how long to
 * wait before doing so.
 *
 * Separate from the adapter because it answers a question the adapter does not
 * ask: retryability is a property of the operation being attempted — whether
 * performing it twice can produce a second effect — not of the HTTP call that
 * carries it. Keeping the two apart is what lets each call site declare its own
 * policy beside itself instead of inheriting a global rule somebody has to
 * remember.
 */

/**
 * The two statuses that say the request was not accepted: the provider gave up
 * waiting for it (408), or the quota window has not rolled over yet (429).
 * Because neither can have been acted on, both are safe to send again whatever
 * the operation does. Everything else in the 4xx range describes the request
 * itself, and a request the provider has already rejected will be rejected
 * identically the second time — retrying it only spends quota and holds a
 * Lambda open.
 */
const REQUEST_NOT_ACCEPTED_STATUS_CODES = new Set([408, 429]);

/** The lowest status that reports a fault on the provider's side. */
const FIRST_SERVER_FAULT_STATUS = 500;

/**
 * What to do with the two outcomes where the request may or may not have been
 * acted on: one that produced no response at all, and a 5xx, which can be an
 * edge proxy answering for a server that already did the work.
 *
 * Retryability belongs to the operation rather than to the status, so it is
 * declared beside each call instead of being a global rule to remember.
 */
export interface RetryPolicy {
  readonly onUnansweredRequest: boolean;
  readonly onServerFault: boolean;
}

/**
 * For an operation that can be performed twice without a second effect.
 * Minting a temporary key again costs one unused key that expires within the
 * minute, so an unknown outcome is worth another attempt.
 */
export const REPEATABLE_OPERATION_RETRY_POLICY: RetryPolicy = {
  onUnansweredRequest: true,
  onServerFault: true,
};

/**
 * `POST /v2/jobs/` creates a resource and Speechmatics documents no
 * idempotency key, so a second attempt cannot be recognised as the same
 * submission. A first attempt that reached the provider and then timed out —
 * or that an edge proxy answered 5xx after the job had been created — would
 * leave two jobs transcribing the same audio against the same callback URL:
 * the account's minutes spent twice, and a callback carrying a job id that
 * does not match the stored one, which the webhook can only answer 404 to.
 *
 * So an unknown outcome is treated as a submitted job and reported as a
 * failure, which the caller can act on, rather than retried blindly.
 */
export const JOB_SUBMISSION_RETRY_POLICY: RetryPolicy = {
  onUnansweredRequest: false,
  onServerFault: false,
};

/** Whether a response the provider did send is worth asking for again. */
export function isRetryableStatus(status: number, policy: RetryPolicy): boolean {
  return (
    REQUEST_NOT_ACCEPTED_STATUS_CODES.has(status) ||
    (policy.onServerFault && status >= FIRST_SERVER_FAULT_STATUS)
  );
}

/**
 * The numbers the backoff is computed from, and the source of randomness it
 * draws jitter from — injected rather than reached for, so a test gets the
 * same delay twice.
 */
export interface BackoffSchedule {
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly random: () => number;
}

/**
 * Equal jitter: half the delay is the exponential term, half is random.
 * Full jitter can return almost zero and stampede the provider again
 * immediately; no jitter puts every concurrent Lambda back on the wire in
 * the same millisecond. `Retry-After` wins outright when the provider sent
 * one — it knows when its quota window rolls over and this adapter does not.
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
 * `Retry-After` is either a whole number of seconds or an HTTP date. The date
 * form is resolved against the injected clock so the wait is deterministic
 * under test, and a value in the past becomes zero rather than a negative
 * delay that would skip the backoff entirely.
 */
export function parseRetryAfterMs(header: string | null, now: Date): number | null {
  if (header === null) return null;

  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1_000;

  const retryAt = Date.parse(trimmed);
  if (Number.isNaN(retryAt)) return null;

  return Math.max(0, retryAt - now.getTime());
}
