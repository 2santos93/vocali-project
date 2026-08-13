import { computed } from 'vue';
import type { ComputedRef } from 'vue';
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE_SECONDS,
  themeClass,
  toThemePreference,
} from '../utils/theme';
import type { ThemePreference } from '../utils/theme';

/**
 * The chosen theme, kept where the server can read it.
 *
 * The rules are in `utils/theme.ts` and are tested there. What is left here is
 * the part that needs the Nuxt runtime: a cookie, and a piece of shared state.
 *
 * **A cookie, not `localStorage`.** Every screen is server-rendered, and the
 * server cannot read storage that lives in the browser. A theme restored by
 * JavaScript after hydration means the first frame of every page load is
 * painted in the wrong one — a white flash on a dark theme, at every
 * navigation, in a room where the lights are off.
 *
 * **`useState` on top of the cookie, not the cookie alone.** Each `useCookie`
 * call returns its own ref, so the header's toggle and the `<html>` element's
 * class would hold two different copies and only the reloaded page would agree
 * with itself. One piece of shared state, written through to the cookie.
 */
export interface ThemeControl {
  readonly preference: ComputedRef<ThemePreference>;
  /** What `<html>` carries: `theme-light`, `theme-dark`, or nothing at all. */
  readonly rootClass: ComputedRef<string>;
  choose: (preference: ThemePreference) => void;
}

export const THEME_STATE_KEY = 'theme.preference';

export function useThemePreference(): ThemeControl {
  const cookie = useCookie<string | null>(THEME_COOKIE, {
    maxAge: THEME_COOKIE_MAX_AGE_SECONDS,
    // Not `httpOnly`: this one exists to be read by both sides. It carries no
    // authority — the worst a forged value can do is show the reader the other
    // palette — and `toThemePreference` refuses anything it does not know.
    sameSite: 'lax',
    secure: true,
    path: '/',
  });

  const chosen = useState<ThemePreference>(
    THEME_STATE_KEY,
    () => toThemePreference(cookie.value) ?? DEFAULT_THEME_PREFERENCE,
  );

  function choose(preference: ThemePreference): void {
    chosen.value = preference;
    cookie.value = preference;
  }

  return {
    preference: computed<ThemePreference>(() => chosen.value),
    rootClass: computed<string>(() => themeClass(chosen.value)),
    choose,
  };
}
