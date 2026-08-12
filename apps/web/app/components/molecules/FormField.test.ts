import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import BaseInput from '../atoms/BaseInput.vue';
import FormField from './FormField.vue';

const CONTROL_SLOT = `
  <template #default="slotProps">
    <BaseInput
      :id="slotProps.id"
      :described-by="slotProps.describedBy"
      :invalid="slotProps.invalid"
      model-value=""
    />
  </template>
`;

function mountField(props: Record<string, unknown> = {}): VueWrapper {
  return mount(FormField, {
    props: { id: 'correo', label: 'Correo electrónico', ...props },
    slots: { default: CONTROL_SLOT },
    global: { components: { BaseInput } },
  });
}

describe('FormField', () => {
  it('joins the label to the control', () => {
    const wrapper = mountField();

    expect(wrapper.find('label').attributes('for')).toBe('correo');
    expect(wrapper.find('input').attributes('id')).toBe('correo');
    expect(wrapper.find('label').text()).toContain('Correo electrónico');
  });

  it('describes nothing when there is nothing to describe', () => {
    const wrapper = mountField();

    expect(wrapper.find('input').attributes('aria-describedby')).toBeUndefined();
    expect(wrapper.find('input').attributes('aria-invalid')).toBeUndefined();
  });

  it('points the control at its hint', () => {
    const wrapper = mountField({ hint: 'Usaremos este correo para confirmar la cuenta.' });

    expect(wrapper.find('input').attributes('aria-describedby')).toBe('correo-hint');
    expect(wrapper.find('#correo-hint').text()).toBe(
      'Usaremos este correo para confirmar la cuenta.',
    );
  });

  /*
   * The reason the component exists. An error rendered beside a control but
   * not referenced by it is invisible to a screen reader: the user hears the
   * field name and no reason the form refused.
   */
  it('points the control at its error and marks it invalid', () => {
    const wrapper = mountField({ error: 'Introduce un correo electrónico válido.' });

    const input = wrapper.find('input');
    expect(input.attributes('aria-describedby')).toBe('correo-error');
    expect(input.attributes('aria-invalid')).toBe('true');

    const message = wrapper.find('#correo-error');
    expect(message.text()).toBe('Introduce un correo electrónico válido.');
    expect(message.attributes('role')).toBe('alert');
  });

  it('lists both ids, error last, when a hint and an error are shown together', () => {
    const wrapper = mountField({ hint: 'Mínimo 8 caracteres.', error: 'Es demasiado corta.' });

    expect(wrapper.find('input').attributes('aria-describedby')).toBe('correo-hint correo-error');
  });

  it('treats an empty error string as no error', () => {
    const wrapper = mountField({ error: '' });

    expect(wrapper.find('input').attributes('aria-invalid')).toBeUndefined();
    expect(wrapper.find('#correo-error').exists()).toBe(false);
  });

  it('derives the hint and error ids from the field id, so they cannot drift', () => {
    const wrapper = mountField({ id: 'contrasena', hint: 'Mínimo 8 caracteres.', error: 'Corta.' });

    expect(wrapper.find('input').attributes('aria-describedby')).toBe(
      'contrasena-hint contrasena-error',
    );
  });

  it('marks a required field for sighted and non-sighted readers alike', () => {
    const optional = mountField();
    expect(optional.text()).not.toContain('(obligatorio)');

    const required = mountField({ required: true });
    expect(required.find('[aria-hidden="true"]').text()).toBe('*');
    expect(required.find('.sr-only').text()).toBe('(obligatorio)');
  });
});
