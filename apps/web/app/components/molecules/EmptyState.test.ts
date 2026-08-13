import { mount } from '@vue/test-utils';
import EmptyState from './EmptyState.vue';
import { withTranslations } from '../../i18n/testing';

describe('EmptyState', () => {
  it('renders the title and description it was given', () => {
    const wrapper = mount(EmptyState, {
      global: withTranslations(),
      props: {
        title: 'Todavía no tienes transcripciones',
        description: 'Sube un archivo de audio o graba desde el micrófono para empezar.',
      },
    });

    expect(wrapper.text()).toContain('Todavía no tienes transcripciones');
    expect(wrapper.text()).toContain('Sube un archivo de audio');
  });

  /*
   * "No tienes transcripciones" and "no hemos podido cargar tu historial" are
   * different facts. Showing the first when the request failed tells a user
   * their work is gone.
   */
  it('separates an empty history from a failed one', () => {
    const empty = mount(EmptyState, {
      global: withTranslations(),
      props: { title: 'Todavía no tienes transcripciones' },
    });
    expect(empty.attributes('role')).toBe('status');
    expect(empty.classes()).toContain('bg-surface');

    const failed = mount(EmptyState, {
      global: withTranslations(),
      props: { variant: 'error', title: 'No hemos podido cargar tu historial' },
    });
    expect(failed.attributes('role')).toBe('alert');
    expect(failed.classes()).toContain('bg-danger-soft');
  });

  it('offers an action only when one is given', () => {
    expect(
      mount(EmptyState, { global: withTranslations(), props: { title: 'Sin datos' } })
        .find('button')
        .exists(),
    ).toBe(false);

    const wrapper = mount(EmptyState, {
      global: withTranslations(),
      props: { title: 'Sin datos', actionLabel: 'Subir un archivo' },
    });
    expect(wrapper.find('button').text()).toBe('Subir un archivo');
  });

  it('emits action when the action is used', async () => {
    const wrapper = mount(EmptyState, {
      global: withTranslations(),
      props: { title: 'Sin datos', actionLabel: 'Reintentar' },
    });

    await wrapper.find('button').trigger('click');

    expect(wrapper.emitted('action')).toHaveLength(1);
  });

  it('omits the description when there is none', () => {
    const wrapper = mount(EmptyState, {
      global: withTranslations(),
      props: { title: 'Sin datos' },
    });

    expect(wrapper.findAll('p')).toHaveLength(1);
  });
});
