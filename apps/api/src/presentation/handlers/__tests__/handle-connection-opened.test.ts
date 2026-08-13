import { DeregisterConnection } from '../../../application/use-cases/deregister-connection.js';
import { RegisterConnection } from '../../../application/use-cases/register-connection.js';
import { CapturingLogger } from '../../../../test-support/doubles/capturing-logger.js';
import { FixedClock } from '../../../../test-support/doubles/fixed-clock.js';
import { InMemoryConnectionRegistry } from '../../../../test-support/doubles/in-memory-connection-registry.js';
import type { WebSocketRequestEvent } from '../../types/websocket.js';
import { handleConnectionClosedHandler } from '../handle-connection-closed.js';
import { handleConnectionOpenedHandler } from '../handle-connection-opened.js';

const NOW = new Date('2026-08-12T09:00:00.000Z');

function buildEvent(
  overrides: { userId?: string | null; connectionId?: string } = {},
): WebSocketRequestEvent {
  const userId = overrides.userId === undefined ? 'user-1' : overrides.userId;

  return {
    requestContext: {
      connectionId: overrides.connectionId ?? 'connection-a',
      requestId: 'request-1',
      // `null` builds an event whose authorizer resolved nothing, which is
      // what a route reached without its authorizer actually produces.
      ...(userId === null ? {} : { authorizer: { userId } }),
    },
    queryStringParameters: null,
  };
}

describe('handleConnectionOpenedHandler', () => {
  it('records the connection against the user the authorizer resolved', async () => {
    const connections = new InMemoryConnectionRegistry();
    const handler = handleConnectionOpenedHandler({
      registerConnection: new RegisterConnection(connections, new FixedClock(NOW)),
      logger: new CapturingLogger(),
    });

    const response = await handler(buildEvent());

    expect(response.statusCode).toBe(200);
    expect(await connections.listByUser('user-1')).toEqual([{ connectionId: 'connection-a' }]);
  });

  it('takes the identity from the authorizer context and never from the query string', async () => {
    const connections = new InMemoryConnectionRegistry();
    const handler = handleConnectionOpenedHandler({
      registerConnection: new RegisterConnection(connections, new FixedClock(NOW)),
      logger: new CapturingLogger(),
    });

    await handler({
      ...buildEvent({ userId: 'user-1' }),
      // A caller-chosen value on the same request. Accepting it as any kind of
      // fallback would let anyone open a socket as anyone.
      queryStringParameters: { userId: 'user-2' },
    });

    expect(await connections.listByUser('user-2')).toEqual([]);
    expect(await connections.listByUser('user-1')).toHaveLength(1);
  });

  it('refuses a connection whose authorizer resolved no user', async () => {
    const connections = new InMemoryConnectionRegistry();
    const handler = handleConnectionOpenedHandler({
      registerConnection: new RegisterConnection(connections, new FixedClock(NOW)),
      logger: new CapturingLogger(),
    });

    const response = await handler(buildEvent({ userId: null }));

    expect(response.statusCode).toBe(401);
    expect(connections.calls.added).toEqual([]);
  });

  it('refuses the handshake when the connection cannot be recorded', async () => {
    const connections = new InMemoryConnectionRegistry();
    connections.failNextWith = new Error('table unavailable');
    const logger = new CapturingLogger();
    const handler = handleConnectionOpenedHandler({
      registerConnection: new RegisterConnection(connections, new FixedClock(NOW)),
      logger,
    });

    const response = await handler(buildEvent());

    expect(response.statusCode).toBe(500);
    expect(logger.entries.filter((entry) => entry.level === 'error')).toHaveLength(1);
  });
});

describe('handleConnectionClosedHandler', () => {
  it('forgets the connection that closed', async () => {
    const connections = new InMemoryConnectionRegistry();
    await connections.add({ userId: 'user-1', connectionId: 'connection-a', expiresAt: NOW });
    const handler = handleConnectionClosedHandler({
      deregisterConnection: new DeregisterConnection(connections),
      logger: new CapturingLogger(),
    });

    const response = await handler(buildEvent());

    expect(response.statusCode).toBe(200);
    expect(await connections.listByUser('user-1')).toEqual([]);
  });

  it('answers 200 even when the entry cannot be deleted', async () => {
    const connections = new InMemoryConnectionRegistry();
    connections.failNextWith = new Error('table unavailable');
    const logger = new CapturingLogger();
    const handler = handleConnectionClosedHandler({
      deregisterConnection: new DeregisterConnection(connections),
      logger,
    });

    const response = await handler(buildEvent());

    expect(response.statusCode).toBe(200);
    expect(logger.entries.filter((entry) => entry.level === 'warn')).toHaveLength(1);
  });

  it('answers 200, and deletes nothing, when the context carries no user', async () => {
    const connections = new InMemoryConnectionRegistry();
    const handler = handleConnectionClosedHandler({
      deregisterConnection: new DeregisterConnection(connections),
      logger: new CapturingLogger(),
    });

    const response = await handler(buildEvent({ userId: null }));

    expect(response.statusCode).toBe(200);
    expect(connections.calls.removed).toEqual([]);
  });
});
