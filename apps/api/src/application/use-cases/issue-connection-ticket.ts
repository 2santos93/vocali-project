import type { ConnectionTicketResponse } from '@vocali/contracts';
import type { Clock } from '../../domain/ports/clock.js';
import type { ConnectionTicketStore } from '../../domain/ports/connection-ticket-store.js';
import type { TokenGenerator } from '../../domain/ports/token-generator.js';
import { CONNECTION_TICKET_TTL_SECONDS } from '../constants.js';

interface IssueConnectionTicketInput {
  readonly userId: string;
}

/**
 * Mints the credential a browser opens its websocket with.
 *
 * The caller is already authenticated — this runs behind the JWT authorizer,
 * so `userId` is the validated `sub` — and the whole use case exists to turn
 * that proven identity into something safe to put in a query string. The
 * access token is not safe there: API Gateway writes the query string of a
 * `$connect` request into the access log, and an access token in a log is a
 * session anyone reading that log can assume.
 *
 * What goes in the query string instead lives thirty seconds and can be spent
 * once. A leaked log line therefore holds a ticket that is expired, already
 * used, or both.
 *
 * There is no request body and nothing to negotiate, for the same reason
 * `CreateRealtimeSession` has none: the lifetime is a security decision this
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
