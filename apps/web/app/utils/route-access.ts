import type { RouteRedirect } from './types/routing';

/** Reachable with no session. Everything else is not. */
export const ANONYMOUS_ROUTES = ['/login', '/register', '/confirm'] as const;

export const HOME_ROUTE = '/historial';

export const SIGN_IN_ROUTE = '/login';

export function decideRouteAccess(
  path: string,
  fullPath: string,
  signedIn: boolean,
): RouteRedirect | null {
  // `/` belongs to nobody: there is no index page, only the six named screens.
  if (path === '/') {
    return { path: signedIn ? HOME_ROUTE : SIGN_IN_ROUTE };
  }

  const anonymous = (ANONYMOUS_ROUTES as readonly string[]).includes(path);

  if (signedIn) {
    return anonymous ? { path: HOME_ROUTE } : null;
  }

  if (anonymous) return null;

  // Read back in `login.vue`, which accepts only a local path.
  return { path: SIGN_IN_ROUTE, query: { redirect: fullPath } };
}

export function safeRedirectTarget(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null;

  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null;
  if (value.includes('\\')) return null;

  return value;
}
