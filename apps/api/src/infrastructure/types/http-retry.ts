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
