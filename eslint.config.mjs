import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/.nuxt/**', '**/.output/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: false }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: globals.node,
    },
  },
  {
    files: ['apps/api/src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/application/**', '**/infrastructure/**', '**/presentation/**'],
              message: 'The domain layer must not depend on outer layers.',
            },
            {
              group: ['@aws-sdk/*', 'zod'],
              message: 'The domain layer must stay free of third-party dependencies.',
            },
          ],
          // `paths` rather than `patterns`: this must match the package root
          // exactly and still allow the `/constants` subpath, which a glob
          // group would also catch.
          //
          // Banning 'zod' alone was not enough. The contracts barrel re-exports
          // every schema module, each of which imports Zod, so importing the
          // package root pulled Zod into the domain's runtime graph without the
          // specifier ever appearing in a domain file.
          paths: [
            {
              name: '@vocali/contracts',
              message:
                'The domain layer must import @vocali/contracts/constants, which carries no Zod.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/infrastructure/**', '**/presentation/**'],
              message: 'The application layer must depend on ports, not on adapters.',
            },
            { group: ['@aws-sdk/*'], message: 'The application layer must not know about AWS.' },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', 'apps/api/test/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
);
