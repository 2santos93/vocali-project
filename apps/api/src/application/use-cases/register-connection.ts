import type { Clock } from '../../domain/ports/clock.js';
import type { ConnectionRegistry } from '../../domain/ports/connection-registry.js';
import { CONNECTION_TTL_SECONDS } from '../constants.js';
import type { RegisterConnectionInput } from '../types/connection-inputs.js';

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
