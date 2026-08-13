import { mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import type { Ref, VNode } from 'vue';
import { SYSTEM_DARK_STATE_KEY } from '../useSystemColorScheme';
import { THEME_STATE_KEY, useThemePreference } from '../useThemePreference';
import type { ThemeControl } from '../types/ThemeControl';

/*
 * The Nuxt runtime stood in for by globals of the same names, as in
 * `useAuthSession.test.ts`.
 *
 * Mounted rather than called directly, because this composable reaches
 * `useSystemPrefersDark`, which reads the machine in `onMounted` and so needs
 * a component to be mounted into.
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

/**
 * Each `useCookie` call really does return its own ref, so this does too —
 * which is the reason `useState` sits on top of the cookie at all.
 */
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

interface MediaQueryDouble {
  matches: boolean;
  announce(next: boolean): void;
}

function installMatchMedia(initiallyDark: boolean): MediaQueryDouble {
  const changed: ((event: { matches: boolean }) => void)[] = [];

  const media: MediaQueryDouble = {
    matches: initiallyDark,
    announce(next: boolean): void {
      media.matches = next;
      for (const listener of changed) {
        listener({ matches: next });
      }
    },
  };

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => ({
      get matches(): boolean {
        return media.matches;
      },
      addEventListener(_type: string, listener: (event: { matches: boolean }) => void): void {
        changed.push(listener);
      },
    }),
  });

  return media;
}

/** A machine set to light, so a reading of dark is always something chosen. */
const media = installMatchMedia(false);

function mountControl(): ThemeControl {
  // Collected rather than assigned to a local: `setup` runs inside `mount`,
  // and TypeScript cannot see an assignment made from a callback.
  const controls: ThemeControl[] = [];

  mount(
    defineComponent({
      setup() {
        controls.push(useThemePreference());
        return (): VNode => h('div');
      },
    }),
  );

  return controls[0]!;
}

describe('useThemePreference', () => {
  beforeEach(() => {
    cookieValues.clear();
    cookieOptions.clear();
    /*
     * Only the theme's own key, never the whole map: `useSystemPrefersDark`
     * registers its listener once for the life of the module, so clearing the
     * key it writes leaves a fresh ref nothing will ever fill again.
     */
    sharedState.delete(THEME_STATE_KEY);
    media.announce(false);
  });

  /*
   * `system` is a real third value, not a way of spelling light: a two-way
   * switch cannot express "follow my machine".
   */
  it('follows the machine until the reader has chosen otherwise', () => {
    const theme = mountControl();

    expect(theme.preference.value).toBe('system');
    expect(theme.rootClass.value).toBe('');
  });

  it('restores the palette the cookie carries', () => {
    cookieValues.set('vocali_theme', 'dark');

    const theme = mountControl();

    expect(theme.preference.value).toBe('dark');
    expect(theme.rootClass.value).toBe('theme-dark');
    expect(theme.isDark.value).toBe(true);
  });

  /*
   * The cookie value reaches the root element's `class` attribute, and a
   * cookie is set by whoever has the browser.
   */
  it.each([
    ['a palette that does not exist', 'solarized'],
    ['an empty value', ''],
    ['markup', '" onload="alert(1)'],
  ])('falls back to following the machine for %s', (_name: string, forged: string) => {
    cookieValues.set('vocali_theme', forged);

    const theme = mountControl();

    expect(theme.preference.value).toBe('system');
    expect(theme.rootClass.value).toBe('');
  });

  /*
   * Written through to the cookie, because the server renders the first paint:
   * a theme restored after hydration is a white flash on every navigation.
   */
  it('records a chosen palette where the server will read it', () => {
    const theme = mountControl();

    theme.choose('dark');

    expect(theme.preference.value).toBe('dark');
    expect(cookieValues.get('vocali_theme')).toBe('dark');
  });

  /*
   * `system` must stay the *absence* of a class, because the stylesheet's
   * `color-scheme: light dark` is what hands the choice to the machine. The
   * switch, meanwhile, must show the palette actually on screen.
   */
  it('leaves the root element unclassed on a dark machine while still reading as dark', () => {
    const theme = mountControl();

    media.announce(true);

    expect(theme.preference.value).toBe('system');
    expect(theme.rootClass.value).toBe('');
    expect(theme.isDark.value).toBe(true);
  });

  it('follows the machine as it changes, while the preference is system', () => {
    const theme = mountControl();

    media.announce(true);
    expect(theme.isDark.value).toBe(true);

    media.announce(false);
    expect(theme.isDark.value).toBe(false);
  });

  /*
   * An explicit choice overrules the machine: letting the machine win here
   * quietly undoes the choice the reader has just made.
   */
  it('keeps an explicitly chosen palette on a machine set to the other one', () => {
    const theme = mountControl();

    theme.choose('light');
    media.announce(true);

    expect(theme.rootClass.value).toBe('theme-light');
    expect(theme.isDark.value).toBe(false);
  });

  /*
   * One piece of shared state, not one ref per caller: the toggle and the
   * class on `<html>` are two callers, and separate copies disagree.
   */
  it('moves every caller at once rather than only the one that chose', () => {
    const rootElement = mountControl();
    const accountMenu = mountControl();

    accountMenu.choose('dark');

    expect(rootElement.preference.value).toBe('dark');
    expect(rootElement.rootClass.value).toBe('theme-dark');
  });

  /*
   * A year, because nothing about a theme expires with a session, and readable
   * by both sides because the server needs it for the first paint. It carries
   * no authority.
   */
  it('keeps the preference for a year, in a cookie both sides can read', () => {
    mountControl();

    expect(cookieOptions.get('vocali_theme')).toEqual({
      maxAge: 365 * 24 * 60 * 60,
      sameSite: 'lax',
      secure: true,
      path: '/',
    });
  });

  it('shares the machine reading under the key the rest of the shell reads', () => {
    mountControl();

    expect(sharedState.has(SYSTEM_DARK_STATE_KEY)).toBe(true);
  });
});
