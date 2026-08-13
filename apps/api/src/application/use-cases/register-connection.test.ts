import { InMemoryConnectionRegistry } from '../../../test/doubles/in-memory-connection-registry.js';
import { FixedClock } from '../../../test/doubles/fixed-clock.js';
import { DeregisterConnection } from './deregister-connection.js';
import { RegisterConnection } from './register-connection.js';

const NOW = new Date('2026-08-12T09:00:00.000Z');

describe('RegisterConnection', () => {
  it('records the connection against the user the authorizer resolved', async () => {
    const connections = new InMemoryConnectionRegistry();

    await new RegisterConnection(connections, new FixedClock(NOW)).execute({
      userId: 'user-1',
      connectionId: 'connection-a',
    });

    expect(await connections.listByUser('user-1')).toEqual([{ connectionId: 'connection-a' }]);
  });

  /*
   * The lifetime is asserted as a literal for the reason recorded in
   * `constants.ts`. Two hours fifteen: API Gateway closes a websocket after two
   * hours whatever either side does, and the quarter hour is slack against
   * clock skew.
   *
   * Without an expiry an entry for a browser that vanished without a close
   * frame is published to for ever, and nothing would ever remove it — no
   * `$disconnect` arrives for a connection that died with the network.
   */
  it('expires the entry two hours and fifteen minutes after the injected clock', async () => {
    const connections = new InMemoryConnectionRegistry();

    await new RegisterConnection(connections, new FixedClock(NOW)).execute({
      userId: 'user-1',
      connectionId: 'connection-a',
    });

    expect(connections.calls.added[0]?.expiresAt.toISOString()).toBe('2026-08-12T11:15:00.000Z');
  });

  it('keeps every connection a user holds, because two tabs is normal', async () => {
    const connections = new InMemoryConnectionRegistry();
    const useCase = new RegisterConnection(connections, new FixedClock(NOW));

    await useCase.execute({ userId: 'user-1', connectionId: 'connection-a' });
    await useCase.execute({ userId: 'user-1', connectionId: 'connection-b' });

    expect(await connections.listByUser('user-1')).toEqual([
      { connectionId: 'connection-a' },
      { connectionId: 'connection-b' },
    ]);
  });

  it('keeps one user out of another user list', async () => {
    const connections = new InMemoryConnectionRegistry();
    const useCase = new RegisterConnection(connections, new FixedClock(NOW));

    await useCase.execute({ userId: 'user-1', connectionId: 'connection-a' });
    await useCase.execute({ userId: 'user-2', connectionId: 'connection-b' });

    // Identity, not count: a registry that filed both under one key would
    // still answer a length assertion for the first user.
    expect(await connections.listByUser('user-2')).toEqual([{ connectionId: 'connection-b' }]);
  });
});

describe('DeregisterConnection', () => {
  it('removes only the connection that closed', async () => {
    const connections = new InMemoryConnectionRegistry();
    const register = new RegisterConnection(connections, new FixedClock(NOW));
    await register.execute({ userId: 'user-1', connectionId: 'connection-a' });
    await register.execute({ userId: 'user-1', connectionId: 'connection-b' });

    await new DeregisterConnection(connections).execute({
      userId: 'user-1',
      connectionId: 'connection-a',
    });

    expect(await connections.listByUser('user-1')).toEqual([{ connectionId: 'connection-b' }]);
  });

  it('is untroubled by a connection that is already gone', async () => {
    const connections = new InMemoryConnectionRegistry();

    // `$disconnect` is best-effort and can be delivered after the entry has
    // already expired. Treating that as an error would turn a routine close
    // into a logged failure.
    await expect(
      new DeregisterConnection(connections).execute({
        userId: 'user-1',
        connectionId: 'never-registered',
      }),
    ).resolves.toBeUndefined();
  });
});
