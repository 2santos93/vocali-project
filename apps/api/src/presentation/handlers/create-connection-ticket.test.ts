import { ConnectionTicketResponseSchema } from '@vocali/contracts';
import { IssueConnectionTicket } from '../../application/use-cases/issue-connection-ticket.js';
import {
  buildApiGatewayEvent,
  parseResponseBody,
  TEST_USER_ID,
} from '../../../test/builders/api-gateway-event.builder.js';
import { FixedClock } from '../../../test/doubles/fixed-clock.js';
import { InMemoryConnectionTicketStore } from '../../../test/doubles/in-memory-connection-ticket-store.js';
import { SequentialTokenGenerator } from '../../../test/doubles/sequential-token-generator.js';
import { SilentLogger } from '../../../test/doubles/silent-logger.js';
import { createConnectionTicketHandler } from './create-connection-ticket.js';

const NOW = new Date('2026-08-12T09:00:00.000Z');
const WEBSOCKET_URL = 'wss://sockets.test/prod';

function buildHandler(): {
  handler: ReturnType<typeof createConnectionTicketHandler>;
  tickets: InMemoryConnectionTicketStore;
} {
  const tickets = new InMemoryConnectionTicketStore();

  return {
    handler: createConnectionTicketHandler({
      useCase: new IssueConnectionTicket(
        tickets,
        new SequentialTokenGenerator(),
        new FixedClock(NOW),
        { websocketUrl: WEBSOCKET_URL },
      ),
      logger: new SilentLogger(),
    }),
    tickets,
  };
}

describe('createConnectionTicketHandler', () => {
  it('answers 201 with a body the shared contract accepts', async () => {
    const { handler } = buildHandler();

    const response = await handler(buildApiGatewayEvent());

    expect(response.statusCode).toBe(201);
    // Parsed against the same schema the browser validates with, so the two
    // cannot drift into disagreeing about what a ticket response is.
    expect(() =>
      ConnectionTicketResponseSchema.parse(parseResponseBody(response.body)),
    ).not.toThrow();
  });

  it('issues the ticket to the authenticated subject', async () => {
    const { handler, tickets } = buildHandler();

    await handler(buildApiGatewayEvent());

    expect(tickets.calls.issued[0]?.userId).toBe(TEST_USER_ID);
  });

  /*
   * `sub` is the only identity this codebase accepts. A body or a query naming
   * a different user must not reach the use case, or anyone with a valid token
   * of their own could open a socket receiving another user's transcriptions.
   */
  it('ignores a user named in the request', async () => {
    const { handler, tickets } = buildHandler();

    await handler(
      buildApiGatewayEvent({
        body: JSON.stringify({ userId: 'someone-else' }),
        queryStringParameters: { userId: 'someone-else' },
      }),
    );

    expect(tickets.calls.issued[0]?.userId).toBe(TEST_USER_ID);
  });

  it('answers 401 without issuing anything when the route is reached with no claim', async () => {
    const { handler, tickets } = buildHandler();

    const response = await handler(buildApiGatewayEvent({ authorizer: null }));

    expect(response.statusCode).toBe(401);
    expect(tickets.calls.issued).toEqual([]);
  });

  it('does not cache: two calls mint two different tickets', async () => {
    const { handler } = buildHandler();

    const first = parseResponseBody((await handler(buildApiGatewayEvent())).body);
    const second = parseResponseBody((await handler(buildApiGatewayEvent())).body);

    expect(first.ticket).not.toBe(second.ticket);
  });

  it('answers no-store, because the body is a bearer credential', async () => {
    const { handler } = buildHandler();

    const response = await handler(buildApiGatewayEvent());

    expect(response.headers['cache-control']).toBe('no-store');
  });
});
