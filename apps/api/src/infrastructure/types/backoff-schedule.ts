/** `random` is injected rather than reached for, so a test gets the same delay twice. */
export interface BackoffSchedule {
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly random: () => number;
}
