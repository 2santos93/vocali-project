import path from 'node:path';

// Jest resolves a relative `coverageThreshold` key against `process.cwd()`,
// not `rootDir`, and silently ignores a key it cannot find while still exiting
// 0. Keyed absolutely, the threshold survives Jest being invoked from the
// repository root, which is what a CI job does.
const COMPONENTS_DIR = path.join(import.meta.dirname, 'app/components/');

export default {
  rootDir: import.meta.dirname,

  // The components are pure Vue, so they mount in jsdom with no Nuxt runtime,
  // no server and no network. That is the whole reason the test brief's choice
  // of Jest is affordable here.
  testEnvironment: 'jsdom',

  moduleFileExtensions: ['ts', 'js', 'mjs', 'json', 'vue'],
  testMatch: ['<rootDir>/app/**/*.test.ts'],

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

  collectCoverageFrom: ['app/components/**/*.vue'],

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
  },
};
