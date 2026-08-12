import js from '@eslint/js';
import configPrettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';

export default tseslint.config(
  {
    // `**/worktrees/**` keeps other checkouts of this repository out of the
    // lint surface. Without it, `eslint .` walks into every local worktree and
    // reports another branch's files as failures of this one.
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/node_modules/**',
      '**/worktrees/**',
    ],
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

  // Until this block existed, .vue files matched no configuration at all and
  // were skipped in silence — `eslint .` reported success on a front end it
  // had never parsed.
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        // vue-eslint-parser handles the SFC; the script block is handed to
        // typescript-eslint. `extraFileExtensions` is what lets the project
        // service accept a .vue path as a program file, which is the
        // difference between type-aware rules running and being skipped.
        parser: tseslint.parser,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
      globals: globals.browser,
    },
  },

  // The front end runs in a browser. typescript-eslint's own overrides switch
  // `no-undef` off for .ts files, but the front end's tests reach for File,
  // DragEvent and document, which are undeclared under the Node globals the
  // rest of the workspace assumes.
  {
    files: ['apps/web/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },

  // A component test imports a .vue file, and typescript-eslint's program
  // cannot resolve one: only the Vue language service can compile a single
  // file component into a type. Every value that comes back from `mount()` is
  // therefore `error`-typed here, and the no-unsafe family reports each use of
  // it — a wall of findings about a limitation of the linter rather than a
  // defect in the test.
  //
  // Nothing is given up. `pnpm typecheck` runs vue-tsc over these same files
  // with full knowledge of every SFC, and it runs in CI, so the types are
  // still checked — by the tool that can see them.
  {
    files: ['apps/web/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },

  // The end-to-end project is a second TypeScript program (see
  // apps/web/tsconfig.cypress.json), and the project service resolves a file
  // to the nearest tsconfig.json — which excludes these. Naming the project
  // explicitly is what keeps the type-aware rules running over them instead of
  // failing to parse.
  {
    files: ['apps/web/cypress.config.ts', 'apps/web/cypress/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ['apps/web/tsconfig.cypress.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Last, so it wins. eslint-plugin-vue's recommended set carries layout rules
  // — where attributes wrap, how a tag self-closes — that disagree with
  // Prettier, and a repository with two formatters has neither. This switches
  // off every rule Prettier already decides and leaves the correctness rules
  // untouched.
  configPrettier,
);
