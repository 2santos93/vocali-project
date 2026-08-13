/**
 * Whether the message reached the connection, or the connection was already
 * gone.
 *
 * These are the only two answers, and the distinction is the whole reason this
 * is not a `Promise<void>`. A browser that closed its laptop lid leaves a
 * connection id that API Gateway answers `410 Gone` for, and that is not a
 * failure of the publish — it is the expected end of a connection nobody
 * closed politely. Anything else is infrastructure failing and keeps throwing,
 * because a throttle silently reported as `gone` would have the caller delete
 * a live connection.
 */
export type PublishOutcome = 'delivered' | 'gone';

export interface ConnectionPublisher {
  publish(input: { connectionId: string; payload: unknown }): Promise<PublishOutcome>;
}
