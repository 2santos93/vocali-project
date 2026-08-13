import { mount } from '@vue/test-utils';
import type { DOMWrapper, VueWrapper } from '@vue/test-utils';
import ThemeSwitch from '../ThemeSwitch.vue';
import { withTranslations } from '../../../i18n/testing';
import type { InterfaceLanguage } from '../../../i18n/types/InterfaceLanguage';

function mountSwitch(
  props: Record<string, unknown> = {},
  language: InterfaceLanguage = 'es',
): VueWrapper {
  return mount(ThemeSwitch, {
    global: withTranslations(language),
    props: { preference: 'system', dark: false, ...props },
  });
}

const theSwitch = (wrapper: VueWrapper): DOMWrapper<Element> =>
  wrapper.find('[data-testid=theme-switch]');
const systemRow = (wrapper: VueWrapper): DOMWrapper<Element> =>
  wrapper.find('[data-testid=theme-system]');

describe('ThemeSwitch', () => {
  // The position comes from the resolved palette, never the preference: a
  // reader following a dark machine must not see a switch saying "off".
  it.each([
    ['system', true, 'true'],
    ['system', false, 'false'],
    ['dark', true, 'true'],
    ['light', false, 'false'],
  ] as const)(
    'shows the palette on screen, not the preference (%s / dark=%s)',
    (preference, dark, expected) => {
      expect(theSwitch(mountSwitch({ preference, dark })).attributes('aria-checked')).toBe(
        expected,
      );
    },
  );

  it.each([
    ['off, from a dark machine nobody overruled', 'system', true, 'light'],
    ['on, from a light machine nobody overruled', 'system', false, 'dark'],
    ['off, from an explicit dark', 'dark', true, 'light'],
    ['on, from an explicit light', 'light', false, 'dark'],
  ] as const)('turned %s, chooses %s', async (_case, preference, dark, expected) => {
    const wrapper = mountSwitch({ preference, dark });

    await theSwitch(wrapper).trigger('click');

    expect(wrapper.emitted('update:preference')).toEqual([[expected]]);
  });

  it('hands the decision back to the machine', async () => {
    const wrapper = mountSwitch({ preference: 'dark', dark: true });

    await systemRow(wrapper).trigger('click');

    expect(wrapper.emitted('update:preference')).toEqual([['system']]);
  });

  it.each([
    ['system', 'true'],
    ['light', 'false'],
    ['dark', 'false'],
  ] as const)('offers the way back whatever is chosen, pressed=%s', (preference, pressed) => {
    const wrapper = mountSwitch({ preference });

    expect(systemRow(wrapper).exists()).toBe(true);
    expect(systemRow(wrapper).attributes('aria-pressed')).toBe(pressed);
  });

  it('names both controls as one setting', () => {
    const group = mountSwitch().find('[role=group]');

    expect(group.attributes('aria-label')).toBe('Tema');
  });

  it('reads in Spanish and in English', () => {
    expect(theSwitch(mountSwitch({}, 'es')).text()).toContain('Modo oscuro');
    expect(systemRow(mountSwitch({}, 'es')).text()).toContain('Como el sistema');

    expect(theSwitch(mountSwitch({}, 'en')).text()).toContain('Dark mode');
    expect(systemRow(mountSwitch({}, 'en')).text()).toContain('Match my system');
  });

  it('carries a visible focus ring on both controls', () => {
    const wrapper = mountSwitch();

    expect(theSwitch(wrapper).classes()).toContain('focus-visible:focus-ring');
    expect(systemRow(wrapper).classes()).toContain('focus-visible:focus-ring');
  });
});
