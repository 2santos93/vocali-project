/**
 * @jest-environment node
 */
import { isSessionExpired, readStatusCode } from './http-failure';

describe('readStatusCode', () => {
  it('reads the status ofetch attaches to what it throws', () => {
    expect(readStatusCode({ statusCode: 404 })).toBe(404);
  });

  it('reports nothing for a rejection that carries no status', () => {
    // A connection that never opened rejects with a TypeError, which has no
    // status at all. Reading one off it would invent a fact about a request
    // that never reached a server.
    expect(readStatusCode(new TypeError('Failed to fetch'))).toBeNull();
  });

  it.each([
    ['a string', 'Internal Server Error'],
    ['null', null],
    ['undefined', undefined],
  ])('reports nothing when %s is thrown', (_description, thrown) => {
    // `typeof null` is 'object', so a bare typeof check would let null through
    // and then read a property off it.
    expect(readStatusCode(thrown)).toBeNull();
  });

  it('reports nothing when the status is not a number', () => {
    // A body-shaped object from somewhere else can carry a string here, and a
    // string '401' would never equal 401 but would pass a truthiness check.
    expect(readStatusCode({ statusCode: '401' })).toBeNull();
  });
});

describe('isSessionExpired', () => {
  it('recognises the status that means the session is over', () => {
    // Hardcoded rather than imported from HTTP_UNAUTHORIZED: importing the
    // constant this function compares against would assert that a constant
    // equals itself, and would stay green if the comparison were changed to
    // any other status.
    expect(isSessionExpired({ statusCode: 401 })).toBe(true);
  });

  it.each([403, 404, 500])('does not treat %s as an ended session', (statusCode) => {
    // Every one of these leaves the user signed in, so the remedy is to retry
    // rather than to sign in again.
    expect(isSessionExpired({ statusCode })).toBe(false);
  });

  it('does not treat a request that never reached the server as an ended session', () => {
    expect(isSessionExpired(new TypeError('Failed to fetch'))).toBe(false);
  });
});
