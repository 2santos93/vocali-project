import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import AuthFormPanel from './AuthFormPanel.vue';
import { withTranslations } from '../../i18n/testing';

function mountPanel(
  props: Record<string, unknown> = {},
  slots: Record<string, string> = {},
): VueWrapper {
  return mount(AuthFormPanel, {
    global: withTranslations(),
    props: { title: 'Iniciar sesión', ...props },
    slots: { default: '<form data-testid="fields"></form>', ...slots },
  });
}

describe('AuthFormPanel', () => {
  it('names the screen with the page heading', () => {
    // Every authentication screen renders with `layout: false`, so this is the
    // only h1 on the page and the document would otherwise have none.
    expect(mountPanel().find('h1').text()).toBe('Iniciar sesión');
  });

  it('renders the form it was given', () => {
    expect(mountPanel().find('[data-testid="fields"]').exists()).toBe(true);
  });

  it('omits the description when there is none, rather than leaving a gap', () => {
    const wrapper = mountPanel();

    expect(wrapper.findAll('p').some((p) => p.text() === '')).toBe(false);
  });

  it('shows a description when the page supplies one', () => {
    const wrapper = mountPanel({ description: 'Accede con la cuenta de tu centro.' });

    expect(wrapper.text()).toContain('Accede con la cuenta de tu centro.');
  });

  it('shows nothing where the alerts go until there is something to say', () => {
    expect(mountPanel().find('[data-testid="alert-banner"]').exists()).toBe(false);
  });

  /*
   * A failure interrupts. `role="alert"` carries an implicit assertive live
   * region, so a screen reader announces it as it appears rather than when the
   * field is next focused — which for a sign-in failure is never, because the
   * user is looking at a form that appears to have done nothing.
   */
  it('announces a failure assertively', () => {
    const wrapper = mountPanel({ error: 'El correo o la contraseña no son correctos.' });

    const alert = wrapper.find('[data-testid="alert-banner"]');
    expect(alert.text()).toContain('El correo o la contraseña no son correctos.');
    expect(alert.attributes('role')).toBe('alert');
  });

  it('announces an acknowledgement politely', () => {
    const wrapper = mountPanel({ notice: 'Te hemos enviado un código nuevo.' });

    // Not assertive: cutting across whatever the reader is saying in order to
    // confirm something that went right teaches the user to ignore the one
    // announcement that had to be heard.
    expect(wrapper.find('[data-testid="alert-banner"]').attributes('role')).toBe('status');
  });

  it('shows a failure and an acknowledgement together when both apply', () => {
    const wrapper = mountPanel({ error: 'El código no es correcto.', notice: 'Código reenviado.' });

    expect(wrapper.findAll('[data-testid="alert-banner"]')).toHaveLength(2);
  });

  it('places the messages above the fields, where they will be read', () => {
    const wrapper = mountPanel({ error: 'Algo ha fallado.' });

    const html = wrapper.html();
    // A message below the submit button is a message the user scrolls past.
    expect(html.indexOf('data-testid="alert-banner"')).toBeLessThan(
      html.indexOf('data-testid="fields"'),
    );
  });

  it('renders the footer the page supplies', () => {
    const wrapper = mountPanel({}, { footer: '<a href="/register">Crear una cuenta</a>' });

    expect(wrapper.find('a[href="/register"]').text()).toBe('Crear una cuenta');
  });
});
