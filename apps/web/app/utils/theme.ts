/**
 * The theme preference: what it may be, where it is kept, and what it puts on
 * the root element.
 *
 * Here rather than in the composable that reads the cookie, for the same
 * reason `route-access.ts` is here: this is the rule, and the composable is
 * the four lines of Nuxt that apply it. A rule in a composable can only be
 * checked by driving a browser; a rule in a pure function fails under Jest the
 * moment it stops holding.
 */

/**
 * Three, not two.
 *
 * A two-way switch cannot express "follow my machine", so a reader whose
 * laptop turns dark at sunset would have to come back and change this by hand
 * every evening. `system` is also the default, which means the honest choice
 * is reachable again after someone has picked one of the other two — a
 * preference with no way back is a preference that has to be got right first
 * time.
 */
export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

/**
 * Read by the server on every request, so it is a cookie rather than local
 * storage. Storage the server cannot see means the first frame is rendered in
 * the wrong theme and corrected once JavaScript runs, on every page load.
 */
export const THEME_COOKIE = 'vocali_theme';

/** A year. Nothing about a theme preference expires with a session. */
export const THEME_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

const THEME_CLASSES: Record<ThemePreference, string> = {
  light: 'theme-light',
  dark: 'theme-dark',
  // No class. The stylesheet's default is `color-scheme: light dark`, which is
  // what hands the choice to the operating system.
  system: '',
};

/**
 * Narrows whatever the cookie holds to a preference this application knows.
 *
 * A search rather than a cast, and not merely for tidiness: the value is
 * attacker-controlled — a cookie can be set to anything by anything with
 * access to the browser — and it ends up in the `class` attribute of the root
 * element. Anything unrecognised falls back to the default rather than
 * travelling any further.
 */
export function toThemePreference(value: unknown): ThemePreference | null {
  return THEME_PREFERENCES.find((preference) => preference === value) ?? null;
}

/**
 * The class the root element carries, or an empty string for `system`.
 *
 * `theme-light` is a real class rather than the absence of one, because the
 * absence means "ask the operating system" and a reader who has chosen light
 * on a dark machine has asked for the opposite of that.
 */
export function themeClass(preference: ThemePreference): string {
  return THEME_CLASSES[preference];
}
