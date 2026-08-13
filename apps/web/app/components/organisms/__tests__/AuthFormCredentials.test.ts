import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import AuthFormCredentials from '../AuthFormCredentials.vue';
import { withTranslations } from '../../../i18n/testing';

function mountForm(props: Record<string, unknown> = {}): VueWrapper {
  return mount(AuthFormCredentials, {
    global: withTranslations(),
    props: {
      email: '',
      password: '',
      submitLabel: 'Entrar',
      passwordAutocomplete: 'current-password',
      ...props,
    },
  });
}

describe('AuthFormCredentials', () => {
  it('reports what was typed without holding it', async () => {
    const wrapper = mountForm();

    await wrapper.findAll('input')[0]?.setValue('ana@example.com');
    await wrapper.findAll('input')[1]?.setValue('Abcd1234!');

    expect(wrapper.emitted('update:email')).toStrictEqual([['ana@example.com']]);
    expect(wrapper.emitted('update:password')).toStrictEqual([['Abcd1234!']]);
  });

  it('submits when both fields are filled', async () => {
    const wrapper = mountForm({ email: 'ana@example.com', password: 'Abcd1234!' });

    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')).toHaveLength(1);
  });

  it('submits from the form itself rather than only from the button', async () => {
    const wrapper = mountForm({ email: 'ana@example.com', password: 'Abcd1234!' });

    expect(wrapper.find('button[type="submit"]').exists()).toBe(true);

    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')).toHaveLength(1);
  });

  it('says nothing about empty fields until the form is submitted', () => {
    const wrapper = mountForm();

    expect(wrapper.text()).not.toContain('Introduce tu correo electrónico.');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('refuses an empty submission and says which field is missing', async () => {
    const wrapper = mountForm({ password: 'Abcd1234!' });

    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.text()).toContain('Introduce tu correo electrónico.');
    expect(wrapper.findAll('input')[0]?.attributes('aria-invalid')).toBe('true');
  });

  it('treats an address of only spaces as missing', async () => {
    const wrapper = mountForm({ email: '   ', password: 'Abcd1234!' });

    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  it('refuses a missing password and names it', async () => {
    const wrapper = mountForm({ email: 'ana@example.com' });

    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.text()).toContain('Introduce tu contraseña.');
  });

  it('submits once the missing field is supplied', async () => {
    const wrapper = mountForm({ password: 'Abcd1234!' });

    await wrapper.find('form').trigger('submit');
    await wrapper.setProps({ email: 'ana@example.com' });
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')).toHaveLength(1);
  });

  it('carries the autocomplete token the surrounding page asked for', () => {
    // `new-password` asks a password manager to generate one;
    // `current-password` asks it to fill the one it holds.
    const signIn = mountForm({ passwordAutocomplete: 'current-password' });
    expect(signIn.findAll('input')[1]?.attributes('autocomplete')).toBe('current-password');

    const register = mountForm({ passwordAutocomplete: 'new-password' });
    expect(register.findAll('input')[1]?.attributes('autocomplete')).toBe('new-password');
  });

  it('shows the password rule when the page supplies one', () => {
    const wrapper = mountForm({ passwordHint: 'Mínimo 8 caracteres.' });

    expect(wrapper.find('#auth-password-hint').text()).toBe('Mínimo 8 caracteres.');
    expect(wrapper.findAll('input')[1]?.attributes('aria-describedby')).toBe('auth-password-hint');
  });

  it('locks the fields and the button while a request is in flight', () => {
    const wrapper = mountForm({ email: 'ana@example.com', password: 'x', busy: true });

    for (const input of wrapper.findAll('input')) {
      expect(input.attributes('disabled')).toBeDefined();
    }

    const button = wrapper.find('button[type="submit"]');
    expect(button.attributes('disabled')).toBeDefined();
    expect(button.attributes('aria-busy')).toBe('true');
  });

  it('uses the label the page gives it', () => {
    expect(
      mountForm({ submitLabel: 'Crear cuenta' }).find('button[type="submit"]').text(),
    ).toContain('Crear cuenta');
  });

  it('names the missing fields in English for a reader who chose it', async () => {
    const wrapper = mount(AuthFormCredentials, {
      global: withTranslations('en'),
      props: {
        email: '',
        password: '',
        submitLabel: 'Sign in',
        passwordAutocomplete: 'current-password',
      },
    });

    await wrapper.find('form').trigger('submit');

    expect(wrapper.text()).toContain('Enter your email address.');
    expect(wrapper.text()).toContain('Enter your password.');
    expect(wrapper.find('label[for="auth-email"]').text()).toContain('Email address');
    expect(wrapper.emitted('submit')).toBeUndefined();
  });
});
