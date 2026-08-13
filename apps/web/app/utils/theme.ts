import type { EffectiveTheme, ThemePreference } from './types/theme';

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

export const THEME_COOKIE = 'vocali_theme';

/** A year. Nothing about a theme preference expires with a session. */
export const THEME_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/**
 * Here rather than in the composable, so the string the browser is asked and
 * the string this module reasons about are the same one.
 */
export const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

export function effectiveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): EffectiveTheme {
  if (preference === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }

  return preference;
}

const THEME_CLASSES: Record<ThemePreference, string> = {
  light: 'theme-light',
  dark: 'theme-dark',
  // No class. The stylesheet's default is `color-scheme: light dark`, which is
  // what hands the choice to the operating system.
  system: '',
};

export function toThemePreference(value: unknown): ThemePreference | null {
  return THEME_PREFERENCES.find((preference) => preference === value) ?? null;
}

export function themeClass(preference: ThemePreference): string {
  return THEME_CLASSES[preference];
}
