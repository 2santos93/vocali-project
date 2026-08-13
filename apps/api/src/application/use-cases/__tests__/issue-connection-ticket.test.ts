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

  /*
   * The lifetime is asserted as a literal, not imported from `constants.ts`: a
   * test that imports the constant it checks asserts `constant === constant`
   * and stays green through the window being widened to an hour.
   *
   * Asserted on the stored expiry and the one the client is told, because a
   * store expiring on a different schedule from the browser's promise produces
   * a connect that fails for no visible reason.
   */
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

    // A ticket handed to a browser that the store never accepted produces a
    // connect that is denied, which reads to the user as the feature being
    // broken rather than as the request having failed.
    await expect(useCase.execute({ userId: 'user-1' })).rejects.toThrow('table unavailable');
  });
});
