import { InMemoryConnectionTicketStore } from '../../../../test-support/doubles/in-memory-connection-ticket-store.js';
import { FixedClock } from '../../../../test-support/doubles/fixed-clock.js';
import { RedeemConnectionTicket } from '../redeem-connection-ticket.js';

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

    // The store's own sweeper runs within days, so the expiry has to be
    // honoured on the read or a lapsed ticket stays usable in practice.
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
    // Even with the clock wound back the ticket is gone, so a caller cannot
    // hold a lapsed ticket and retry until a clock skew lets it through.
    const retried = await new RedeemConnectionTicket(tickets, new FixedClock(NOW)).execute({
      ticket: 'ticket-001',
    });

    expect(retried).toBeNull();
  });
});
