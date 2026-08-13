import { mount } from '@vue/test-utils';
import type { DOMWrapper, VueWrapper } from '@vue/test-utils';
import { withTranslations } from '../../i18n/testing';
import type { InterfaceLanguage } from '../../i18n/language';
import LanguageToggle from './LanguageToggle.vue';

/**
 * Attached to the document on purpose, and not only for the focus assertions.
 *
 * The three ways this closes — a click elsewhere, Escape, the focus moving on
 * — are listeners on `document`, and an event dispatched inside a detached
 * fragment never reaches it. A suite that mounted loose would pass with all
 * three missing.
 */
function mountToggle(
  props: Record<string, unknown> = {},
  language: InterfaceLanguage = 'es',
): VueWrapper {
  return mount(LanguageToggle, {
    global: withTranslations(language),
    props: { language: 'es', ...props },
    attachTo: document.body,
  });
}

const button = (wrapper: VueWrapper): DOMWrapper<Element> =>
  wrapper.find('[data-testid=language-toggle]');
const options = (wrapper: VueWrapper): DOMWrapper<Element>[] => wrapper.findAll('[role=option]');

async function open(wrapper: VueWrapper): Promise<void> {
  await button(wrapper).trigger('click');
}

describe('LanguageToggle', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  /*
   * The requirement this component exists for: a flag alone once it is closed,
   * a flag *and* the language's name once it is open. A native `<select>`
   * cannot do the first, which is the only reason the keyboard handling below
   * is written by hand rather than inherited.
   */
  it('shows nothing but a flag while it is closed', () => {
    const wrapper = mountToggle();

    expect(wrapper.find('[data-flag=es]').exists()).toBe(true);
    expect(wrapper.text()).toBe('');
    expect(wrapper.find('[role=listbox]').exists()).toBe(false);
  });

  it('shows a flag and a name for each language once it is open', async () => {
    const wrapper = mountToggle();

    await open(wrapper);

    expect(options(wrapper).map((option) => option.text())).toEqual(['Español', 'English']);
    expect(
      options(wrapper).map((option) => option.find('span[data-flag]').attributes('data-flag')),
    ).toEqual(['es', 'en']);
  });

  /*
   * The one control in the application whose options do not translate.
   * Somebody looking for the way out of a language they cannot read is looking
   * for the name of the language they can.
   */
  it('names each language in its own language, whichever is on screen', async () => {
    for (const language of ['es', 'en'] as const) {
      const wrapper = mountToggle({}, language);
      await open(wrapper);

      expect(options(wrapper).map((option) => option.text())).toEqual(['Español', 'English']);
      wrapper.unmount();
    }
  });

  /*
   * A flag is a country and a language is not. With the name off screen, the
   * button has to say which language it means — and it says it in the language
   * being read, because the sentence around the name is not the name.
   */
  it.each([
    ['es', 'es', 'Idioma: Español'],
    ['en', 'es', 'Language: Español'],
    ['es', 'en', 'Idioma: English'],
  ] as const)(
    'is named for the language it holds (%s reader, %s chosen)',
    (reading, chosen, expected) => {
      expect(button(mountToggle({ language: chosen }, reading)).attributes('aria-label')).toBe(
        expected,
      );
    },
  );

  it('says which language is current, and which row the keyboard is on', async () => {
    const wrapper = mountToggle({ language: 'en' });

    expect(button(wrapper).attributes('aria-expanded')).toBe('false');
    expect(button(wrapper).attributes('aria-activedescendant')).toBeUndefined();

    await open(wrapper);

    expect(button(wrapper).attributes('aria-expanded')).toBe('true');
    expect(options(wrapper).map((option) => option.attributes('aria-selected'))).toEqual([
      'false',
      'true',
    ]);

    // Opened on the current language rather than at the top: the list keeps
    // the reader's place instead of losing it.
    expect(button(wrapper).attributes('aria-activedescendant')).toBe(
      options(wrapper)[1]?.attributes('id'),
    );
  });

  it('reports the language that was clicked, and closes', async () => {
    const wrapper = mountToggle();

    await open(wrapper);
    await options(wrapper)[1]?.trigger('click');

    expect(wrapper.emitted('update:language')).toEqual([['en']]);
    expect(wrapper.find('[role=listbox]').exists()).toBe(false);
  });

  /*
   * The keyboard contract a native select would have given for free, and the
   * bill for showing a flag alone. Focus never leaves the button — the active
   * row is pointed at rather than focused — so every key below is handled
   * there.
   */
  describe('from the keyboard', () => {
    it.each(['ArrowDown', 'ArrowUp', 'Enter', ' '])('opens on %s', async (key) => {
      const wrapper = mountToggle();

      await button(wrapper).trigger('keydown', { key });

      expect(wrapper.find('[role=listbox]').exists()).toBe(true);
    });

    it('leaves other keys alone', async () => {
      const wrapper = mountToggle();

      await button(wrapper).trigger('keydown', { key: 'a' });

      expect(wrapper.find('[role=listbox]').exists()).toBe(false);
    });

    it('walks the rows and wraps, because two rows is not a wall to stop at', async () => {
      const wrapper = mountToggle();
      await open(wrapper);

      const [first, second] = options(wrapper).map((option) => option.attributes('id'));

      await button(wrapper).trigger('keydown', { key: 'ArrowDown' });
      expect(button(wrapper).attributes('aria-activedescendant')).toBe(second);

      await button(wrapper).trigger('keydown', { key: 'ArrowDown' });
      expect(button(wrapper).attributes('aria-activedescendant')).toBe(first);

      await button(wrapper).trigger('keydown', { key: 'ArrowUp' });
      expect(button(wrapper).attributes('aria-activedescendant')).toBe(second);

      await button(wrapper).trigger('keydown', { key: 'Home' });
      expect(button(wrapper).attributes('aria-activedescendant')).toBe(first);

      await button(wrapper).trigger('keydown', { key: 'End' });
      expect(button(wrapper).attributes('aria-activedescendant')).toBe(second);
    });

    /*
     * Moving through a list is not choosing from it. A listbox that committed
     * on every arrow key would redraw the whole application on the way past
     * each option it was not asked for.
     */
    it('reports nothing while the keyboard is merely moving', async () => {
      const wrapper = mountToggle();
      await open(wrapper);

      await button(wrapper).trigger('keydown', { key: 'ArrowDown' });

      expect(wrapper.emitted('update:language')).toBeUndefined();
    });

    it.each(['Enter', ' '])('chooses the active row on %s', async (key) => {
      const wrapper = mountToggle();
      await open(wrapper);

      await button(wrapper).trigger('keydown', { key: 'ArrowDown' });
      await button(wrapper).trigger('keydown', { key });

      expect(wrapper.emitted('update:language')).toEqual([['en']]);
      expect(wrapper.find('[role=listbox]').exists()).toBe(false);
    });

    it('hands the focus back to the button it came from', async () => {
      const wrapper = mountToggle();
      await open(wrapper);

      await button(wrapper).trigger('keydown', { key: 'ArrowDown' });
      await button(wrapper).trigger('keydown', { key: 'Enter' });

      expect(document.activeElement).toBe(button(wrapper).element);
    });

    it('closes on Escape without choosing anything', async () => {
      const wrapper = mountToggle();
      await open(wrapper);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[role=listbox]').exists()).toBe(false);
      expect(wrapper.emitted('update:language')).toBeUndefined();
      expect(document.activeElement).toBe(button(wrapper).element);
    });
  });

  it('closes when something else on the page is clicked', async () => {
    const wrapper = mountToggle();
    await open(wrapper);

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[role=listbox]').exists()).toBe(false);
  });

  /*
   * The race that made this control fail intermittently in a real browser.
   *
   * A row is not focusable — the focus stays on the combobox, and
   * `aria-activedescendant` points at the active row — so pressing one makes
   * the browser blur the button and move the focus to `<body>`. The dropdown
   * watches for the focus leaving and closes, which unmounts the row between
   * its own `mousedown` and its `click`, and the press does nothing.
   *
   * Asserted as "the default is prevented" rather than by replaying the whole
   * browser sequence, because `mousedown` moving the focus is the browser's
   * behaviour and jsdom does not have it: a test that dispatched the events
   * by hand would be asserting against a model of the bug rather than the bug.
   */
  it('does not let a press on a row take the focus off the button', async () => {
    const wrapper = mountToggle();
    await open(wrapper);

    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    options(wrapper)[1]?.element.dispatchEvent(press);

    expect(press.defaultPrevented).toBe(true);
  });

  it('stays open when the click was its own', async () => {
    const wrapper = mountToggle();
    await open(wrapper);

    options(wrapper)[0]?.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[role=listbox]').exists()).toBe(true);
  });

  /*
   * What Tab does. A panel left open behind a focus that has moved on is a
   * panel covering whatever the reader went to next.
   */
  it('closes when the focus moves out of it', async () => {
    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);

    const wrapper = mountToggle();
    await open(wrapper);

    elsewhere.focus();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[role=listbox]').exists()).toBe(false);
  });

  it('follows the mouse without choosing under it', async () => {
    const wrapper = mountToggle();
    await open(wrapper);

    await options(wrapper)[1]?.trigger('mousemove');

    expect(button(wrapper).attributes('aria-activedescendant')).toBe(
      options(wrapper)[1]?.attributes('id'),
    );
    expect(wrapper.emitted('update:language')).toBeUndefined();
  });

  it('lets a second one exist without colliding ids', async () => {
    const wrapper = mountToggle({ id: 'interface-language-footer' });

    expect(button(wrapper).attributes('id')).toBe('interface-language-footer');

    await open(wrapper);

    expect(wrapper.find('[role=listbox]').attributes('id')).toBe('interface-language-footer-list');
  });

  it('carries a visible focus ring, because it is reached by keyboard', () => {
    expect(button(mountToggle()).classes()).toContain('focus-visible:focus-ring');
  });

  /*
   * The literal is the point, as it is in `theme.test.ts`. `UserMenu` stands
   * next to this in the header and asserts the same `h-9`, and the two hold
   * contents of different sizes — a 16px flag here, a 28px avatar there — so
   * a height left to fall out of the padding is a header with two buttons of
   * different heights. Written out in both files, one of them moving fails.
   */
  it('is the same height as the account menu beside it', () => {
    expect(button(mountToggle()).classes()).toContain('h-9');
  });
});
