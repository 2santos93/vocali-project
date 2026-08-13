import { IssueConnectionTicket } from '../../../application/use-cases/issue-connection-ticket.js';
import { RedeemConnectionTicket } from '../../../application/use-cases/redeem-connection-ticket.js';
import { CapturingLogger } from '../../../../test-support/doubles/capturing-logger.js';
import { FixedClock } from '../../../../test-support/doubles/fixed-clock.js';
import { InMemoryConnectionTicketStore } from '../../../../test-support/doubles/in-memory-connection-ticket-store.js';
import { SequentialTokenGenerator } from '../../../../test-support/doubles/sequential-token-generator.js';
import { authorizeConnectionHandler } from '../authorize-connection.js';
import type { ConnectionAuthorizerEvent } from '../../types/websocket.js';

const NOW = new Date('2026-08-12T09:00:00.000Z');
const METHOD_ARN = 'arn:aws:execute-api:eu-west-1:111122223333:abc123/prod/$connect';

interface Harness {
  readonly authorize: ReturnType<typeof authorizeConnectionHandler>;
  readonly issue: IssueConnectionTicket;
  readonly logger: CapturingLogger;
}

function buildHarness(now: Date = NOW): Harness {
  const tickets = new InMemoryConnectionTicketStore();
  const logger = new CapturingLogger();

  return {
    authorize: authorizeConnectionHandler({
      redeemConnectionTicket: new RedeemConnectionTicket(tickets, new FixedClock(now)),
      logger,
    }),
    issue: new IssueConnectionTicket(tickets, new SequentialTokenGenerator(), new FixedClock(NOW), {
      websocketUrl: 'wss://sockets.test/prod',
    }),
    logger,
  };
}

function buildEvent(ticket?: string): ConnectionAuthorizerEvent {
  return {
    methodArn: METHOD_ARN,
    queryStringParameters: ticket === undefined ? null : { ticket },
  };
}

describe('authorizeConnectionHandler', () => {
  it('allows a connection presenting a freshly issued ticket, and names its owner', async () => {
    const harness = buildHarness();
    const { ticket } = await harness.issue.execute({ userId: 'user-1' });

    const result = await harness.authorize(buildEvent(ticket));

    expect(result.policyDocument.Statement[0]?.Effect).toBe('Allow');
    expect(result.principalId).toBe('user-1');
    // Carried onto the connection, which is how `$disconnect` learns whose
    // socket closed without trusting anything the client sent.
    expect(result.context).toEqual({ userId: 'user-1' });
  });

  it('scopes the policy to the route being authorised, never the whole API', async () => {
    const harness = buildHarness();
    const { ticket } = await harness.issue.execute({ userId: 'user-1' });

    const result = await harness.authorize(buildEvent(ticket));

    expect(result.policyDocument.Statement[0]?.Resource).toBe(METHOD_ARN);
    expect(result.policyDocument.Statement[0]?.Resource).not.toContain('*');
  });

  /*
   * The ticket rides in a query string, which API Gateway writes into its
   * access log verbatim, so anything replayable from that log is a session
   * whoever reads it can assume. Asserting the first connect is allowed would
   * pin nothing — an authorizer that never spent anything passes that — so the
   * second attempt with the same ticket is the assertion.
   */
  it('refuses a second connection presenting a ticket already spent', async () => {
    const harness = buildHarness();
    const { ticket } = await harness.issue.execute({ userId: 'user-1' });

    const first = await harness.authorize(buildEvent(ticket));
    const replayed = await harness.authorize(buildEvent(ticket));

    expect(first.policyDocument.Statement[0]?.Effect).toBe('Allow');
    expect(replayed.policyDocument.Statement[0]?.Effect).toBe('Deny');
    expect(replayed.context).toBeUndefined();
  });

  it('refuses a ticket that has lapsed', async () => {
    const tickets = new InMemoryConnectionTicketStore();
    const issue = new IssueConnectionTicket(
      tickets,
      new SequentialTokenGenerator(),
      new FixedClock(NOW),
      { websocketUrl: 'wss://sockets.test/prod' },
    );
    const { ticket } = await issue.execute({ userId: 'user-1' });
    const authorize = authorizeConnectionHandler({
      redeemConnectionTicket: new RedeemConnectionTicket(
        tickets,
        new FixedClock(new Date('2026-08-12T09:00:31.000Z')),
      ),
      logger: new CapturingLogger(),
    });

    const result = await authorize(buildEvent(ticket));

    expect(result.policyDocument.Statement[0]?.Effect).toBe('Deny');
  });

  it('refuses a ticket nothing ever issued', async () => {
    const harness = buildHarness();

    const result = await harness.authorize(buildEvent('invented'));

    expect(result.policyDocument.Statement[0]?.Effect).toBe('Deny');
  });

  it('refuses a connection with no ticket at all', async () => {
    const harness = buildHarness();

    const result = await harness.authorize(buildEvent());

    expect(result.policyDocument.Statement[0]?.Effect).toBe('Deny');
  });

  it('refuses an absurdly long ticket before it reaches a key builder', async () => {
    const harness = buildHarness();

    const result = await harness.authorize(buildEvent('t'.repeat(5_000)));

    expect(result.policyDocument.Statement[0]?.Effect).toBe('Deny');
  });

  /*
   * A rejected credential is still a credential until it expires, and this
   * line is written on the one path an attacker can reach at will. Logging the
   * presented value would put every real ticket that arrived a moment late
   * into a log with a fourteen-day retention.
   */
  it('never writes the presented ticket to a log, on any path', async () => {
    const harness = buildHarness();
    const { ticket } = await harness.issue.execute({ userId: 'user-1' });

    await harness.authorize(buildEvent(ticket));
    await harness.authorize(buildEvent(ticket));
    await harness.authorize(buildEvent('a-guessed-value'));

    expect(harness.logger.serialise()).not.toContain(ticket);
    expect(harness.logger.serialise()).not.toContain('a-guessed-value');
  });
});
