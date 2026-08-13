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
 * One spec per journey lives in `cypress/e2e/`. They run against a built
 * application (`pnpm --filter @vocali/web preview`) with every call to
 * `/api/**` answered by `cy.intercept`, so the suite reaches no network and no
 * AWS: what it proves is everything the browser does, which is the half no
 * unit test can see.
 */
export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    specPattern: 'cypress/e2e/**/*.cy.ts',

    /*
     * No support file, deliberately. What the specs share lives in
     * `cypress/support/*.ts` and is imported by name, so a spec's dependencies
     * are visible at the top of the spec rather than arriving from a file it
     * never mentions — and a helper nothing imports is dead code the reader
     * can see is dead.
     */
    supportFile: false,

    viewportWidth: 1280,
    viewportHeight: 800,

    // A recording of a run that already reported its failure in the log is
    // storage nobody opens.
    video: false,
  },
});
