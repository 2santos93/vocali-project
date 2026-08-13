import { mount } from '@vue/test-utils';
import type { DOMWrapper, VueWrapper } from '@vue/test-utils';
import { withTranslations } from '../../../i18n/testing';
import type { InterfaceLanguage } from '../../../i18n/types/InterfaceLanguage';
import LanguageToggle from '../LanguageToggle.vue';

/**
 * Attached to the document: the three ways this closes are listeners on
 * `document`, which an event dispatched inside a detached fragment never
 * reaches, so a suite mounting loose would pass with all three missing.
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

  // The one control whose options do not translate: somebody escaping a
  // language they cannot read is looking for the name of the one they can.
  it('names each language in its own language, whichever is on screen', async () => {
    for (const language of ['es', 'en'] as const) {
      const wrapper = mountToggle({}, language);
      await open(wrapper);

      expect(options(wrapper).map((option) => option.text())).toEqual(['Español', 'English']);
      wrapper.unmount();
    }
  });

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

  // Focus never leaves the button — the active row is pointed at rather than
  // focused — so every key below is handled there.
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
   * A row is not focusable, so pressing one blurs the button, the dropdown
   * closes on that blur, and the row unmounts between its own `mousedown` and
   * its `click` — the press does nothing, intermittently.
   *
   * Asserted as "the default is prevented" rather than by replaying the
   * sequence: jsdom does not move focus on `mousedown`, so a hand-dispatched
   * version would assert against a model of the bug rather than the bug.
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
   * The literal is the point. `UserMenu` sits beside this and asserts the same
   * `h-9`; written out in both files rather than shared, one of them moving
   * fails rather than silently agreeing with itself.
   */
  it('is the same height as the account menu beside it', () => {
    expect(button(mountToggle()).classes()).toContain('h-9');
  });
});
