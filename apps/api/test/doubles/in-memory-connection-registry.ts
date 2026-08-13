import type {
  ConnectionRegistry,
  UserConnection,
} from '../../src/domain/ports/connection-registry.js';

type AddInput = Parameters<ConnectionRegistry['add']>[0];

/**
 * Nested by user, exactly as the real partition is, so a connection belonging
 * to one user cannot be reached through another's id. A flat map keyed
 * `${userId}#${connectionId}` is the shape that made the transcription double
 * strictly weaker than the store it modelled — see the note on
 * `InMemoryTranscriptionRepository`.
 */
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
