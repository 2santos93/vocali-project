import type { Clock } from '../../domain/ports/clock.js';
import type { ConnectionTicketStore } from '../../domain/ports/connection-ticket-store.js';
import type { RedeemConnectionTicketInput } from '../types/connection-inputs.js';

/**
 * Deliberately not a `Result` with a reason. "Already used" and "never existed"
 * are different sentences about the same denial, and telling them apart is how
 * an attacker learns which of their guesses was once a real ticket.
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
