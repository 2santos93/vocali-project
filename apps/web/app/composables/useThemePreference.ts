import { computed } from 'vue';
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE_SECONDS,
  effectiveTheme,
  themeClass,
  toThemePreference,
} from '../utils/theme';
import type { ThemePreference } from '../utils/types/theme';
import type { ThemeControl } from './types/preferences';
import { useSystemPrefersDark } from './useSystemColorScheme';

export const THEME_STATE_KEY = 'theme.preference';

export function useThemePreference(): ThemeControl {
  const cookie = useCookie<string | null>(THEME_COOKIE, {
    maxAge: THEME_COOKIE_MAX_AGE_SECONDS,
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
