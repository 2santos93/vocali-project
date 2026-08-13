import { mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import type { ComputedRef, Ref, VNode } from 'vue';
import { useSystemPrefersDark } from './useSystemColorScheme';

/*
 * The Nuxt runtime stood in for by globals of the same names, as in
 * `useAuthSession.test.ts`.
 *
 * `sharedState` is deliberately never cleared between the cases below, and the
 * module is imported once rather than reloaded per case. Both mirror what is
 * being tested: the listener guard is module scope on purpose — one listener
 * for the whole application, armed by whichever caller mounts first — and the
 * state it writes to is shared for the life of the page. Reloading the module
 * per case would also give it a second copy of Vue, whose `computed` cannot
 * see a `ref` belonging to the first, so every reading would silently freeze
 * at whatever it was during setup.
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

  // jsdom implements no media queries at all, so this is the whole of the
  // browser side of this composable.
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
   * Read in `onMounted`, not during setup.
   *
   * The server renders `false` — it has no way to know — and a client that
   * read `matchMedia` synchronously would render `true` on a dark machine
   * while hydrating against markup that said otherwise. Vue reports the
   * mismatch and then patches it. The cost of avoiding it is one frame of a
   * switch sitting in the wrong position inside a menu that is closed at the
   * time; the cost of not avoiding it is a hydration error on every load.
   */
  it('reports light while rendering and the machine answer only once mounted', () => {
    expect(first.duringSetup).toBe(false);
    expect(first.now()).toBe(true);
  });

  it('asks the one query the stylesheet is written against', () => {
    expect(media.queries).toEqual(['(prefers-color-scheme: dark)']);
  });

  /*
   * A laptop that turns dark at sunset should redraw the switch without the
   * page being reloaded. Nothing else would notice: the preference itself has
   * not changed, and this is the only input to the theme that no request
   * carries.
   */
  it('follows the machine when it changes under an open page', () => {
    media.announce(false);
    expect(first.now()).toBe(false);

    media.announce(true);
    expect(first.now()).toBe(true);
  });

  /*
   * One listener for the whole application, not one per caller. The composable
   * is reached from `app.vue` and from both layouts, so a registration per
   * caller would be three listeners writing the same value, each outliving the
   * component that asked for it — the guard is what makes module scope safe
   * rather than merely convenient.
   */
  it('registers a single listener however many callers ask', () => {
    const second = mountReading(useSystemPrefersDark);
    const third = mountReading(useSystemPrefersDark);

    expect(media.listeners).toBe(1);
    expect(media.queries).toHaveLength(1);
    // Every caller still reads the answer, because the value is shared rather
    // than fetched again — which is what makes one listener sufficient.
    expect([first.now(), second.now(), third.now()]).toEqual([true, true, true]);
    // And a caller arriving after the reading has been taken sees it
    // immediately, rather than a frame of light on a dark machine.
    expect(second.duringSetup).toBe(true);
  });

  /*
   * The listener outlives the component that armed it, which is the point of
   * registering once at module scope: a layout being replaced during a
   * navigation must not stop the switch following the machine.
   */
  it('keeps following the machine for callers that mounted later', () => {
    const later = mountReading(useSystemPrefersDark);

    media.announce(false);

    expect(later.now()).toBe(false);
    expect(first.now()).toBe(false);
  });
});
