import type {
  ConnectionPublisher,
  PublishOutcome,
} from '../../src/domain/ports/connection-publisher.js';

type PublishInput = Parameters<ConnectionPublisher['publish']>[0];

/**
 * Records every publish with its full payload, and lets a test decide which
 * connections are already gone.
 *
 * `goneConnectionIds` is what makes the 410 path testable at all. Without it
 * every publish succeeds, the cleanup branch is never entered, and a use case
 * that simply never deleted a stale connection would pass every test.
 */
export class RecordingConnectionPublisher implements ConnectionPublisher {
  readonly calls: PublishInput[] = [];

  /** Connections that answer `410 Gone`, as a departed browser's does. */
  readonly goneConnectionIds = new Set<string>();

  /** Set to make the next call reject with this error; cleared after one use. */
  failNextWith?: Error | undefined;

  publish(input: PublishInput): Promise<PublishOutcome> {
    const failure = this.consumeFailure();
    if (failure) return Promise.reject(failure);

    this.calls.push({ ...input });

    return Promise.resolve(this.goneConnectionIds.has(input.connectionId) ? 'gone' : 'delivered');
  }

  private consumeFailure(): Error | undefined {
    const failure = this.failNextWith;
    this.failNextWith = undefined;
    return failure;
  }
}
