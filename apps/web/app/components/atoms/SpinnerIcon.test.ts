import { mount } from '@vue/test-utils';
import SpinnerIcon from './SpinnerIcon.vue';
import { withTranslations } from '../../i18n/testing';

describe('SpinnerIcon', () => {
  // A spinner is the only thing on screen while a request is in flight. Left
  // as a bare decorative <svg> it is invisible to a screen reader, so the
  // interface says nothing at all about the wait.
  it('exposes itself as a labelled image, in Spanish, by default', () => {
    const wrapper = mount(SpinnerIcon, { global: withTranslations() });

    expect(wrapper.attributes('role')).toBe('img');
    expect(wrapper.attributes('aria-label')).toBe('Cargando');
  });

  it('takes a caller-supplied label', () => {
    const wrapper = mount(SpinnerIcon, {
      global: withTranslations(),
      props: { label: 'Transcribiendo' },
    });

    expect(wrapper.attributes('aria-label')).toBe('Transcribiendo');
  });

  it.each([
    ['sm', 'h-3.5'],
    ['md', 'h-4'],
    ['lg', 'h-5'],
  ] as const)('renders the %s size distinctly', (size, expectedClass) => {
    const wrapper = mount(SpinnerIcon, { global: withTranslations(), props: { size } });

    expect(wrapper.classes()).toContain(expectedClass);
  });

  it('defaults to the medium size', () => {
    expect(mount(SpinnerIcon, { global: withTranslations() }).classes()).toContain('h-4');
  });

  it('animates', () => {
    expect(mount(SpinnerIcon, { global: withTranslations() }).classes()).toContain('animate-spin');
  });
});
