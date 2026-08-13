import type { RegisterConnection } from '../../application/use-cases/register-connection.js';
import type { Logger } from '../../domain/ports/logger.js';

export interface HandleConnectionOpenedDependencies {
  readonly registerConnection: RegisterConnection;
  readonly logger: Logger;
}
