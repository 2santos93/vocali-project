/**
 * Every option the repository depends on is written down, including the ones
 * that happen to be Prettier's defaults.
 *
 * A default is a decision someone still has to look up, and it is a decision
 * that can change under a minor upgrade — `trailingComma` moved from 'es5' to
 * 'all' in Prettier 3, and reformatted a lot of repositories that had never
 * stated a preference. Stating them costs nothing and pins the output.
 *
 * Not stated: options for languages this repository does not contain (JSX,
 * Flow, Handlebars). Listing those would be noise pretending to be rigour.
 *
 * Terraform is deliberately absent; see the note at the end of this file.
 */

/** @type {import('prettier').Config} */
export default {
  // 80 puts a two-argument call with a type annotation over three lines. 100
  // holds most of this codebase's signatures on one, and still fits a split
  // editor. Nothing above 100 is a readable line of TypeScript.
  printWidth: 100,

  // Mirrors .editorconfig, which sets the same two values for editors that
  // never invoke Prettier. They have to agree, so they are both explicit
  // rather than both implicit.
  tabWidth: 2,
  useTabs: false,

  // Also .editorconfig's `end_of_line = lf`. Left to chance, a Windows
  // checkout produces a diff on every file the first time anyone formats.
  endOfLine: 'lf',

  singleQuote: true,
  quoteProps: 'as-needed',
  semi: true,
  trailingComma: 'all',
  bracketSpacing: true,
  arrowParens: 'always',

  /*
   * The .vue options.
   *
   * `htmlWhitespaceSensitivity: 'css'` is the one with a runtime consequence
   * rather than a cosmetic one: whitespace between inline elements is
   * rendered, so reformatting a template under 'ignore' can visibly move text
   * in the browser. 'css' keeps Prettier from touching it where it matters.
   *
   * The other two are the layout decisions eslint-config-prettier switches
   * eslint-plugin-vue's own rules off for. With the rules disabled and these
   * unstated, nothing in the repository would record what the layout is.
   */
  htmlWhitespaceSensitivity: 'css',
  vueIndentScriptAndStyle: false,
  singleAttributePerLine: false,

  // Markdown is reflowed by no one: 'preserve' keeps a hand-wrapped paragraph
  // exactly as its author wrapped it, so a one-word edit does not rewrap the
  // surrounding twenty lines and bury the change in the diff.
  proseWrap: 'preserve',
};

/*
 * Why there is no HCL plugin here, and how .tf files are formatted instead.
 *
 * Terraform ships its own canonical formatter. `terraform fmt` is normative —
 * it is what the ecosystem runs, what module documentation is written in, and
 * what any downstream `terraform fmt -check` will hold this repository to. A
 * Prettier HCL plugin would produce its own layout, which means the 51 .tf
 * files here would be formatted by a tool no Terraform user runs, and would
 * fail the check every Terraform user does run.
 *
 * That is the same argument this repository already makes about
 * eslint-plugin-vue's layout rules: two formatters over one file type leaves
 * neither of them authoritative. So .tf is not Prettier's, and the
 * `format:check:tf` script hands it to the tool that owns it.
 */
