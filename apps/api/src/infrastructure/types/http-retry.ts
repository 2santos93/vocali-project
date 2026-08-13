/**
 * The two outcomes where the request may or may not have been acted on: no
 * response at all, and a 5xx, which can be an edge proxy answering for a
 * server that already did the work.
 */
export interface RetryPolicy {
  readonly onUnansweredRequest: boolean;
  readonly onServerFault: boolean;
}

/** `random` is injected rather than reached for, so a test gets the same delay twice. */
export interface BackoffSchedule {
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly random: () => number;
}

export type AttemptResult =
  | { readonly kind: 'success'; readonly response: Response }
  | { readonly kind: 'permanent'; readonly reason: string; readonly status: number | null }
  | {
      readonly kind: 'transient';
      readonly reason: string;
      readonly status: number | null;
      readonly retryAfterMs: number | null;
    };

export type RequestInitWithHeaders = RequestInit & { headers: Record<string, string> };
