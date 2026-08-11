export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: { verbatimModuleSyntax: false } }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/index.ts', '!src/**/ports/**'],
  coverageThreshold: {
    './src/domain/': { statements: 90, branches: 85, functions: 90, lines: 90 },
    './src/application/': { statements: 90, branches: 85, functions: 90, lines: 90 },
  },
};
