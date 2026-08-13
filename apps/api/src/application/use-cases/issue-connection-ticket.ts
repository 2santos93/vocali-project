import type { ConnectionTicketResponse } from '@vocali/contracts';
import type { Clock } from '../../domain/ports/clock.js';
import type { ConnectionTicketStore } from '../../domain/ports/connection-ticket-store.js';
import type { TokenGenerator } from '../../domain/ports/token-generator.js';
import { CONNECTION_TICKET_TTL_SECONDS } from '../constants.js';
import type { IssueConnectionTicketInput } from '../types/issue-connection-ticket-input.js';

/**
 * Turns the proven identity behind the JWT authorizer into something safe to
 * put in a query string. API Gateway writes a `$connect` query string into the
 * access log, and an access token in a log is a session anyone reading it can
 * assume; a ticket in that log is expired, already spent, or both.
 *
 * No request body, deliberately: the lifetime is a security decision this
 * layer makes, not a preference a client states.
 */
export class IssueConnectionTicket {
  constructor(
    private readonly tickets: ConnectionTicketStore,
    private readonly tokens: TokenGenerator,
    private readonly clock: Clock,
    private readonly options: { websocketUrl: string },
  ) {}

  async execute(input: IssueConnectionTicketInput): Promise<ConnectionTicketResponse> {
    const ticket = this.tokens.generate();
    const expiresAt = new Date(this.clock.now().getTime() + CONNECTION_TICKET_TTL_SECONDS * 1_000);

    await this.tickets.issue({ ticket, userId: input.userId, expiresAt });

    return {
      ticket,
      websocketUrl: this.options.websocketUrl,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
