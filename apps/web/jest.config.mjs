import path from 'node:path';

// Jest resolves a relative `coverageThreshold` key against `process.cwd()`,
// not `rootDir`, and silently ignores a key it cannot find while still exiting
// 0. Keyed absolutely, the threshold survives Jest being invoked from the
// repository root, which is what a CI job does.
const COMPONENTS_DIR = path.join(import.meta.dirname, 'app/components/');
const SERVER_DIR = path.join(import.meta.dirname, 'server/');
const SHELL_RULES_DIR = path.join(import.meta.dirname, 'app/utils/');
const MESSAGES_DIR = path.join(import.meta.dirname, 'app/i18n/');
const COMPOSABLES_DIR = path.join(import.meta.dirname, 'app/composables/');

export default {
  rootDir: import.meta.dirname,

  testEnvironment: 'jsdom',

  /*
   * jsdom asks packages for their `browser` build, and a package shipping an
   * ES module there — `vue-i18n` does — reaches Jest as an `import` inside
   * `node_modules`, which it cannot parse. `node` puts it back on the
   * CommonJS entry point, and nothing here wanted the `browser` build anyway.
   */
  testEnvironmentOptions: { customExportConditions: ['node'] },

  moduleFileExtensions: ['ts', 'js', 'mjs', 'json', 'vue'],

  // The server's own modules are covered here too; each of those files
  // declares `@jest-environment node`, since none of them touches a DOM.
  testMatch: ['<rootDir>/app/**/*.test.ts', '<rootDir>/server/**/*.test.ts'],

  moduleNameMapper: {
    // The workspace compiles with `verbatimModuleSyntax`, so relative imports
    // carry a `.js` extension that the on-the-fly transform must strip.
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^~/(.*)$': '<rootDir>/app/$1',
  },

  transform: {
    '^.+\\.vue$': '@vue/vue3-jest',
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          // Jest runs CommonJS here, and `bundler` resolution is only legal
          // alongside an ES module target.
          module: 'CommonJS',
          moduleResolution: 'Node10',
          verbatimModuleSyntax: false,
        },
      },
    ],
  },

  collectCoverageFrom: [
    'app/components/**/*.vue',
    'app/utils/**/*.ts',
    'app/i18n/**/*.ts',
    // Left out of this list the composables reported no rows at all, so the
    // branch deciding whether a dictation is offered back after a dropped
    // connection was neither covered nor visibly uncovered.
    'app/composables/**/*.ts',
    'server/**/*.ts',
    '!**/*.test.ts',

    // A mount helper the tests use and nothing ships: covering it would mean
    // testing the test suite.
    '!app/i18n/testing.ts',

    /*
     * Three adapters and the route handlers, excluded because they touch what
     * a test cannot stand in for and were written thin on purpose. Every
     * decision they would otherwise contain — cookie flags, when to refresh,
     * how a Cognito failure reads, what the proxy does with a status — lives
     * in a module beside them that is covered.
     */
    '!server/utils/cognito-gateway.ts',
    '!server/utils/auth-runtime.ts',
    '!server/utils/http.ts',
    '!server/api/**',
  ],

  /*
   * Branches sit lower than the other three, and the gap is measured rather
   * than guessed: @vue/vue3-jest forces an ES5 target, so a template with
   * hoisted static children carries TypeScript's `__spreadArray` helper, whose
   * four branches can never all be taken from a component test. Every
   * uncovered line in the report sits inside that helper.
   */
  coverageThreshold: {
    [COMPONENTS_DIR]: { statements: 95, branches: 84, functions: 100, lines: 96 },

    /*
     * Plain TypeScript, no template-compilation penalty, so the full figure.
     * These modules decide whether a token is exposed to script, whether a
     * signed-out session is really over, and whether an error answers a
     * question the caller has not earned.
     */
    [SERVER_DIR]: { statements: 100, branches: 100, functions: 100, lines: 100 },
    [SHELL_RULES_DIR]: { statements: 100, branches: 100, functions: 100, lines: 100 },

    /*
     * Two of these files are data and reach 100% by being imported, which is
     * the point: the threshold exists so the translator's own branches — a key
     * with no message, a placeholder with no value — are exercised rather than
     * assumed, since those are the two ways a reader sees nothing.
     */
    [MESSAGES_DIR]: { statements: 100, branches: 100, functions: 100, lines: 100 },

    /*
     * Two branches are deliberately not chased, both defensive and neither
     * reachable through the public surface: the throw guarding a promise
     * executor that did not run synchronously, and the duration measured to
     * the present moment when a dictation has no recorded end. Forcing either
     * would mean testing the doubles instead of the behaviour.
     */
    [COMPOSABLES_DIR]: { statements: 99, branches: 98, functions: 100, lines: 99 },
  },
};
