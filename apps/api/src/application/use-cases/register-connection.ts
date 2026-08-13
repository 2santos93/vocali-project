import type { Clock } from '../../domain/ports/clock.js';
import type { ConnectionRegistry } from '../../domain/ports/connection-registry.js';
import { CONNECTION_TTL_SECONDS } from '../constants.js';

interface RegisterConnectionInput {
  readonly userId: string;
  readonly connectionId: string;
}

/**
 * Records a connection so a completion has somewhere to be delivered.
 *
 * Run on `$connect`, after the authorizer has already validated and spent the
 * ticket, so `userId` here is resolved rather than claimed — nothing in the
 * connect request itself is trusted for identity.
 *
 * Deliberately separate from the authorizer, which also sees the connection
 * id. An authorizer that wrote the entry would write it before API Gateway had
 * decided the connection was established, so a connect the service then
 * refused would leave a record of a connection that never existed, and nothing
 * would ever send a `$disconnect` to clear it.
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
