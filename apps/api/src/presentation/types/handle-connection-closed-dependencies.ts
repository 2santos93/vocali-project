import type { DeregisterConnection } from '../../application/use-cases/deregister-connection.js';
import type { Logger } from '../../domain/ports/logger.js';

export interface HandleConnectionClosedDependencies {
  readonly deregisterConnection: DeregisterConnection;
  readonly logger: Logger;
}
