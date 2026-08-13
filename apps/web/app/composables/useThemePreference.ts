import { computed } from 'vue';
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE_SECONDS,
  effectiveTheme,
  themeClass,
  toThemePreference,
} from '../utils/theme';
import type { ThemePreference } from '../utils/types/ThemePreference';
import type { ThemeControl } from './types/ThemeControl';
import { useSystemPrefersDark } from './useSystemColorScheme';

/**
 * **A cookie, not `localStorage`.** Every screen is server-rendered and the
 * server cannot read browser storage, so a theme restored after hydration
 * paints the first frame of every page load in the wrong one.
 *
 * **`useState` on top of it, not the cookie alone.** Each `useCookie` call
 * returns its own ref, so the header's toggle and the `<html>` class would
 * hold two copies and only a reload would agree with itself.
 */

export const THEME_STATE_KEY = 'theme.preference';

export function useThemePreference(): ThemeControl {
  const cookie = useCookie<string | null>(THEME_COOKIE, {
    maxAge: THEME_COOKIE_MAX_AGE_SECONDS,
    // Not `httpOnly`: this exists to be read by both sides. It carries no
    // authority — the worst a forged value does is show the other palette —
    // and `toThemePreference` refuses anything it does not know.
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

  const systemPrefersDark = useSystemPrefersDark();

  return {
    preference: computed<ThemePreference>(() => chosen.value),
    rootClass: computed<string>(() => themeClass(chosen.value)),
    isDark: computed<boolean>(
      () => effectiveTheme(chosen.value, systemPrefersDark.value) === 'dark',
    ),
    choose,
  };
}
