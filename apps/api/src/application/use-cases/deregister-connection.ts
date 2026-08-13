import type { ConnectionRegistry } from '../../domain/ports/connection-registry.js';
import type { DeregisterConnectionInput } from '../types/connection-inputs.js';

/**
 * `$disconnect` is not delivered when a connection dies with the network
 * rather than with a close frame, which is why the entry also carries an expiry.
 */
export class DeregisterConnection {
  constructor(private readonly connections: ConnectionRegistry) {}

  async execute(input: DeregisterConnectionInput): Promise<void> {
    await this.connections.remove(input.userId, input.connectionId);
  }
}
