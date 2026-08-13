import type { Clock } from '../../domain/ports/clock.js';
import type { ConnectionRegistry } from '../../domain/ports/connection-registry.js';
import { CONNECTION_TTL_SECONDS } from '../constants.js';
import type { RegisterConnectionInput } from '../types/register-connection-input.js';

/**
 * Deliberately separate from the authorizer, which also sees the connection id.
 * An authorizer that wrote the entry would write it before API Gateway had
 * established the connection, so a refused connect would leave a record nothing
 * ever sends a `$disconnect` for.
 */
export class RegisterConnection {
  constructor(
    private readonly connections: ConnectionRegistry,
    private readonly clock: Clock,
  ) {}

  async execute(input: RegisterConnectionInput): Promise<void> {
    await this.connections.add({
      userId: input.userId,
      connectionId: input.connectionId,
      expiresAt: new Date(this.clock.now().getTime() + CONNECTION_TTL_SECONDS * 1_000),
    });
  }
}
