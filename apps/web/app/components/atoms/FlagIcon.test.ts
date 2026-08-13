import { mount } from '@vue/test-utils';
import FlagIcon from './FlagIcon.vue';

describe('FlagIcon', () => {
  it.each(['es', 'en'] as const)('draws %s rather than spelling it', (language) => {
    const wrapper = mount(FlagIcon, { props: { language } });

    expect(wrapper.attributes('data-flag')).toBe(language);

    /*
     * The whole reason this is not the `🇪🇸` emoji. Windows ships no flag
     * glyphs, so the emoji renders as the letters `ES` in a box — and a text
     * node here is how that regression would arrive.
     */
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

  /*
   * A flag is a country and a language is not: this same flag would be wrong
   * for a reader in Dublin. So it is never the thing that names the option —
   * the list shows the language's name beside it, and the collapsed button
   * carries that name as its accessible name.
   */
  it('says nothing to a screen reader, because a country is not a language', () => {
    expect(mount(FlagIcon, { props: { language: 'es' } }).attributes('aria-hidden')).toBe('true');
  });
});
