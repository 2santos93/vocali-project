import { computed, onMounted } from 'vue';
import type { ComputedRef } from 'vue';
import { SYSTEM_DARK_QUERY } from '../utils/theme';

/**
 * Whether the machine has asked for a dark interface.
 *
 * The one input into the theme that no HTTP request carries, which is why the
 * `system` preference is expressed as the *absence* of a class and left to
 * `color-scheme: light dark` in the stylesheet: the page paints itself
 * correctly without anybody here knowing the answer.
 *
 * This exists because one thing does need the answer — the switch in the
 * account menu, which has two positions where the preference has three values.
 * A switch reading "off" on a page painted dark is a control nobody believes
 * again.
 *
 * **Read in `onMounted`, not during setup.** The server renders `false`, and a
 * client that read `matchMedia` synchronously would render `true` on a dark
 * machine while hydrating against markup that said otherwise — a mismatch Vue
 * reports and then patches. Deferring it costs one frame of the switch sitting
 * in the wrong position inside a menu that is closed at the time, and buys
 * markup the server and the browser agree about.
 */
export const SYSTEM_DARK_STATE_KEY = 'theme.systemPrefersDark';

/*
 * Set once, in the browser, and never unset.
 *
 * The listener below outlives every component that asks for this value: the
 * state it writes to is shared by the whole application, and a laptop that
 * turns dark at sunset should redraw the switch whether or not the layout that
 * first asked has since been replaced. One listener rather than one per caller,
 * because `useThemePreference` is called from `app.vue` and from both layouts.
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
