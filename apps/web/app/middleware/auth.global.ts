export default defineNuxtRouteMiddleware(async (to) => {
  const session = useAuthSession();

  await session.ensureLoaded();

  const redirect = decideRouteAccess(to.path, to.fullPath, session.user.value !== null);
  if (redirect === null) return;

  return navigateTo(redirect);
});
