import {
  DEFAULT_INTERFACE_LANGUAGE,
  INTERFACE_LANGUAGES,
  INTERFACE_LANGUAGE_COOKIE,
  INTERFACE_LANGUAGE_COOKIE_MAX_AGE_SECONDS,
  localeTag,
  toInterfaceLanguage,
} from './language';

describe('the interface language', () => {
  it('is Spanish until somebody says otherwise', () => {
    expect(DEFAULT_INTERFACE_LANGUAGE).toBe('es');
    expect([...INTERFACE_LANGUAGES]).toEqual(['es', 'en']);
  });

  it('lives in a cookie the server can read, and outlives the session', () => {
    expect(INTERFACE_LANGUAGE_COOKIE).toBe('vocali_interface_language');
    expect(INTERFACE_LANGUAGE_COOKIE_MAX_AGE_SECONDS).toBe(365 * 24 * 60 * 60);
  });

  /*
   * The regional tags are the point of this function. `es` and `en` alone would
   * leave `Intl` to guess, and its guess for English is the United States:
   * 08/12/2026 rather than 12/08/2026, on the same screen as Spanish rows that
   * were written the other way round.
   */
  it('formats for Spain and for British English, never for the United States', () => {
    expect(localeTag('es')).toBe('es-ES');
    expect(localeTag('en')).toBe('en-GB');

    const date = new Date('2026-08-12T09:30:00Z');
    expect(new Intl.DateTimeFormat(localeTag('en'), { dateStyle: 'short' }).format(date)).toBe(
      '12/08/2026',
    );
    expect(new Intl.NumberFormat(localeTag('es')).format(1.5)).toBe('1,5');
  });

  it.each(['es', 'en'] as const)('accepts %s from the cookie', (value) => {
    expect(toInterfaceLanguage(value)).toBe(value);
  });

  it.each([
    ['a language with no catalogue', 'fr'],
    ['a regional tag', 'es-ES'],
    ['an empty string', ''],
    ['a missing cookie', undefined],
    ['a cleared cookie', null],
    ['a number', 1],
  ])('refuses %s', (_case, value) => {
    expect(toInterfaceLanguage(value)).toBeNull();
  });
});
