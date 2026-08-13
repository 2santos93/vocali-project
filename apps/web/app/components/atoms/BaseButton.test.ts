import { mount } from '@vue/test-utils';
import BaseButton from './BaseButton.vue';
import { withTranslations } from '../../i18n/testing';

describe('BaseButton', () => {
  it('renders its slot content', () => {
    const wrapper = mount(BaseButton, {
      global: withTranslations(),
      slots: { default: 'Subir archivo' },
    });

    expect(wrapper.text()).toContain('Subir archivo');
  });

  it('defaults to type="button" so it cannot submit a form it merely sits in', () => {
    const wrapper = mount(BaseButton, { global: withTranslations() });

    expect(wrapper.attributes('type')).toBe('button');
  });

  it('submits when asked to', () => {
    const wrapper = mount(BaseButton, { global: withTranslations(), props: { type: 'submit' } });

    expect(wrapper.attributes('type')).toBe('submit');
  });

  it('emits click with the originating event', async () => {
    const wrapper = mount(BaseButton, { global: withTranslations() });

    await wrapper.trigger('click');

    const emitted = wrapper.emitted('click');
    expect(emitted).toHaveLength(1);
    expect(emitted?.[0]?.[0]).toBeInstanceOf(Event);
  });

  it('does not emit click while disabled', async () => {
    const wrapper = mount(BaseButton, { global: withTranslations(), props: { disabled: true } });

    await wrapper.trigger('click');

    expect(wrapper.emitted('click')).toBeUndefined();
    expect(wrapper.attributes('disabled')).toBeDefined();
  });

  // The reason loading disables at all: a second click sends a second upload.
  it('does not emit click while loading', async () => {
    const wrapper = mount(BaseButton, { global: withTranslations(), props: { loading: true } });

    await wrapper.trigger('click');

    expect(wrapper.emitted('click')).toBeUndefined();
    expect(wrapper.attributes('disabled')).toBeDefined();
  });

  it('shows a labelled spinner and marks itself busy only while loading', () => {
    const idle = mount(BaseButton, { global: withTranslations() });
    expect(idle.find('[data-testid="spinner-icon"]').exists()).toBe(false);
    expect(idle.attributes('aria-busy')).toBeUndefined();

    const busy = mount(BaseButton, { global: withTranslations(), props: { loading: true } });
    expect(busy.find('[data-testid="spinner-icon"]').attributes('aria-label')).toBe('Procesando');
    expect(busy.attributes('aria-busy')).toBe('true');
  });

  it('announces a caller-supplied loading label in Spanish', () => {
    const wrapper = mount(BaseButton, {
      global: withTranslations(),
      props: { loading: true, loadingLabel: 'Subiendo el audio' },
    });

    expect(wrapper.find('[data-testid="spinner-icon"]').attributes('aria-label')).toBe(
      'Subiendo el audio',
    );
  });

  it.each([
    ['primary', 'bg-brand-solid'],
    ['secondary', 'bg-surface'],
    ['danger', 'bg-danger-solid'],
    ['ghost', 'bg-transparent'],
  ] as const)('paints the %s variant distinctly', (variant, expectedClass) => {
    const wrapper = mount(BaseButton, { global: withTranslations(), props: { variant } });

    expect(wrapper.classes()).toContain(expectedClass);
  });

  it.each([
    ['sm', 'px-3'],
    ['md', 'px-4'],
    ['lg', 'px-5'],
  ] as const)('sizes the %s variant distinctly', (size, expectedClass) => {
    const wrapper = mount(BaseButton, { global: withTranslations(), props: { size } });

    expect(wrapper.classes()).toContain(expectedClass);
  });

  it('stretches to the full width only when asked', () => {
    expect(mount(BaseButton, { global: withTranslations() }).classes()).toContain('inline-flex');
    expect(
      mount(BaseButton, { global: withTranslations(), props: { block: true } }).classes(),
    ).toContain('w-full');
  });

  it('carries a visible focus ring', () => {
    expect(mount(BaseButton, { global: withTranslations() }).classes()).toContain(
      'focus-visible:focus-ring',
    );
  });
});
