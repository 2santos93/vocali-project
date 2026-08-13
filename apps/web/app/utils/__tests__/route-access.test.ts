import {
  ANONYMOUS_ROUTES,
  decideRouteAccess,
  HOME_ROUTE,
  safeRedirectTarget,
  SIGN_IN_ROUTE,
} from '../route-access';

const PROTECTED_ROUTES = ['/historial', '/transcribir', '/dictar'];

describe('a visitor with no session', () => {
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

describe('the destination a sign-in may forward to', () => {
  it('accepts the local path the middleware put in the query', () => {
    // The round trip that has to work: the redirect above is read back here.
    const redirect = decideRouteAccess('/historial', '/historial?cursor=abc', false);

    expect(safeRedirectTarget(redirect?.query?.['redirect'])).toBe('/historial?cursor=abc');
  });

  it.each([
    ['an absolute URL', 'https://evil.example/steal'],
    ['a protocol-relative URL', '//evil.example/steal'],
    ['a scheme-less host', 'evil.example/steal'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['a backslash path some browsers normalise to a slash', '/\\evil.example'],
  ])('refuses %s', (_description, target) => {
    expect(safeRedirectTarget(target)).toBeNull();
  });

  it.each([
    ['absent', undefined],
    ['empty', ''],
    ['repeated, so the router reports an array', ['/historial', '/dictar']],
  ])('reports no destination when the parameter is %s', (_description, value) => {
    expect(safeRedirectTarget(value)).toBeNull();
  });
});
