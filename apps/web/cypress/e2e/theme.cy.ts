import {
  DARK_PAGE_BACKGROUND,
  LIGHT_PAGE_BACKGROUND,
  emulateSystemColorScheme,
  expectPageBackground,
} from '../support/appearance';
import { chooseTheme, expectThemeSwitch, followSystemTheme } from '../support/preferences';
import { signInOnTheWayTo } from '../support/session';
import { buildTranscriptions } from '../support/transcriptions';

/**
 * Journey 8: reading the application in the light or the dark.
 *
 * Almost none of this is reachable from a unit test. The rules are pure and
 * covered in `app/utils/theme.test.ts`, but everything that makes the feature
 * worth having is a property of the running application: that the cookie
 * survives a reload, that the *server* reads it and puts the class in the HTML
 * it sends, that a browser with no cookie follows the machine, and that the
 * palette the tokens describe is the palette the page is actually painted in.
 *
 * The colour assertions are the ones that would catch the whole mechanism
 * being wired up and having no effect: a class on `<html>` that no stylesheet
 * keys on is a passing test and a white screen.
 *
 * The control itself is a switch now, and a switch has two positions where the
 * preference has three values — so `chooseTheme` reads the position before it
 * presses, and the way back to the machine is a control of its own. On the
 * sign-in screens it sits in the page; everywhere else it is inside the
 * account menu, which is what `signedIn` opens.
 */

describe('Choosing a theme', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/transcriptions*', {
      statusCode: 200,
      body: { items: buildTranscriptions(2, 1), nextCursor: null },
    }).as('history');
  });

  afterEach(() => {
    // The emulation belongs to the browser, not to the page, so it would leak
    // into whichever spec ran next.
    emulateSystemColorScheme('light');
  });

  it('follows the machine when nobody has chosen', () => {
    emulateSystemColorScheme('dark');
    cy.visit('/login');

    // No class at all: the absence is what hands the decision to the operating
    // system. A `theme-light` here would pin every reader who never opened the
    // control to the light palette on a machine that asked for the dark one.
    cy.get('html').should('not.have.class', 'theme-dark');
    cy.get('html').should('not.have.class', 'theme-light');
    expectPageBackground(DARK_PAGE_BACKGROUND);

    emulateSystemColorScheme('light');
    cy.reload();
    expectPageBackground(LIGHT_PAGE_BACKGROUND);
  });

  it('keeps a chosen theme across a reload', () => {
    cy.visit('/login');
    expectPageBackground(LIGHT_PAGE_BACKGROUND);

    chooseTheme('dark');

    cy.get('html').should('have.class', 'theme-dark');
    expectPageBackground(DARK_PAGE_BACKGROUND);

    cy.reload();

    cy.get('html').should('have.class', 'theme-dark');
    expectPageBackground(DARK_PAGE_BACKGROUND);
    expectThemeSwitch('dark');
  });

  /*
   * The point of the cookie, and the reason it is not `localStorage`.
   *
   * This asks the server for the page the way a browser would and reads the
   * markup it sent back, before a line of JavaScript has run. The class is
   * either in that markup or the first frame of every page load is painted in
   * the wrong theme and corrected a moment later — which is the only thing
   * anybody ever notices about a theme implementation.
   */
  it('is already in the HTML the server sends', () => {
    cy.visit('/login');
    chooseTheme('dark');
    cy.getCookie('vocali_theme').should('have.property', 'value', 'dark');

    cy.request('/login')
      .its('body')
      .should('match', /<html[^>]*\bclass="[^"]*theme-dark/);
  });

  /*
   * The third option earning its place. Someone who has chosen light is asking
   * to override a machine set to dark, and only an explicit class can say so —
   * which is why `system` is the absence of one and `light` is not.
   */
  it('lets an explicit choice overrule the machine, in both directions', () => {
    emulateSystemColorScheme('dark');
    cy.visit('/login');

    chooseTheme('light');
    cy.get('html').should('have.class', 'theme-light');
    expectPageBackground(LIGHT_PAGE_BACKGROUND);

    emulateSystemColorScheme('light');
    chooseTheme('dark');
    cy.get('html').should('have.class', 'theme-dark');
    expectPageBackground(DARK_PAGE_BACKGROUND);
  });

  it('offers the way back to the machine once a choice has been made', () => {
    emulateSystemColorScheme('dark');
    cy.visit('/login');

    chooseTheme('light');
    expectPageBackground(LIGHT_PAGE_BACKGROUND);

    followSystemTheme();

    cy.get('html').should('not.have.class', 'theme-light');
    cy.get('html').should('not.have.class', 'theme-dark');
    expectPageBackground(DARK_PAGE_BACKGROUND);
  });

  /*
   * The value goes from a cookie into the `class` attribute of the root
   * element, and a cookie is set by whatever has the browser.
   */
  it('ignores a preference nobody offered', () => {
    cy.setCookie('vocali_theme', 'sepia');
    cy.visit('/login');

    cy.get('html').should('not.have.class', 'sepia');
    cy.get('html').should('not.have.class', 'theme-dark');
    expectPageBackground(LIGHT_PAGE_BACKGROUND);
  });

  it('belongs to the reader rather than the account, and survives signing in', () => {
    cy.visit('/login');
    chooseTheme('dark');

    signInOnTheWayTo('/historial');

    cy.get('html').should('have.class', 'theme-dark');
    expectPageBackground(DARK_PAGE_BACKGROUND);

    // Inside the account menu now, which is the other half of this test: the
    // control moved and the preference did not follow the session.
    expectThemeSwitch('dark', { signedIn: true });

    // The table is the densest thing in the application and the reason the dark
    // palette exists: it has to be readable, not merely dark.
    cy.get('[data-testid=history-row]').should('have.length', 2);
  });
});
