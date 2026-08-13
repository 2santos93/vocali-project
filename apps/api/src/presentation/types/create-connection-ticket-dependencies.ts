import type { IssueConnectionTicket } from '../../application/use-cases/issue-connection-ticket.js';
import type { Logger } from '../../domain/ports/logger.js';

export interface CreateConnectionTicketDependencies {
  readonly useCase: IssueConnectionTicket;
  readonly logger: Logger;
}
