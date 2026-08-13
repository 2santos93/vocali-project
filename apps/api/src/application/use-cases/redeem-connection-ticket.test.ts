import { InMemoryConnectionTicketStore } from '../../../test/doubles/in-memory-connection-ticket-store.js';
import { FixedClock } from '../../../test/doubles/fixed-clock.js';
import { RedeemConnectionTicket } from './redeem-connection-ticket.js';

const NOW = new Date('2026-08-12T09:00:00.000Z');
const LATER = new Date('2026-08-12T09:00:31.000Z');

describe('RedeemConnectionTicket', () => {
  it('resolves the user a valid ticket was issued to', async () => {
    const tickets = new InMemoryConnectionTicketStore();
    await tickets.issue({
      ticket: 'ticket-001',
      userId: 'user-1',
      expiresAt: new Date(NOW.getTime() + 30_000),
    });

    const resolved = await new RedeemConnectionTicket(tickets, new FixedClock(NOW)).execute({
      ticket: 'ticket-001',
    });

    expect(resolved).toEqual({ userId: 'user-1' });
  });

  /*
   * The single-use property, and the reason this file exists.
   *
   * Two `$connect` attempts arriving with the same ticket must not both
   * succeed: the ticket travels in a query string that lands in the access
   * log, so anything replayable from that log is a session anyone reading it
   * can take. Asserting the first redemption succeeds is not enough on its own
   * — a store that never burned anything would pass that — so the second
   * attempt is the assertion that matters.
   */
  it('refuses a ticket that has already been spent', async () => {
    const tickets = new InMemoryConnectionTicketStore();
    await tickets.issue({
      ticket: 'ticket-001',
      userId: 'user-1',
      expiresAt: new Date(NOW.getTime() + 30_000),
    });
    const useCase = new RedeemConnectionTicket(tickets, new FixedClock(NOW));

    const first = await useCase.execute({ ticket: 'ticket-001' });
    const second = await useCase.execute({ ticket: 'ticket-001' });

    expect(first).toEqual({ userId: 'user-1' });
    expect(second).toBeNull();
  });

  it('refuses a ticket that has lapsed, whatever the store has swept', async () => {
    const tickets = new InMemoryConnectionTicketStore();
    await tickets.issue({
      ticket: 'ticket-001',
      userId: 'user-1',
      expiresAt: new Date(NOW.getTime() + 30_000),
    });

    // The clock is past the expiry the ticket was issued with. The store's own
    // sweeper is a background process that runs within days, so the expiry has
    // to be honoured on the read or a lapsed ticket stays usable in practice.
    const resolved = await new RedeemConnectionTicket(tickets, new FixedClock(LATER)).execute({
      ticket: 'ticket-001',
    });

    expect(resolved).toBeNull();
  });

  it('refuses a ticket nothing ever issued', async () => {
    const resolved = await new RedeemConnectionTicket(
      new InMemoryConnectionTicketStore(),
      new FixedClock(NOW),
    ).execute({ ticket: 'invented' });

    expect(resolved).toBeNull();
  });

  it('spends an expired ticket rather than leaving it to be retried', async () => {
    const tickets = new InMemoryConnectionTicketStore();
    await tickets.issue({ ticket: 'ticket-001', userId: 'user-1', expiresAt: NOW });

    await new RedeemConnectionTicket(tickets, new FixedClock(LATER)).execute({
      ticket: 'ticket-001',
    });
    // Even with the clock wound back, the ticket is gone: presenting it once
    // spends it, so a caller cannot hold a lapsed ticket and retry until a
    // clock skew lets it through.
    const retried = await new RedeemConnectionTicket(tickets, new FixedClock(NOW)).execute({
      ticket: 'ticket-001',
    });

    expect(retried).toBeNull();
  });
});
