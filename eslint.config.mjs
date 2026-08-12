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

  // An AudioWorklet module. The browser fetches it by URL and evaluates it in
  // `AudioWorkletGlobalScope`, so it is plain JavaScript in `public/` and
  // belongs to no TypeScript project — without this block the project service
  // fails to resolve it and `eslint .` reports a parsing error for the whole
  // repository rather than skipping the file.
  //
  // `AudioWorkletProcessor` and `registerProcessor` come from that scope and
  // from nowhere else, so they have to be declared here or `no-undef` reports
  // the file's two most important lines.
  {
    files: ['apps/web/public/**/*.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: {
        ...globals.worker,
        AudioWorkletProcessor: 'readonly',
        registerProcessor: 'readonly',
        currentFrame: 'readonly',
        currentTime: 'readonly',
        sampleRate: 'readonly',
      },
    },
    rules: {
      /*
       * Spread inside `rules`, not alongside it.
       *
       * `disableTypeChecked` carries its entire effect in a `rules` object, so
       * a sibling `rules` key after the spread above replaces it and switches
       * every type-aware rule back on. They then run against a file that
       * belongs to no program, and ESLint does not report a finding — it dies
       * with "don't have parserOptions set to generate type information",
       * taking the whole repository's lint run with it.
       *
       * The plain-JavaScript block near the top of this file uses the sibling
       * shape safely only because it never overrides a rule of its own.
       */
      ...tseslint.configs.disableTypeChecked.rules,
      // A return type annotation is not expressible in a file the browser
      // evaluates as plain JavaScript, so the workspace rule asks for
      // something this file cannot have. The types it would state are in the
      // JSDoc instead.
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
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
  //
  // Scoped to the component tests, because that is where the reason applies.
  // It previously read `apps/web/**/*.test.ts`, which also covered the
  // composable, util and server tests — fourteen files that mount nothing and
  // import no SFC, and so had five rules switched off for a reason none of
  // them met.
  {
    files: ['apps/web/app/components/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },

  /*
   * Temporary, and deliberately one rule rather than five.
   *
   * Jest's asymmetric matchers are typed `any`, so putting one in an object
   * literal — `{ message: expect.stringContaining('...') }` — is an unsafe
   * assignment. The workspace already has an answer for this: the API writes
   * `expect.stringMatching(...) as unknown` (pino-logger.test.ts:37) and
   * passes the rule with it switched on.
   *
   * One call site does not, at backend-proxy.test.ts:156, and the wider block
   * above is what hid it. Add `as unknown` there and this block deletes
   * itself; nothing else under apps/web/server needs it.
   */
  {
    files: ['apps/web/server/**/*.test.ts'],
    rules: { '@typescript-eslint/no-unsafe-assignment': 'off' },
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

  // The front end is three TypeScript programs, not one, and the project
  // service resolves a file to the nearest tsconfig.json — which is the design
  // system's, and which deliberately excludes everything below. Naming the
  // project explicitly is what keeps the type-aware rules running over the
  // shell instead of failing to parse it, exactly as the Cypress block does.
  //
  // Both projects extend a config `nuxt prepare` generates, which is why that
  // command runs from `apps/web`'s `postinstall`: linting depends on `.nuxt`
  // existing just as type checking does.
  {
    files: [
      'apps/web/app/app.vue',
      'apps/web/app/pages/**/*.vue',
      'apps/web/app/layouts/**/*.vue',
      'apps/web/app/middleware/**/*.ts',
      'apps/web/app/composables/**/*.ts',
      'apps/web/app/utils/**/*.ts',
      'apps/web/app/plugins/**/*.ts',
    ],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ['apps/web/tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      /*
       * `no-undef` cannot see a Nuxt auto-import.
       *
       * It works from a static list of globals, and `definePageMeta`,
       * `navigateTo`, `$fetch` and every composable are declared in files
       * `nuxt prepare` generates. The rule therefore reports each of them as
       * undefined — thirty false positives that would train a reader to skim
       * the lint output. TypeScript does read those declarations, and
       * `pnpm typecheck` reports a genuinely undefined identifier here, with
       * the file and the line, which is the check that was actually wanted.
       *
       * It stays on for `app/components`, where there are no auto-imports to
       * confuse it and where it is one of the things keeping the design system
       * free of the Nuxt runtime.
       */
      'no-undef': 'off',

      /*
       * Off for the shell only.
       *
       * A page's file name is its route: `login.vue` is `/login`, and
       * `historial.vue` is `/historial`. The rule exists to stop a component
       * called `Button` from colliding with a future HTML element, which is a
       * real hazard for a component and no hazard at all for a page that is
       * never written as a tag. Renaming these to satisfy it would change
       * every URL in the application.
       */
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    files: ['apps/web/server/**/*.ts'],
    languageOptions: {
      // The server runs in Node, not in a browser: the block below that gives
      // `apps/web/**/*.ts` the browser globals is wrong for these files, and
      // this one comes after it.
      globals: globals.node,
      parserOptions: {
        projectService: false,
        project: ['apps/web/tsconfig.server.json'],
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
