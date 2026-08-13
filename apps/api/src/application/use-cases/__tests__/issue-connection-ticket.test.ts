import { InMemoryConnectionTicketStore } from '../../../../test-support/doubles/in-memory-connection-ticket-store.js';
import { FixedClock } from '../../../../test-support/doubles/fixed-clock.js';
import { SequentialTokenGenerator } from '../../../../test-support/doubles/sequential-token-generator.js';
import { IssueConnectionTicket } from '../issue-connection-ticket.js';

const NOW = new Date('2026-08-12T09:00:00.000Z');
const WEBSOCKET_URL = 'wss://sockets.test/prod';

function buildUseCase(): {
  useCase: IssueConnectionTicket;
  tickets: InMemoryConnectionTicketStore;
} {
  const tickets = new InMemoryConnectionTicketStore();
  const useCase = new IssueConnectionTicket(
    tickets,
    new SequentialTokenGenerator(),
    new FixedClock(NOW),
    { websocketUrl: WEBSOCKET_URL },
  );

  return { useCase, tickets };
}

describe('IssueConnectionTicket', () => {
  it('issues the ticket against the authenticated user and returns it with the socket endpoint', async () => {
    const { useCase, tickets } = buildUseCase();

    const response = await useCase.execute({ userId: 'user-1' });

    expect(response.ticket).toBe('ticket-001');
    expect(response.websocketUrl).toBe(WEBSOCKET_URL);
    expect(tickets.calls.issued).toHaveLength(1);
    expect(tickets.calls.issued[0]?.userId).toBe('user-1');
    expect(tickets.calls.issued[0]?.ticket).toBe('ticket-001');
  });

  it('expires the ticket thirty seconds after the injected clock', async () => {
    const { useCase, tickets } = buildUseCase();

    const response = await useCase.execute({ userId: 'user-1' });

    expect(response.expiresAt).toBe('2026-08-12T09:00:30.000Z');
    expect(tickets.calls.issued[0]?.expiresAt.toISOString()).toBe('2026-08-12T09:00:30.000Z');
  });

  it('mints a different ticket every time, so one is never reusable as another', async () => {
    const { useCase } = buildUseCase();

    const first = await useCase.execute({ userId: 'user-1' });
    const second = await useCase.execute({ userId: 'user-1' });

    expect(first.ticket).not.toBe(second.ticket);
  });

  it('propagates a store failure rather than returning a ticket nothing recorded', async () => {
    const { useCase, tickets } = buildUseCase();
    tickets.failNextWith = new Error('table unavailable');

    await expect(useCase.execute({ userId: 'user-1' })).rejects.toThrow('table unavailable');
  });
});
