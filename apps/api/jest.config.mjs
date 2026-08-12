import path from 'node:path';

// Jest resolves a relative `coverageThreshold` key against `process.cwd()`,
// not `rootDir`. Keyed relatively, the thresholds silently stop applying the
// moment Jest is invoked from anywhere but this directory — it prints
// "Coverage data for ./src/domain/ was not found" and still exits 0, which is
// exactly what a CI job running Jest from the repository root would do.
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
    // The adapters carry the rules nothing else can enforce — the upload size
    // policy, the partition key that isolates one user's history from another's
    // and the provider's retry policy. Without a key of their own they are
    // collected, reported and never gated, so every one of those tests could be
    // deleted with the build staying green.
    [INFRASTRUCTURE_DIR]: { statements: 90, branches: 85, functions: 90, lines: 90 },
  },
};
