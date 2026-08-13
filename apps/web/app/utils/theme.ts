import type { EffectiveTheme } from './types/EffectiveTheme';
import type { ThemePreference } from './types/ThemePreference';

/**
 * The rule, kept apart from the composable that applies it: a rule in a
 * composable can only be checked by driving a browser, and a rule in a pure
 * function fails under Jest the moment it stops holding.
 */

/**
 * Three, not two: a two-way switch cannot express "follow my machine".
 * `system` is also the default, so it stays reachable after someone has
 * picked one of the other two.
 */
export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

/**
 * Read by the server on every request, so it is a cookie rather than local
 * storage. Storage the server cannot see means the first frame is rendered in
 * the wrong theme and corrected once JavaScript runs, on every page load.
 */
export const THEME_COOKIE = 'vocali_theme';

/** A year. Nothing about a theme preference expires with a session. */
export const THEME_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/**
 * Here rather than in the composable, so the string the browser is asked and
 * the string this module reasons about are the same one.
 */
export const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * `systemPrefersDark` is only consulted for `system`: an explicit `light` on a
 * dark machine is a reader overruling their operating system, and letting the
 * machine win would quietly undo the choice they just made.
 */
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

/**
 * A search rather than a cast: a cookie can be set to anything by anything
 * with access to the browser, and this value ends up in the `class` attribute
 * of the root element.
 */
export function toThemePreference(value: unknown): ThemePreference | null {
  return THEME_PREFERENCES.find((preference) => preference === value) ?? null;
}

/**
 * `theme-light` is a real class rather than the absence of one, because the
 * absence means "ask the operating system" and a reader who chose light on a
 * dark machine asked for the opposite of that.
 */
export function themeClass(preference: ThemePreference): string {
  return THEME_CLASSES[preference];
}
