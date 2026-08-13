import {
  DEFAULT_THEME_PREFERENCE,
  SYSTEM_DARK_QUERY,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE_SECONDS,
  THEME_PREFERENCES,
  effectiveTheme,
  themeClass,
  toThemePreference,
} from '../theme';

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

describe('the palette actually on screen', () => {
  it.each([
    ['a machine set to dark', true, 'dark'],
    ['a machine set to light', false, 'light'],
  ] as const)('follows %s when nobody has chosen', (_case, systemPrefersDark, expected) => {
    expect(effectiveTheme('system', systemPrefersDark)).toBe(expected);
  });

  it.each([
    ['light', true],
    ['light', false],
    ['dark', true],
    ['dark', false],
  ] as const)('shows %s whatever the machine asked for', (preference, systemPrefersDark) => {
    expect(effectiveTheme(preference, systemPrefersDark)).toBe(preference);
  });

  it('asks the browser the question the server cannot answer', () => {
    expect(SYSTEM_DARK_QUERY).toBe('(prefers-color-scheme: dark)');
  });
});
