/**
 * Which route a visitor may see, decided as a value rather than as a side
 * effect.
 *
 * The global middleware is four lines of Nuxt around this function, and the
 * split is what makes the rule testable: `navigateTo` and
 * `defineNuxtRouteMiddleware` need a Nuxt runtime that Jest does not boot, so
 * a decision entangled with them could only be checked by driving a browser.
 * Here it is a pure function of two inputs, and a test fails the moment a
 * signed-out visitor stops being sent to the sign-in page.
 *
 * None of this is the security boundary and none of it pretends to be. The API
 * refuses an unauthenticated request whatever the browser renders, and the BFF
 * proxy answers 401 without a valid session cookie. What this decides is what
 * a person is shown — a sign-in form rather than an application shell that
 * cannot load anything, and the screen they asked for rather than a sign-in
 * form they have already completed.
 */

/** Reachable with no session. Everything else is not. */
export const ANONYMOUS_ROUTES = ['/login', '/register', '/confirm'] as const;

export const HOME_ROUTE = '/historial';

export const SIGN_IN_ROUTE = '/login';

export interface RouteRedirect {
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
}

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
  /*
   * `/` belongs to nobody. There is no index page, because every screen this
   * application has is one of the six named ones, and an index whose only job
   * is to redirect is a file that exists to hold a redirect.
   */
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

  /*
   * The destination travels with the redirect so the visitor lands where they
   * were going rather than on the home screen. It is read back in `login.vue`,
   * which accepts only a local path: a sign-in page that forwards to any
   * address it is handed is a phishing primitive, because the victim sees a
   * genuine form on the genuine domain and is delivered elsewhere afterwards.
   */
  return { path: SIGN_IN_ROUTE, query: { redirect: fullPath } };
}

/**
 * Where to send someone after they sign in, if it is somewhere in this
 * application.
 *
 * The other half of the redirect above, and here rather than in `login.vue`
 * for the same reason `decideRouteAccess` is: a page is the one layer Jest
 * never mounts, so this rule could only be checked by driving a browser, and
 * it is not a rule that may go unchecked. The value arrives in the URL, so it
 * is chosen by whoever wrote the link — a sign-in page that forwards to any
 * address it is handed is a phishing primitive, because the victim sees a
 * genuine form on the genuine domain and is delivered elsewhere afterwards.
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
