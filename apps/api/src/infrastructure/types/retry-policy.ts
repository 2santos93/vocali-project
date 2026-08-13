/**
 * The two outcomes where the request may or may not have been acted on: no
 * response at all, and a 5xx, which can be an edge proxy answering for a
 * server that already did the work.
 */
export interface RetryPolicy {
  readonly onUnansweredRequest: boolean;
  readonly onServerFault: boolean;
}
