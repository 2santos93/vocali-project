import path from 'node:path';

const DOMAIN_DIR = path.join(import.meta.dirname, 'src/domain/');
const APPLICATION_DIR = path.join(import.meta.dirname, 'src/application/');
const INFRASTRUCTURE_DIR = path.join(import.meta.dirname, 'src/infrastructure/');

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
    [DOMAIN_DIR]: { statements: 90, branches: 85, functions: 90, lines: 90 },
    [APPLICATION_DIR]: { statements: 90, branches: 85, functions: 90, lines: 90 },
    [INFRASTRUCTURE_DIR]: { statements: 90, branches: 85, functions: 90, lines: 90 },
  },
};
