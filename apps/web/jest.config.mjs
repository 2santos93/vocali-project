import path from 'node:path';

const COMPONENTS_DIR = path.join(import.meta.dirname, 'app/components/');
const SERVER_DIR = path.join(import.meta.dirname, 'server/');
const SHELL_RULES_DIR = path.join(import.meta.dirname, 'app/utils/');
const MESSAGES_DIR = path.join(import.meta.dirname, 'app/i18n/');
const COMPOSABLES_DIR = path.join(import.meta.dirname, 'app/composables/');

export default {
  rootDir: import.meta.dirname,

  testEnvironment: 'jsdom',

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
    'app/composables/**/*.ts',
    'server/**/*.ts',
    '!**/*.test.ts',

    // A mount helper the tests use and nothing ships: covering it would mean
    // testing the test suite.
    '!app/i18n/testing.ts',

    '!server/utils/cognito-gateway.ts',
    '!server/utils/auth-runtime.ts',
    '!server/utils/http.ts',

    // Nitro entry points. Both are defined by an auto-import that only exists
    // inside the server build, so Jest cannot construct either one.
    '!server/api/**',
    '!server/plugins/**',
  ],

  coverageThreshold: {
    [COMPONENTS_DIR]: { statements: 95, branches: 84, functions: 100, lines: 96 },

    [SERVER_DIR]: { statements: 100, branches: 100, functions: 100, lines: 100 },
    [SHELL_RULES_DIR]: { statements: 100, branches: 100, functions: 100, lines: 100 },

    [MESSAGES_DIR]: { statements: 100, branches: 100, functions: 100, lines: 100 },

    [COMPOSABLES_DIR]: { statements: 99, branches: 98, functions: 100, lines: 99 },
  },
};
