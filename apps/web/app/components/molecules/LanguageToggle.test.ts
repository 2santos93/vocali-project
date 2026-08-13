import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { withTranslations } from '../../i18n/testing';
import type { InterfaceLanguage } from '../../i18n/language';
import LanguageToggle from './LanguageToggle.vue';

function mountToggle(
  props: Record<string, unknown> = {},
  language: InterfaceLanguage = 'es',
): VueWrapper {
  return mount(LanguageToggle, {
    global: withTranslations(language),
    props: { language: 'es', ...props },
  });
}

describe('LanguageToggle', () => {
  /*
   * The one control in the application whose options do not translate. Somebody
   * looking for the way out of a language they cannot read is looking for the
   * name of the language they can, so each option names itself in both
   * catalogues.
   */
  it('names each language in its own language, whichever is on screen', () => {
    for (const language of ['es', 'en'] as const) {
      const options = mountToggle({}, language).findAll('option');

      expect(options.map((option) => option.text())).toEqual(['Español', 'English']);
      expect(options.map((option) => option.attributes('value'))).toEqual(['es', 'en']);
    }
  });

  it('translates its own label', () => {
    expect(mountToggle({}, 'es').find('label').text()).toBe('Idioma');
    expect(mountToggle({}, 'en').find('label').text()).toBe('Language');
  });

  it.each(['es', 'en'] as const)('shows %s as the current language', (language) => {
    const select = mountToggle({ language }).find('select');

    expect((select.element as HTMLSelectElement).value).toBe(language);
  });

  it('reports the chosen language', async () => {
    const wrapper = mountToggle();
    const select = wrapper.find('select');

    (select.element as HTMLSelectElement).value = 'en';
    await select.trigger('change');

    expect(wrapper.emitted('update:language')).toEqual([['en']]);
  });

  it('reports nothing when the value is not a language it rendered', async () => {
    const wrapper = mountToggle();
    const select = wrapper.find('select');

    const injected = document.createElement('option');
    injected.value = 'de';
    select.element.appendChild(injected);
    (select.element as HTMLSelectElement).value = 'de';
    await select.trigger('change');

    expect(wrapper.emitted('update:language')).toBeUndefined();
  });

  it('is labelled, and the label points at the control', () => {
    const wrapper = mountToggle();

    expect(wrapper.find('label').attributes('for')).toBe(wrapper.find('select').attributes('id'));
  });

  it('carries a visible focus ring, because it is reached by keyboard', () => {
    expect(mountToggle().find('select').classes()).toContain('focus-visible:focus-ring');
  });
});
