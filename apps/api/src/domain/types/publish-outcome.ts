/**
 * Only `410 Gone` maps to `gone`. Everything else keeps throwing: a throttle
 * silently reported as `gone` would have the caller delete a live connection.
 */
export type PublishOutcome = 'delivered' | 'gone';
