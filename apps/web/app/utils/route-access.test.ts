import { ANONYMOUS_ROUTES, decideRouteAccess, HOME_ROUTE, SIGN_IN_ROUTE } from './route-access';

const PROTECTED_ROUTES = ['/historial', '/transcribir', '/dictar'];

describe('a visitor with no session', () => {
  /*
   * The redirect the brief asks to be pinned. A protected screen shown to
   * somebody with no session is an application shell whose every request will
   * answer 401, which reads as the product being broken rather than as needing
   * to sign in.
   */
  it.each(PROTECTED_ROUTES)('is sent from %s to the sign-in page', (path) => {
    expect(decideRouteAccess(path, path, false)?.path).toBe(SIGN_IN_ROUTE);
  });

  it('carries the destination so the sign-in does not lose it', () => {
    const redirect = decideRouteAccess('/historial', '/historial?cursor=abc', false);

    expect(redirect?.query).toStrictEqual({ redirect: '/historial?cursor=abc' });
  });

  it.each(ANONYMOUS_ROUTES)('is left alone on %s', (path) => {
    // Redirecting the sign-in page to itself is an infinite loop, and the
    // registration and confirmation screens exist precisely for people with no
    // session.
    expect(decideRouteAccess(path, path, false)).toBeNull();
  });

  it('is sent from the root to the sign-in page', () => {
    expect(decideRouteAccess('/', '/', false)).toStrictEqual({ path: SIGN_IN_ROUTE });
  });

  it('is sent to the sign-in page from a route nobody defined', () => {
    // An unknown path must not be a way past the check. It becomes a 404 after
    // signing in, which is the correct answer and not a leak.
    expect(decideRouteAccess('/algo-que-no-existe', '/algo-que-no-existe', false)?.path).toBe(
      SIGN_IN_ROUTE,
    );
  });
});

describe('a visitor with a session', () => {
  it.each(PROTECTED_ROUTES)('is left alone on %s', (path) => {
    expect(decideRouteAccess(path, path, true)).toBeNull();
  });

  it.each(ANONYMOUS_ROUTES)('is sent away from %s to the home screen', (path) => {
    // A sign-in form shown to somebody already signed in reads as the session
    // having been lost, and the obvious response is a second authentication
    // for no reason.
    expect(decideRouteAccess(path, path, true)).toStrictEqual({ path: HOME_ROUTE });
  });

  it('is sent from the root to the home screen', () => {
    expect(decideRouteAccess('/', '/', true)).toStrictEqual({ path: HOME_ROUTE });
  });
});

describe('the routes themselves', () => {
  it('treats exactly the three authentication screens as anonymous', () => {
    // Widening this list is how a protected screen quietly stops being
    // protected, so the list is asserted rather than trusted.
    expect([...ANONYMOUS_ROUTES]).toStrictEqual(['/login', '/register', '/confirm']);
  });

  it('does not treat a path that merely starts with an anonymous one as anonymous', () => {
    expect(decideRouteAccess('/login-secreto', '/login-secreto', false)?.path).toBe(SIGN_IN_ROUTE);
  });
});
