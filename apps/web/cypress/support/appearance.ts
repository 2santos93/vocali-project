/**
 * The colours are written out rather than read from the stylesheet on purpose:
 * a test that asked the page for its own token and compared it to itself would
 * pass on a page with no theme at all. These restate what `tokens.css`
 * declares, so changing one without the other is a failure.
 */

/** `--color-surface-muted`, light half: #f4f7f9. */
export const LIGHT_PAGE_BACKGROUND = 'rgb(244, 247, 249)';

/** `--color-surface-muted`, dark half: #0c1319. */
export const DARK_PAGE_BACKGROUND = 'rgb(12, 19, 25)';

/**
 * The one input the server cannot see, which is why the default is expressed
 * in CSS rather than in a class the server writes. Driving it is the only way
 * to prove the default is the machine's choice and not a hard-coded light.
 */
export function emulateSystemColorScheme(scheme: 'light' | 'dark'): void {
  /*
   * Inside `cy.then`, not beside it. `Cypress.automation` starts the moment it
   * is called, and a test body runs top to bottom before a single queued
   * command does — so called directly, every emulation in a test applies at
   * the start and the last one wins, while the visit in between sees the wrong
   * preference.
   */
  cy.then(() =>
    Cypress.automation('remote:debugger:protocol', {
      command: 'Emulation.setEmulatedMedia',
      params: { features: [{ name: 'prefers-color-scheme', value: scheme }] },
    }),
  );
}

/**
 * Two details, both learned by watching this fail.
 *
 * The window comes from `cy.window()`, not the spec's own, which belongs to
 * the runner: asking that one to compute a style for an element in another
 * document answers with the runner's media state, so an emulated
 * `prefers-color-scheme` would silently have no effect.
 *
 * The read is inside `should`, not `then`, so it is retried: choosing a theme
 * is a reactive update and a reload is a new document.
 */
export function expectPageBackground(expected: string): void {
  cy.window().should((win) => {
    expect(win.getComputedStyle(win.document.body).backgroundColor).to.equal(expected);
  });
}
