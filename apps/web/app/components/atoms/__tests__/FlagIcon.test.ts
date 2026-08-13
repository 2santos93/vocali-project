import { mount } from '@vue/test-utils';
import FlagIcon from '../FlagIcon.vue';

describe('FlagIcon', () => {
  it.each(['es', 'en'] as const)('draws %s rather than spelling it', (language) => {
    const wrapper = mount(FlagIcon, { props: { language } });

    expect(wrapper.attributes('data-flag')).toBe(language);

    // A text node here is how a regression back to the `🇪🇸` emoji would arrive,
    // which Windows renders as the letters `ES` in a box.
    expect(wrapper.text()).toBe('');
    expect(wrapper.find('svg').exists()).toBe(true);
  });

  it('draws a different flag for each language', () => {
    const spain = mount(FlagIcon, { props: { language: 'es' } })
      .find('svg')
      .html();
    const britain = mount(FlagIcon, { props: { language: 'en' } })
      .find('svg')
      .html();

    expect(spain).not.toBe(britain);
  });

  it('says nothing to a screen reader, because a country is not a language', () => {
    expect(mount(FlagIcon, { props: { language: 'es' } }).attributes('aria-hidden')).toBe('true');
  });
});
