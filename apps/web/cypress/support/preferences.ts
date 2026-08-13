import type { InterfaceLanguage } from '../../app/i18n/language';
import { DARK_PAGE_BACKGROUND } from './appearance';

/**
 * Driving the two preference controls, now that neither is a `<select>`.
 *
 * They used to be, and every spec called `cy.select('dark')`. They are not any
 * more — the theme is a switch inside the account menu and the language is a
 * listbox that shows a flag alone — and the point of these helpers is that the
 * specs go on describing *what a reader does* rather than which element the
 * design settled on this month. The next time the header is rearranged, this
 * file changes and the specs that read it do not.
 */

/**
 * Where the theme control is, which depends on whether anybody is signed in.
 *
 * On the sign-in screens there is no account, so there is no account menu and
 * the switch sits in the page. On every other screen it is inside the menu,
 * and the menu has to be opened first.
 */
function openThemeControl(signedIn: boolean): void {
  if (signedIn) {
    cy.get('[data-testid=user-menu]').click();
  }
}

/**
 * Waits for the switch to be telling the truth, and asserts that it is.
 *
 * Both halves matter, and they are the same line of code.
 *
 * The truth is the palette the page is painted in, and the switch shows *that*
 * rather than the stored preference — which is the whole reason `system`
 * resolves against the machine before it reaches the control. So this is a
 * real assertion: a switch reading "off" on a dark page is the defect the
 * resolver exists to prevent.
 *
 * It is also the wait. No HTTP request carries `prefers-color-scheme`, so the
 * server renders the switch in the light position for every reader who has
 * never chosen; the browser corrects it once it has run `matchMedia`. Reading
 * `aria-checked` without waiting for that would pass or fail depending on how
 * busy the machine is — and only on a dark machine, which is the configuration
 * least likely to be the one anybody runs the suite on.
 */
function expectSwitchToAgreeWithThePage(): void {
  cy.window().should((win) => {
    const painted = win.getComputedStyle(win.document.body).backgroundColor;
    const control = win.document.querySelector('[data-testid=theme-switch]');

    expect(control?.getAttribute('aria-checked')).to.equal(
      painted === DARK_PAGE_BACKGROUND ? 'true' : 'false',
    );
  });
}

/**
 * Moves the switch, which is only meaningful if it is not already there.
 *
 * Reading the position before pressing is what makes this an instruction —
 * "be dark" — rather than a press. A spec that pressed blind would turn the
 * page light in exactly the case it was trying to set up: a machine already
 * following dark.
 */
export function chooseTheme(scheme: 'light' | 'dark', options: { signedIn?: boolean } = {}): void {
  const wanted = scheme === 'dark' ? 'true' : 'false';

  openThemeControl(options.signedIn === true);
  expectSwitchToAgreeWithThePage();

  cy.get('[data-testid=theme-switch]').then((control) => {
    if (control.attr('aria-checked') !== wanted) {
      cy.wrap(control).click();
    }
  });

  cy.get('[data-testid=theme-switch]').should('have.attr', 'aria-checked', wanted);
}

/** Hands the decision back to the operating system. */
export function followSystemTheme(options: { signedIn?: boolean } = {}): void {
  openThemeControl(options.signedIn === true);

  cy.get('[data-testid=theme-system]').click();
  cy.get('[data-testid=theme-system]').should('have.attr', 'aria-pressed', 'true');
}

/** The position of the switch, once it has caught up with the page. */
export function expectThemeSwitch(
  scheme: 'light' | 'dark',
  options: { signedIn?: boolean } = {},
): void {
  openThemeControl(options.signedIn === true);
  expectSwitchToAgreeWithThePage();

  cy.get('[data-testid=theme-switch]').should(
    'have.attr',
    'aria-checked',
    scheme === 'dark' ? 'true' : 'false',
  );
}

/**
 * Opens the flag and picks a language out of it.
 *
 * Two steps rather than one, because that is what it now costs a reader — and
 * a helper that hid the opening would let the panel stop opening without a
 * single spec noticing.
 *
 * The assertion between the two presses is there so that a panel which failed
 * to open fails *here*, naming the control, rather than four commands later as
 * "expected to find a button saying Transcribe" on a screen that is still in
 * Spanish because nothing was ever chosen.
 */
export function chooseInterfaceLanguage(language: InterfaceLanguage): void {
  cy.get('[data-testid=language-toggle]').click();
  cy.get('[data-testid=language-toggle]').should('have.attr', 'aria-expanded', 'true');

  cy.get(`[data-testid=language-option-${language}]`).click();
  expectInterfaceLanguage(language);
}

/** Which flag the collapsed control is showing. */
export function expectInterfaceLanguage(language: InterfaceLanguage): void {
  cy.get('[data-testid=language-toggle]').should('have.attr', 'data-language', language);
}
