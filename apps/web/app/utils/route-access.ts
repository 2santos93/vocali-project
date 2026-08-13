import type { RouteRedirect } from './types/RouteRedirect';

/**
 * Decided as a value rather than a side effect, because `navigateTo` and
 * `defineNuxtRouteMiddleware` need a Nuxt runtime Jest does not boot. As a
 * pure function, a test fails the moment a signed-out visitor stops being
 * sent to the sign-in page.
 *
 * **Not the security boundary.** The API refuses an unauthenticated request
 * whatever the browser renders, and the BFF proxy answers 401 without a valid
 * session cookie. This only decides what a person is shown.
 */

/** Reachable with no session. Everything else is not. */
export const ANONYMOUS_ROUTES = ['/login', '/register', '/confirm'] as const;

export const HOME_ROUTE = '/historial';

export const SIGN_IN_ROUTE = '/login';

/**
 * Where the visitor should go instead, or null to let them through.
 *
 * @param path      the path being navigated to, without its query string
 * @param fullPath  the same navigation including its query string, preserved
 *                  when a sign-in has to be interposed
 */
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
    // Showing a sign-in form to somebody who is signed in reads as the session
    // having been lost, and the obvious response — signing in again — is a
    // second authentication for no reason.
    return anonymous ? { path: HOME_ROUTE } : null;
  }

  if (anonymous) return null;

  // Read back in `login.vue`, which accepts only a local path.
  return { path: SIGN_IN_ROUTE, query: { redirect: fullPath } };
}

/**
 * The value arrives in the URL, so it is chosen by whoever wrote the link. A
 * sign-in page that forwards to any address it is handed is a phishing
 * primitive: the victim sees a genuine form on the genuine domain and is
 * delivered elsewhere afterwards.
 *
 * Here rather than in `login.vue` because a page is the one layer Jest never
 * mounts, and this is not a rule that may go unchecked.
 *
 * Only a local path is accepted. `//host` is rejected explicitly because it is
 * a path by the loosest reading and an absolute URL to the browser, and a
 * backslash because some browsers have historically normalised it to a slash.
 *
 * @param value the raw query value, which may be absent, a string, or an array
 *              when the parameter was repeated
 */
export function safeRedirectTarget(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null;

  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null;
  if (value.includes('\\')) return null;

  return value;
}
