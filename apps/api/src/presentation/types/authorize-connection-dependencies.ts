import type { RedeemConnectionTicket } from '../../application/use-cases/redeem-connection-ticket.js';
import type { Logger } from '../../domain/ports/logger.js';

export interface AuthorizeConnectionDependencies {
  readonly redeemConnectionTicket: RedeemConnectionTicket;
  readonly logger: Logger;
}
