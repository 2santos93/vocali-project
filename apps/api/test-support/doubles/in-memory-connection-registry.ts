import type { ConnectionRegistry } from '../../src/domain/ports/connection-registry.js';
import type { UserConnection } from '../../src/domain/types/connection.js';

type AddInput = Parameters<ConnectionRegistry['add']>[0];

export class InMemoryConnectionRegistry implements ConnectionRegistry {
  readonly calls: {
    added: AddInput[];
    removed: { userId: string; connectionId: string }[];
  } = { added: [], removed: [] };

  /** Set to make the next call reject with this error; cleared after one use. */
  failNextWith?: Error | undefined;

  private readonly byUser = new Map<string, Map<string, UserConnection>>();

  add(input: AddInput): Promise<void> {
    const failure = this.consumeFailure();
    if (failure) return Promise.reject(failure);

    this.calls.added.push({ ...input });

    const connections = this.byUser.get(input.userId) ?? new Map<string, UserConnection>();
    connections.set(input.connectionId, { connectionId: input.connectionId });
    this.byUser.set(input.userId, connections);

    return Promise.resolve();
  }

  remove(userId: string, connectionId: string): Promise<void> {
    const failure = this.consumeFailure();
    if (failure) return Promise.reject(failure);

    this.calls.removed.push({ userId, connectionId });
    this.byUser.get(userId)?.delete(connectionId);

    return Promise.resolve();
  }

  listByUser(userId: string): Promise<readonly UserConnection[]> {
    const failure = this.consumeFailure();
    if (failure) return Promise.reject(failure);

    return Promise.resolve([...(this.byUser.get(userId)?.values() ?? [])]);
  }

  private consumeFailure(): Error | undefined {
    const failure = this.failNextWith;
    this.failNextWith = undefined;
    return failure;
  }
}
