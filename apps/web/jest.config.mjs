import path from 'node:path';

// Jest resolves a relative `coverageThreshold` key against `process.cwd()`,
// not `rootDir`, and silently ignores a key it cannot find while still exiting
// 0. Keyed absolutely, the threshold survives Jest being invoked from the
// repository root, which is what a CI job does.
const COMPONENTS_DIR = path.join(import.meta.dirname, 'app/components/');
const SERVER_DIR = path.join(import.meta.dirname, 'server/');
const SHELL_RULES_DIR = path.join(import.meta.dirname, 'app/utils/');
const MESSAGES_DIR = path.join(import.meta.dirname, 'app/i18n/');

export default {
  rootDir: import.meta.dirname,

  // The components are pure Vue, so they mount in jsdom with no Nuxt runtime,
  // no server and no network. That is the whole reason the test brief's choice
  // of Jest is affordable here.
  testEnvironment: 'jsdom',

  moduleFileExtensions: ['ts', 'js', 'mjs', 'json', 'vue'],

  // The server's own modules are covered here too. They are written against
  // plain values and a `CookieJar` interface rather than against an `H3Event`,
  // precisely so the cookie flags, the refresh decision and the proxy's
  // pass-through can be asserted without booting Nitro or reaching AWS. Each
  // of those files declares `@jest-environment node`, since none of them has
  // any business touching a DOM.
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
    // `app/utils` holds the rules the shell applies rather than the Nuxt calls
    // that apply them — which route a visitor may see, and nothing that needs
    // a runtime to decide it.
    'app/utils/**/*.ts',
    // The catalogues and the translator. Pure, and the one place every
    // user-facing sentence in the application is written down.
    'app/i18n/**/*.ts',
    'server/**/*.ts',
    '!**/*.test.ts',

    // A mount helper the tests use and nothing ships. Excluded rather than
    // exercised: covering it would mean testing the test suite.
    '!app/i18n/testing.ts',

    /*
     * Three adapters, excluded because they are the places where this package
     * touches something a test cannot stand in for, and because they were
     * written thin on purpose so that exclusion costs nothing.
     *
     * `cognito-gateway` is the AWS SDK call sites; `auth-runtime` reads the
     * client secret from Parameter Store; `http` is the four-line bridge from
     * `H3Event` to the `CookieJar` interface everything else is written
     * against. Every decision they would otherwise contain — which flags a
     * cookie carries, when to refresh, how a Cognito failure reads in Spanish,
     * what the proxy does with a status — lives in a module beside them that
     * is covered.
     *
     * The route handlers are excluded for the same reason and are the same
     * shape: parse, delegate, respond.
     */
    '!server/utils/cognito-gateway.ts',
    '!server/utils/auth-runtime.ts',
    '!server/utils/http.ts',
    '!server/api/**',
  ],

  /*
   * Branches sit lower than the other three, and the gap is measured rather
   * than guessed. Coverage is collected on the compiled single file
   * component, and @vue/vue3-jest forces an ES5 target, so every template
   * containing hoisted static children carries a copy of TypeScript's
   * `__spreadArray` helper. Its four branches can never all be taken from a
   * component test. Four of the eleven components pay that cost; the rest
   * report 100%.
   *
   * The figures for the finished design system are 96.69 / 86.86 / 100 /
   * 97.69, and every uncovered line in the report sits inside that helper.
   * The thresholds are set just under those numbers. The branch figure also
   * has to survive a smaller set of files, where the fixed penalty weighs
   * more: four components alone measure 84.21.
   */
  coverageThreshold: {
    [COMPONENTS_DIR]: { statements: 95, branches: 84, functions: 100, lines: 96 },

    /*
     * The server's logic carries no such penalty — it is plain TypeScript with
     * no template compilation — so it is held to the full figure. These are
     * the modules that decide whether a token is exposed to script, whether a
     * signed-out session is really over, and whether an error message answers
     * a question the caller has not earned. A gap in the report here is a
     * branch of one of those decisions that nothing exercises.
     */
    [SERVER_DIR]: { statements: 100, branches: 100, functions: 100, lines: 100 },
    [SHELL_RULES_DIR]: { statements: 100, branches: 100, functions: 100, lines: 100 },

    /*
     * The same figure, for the same reason. Two of these files are data and
     * reach 100% by being imported, which is the point: the threshold is here
     * so that the translator's own branches — a key with no message, a
     * placeholder with no value — are exercised rather than assumed, since
     * those are the two ways a reader ends up looking at nothing.
     */
    [MESSAGES_DIR]: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
