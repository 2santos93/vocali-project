import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import AuthFormConfirmation from './AuthFormConfirmation.vue';
import { withTranslations } from '../../i18n/testing';

function mountForm(props: Record<string, unknown> = {}): VueWrapper {
  return mount(AuthFormConfirmation, {
    global: withTranslations(),
    props: { email: 'ana@example.com', code: '', ...props },
  });
}

describe('AuthFormConfirmation', () => {
  it('names the address the code was sent to', () => {
    // Without it, a user who mistyped their address at sign-up waits for a
    // message that will never arrive and has no way to see why.
    expect(mountForm().text()).toContain('ana@example.com');
  });

  it('reports the code as it is typed', async () => {
    const wrapper = mountForm();

    await wrapper.find('input').setValue('123456');

    expect(wrapper.emitted('update:code')).toStrictEqual([['123456']]);
  });

  it('submits a filled code', async () => {
    const wrapper = mountForm({ code: '123456' });

    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')).toHaveLength(1);
  });

  it('refuses an empty code and says so', async () => {
    const wrapper = mountForm();

    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.text()).toContain('Introduce el código que te hemos enviado.');
  });

  it('treats a code of only spaces as empty', async () => {
    const wrapper = mountForm({ code: '   ' });

    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  /*
   * The path a reviewer actually walks. A confirmation code expires while it
   * sits unread in an inbox, so "the code no longer works" is the ordinary
   * case — and a screen with no way to ask for another one is an account that
   * can never be used.
   */
  it('always offers a fresh code, not only after a failure', () => {
    const wrapper = mountForm();

    expect(wrapper.find('[data-testid="resend-code"]').exists()).toBe(true);
  });

  it('asks for a fresh code without submitting the form', async () => {
    const wrapper = mountForm();

    await wrapper.find('[data-testid="resend-code"]').trigger('click');

    expect(wrapper.emitted('resend')).toHaveLength(1);
    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  it('keeps the resend button out of the form submission', () => {
    // `type="button"`, or pressing Enter in the code field would resend
    // instead of confirming.
    expect(mountForm().find('[data-testid="resend-code"]').attributes('type')).toBe('button');
  });

  it('locks the code field and the confirm button while confirming', () => {
    const wrapper = mountForm({ code: '123456', busy: true });

    expect(wrapper.find('input').attributes('disabled')).toBeDefined();
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
  });

  it('leaves the code field usable while a new code is being sent', () => {
    const wrapper = mountForm({ resending: true });

    // The user may be typing the code from the previous message; locking the
    // field because a resend is in flight throws that away.
    expect(wrapper.find('input').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="resend-code"]').attributes('aria-busy')).toBe('true');
  });
});
