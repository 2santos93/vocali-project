/** `--color-surface-muted`, light half: #f4f7f9. */
export const LIGHT_PAGE_BACKGROUND = 'rgb(244, 247, 249)';

/** `--color-surface-muted`, dark half: #0c1319. */
export const DARK_PAGE_BACKGROUND = 'rgb(12, 19, 25)';

export function emulateSystemColorScheme(scheme: 'light' | 'dark'): void {
  cy.then(() =>
    Cypress.automation('remote:debugger:protocol', {
      command: 'Emulation.setEmulatedMedia',
      params: { features: [{ name: 'prefers-color-scheme', value: scheme }] },
    }),
  );
}

export function expectPageBackground(expected: string): void {
  cy.window().should((win) => {
    expect(win.getComputedStyle(win.document.body).backgroundColor).to.equal(expected);
  });
}
