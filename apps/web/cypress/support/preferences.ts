import type { InterfaceLanguage } from '../../app/i18n/types';
import { DARK_PAGE_BACKGROUND } from './appearance';

/**
 * On the sign-in screens there is no account menu and the switch sits in the
 * page; on every other screen the menu has to be opened first.
 */
function openThemeControl(signedIn: boolean): void {
  if (signedIn) {
    cy.get('[data-testid=user-menu]').click();
  }
}

function expectSwitchToAgreeWithThePage(): void {
  cy.window().should((win) => {
    const painted = win.getComputedStyle(win.document.body).backgroundColor;
    const control = win.document.querySelector('[data-testid=theme-switch]');

    expect(control?.getAttribute('aria-checked')).to.equal(
      painted === DARK_PAGE_BACKGROUND ? 'true' : 'false',
    );
  });
}

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
