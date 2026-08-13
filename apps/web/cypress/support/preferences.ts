import type { InterfaceLanguage } from '../../app/i18n/types';
import { DARK_PAGE_BACKGROUND } from './appearance';

/**
 * The specs describe what a reader does rather than which element the design
 * settled on: the next time the header is rearranged, this file changes and
 * the specs that read it do not.
 */

/**
 * On the sign-in screens there is no account menu and the switch sits in the
 * page; on every other screen the menu has to be opened first.
 */
function openThemeControl(signedIn: boolean): void {
  if (signedIn) {
    cy.get('[data-testid=user-menu]').click();
  }
}

/**
 * Both an assertion and a wait, in one line.
 *
 * The assertion: a switch reading "off" on a dark page is the defect the
 * resolver exists to prevent. The wait: no HTTP request carries
 * `prefers-color-scheme`, so the server renders the light position and the
 * browser corrects it once it has run `matchMedia`. Reading `aria-checked`
 * without waiting passes or fails depending on how busy the machine is, and
 * only on a dark machine.
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
 * Reading the position before pressing makes this an instruction — "be dark" —
 * rather than a press. Pressing blind turns the page light in exactly the case
 * it was setting up: a machine already following dark.
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
 * Two steps rather than one, because a helper that hid the opening would let
 * the panel stop opening without a single spec noticing. The assertion between
 * the presses makes a panel that failed to open fail *here*, naming the
 * control, rather than four commands later on a still-Spanish screen.
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
