import {
  DEFAULT_THEME_PREFERENCE,
  SYSTEM_DARK_QUERY,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE_SECONDS,
  THEME_PREFERENCES,
  effectiveTheme,
  themeClass,
  toThemePreference,
} from './theme';

/*
 * Every expectation below is written as a literal rather than as a lookup into
 * the table it is checking. `expect(themeClass('dark')).toBe(THEME_CLASSES.dark)`
 * would pass whatever the table said, including an empty string, and the class
 * name is not private to this module: `main.css` keys `color-scheme` off the
 * same two words, and nothing but a literal here would notice them parting.
 */

describe('theme preference', () => {
  it('offers a third option, because two cannot express "follow my machine"', () => {
    expect([...THEME_PREFERENCES]).toEqual(['light', 'dark', 'system']);
  });

  it('follows the machine until somebody says otherwise', () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe('system');
    expect(themeClass(DEFAULT_THEME_PREFERENCE)).toBe('');
  });

  it.each([
    ['light', 'theme-light'],
    ['dark', 'theme-dark'],
  ] as const)('puts %s on the root element as %s', (preference, expectedClass) => {
    expect(themeClass(preference)).toBe(expectedClass);
  });

  /*
   * The absence of a class is what lets `color-scheme: light dark` reach the
   * operating system. A `theme-light` emitted here for `system` would pin every
   * reader who never opened the control to the light palette, on a machine that
   * had already asked for the dark one — which is the default silently failing
   * rather than visibly breaking.
   */
  it('puts nothing on the root element when the machine decides', () => {
    expect(themeClass('system')).toBe('');
  });

  it('gives light and dark their own class', () => {
    const classes = THEME_PREFERENCES.map((preference) => themeClass(preference));

    expect(new Set(classes).size).toBe(THEME_PREFERENCES.length);
  });

  it.each(['light', 'dark', 'system'] as const)('accepts %s from the cookie', (value) => {
    expect(toThemePreference(value)).toBe(value);
  });

  /*
   * The value travels from a cookie into the `class` attribute of `<html>`, and
   * a cookie is set by whoever has the browser. Narrowing it here is what stops
   * the rest of the application from having to be careful.
   */
  it.each([
    ['an unknown word', 'sepia'],
    ['an empty string', ''],
    ['a missing cookie', undefined],
    ['a cleared cookie', null],
    ['a number', 1],
    ['a class of its own choosing', 'theme-dark'],
    ['markup', '"><script>alert(1)</script>'],
  ])('refuses %s', (_case, value) => {
    expect(toThemePreference(value)).toBeNull();
  });

  it('names the cookie the server reads, and keeps it past the session', () => {
    expect(THEME_COOKIE).toBe('vocali_theme');
    expect(THEME_COOKIE_MAX_AGE_SECONDS).toBe(365 * 24 * 60 * 60);
  });
});

/*
 * The switch in the account menu has two positions and the preference has
 * three values, so something has to decide which position a `system`
 * preference puts it in. It is this function, and it is here rather than in
 * the component for the reason the rest of this file exists: a rule in a pure
 * function fails under Jest the moment it stops holding.
 */
describe('the palette actually on screen', () => {
  it.each([
    ['a machine set to dark', true, 'dark'],
    ['a machine set to light', false, 'light'],
  ] as const)('follows %s when nobody has chosen', (_case, systemPrefersDark, expected) => {
    expect(effectiveTheme('system', systemPrefersDark)).toBe(expected);
  });

  /*
   * The reason the third value exists at all. Somebody who has picked light is
   * overruling a machine set to dark, and a resolver that let the machine win
   * here would undo the choice a moment after it was made — which is worse
   * than never offering the choice.
   */
  it.each([
    ['light', true],
    ['light', false],
    ['dark', true],
    ['dark', false],
  ] as const)('shows %s whatever the machine asked for', (preference, systemPrefersDark) => {
    expect(effectiveTheme(preference, systemPrefersDark)).toBe(preference);
  });

  /*
   * The composable hands this string to `matchMedia`, and `main.css` leaves the
   * same question to `color-scheme: light dark`. A literal here is what notices
   * the two parting company.
   */
  it('asks the browser the question the server cannot answer', () => {
    expect(SYSTEM_DARK_QUERY).toBe('(prefers-color-scheme: dark)');
  });
});
