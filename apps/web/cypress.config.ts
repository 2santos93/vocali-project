import { defineConfig } from 'cypress';

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
