import type { Clock } from '../../domain/ports/clock.js';
import type { ConnectionTicketStore } from '../../domain/ports/connection-ticket-store.js';

interface RedeemConnectionTicketInput {
  readonly ticket: string;
}

/**
 * Turns a ticket into the user it was issued to, and spends it in the same
 * act.
 *
 * This is what the `$connect` authorizer runs, and it is the only place the
 * websocket learns who is connecting. There is no fallback: a ticket that was
 * never issued, has already been spent or has lapsed resolves to null, and the
 * authorizer denies. Resolving an unknown ticket to anything at all would make
 * the socket open to whoever asked.
 *
 * The result is deliberately not a `Result` with a reason. Which of the three
 * a rejected ticket was is information the caller must not be able to
 * distinguish — "already used" and "never existed" are different sentences
 * about the same denial, and telling them apart is how an attacker learns
 * which of their guesses was once a real ticket.
 */
export class RedeemConnectionTicket {
  constructor(
    private readonly tickets: ConnectionTicketStore,
    private readonly clock: Clock,
  ) {}

  async execute(input: RedeemConnectionTicketInput): Promise<{ userId: string } | null> {
    return this.tickets.redeem({ ticket: input.ticket, now: this.clock.now() });
  }
}
