import { mount } from '@vue/test-utils';
import BaseInput from '../BaseInput.vue';
import { withTranslations } from '../../../i18n/testing';

describe('BaseInput', () => {
  it('carries the id it was given, so a label can point at it', () => {
    const wrapper = mount(BaseInput, {
      global: withTranslations(),
      props: { id: 'correo', modelValue: '' },
    });

    expect(wrapper.attributes('id')).toBe('correo');
  });

  it('renders the bound value', () => {
    const wrapper = mount(BaseInput, {
      global: withTranslations(),
      props: { id: 'correo', modelValue: 'paciente@ejemplo.es' },
    });

    expect((wrapper.element as HTMLInputElement).value).toBe('paciente@ejemplo.es');
  });

  /*
   * Through `find('input')`, not the component wrapper: `VueWrapper.setValue`
   * emits `update:modelValue` on the instance itself, so the assertion would
   * hold even if the component ignored the event entirely.
   */
  it('emits update:modelValue with what was typed', async () => {
    const wrapper = mount(BaseInput, {
      global: withTranslations(),
      props: { id: 'correo', modelValue: '' },
    });

    await wrapper.find('input').setValue('doctora@hospital.es');

    expect(wrapper.emitted('update:modelValue')).toEqual([['doctora@hospital.es']]);
  });

  it('emits blur, which is what triggers field-level validation', async () => {
    const wrapper = mount(BaseInput, {
      global: withTranslations(),
      props: { id: 'correo', modelValue: '' },
    });

    await wrapper.trigger('blur');

    expect(wrapper.emitted('blur')).toHaveLength(1);
  });

  it('defaults to a text input and accepts another type', () => {
    expect(
      mount(BaseInput, {
        global: withTranslations(),
        props: { id: 'a', modelValue: '' },
      }).attributes('type'),
    ).toBe('text');
    expect(
      mount(BaseInput, {
        global: withTranslations(),
        props: { id: 'a', modelValue: '', type: 'password' },
      }).attributes('type'),
    ).toBe('password');
  });

  it('announces invalidity as well as painting it', () => {
    const valid = mount(BaseInput, {
      global: withTranslations(),
      props: { id: 'a', modelValue: '' },
    });
    expect(valid.attributes('aria-invalid')).toBeUndefined();
    expect(valid.classes()).toContain('border-line');

    const invalid = mount(BaseInput, {
      global: withTranslations(),
      props: { id: 'a', modelValue: '', invalid: true },
    });
    expect(invalid.attributes('aria-invalid')).toBe('true');
    expect(invalid.classes()).toContain('border-danger-line');
  });

  it('points at the description it was given, and omits the attribute otherwise', () => {
    const plain = mount(BaseInput, {
      global: withTranslations(),
      props: { id: 'a', modelValue: '' },
    });
    expect(plain.attributes('aria-describedby')).toBeUndefined();

    const described = mount(BaseInput, {
      global: withTranslations(),
      props: { id: 'a', modelValue: '', describedBy: 'a-hint a-error' },
    });
    expect(described.attributes('aria-describedby')).toBe('a-hint a-error');
  });

  it('passes through the remaining native attributes', () => {
    const wrapper = mount(BaseInput, {
      global: withTranslations(),
      props: {
        id: 'a',
        modelValue: '',
        placeholder: 'nombre@hospital.es',
        autocomplete: 'email',
        required: true,
        disabled: true,
      },
    });

    expect(wrapper.attributes('placeholder')).toBe('nombre@hospital.es');
    expect(wrapper.attributes('autocomplete')).toBe('email');
    expect(wrapper.attributes('required')).toBeDefined();
    expect(wrapper.attributes('disabled')).toBeDefined();
  });

  it('carries a visible focus ring', () => {
    expect(
      mount(BaseInput, {
        global: withTranslations(),
        props: { id: 'a', modelValue: '' },
      }).classes(),
    ).toContain('focus-visible:focus-ring');
  });
});
