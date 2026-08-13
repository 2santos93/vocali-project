import type { ConnectionPublisher } from '../../src/domain/ports/connection-publisher.js';
import type { PublishOutcome } from '../../src/domain/types/connection.js';

type PublishInput = Parameters<ConnectionPublisher['publish']>[0];

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
