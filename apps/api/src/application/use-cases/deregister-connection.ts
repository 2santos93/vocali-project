import type { ConnectionRegistry } from '../../domain/ports/connection-registry.js';

interface DeregisterConnectionInput {
  readonly userId: string;
  readonly connectionId: string;
}

/**
 * Forgets a connection the client closed.
 *
 * `$disconnect` is best-effort by API Gateway's own definition — it is not
 * delivered when the connection dies with the network rather than with a close
 * frame — which is why the entry also carries an expiry. This path is the
 * cheap case: a user closing a tab is a delete now rather than a publish that
 * answers 410 hours later.
 */
export class DeregisterConnection {
  constructor(private readonly connections: ConnectionRegistry) {}

  async execute(input: DeregisterConnectionInput): Promise<void> {
    await this.connections.remove(input.userId, input.connectionId);
  }
}
