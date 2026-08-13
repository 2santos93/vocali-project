import { ref } from 'vue';
import type { Ref } from 'vue';
import { useInterfaceLanguage } from '../useInterfaceLanguage';

/*
 * The Nuxt runtime stood in for by globals, as in `useAuthSession.test.ts`.
 *
 * Each `useCookie` call really does return its own ref, so the double does
 * too: that difference is exactly why `useState` sits on top of the cookie
 * here, and a double sharing the cookie ref would hide it.
 */
const sharedState = new Map<string, Ref<unknown>>();
const cookieValues = new Map<string, unknown>();
const cookieOptions = new Map<string, Record<string, unknown>>();

function fakeUseState<T>(key: string, initialise: () => T): Ref<T> {
  const existing = sharedState.get(key);
  if (existing !== undefined) {
    return existing as Ref<T>;
  }

  const created = ref(initialise()) as unknown as Ref<T>;
  sharedState.set(key, created);
  return created;
}

function fakeUseCookie<T>(name: string, options: Record<string, unknown>): Ref<T | null> {
  cookieOptions.set(name, options);

  const held = ref(cookieValues.get(name) ?? null) as unknown as Ref<T | null>;

  return {
    get value(): T | null {
      return held.value;
    },
    set value(next: T | null) {
      held.value = next;
      cookieValues.set(name, next);
    },
  } as Ref<T | null>;
}

Object.assign(globalThis, { useState: fakeUseState, useCookie: fakeUseCookie });

describe('useInterfaceLanguage', () => {
  beforeEach(() => {
    sharedState.clear();
    cookieValues.clear();
    cookieOptions.clear();
  });

  /*
   * Spanish is the baseline, not a fallback that happens to be first: a reader
   * with no cookie meets Spanish, never what the browser would negotiate.
   */
  it('starts in Spanish when the reader has expressed no preference', () => {
    const language = useInterfaceLanguage();

    expect(language.current.value).toBe('es');
    expect(language.locale.value).toBe('es-ES');
  });

  it('restores the language the cookie carries', () => {
    cookieValues.set('vocali_interface_language', 'en');

    const language = useInterfaceLanguage();

    expect(language.current.value).toBe('en');
    expect(language.locale.value).toBe('en-GB');
  });

  /*
   * A cookie is set by whoever has the browser. An unrecognised value reaching
   * the catalogue finds nothing, and the missing-key handler throws rather
   * than rendering a key — so a forged cookie would be a blank screen.
   */
  it.each([
    ['a language the product has no words for', 'fr'],
    ['an empty value', ''],
    ['something that is not a language at all', '<script>'],
  ])('falls back to Spanish for %s', (_name: string, forged: string) => {
    cookieValues.set('vocali_interface_language', forged);

    expect(useInterfaceLanguage().current.value).toBe('es');
  });

  /*
   * Written through to the cookie: the server renders the first paint, and a
   * preference it cannot read is a page rendered in Spanish and rewritten in
   * English once JavaScript catches up.
   */
  it('records a chosen language where the server will read it', () => {
    const language = useInterfaceLanguage();

    language.choose('en');

    expect(language.current.value).toBe('en');
    expect(cookieValues.get('vocali_interface_language')).toBe('en');
  });

  /*
   * One value, not three copies: with a ref per caller the header still says
   * "Español" on a page already redrawn in English.
   */
  it('moves every caller at once rather than only the one that chose', () => {
    const header = useInterfaceLanguage();
    const document = useInterfaceLanguage();

    header.choose('en');

    expect(document.current.value).toBe('en');
    expect(document.locale.value).toBe('en-GB');
  });

  /*
   * `es-ES` and `en-GB` rather than the bare subtags: the tag decides how a
   * date and a decimal are written, and `en-US` would change both.
   */
  it('hands Intl a regional tag rather than a bare subtag', () => {
    const language = useInterfaceLanguage();

    expect(language.locale.value).toBe('es-ES');
    language.choose('en');
    expect(language.locale.value).toBe('en-GB');
  });

  /*
   * The cookie outlives the session and is readable by both sides on purpose,
   * because the server needs it for the first paint. It carries no authority.
   */
  it('keeps the preference for a year, in a cookie both sides can read', () => {
    useInterfaceLanguage();

    expect(cookieOptions.get('vocali_interface_language')).toEqual({
      maxAge: 365 * 24 * 60 * 60,
      sameSite: 'lax',
      secure: true,
      path: '/',
    });
  });
});
