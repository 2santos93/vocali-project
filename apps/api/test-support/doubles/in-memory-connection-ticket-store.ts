import type { ConnectionTicketStore } from '../../src/domain/ports/connection-ticket-store.js';

type IssueInput = Parameters<ConnectionTicketStore['issue']>[0];

interface StoredTicket {
  readonly userId: string;
  readonly expiresAt: Date;
}

/**
 * Single use is modelled by deleting on redemption, which is what the adapter's
 * conditional delete does. A double that returned the ticket without spending
 * it would let a use case that forgot to burn anything pass its own test.
 */
export class InMemoryConnectionTicketStore implements ConnectionTicketStore {
  readonly calls: { issued: IssueInput[]; redeemed: { ticket: string; now: Date }[] } = {
    issued: [],
    redeemed: [],
  };

  /** Set to make the next call reject with this error; cleared after one use. */
  failNextWith?: Error | undefined;

  private readonly tickets = new Map<string, StoredTicket>();

  issue(input: IssueInput): Promise<void> {
    const failure = this.consumeFailure();
    if (failure) return Promise.reject(failure);

    this.calls.issued.push({ ...input });
    this.tickets.set(input.ticket, { userId: input.userId, expiresAt: input.expiresAt });

    return Promise.resolve();
  }

  redeem(input: { ticket: string; now: Date }): Promise<{ userId: string } | null> {
    const failure = this.consumeFailure();
    if (failure) return Promise.reject(failure);

    this.calls.redeemed.push({ ...input });

    const stored = this.tickets.get(input.ticket);
    // Deleted whether or not it was still valid, exactly as the adapter's
    // unconditional delete-then-inspect does. Leaving it behind would let a
    // caller retry it until the store's own sweeper happened to run.
    this.tickets.delete(input.ticket);

    if (stored === undefined || stored.expiresAt.getTime() <= input.now.getTime()) {
      return Promise.resolve(null);
    }

    return Promise.resolve({ userId: stored.userId });
  }

  private consumeFailure(): Error | undefined {
    const failure = this.failNextWith;
    this.failNextWith = undefined;
    return failure;
  }
}
