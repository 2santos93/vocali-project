/**
 * What the two themes actually look like, and how to pretend the machine has a
 * preference.
 *
 * The colours are written out rather than read from the stylesheet on purpose.
 * A test that asked the page for its own token and compared it to itself would
 * pass on a page with no theme at all; these are the two values `tokens.css`
 * declares for `--color-surface-muted`, restated here so that changing one
 * without the other is a failure rather than a silent redesign.
 */

/** `--color-surface-muted`, light half: #f4f7f9. */
export const LIGHT_PAGE_BACKGROUND = 'rgb(244, 247, 249)';

/** `--color-surface-muted`, dark half: #0c1319. */
export const DARK_PAGE_BACKGROUND = 'rgb(12, 19, 25)';

/**
 * Sets `prefers-color-scheme` for the browser under test.
 *
 * This is the one input the server genuinely cannot see — no HTTP request
 * carries it — so it is the reason the default is expressed in CSS rather than
 * in a class the server writes. Driving it is the only way to prove that the
 * default is the machine's choice and not a hard-coded light theme.
 */
export function emulateSystemColorScheme(scheme: 'light' | 'dark'): void {
  /*
   * Inside `cy.then`, not beside it. `Cypress.automation` starts the moment it
   * is called, and a test body runs top to bottom before a single queued
   * command does — so called directly, every emulation in a test would be
   * applied at the start of it and the last one would win. The visit that was
   * supposed to happen in between would see the wrong preference, and the
   * assertion after it would fail for a reason that has nothing to do with the
   * application.
   */
  cy.then(() =>
    Cypress.automation('remote:debugger:protocol', {
      command: 'Emulation.setEmulatedMedia',
      params: { features: [{ name: 'prefers-color-scheme', value: scheme }] },
    }),
  );
}

/**
 * Asserts the colour the page is actually painted in.
 *
 * Two details, both learned by watching this fail.
 *
 * The window comes from `cy.window()` rather than from the spec's own
 * `window`, which belongs to the test runner: asking that one to compute a
 * style for an element in another document answers with the runner's media
 * state, so an emulated `prefers-color-scheme` would silently have no effect.
 *
 * The read is inside `should`, not inside `then`, so it is retried. Choosing a
 * theme is a reactive update and a reload is a new document; a value read once,
 * immediately, is read before either has happened, and the test then fails or
 * passes depending on how busy the machine is.
 */
export function expectPageBackground(expected: string): void {
  cy.window().should((win) => {
    expect(win.getComputedStyle(win.document.body).backgroundColor).to.equal(expected);
  });
}
