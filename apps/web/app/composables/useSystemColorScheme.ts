import { computed, onMounted } from 'vue';
import type { ComputedRef } from 'vue';
import { SYSTEM_DARK_QUERY } from '../utils/theme';

/**
 * The one input into the theme that no HTTP request carries, which is why
 * `system` is expressed as the *absence* of a class and left to
 * `color-scheme: light dark`. Only the account-menu switch needs the answer.
 *
 * **Read in `onMounted`, not during setup.** The server renders `false`, so a
 * client reading `matchMedia` synchronously would hydrate against markup that
 * said otherwise. Deferring costs one frame in a menu that is closed anyway.
 */
export const SYSTEM_DARK_STATE_KEY = 'theme.systemPrefersDark';

/*
 * One listener rather than one per caller: `useThemePreference` is called from
 * `app.vue` and from both layouts, and the state it writes is shared by the
 * whole application.
 *
 * Module scope is safe here only because nothing reaches it on the server,
 * where a module is shared between two readers' requests.
 */
let watchingSystemScheme = false;

export function useSystemPrefersDark(): ComputedRef<boolean> {
  const prefersDark = useState<boolean>(SYSTEM_DARK_STATE_KEY, () => false);

  onMounted(() => {
    if (watchingSystemScheme) return;

    watchingSystemScheme = true;

    const query = window.matchMedia(SYSTEM_DARK_QUERY);

    prefersDark.value = query.matches;
    query.addEventListener('change', (event) => {
      prefersDark.value = event.matches;
    });
  });

  return computed<boolean>(() => prefersDark.value);
}
