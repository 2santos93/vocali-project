/**
 * The one place a route decides whether it may be seen.
 *
 * Global, so a screen is protected by existing rather than by remembering to
 * ask. Per-page guards are how the seventh page ships unprotected: nothing
 * fails, nothing is noisy, and the omission is invisible until somebody reads
 * a URL out of a browser history.
 *
 * The rule itself is in `decideRouteAccess`, which is a pure function and
 * therefore testable; what is left here is the part that needs the Nuxt
 * runtime and cannot be tested without one.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const session = useAuthSession();

  await session.ensureLoaded();

  const redirect = decideRouteAccess(to.path, to.fullPath, session.user.value !== null);
  if (redirect === null) return;

  return navigateTo(redirect);
});
