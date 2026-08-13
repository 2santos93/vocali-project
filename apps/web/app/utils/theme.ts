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

/**
 * Which of the two palettes a reader is actually looking at.
 *
 * A preference has three values and a screen only ever has two, and the gap
 * between them is not academic: a switch in the account menu has to show the
 * position the page is *painted* in, or somebody on a machine set to dark
 * meets a control that says "off" on a dark screen and stops trusting it.
 */
export type EffectiveTheme = 'light' | 'dark';

/**
 * The media query that answers the one question the server cannot.
 *
 * Here rather than written out in the composable so that the string the
 * browser is asked and the string this module reasons about are the same one.
 */
export const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * The palette on screen, given what was chosen and what the machine asked for.
 *
 * `systemPrefersDark` is only consulted for `system`. That is the whole point
 * of the third value: an explicit `light` on a machine set to dark is a reader
 * overruling their operating system, and a function that let the machine win
 * there would quietly undo the choice they just made.
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
