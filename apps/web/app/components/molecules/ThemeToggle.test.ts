import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import ThemeToggle from './ThemeToggle.vue';
import { withTranslations } from '../../i18n/testing';

function mountToggle(props: Record<string, unknown> = {}): VueWrapper {
  return mount(ThemeToggle, {
    global: withTranslations(),
    props: { preference: 'system', ...props },
  });
}

describe('ThemeToggle', () => {
  it('offers the three choices in Spanish, the machine among them', () => {
    const options = mountToggle().findAll('option');

    expect(options.map((option) => option.text())).toEqual(['Claro', 'Oscuro', 'Como el sistema']);
    expect(options.map((option) => option.attributes('value'))).toEqual([
      'light',
      'dark',
      'system',
    ]);
  });

  it.each(['light', 'dark', 'system'] as const)('shows %s as the current choice', (preference) => {
    const select = mountToggle({ preference }).find('select');

    expect((select.element as HTMLSelectElement).value).toBe(preference);
  });

  it('reports the chosen preference', async () => {
    const wrapper = mountToggle();
    const select = wrapper.find('select');

    (select.element as HTMLSelectElement).value = 'dark';
    await select.trigger('change');

    expect(wrapper.emitted('update:preference')).toEqual([['dark']]);
  });

  /*
   * A `<select>` reports a string, and the value narrowed rather than asserted
   * is what stops an edited option reaching the cookie and the class attribute.
   */
  it('reports nothing when the value is not a preference it rendered', async () => {
    const wrapper = mountToggle();
    const select = wrapper.find('select');

    const injected = document.createElement('option');
    injected.value = 'sepia';
    select.element.appendChild(injected);
    (select.element as HTMLSelectElement).value = 'sepia';
    await select.trigger('change');

    expect(wrapper.emitted('update:preference')).toBeUndefined();
  });

  /*
   * A control nobody can name is a control a screen reader user cannot use, and
   * `aria-label` would have named it for them alone. The label is real, visible
   * and joined by id.
   */
  it('is labelled, and the label points at the control', () => {
    const wrapper = mountToggle();
    const label = wrapper.find('label');

    expect(label.text()).toBe('Tema');
    expect(label.attributes('for')).toBe(wrapper.find('select').attributes('id'));
  });

  it('lets a second one exist without colliding ids', () => {
    const wrapper = mountToggle({ id: 'theme-preference-footer' });

    expect(wrapper.find('select').attributes('id')).toBe('theme-preference-footer');
    expect(wrapper.find('label').attributes('for')).toBe('theme-preference-footer');
  });

  it('carries a visible focus ring, because it is reached by keyboard', () => {
    expect(mountToggle().find('select').classes()).toContain('focus-visible:focus-ring');
  });

  it('offers the same three choices in English', () => {
    const options = mount(ThemeToggle, {
      global: withTranslations('en'),
      props: { preference: 'system' },
    }).findAll('option');

    expect(options.map((option) => option.text())).toEqual(['Light', 'Dark', 'Match my system']);
  });
});
