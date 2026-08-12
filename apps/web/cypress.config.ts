import { defineConfig } from 'cypress';

/**
 * Cypress owns the journeys; Jest owns the components.
 *
 * The split is not a preference. Atoms, molecules and organisms are pure Vue
 * and mount under Vue Test Utils in milliseconds with no Nuxt runtime, which
 * is what makes the brief's choice of Jest workable. Pages do need the
 * runtime — routing, middleware, the server routes that hold the session
 * cookie — and booting that inside Jest is neither cheap nor faithful. Cypress
 * drives a real browser against a real Nuxt server instead.
 *
 * The specs themselves land with the pages they exercise; `cypress/e2e/` is
 * empty until then, so `pnpm e2e` has nothing to run yet and CI does not call
 * it.
 */
export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: false,
    viewportWidth: 1280,
    viewportHeight: 800,
    // A recording of a run that already reported its failure in the log is
    // storage nobody opens.
    video: false,
  },
});
