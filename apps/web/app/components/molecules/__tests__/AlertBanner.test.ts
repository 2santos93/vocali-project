import { mount } from '@vue/test-utils';
import AlertBanner from '../AlertBanner.vue';
import { withTranslations } from '../../../i18n/testing';

describe('AlertBanner', () => {
  it('renders the message, and the title only when there is one', () => {
    const plain = mount(AlertBanner, {
      global: withTranslations(),
      props: { message: 'Sesión iniciada.' },
    });
    expect(plain.text()).toBe('Sesión iniciada.');

    const titled = mount(AlertBanner, {
      global: withTranslations(),
      props: { title: 'No se pudo subir el archivo', message: 'Inténtalo de nuevo.' },
    });
    expect(titled.text()).toContain('No se pudo subir el archivo');
    expect(titled.text()).toContain('Inténtalo de nuevo.');
  });

  it.each([
    ['info', 'bg-info-soft'],
    ['success', 'bg-success-soft'],
    ['warning', 'bg-warning-soft'],
    ['error', 'bg-danger-soft'],
  ] as const)('paints the %s variant distinctly', (variant, expectedClass) => {
    const wrapper = mount(AlertBanner, {
      global: withTranslations(),
      props: { variant, message: 'Aviso.' },
    });

    expect(wrapper.classes()).toContain(expectedClass);
  });

  it.each([
    ['info', 'status'],
    ['success', 'status'],
    ['warning', 'alert'],
    ['error', 'alert'],
  ] as const)('announces the %s variant as %s', (variant, expectedRole) => {
    const wrapper = mount(AlertBanner, {
      global: withTranslations(),
      props: { variant, message: 'Aviso.' },
    });

    expect(wrapper.attributes('role')).toBe(expectedRole);
  });

  it('defaults to the informational variant', () => {
    const wrapper = mount(AlertBanner, {
      global: withTranslations(),
      props: { message: 'Aviso.' },
    });

    expect(wrapper.classes()).toContain('bg-info-soft');
    expect(wrapper.attributes('role')).toBe('status');
  });

  it('offers a dismiss control only when it is dismissible', () => {
    expect(
      mount(AlertBanner, { global: withTranslations(), props: { message: 'Aviso.' } })
        .find('[data-testid="alert-dismiss"]')
        .exists(),
    ).toBe(false);

    const dismissible = mount(AlertBanner, {
      global: withTranslations(),
      props: { message: 'Aviso.', dismissible: true },
    });
    expect(dismissible.find('[data-testid="alert-dismiss"]').attributes('aria-label')).toBe(
      'Cerrar aviso',
    );
  });

  it('emits dismiss rather than hiding itself', async () => {
    const wrapper = mount(AlertBanner, {
      global: withTranslations(),
      props: { message: 'Aviso.', dismissible: true },
    });

    await wrapper.find('[data-testid="alert-dismiss"]').trigger('click');

    expect(wrapper.emitted('dismiss')).toHaveLength(1);
    expect(wrapper.find('[data-testid="alert-banner"]').exists()).toBe(true);
  });

  it('gives the dismiss control a visible focus ring', () => {
    const wrapper = mount(AlertBanner, {
      global: withTranslations(),
      props: { message: 'Aviso.', dismissible: true },
    });

    expect(wrapper.find('[data-testid="alert-dismiss"]').classes()).toContain(
      'focus-visible:focus-ring',
    );
  });
});
