import { mount } from '@vue/test-utils';
import type { DOMWrapper, VueWrapper } from '@vue/test-utils';
import { withTranslations } from '../../i18n/testing';
import type { InterfaceLanguage } from '../../i18n/language';
import UserMenu from './UserMenu.vue';

const EMAIL = 'ana.torres@clinicavocali.es';

/**
 * Attached to the document, because the ways this closes — a click elsewhere,
 * Escape, the focus moving on — are listeners on `document`, and an event
 * dispatched inside a detached fragment never reaches it.
 */
function mountMenu(
  props: Record<string, unknown> = {},
  language: InterfaceLanguage = 'es',
): VueWrapper {
  return mount(UserMenu, {
    global: withTranslations(language),
    props: { email: EMAIL, preference: 'system', dark: false, ...props },
    attachTo: document.body,
  });
}

const button = (wrapper: VueWrapper): DOMWrapper<Element> =>
  wrapper.find('[data-testid=user-menu]');
const address = (wrapper: VueWrapper): DOMWrapper<Element> =>
  wrapper.find('[data-testid=signed-in-user]');
const signOut = (wrapper: VueWrapper): DOMWrapper<Element> =>
  wrapper.find('[data-testid=sign-out]');

async function open(wrapper: VueWrapper): Promise<void> {
  await button(wrapper).trigger('click');
}

describe('UserMenu', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows an initial and nothing else until it is opened', () => {
    const wrapper = mountMenu();

    expect(button(wrapper).text()).toBe('A');
    expect(button(wrapper).attributes('aria-expanded')).toBe('false');
    expect(address(wrapper).exists()).toBe(false);
    expect(signOut(wrapper).exists()).toBe(false);
  });

  /*
   * A lone letter is not a name. The button carries the whole address, so a
   * screen reader user is told whose account this opens rather than being read
   * the initial and left to guess.
   */
  it.each([
    ['es', `Cuenta de ${EMAIL}`],
    ['en', `Account for ${EMAIL}`],
  ] as const)('is named by the address it belongs to, reading %s', (language, expected) => {
    expect(button(mountMenu({}, language)).attributes('aria-label')).toBe(expected);
  });

  /*
   * The layout only renders this for a signed-in user, so an empty address is
   * not reachable in practice. A question mark rather than a blank circle
   * anyway: a blank one reads as a rendering fault.
   */
  it('says it does not know rather than showing an empty circle', () => {
    expect(button(mountMenu({ email: '  ' })).text()).toBe('?');
  });

  /*
   * The reason the flat header truncated it and this does not: somebody
   * opening this menu is checking which account they are in, and half an
   * address does not answer that.
   */
  it('shows the whole address once it is open', async () => {
    const wrapper = mountMenu();

    await open(wrapper);

    expect(address(wrapper).text()).toBe(EMAIL);
    expect(address(wrapper).classes()).not.toContain('truncate');
    expect(button(wrapper).attributes('aria-expanded')).toBe('true');
  });

  it('holds the theme, and passes on what was chosen', async () => {
    const wrapper = mountMenu({ preference: 'system', dark: true });

    await open(wrapper);

    // The switch shows the palette on screen, not the preference.
    expect(wrapper.find('[data-testid=theme-switch]').attributes('aria-checked')).toBe('true');

    await wrapper.find('[data-testid=theme-switch]').trigger('click');

    expect(wrapper.emitted('update:preference')).toEqual([['light']]);
  });

  it('offers the way back to the machine too', async () => {
    const wrapper = mountMenu({ preference: 'dark', dark: true });

    await open(wrapper);
    await wrapper.find('[data-testid=theme-system]').trigger('click');

    expect(wrapper.emitted('update:preference')).toEqual([['system']]);
  });

  it('reports a sign-out rather than performing one', async () => {
    const wrapper = mountMenu();

    await open(wrapper);
    await signOut(wrapper).trigger('click');

    expect(wrapper.emitted('sign-out')).toHaveLength(1);
  });

  /*
   * The menu stays open while the request is in flight. Closing it on the
   * press would take the spinner with it and leave a header that looks idle
   * while a sign-out is happening; the session ending is what replaces this.
   */
  it('shows the sign-out running, and refuses to send a second one', async () => {
    const wrapper = mountMenu({ signingOut: true });

    await open(wrapper);

    expect(signOut(wrapper).attributes('disabled')).toBeDefined();
    expect(signOut(wrapper).attributes('aria-busy')).toBe('true');
    expect(wrapper.find('[data-testid=spinner-icon]').exists()).toBe(true);

    await signOut(wrapper).trigger('click');

    expect(wrapper.emitted('sign-out')).toBeUndefined();
  });

  it('reads in Spanish and in English', async () => {
    const spanish = mountMenu({}, 'es');
    await open(spanish);
    expect(signOut(spanish).text()).toContain('Cerrar sesión');
    spanish.unmount();

    const english = mountMenu({}, 'en');
    await open(english);
    expect(signOut(english).text()).toContain('Sign out');
  });

  it('closes on Escape and hands the focus back to the button', async () => {
    const wrapper = mountMenu();
    await open(wrapper);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(address(wrapper).exists()).toBe(false);
    expect(document.activeElement).toBe(button(wrapper).element);
  });

  it('closes when something else on the page is clicked', async () => {
    const wrapper = mountMenu();
    await open(wrapper);

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(address(wrapper).exists()).toBe(false);
  });

  it('closes again when its own button is pressed twice', async () => {
    const wrapper = mountMenu();

    await open(wrapper);
    await open(wrapper);

    expect(address(wrapper).exists()).toBe(false);
  });

  /*
   * `role="menu"` would promise arrow-key navigation these controls do not
   * implement. Left as ordinary controls in a panel, Tab walks them in order
   * and each announces what it actually is — a switch, a button.
   */
  it('does not claim to be a menu it has no keyboard contract for', async () => {
    const wrapper = mountMenu();
    await open(wrapper);

    expect(wrapper.find('[role=menu]').exists()).toBe(false);
    expect(wrapper.find('[role=menuitem]').exists()).toBe(false);
  });

  it('lets a second one exist without colliding ids', async () => {
    const wrapper = mountMenu({ id: 'user-menu-footer' });

    expect(button(wrapper).attributes('id')).toBe('user-menu-footer');
    expect(button(wrapper).attributes('aria-controls')).toBe('user-menu-footer-panel');

    await open(wrapper);

    expect(wrapper.find('#user-menu-footer-panel').exists()).toBe(true);
  });

  /*
   * The twin of the assertion in `LanguageToggle.test.ts`, and a literal in
   * both for the same reason: the two buttons sit side by side and hold
   * contents of different sizes, so a height derived from padding leaves one
   * taller than the other.
   */
  it('is the same height as the language control beside it', () => {
    expect(button(mountMenu()).classes()).toContain('h-9');
  });

  it('carries a visible focus ring on the button and on the sign-out', async () => {
    const wrapper = mountMenu();

    expect(button(wrapper).classes()).toContain('focus-visible:focus-ring');

    await open(wrapper);

    expect(signOut(wrapper).classes()).toContain('focus-visible:focus-ring');
  });
});
