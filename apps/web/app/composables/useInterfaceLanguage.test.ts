import { ref } from 'vue';
import type { Ref } from 'vue';
import { useInterfaceLanguage } from './useInterfaceLanguage';

/*
 * The Nuxt runtime stood in for by globals of the same names, for the reason
 * given in `useAuthSession.test.ts`: `useCookie` and `useState` are the
 * runtime, not collaborators that could be injected.
 *
 * `useState` is reproduced faithfully — one ref per key, shared by every
 * caller — because sharing is the property this composable is built on. Each
 * `useCookie` call really does return its own ref, so the double does too;
 * that difference is exactly why `useState` sits on top of the cookie here,
 * and a double that shared the cookie ref instead would hide it.
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
   * Spanish is the baseline, not a fallback that happens to be first. This is
   * a Spanish medical product and English is the accommodation, so a reader
   * arriving with no cookie must meet Spanish rather than whatever the browser
   * would have negotiated.
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
   * A cookie is set by whoever has the browser. An unrecognised value must
   * fall back rather than travel on: reaching the catalogue with it means a
   * lookup that finds nothing, and the missing-key handler throws rather than
   * rendering a key to a reader — so a forged cookie would be a blank screen.
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
   * Written through to the cookie, not held in memory. The server renders the
   * first paint of every screen, and a preference it cannot read is a page
   * rendered in Spanish and rewritten in English once JavaScript catches up —
   * on every navigation, not just the first.
   */
  it('records a chosen language where the server will read it', () => {
    const language = useInterfaceLanguage();

    language.choose('en');

    expect(language.current.value).toBe('en');
    expect(cookieValues.get('vocali_interface_language')).toBe('en');
  });

  /*
   * One value, not three copies of it. The toggle in the header, the `lang`
   * attribute on the document and every translated string read this, and if
   * each caller held its own ref the header would still say "Español" on a
   * page that had already been redrawn in English.
   */
  it('moves every caller at once rather than only the one that chose', () => {
    const header = useInterfaceLanguage();
    const document = useInterfaceLanguage();

    header.choose('en');

    expect(document.current.value).toBe('en');
    expect(document.locale.value).toBe('en-GB');
  });

  /*
   * `es-ES` and `en-GB` rather than the bare subtags, because the tag decides
   * how a date and a decimal are written — a European clinic writes 12/08/2026
   * and 1,5 MB, and `en-US` would silently turn both into something else.
   */
  it('hands Intl a regional tag rather than a bare subtag', () => {
    const language = useInterfaceLanguage();

    expect(language.locale.value).toBe('es-ES');
    language.choose('en');
    expect(language.locale.value).toBe('en-GB');
  });

  /*
   * A reader's language is not a property of their session, so the cookie
   * outlives it — and it is readable by both sides on purpose, because the
   * server needs it to render the first paint. It carries no authority: the
   * worst a forged value can do is show the other catalogue, which the
   * fallback above already refuses.
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
