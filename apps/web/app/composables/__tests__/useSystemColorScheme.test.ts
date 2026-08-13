import { mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import type { ComputedRef, Ref, VNode } from 'vue';
import { useSystemPrefersDark } from '../useSystemColorScheme';

/*
 * The Nuxt runtime stood in for by globals, as in `useAuthSession.test.ts`.
 *
 * `sharedState` is never cleared and the module is imported once, mirroring
 * what is tested: one listener for the whole application, and state shared for
 * the life of the page. Reloading per case would also give the module a second
 * copy of Vue, whose `computed` cannot see a `ref` belonging to the first.
 */
const sharedState = new Map<string, Ref<unknown>>();

function fakeUseState<T>(key: string, initialise: () => T): Ref<T> {
  const existing = sharedState.get(key);
  if (existing !== undefined) {
    return existing as Ref<T>;
  }

  const created = ref(initialise()) as unknown as Ref<T>;
  sharedState.set(key, created);
  return created;
}

Object.assign(globalThis, { useState: fakeUseState });

interface MediaQueryDouble {
  /** Every query string the composable asked the browser about. */
  readonly queries: string[];
  /** How many change listeners were registered, across every query it made. */
  listeners: number;
  matches: boolean;
  /** The machine's setting changing under a page that is already open. */
  announce(next: boolean): void;
}

function installMatchMedia(initiallyDark: boolean): MediaQueryDouble {
  const changed: ((event: { matches: boolean }) => void)[] = [];

  const media: MediaQueryDouble = {
    queries: [],
    listeners: 0,
    matches: initiallyDark,
    announce(next: boolean): void {
      media.matches = next;
      for (const listener of changed) {
        listener({ matches: next });
      }
    },
  };

  // jsdom implements no media queries, so this is the whole browser side.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => {
      media.queries.push(query);
      return {
        get matches(): boolean {
          return media.matches;
        },
        addEventListener(_type: string, listener: (event: { matches: boolean }) => void): void {
          media.listeners += 1;
          changed.push(listener);
        },
      };
    },
  });

  return media;
}

interface Reading {
  /** What `setup` saw, before anything mounted. This is what the server renders. */
  duringSetup: boolean;
  /** What that same component reads afterwards. */
  now: () => boolean;
}

function mountReading(read: () => ComputedRef<boolean>): Reading {
  const reading: Reading = { duringSetup: false, now: () => false };

  mount(
    defineComponent({
      setup() {
        const prefersDark = read();
        reading.duringSetup = prefersDark.value;
        reading.now = (): boolean => prefersDark.value;
        return (): VNode => h('div');
      },
    }),
  );

  return reading;
}

/** A machine set to dark, so "the server rendered light" is a visible difference. */
const media = installMatchMedia(true);

describe('useSystemPrefersDark', () => {
  /** The mount that arms the listener, taken once because only one ever can. */
  let first: Reading;

  beforeAll(() => {
    first = mountReading(useSystemPrefersDark);
  });

  /*
   * Read in `onMounted`, not during setup. The server renders `false`, so a
   * client reading `matchMedia` synchronously would render `true` on a dark
   * machine while hydrating against markup that said otherwise.
   */
  it('reports light while rendering and the machine answer only once mounted', () => {
    expect(first.duringSetup).toBe(false);
    expect(first.now()).toBe(true);
  });

  it('asks the one query the stylesheet is written against', () => {
    expect(media.queries).toEqual(['(prefers-color-scheme: dark)']);
  });

  /*
   * A laptop turning dark at sunset redraws the switch without a reload.
   * Nothing else notices: the preference itself has not changed.
   */
  it('follows the machine when it changes under an open page', () => {
    media.announce(false);
    expect(first.now()).toBe(false);

    media.announce(true);
    expect(first.now()).toBe(true);
  });

  /*
   * One listener for the whole application: the composable is reached from
   * `app.vue` and both layouts, so a registration per caller would be three
   * listeners writing the same value, each outliving its component.
   */
  it('registers a single listener however many callers ask', () => {
    const second = mountReading(useSystemPrefersDark);
    const third = mountReading(useSystemPrefersDark);

    expect(media.listeners).toBe(1);
    expect(media.queries).toHaveLength(1);
    // Every caller still reads the answer, which is what makes one enough.
    expect([first.now(), second.now(), third.now()]).toEqual([true, true, true]);
    // A later caller sees it immediately, not a frame of light on a dark machine.
    expect(second.duringSetup).toBe(true);
  });

  /*
   * The listener outlives the component that armed it: a layout replaced
   * during a navigation must not stop the switch following the machine.
   */
  it('keeps following the machine for callers that mounted later', () => {
    const later = mountReading(useSystemPrefersDark);

    media.announce(false);

    expect(later.now()).toBe(false);
    expect(first.now()).toBe(false);
  });
});
