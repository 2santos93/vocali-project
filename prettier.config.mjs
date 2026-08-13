/** @type {import('prettier').Config} */
export default {
  printWidth: 100,

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

  proseWrap: 'preserve',
};

/*
 * Why there is no HCL plugin here, and how .tf files are formatted instead.
 *
 * Terraform ships its own canonical formatter. `terraform fmt` is normative:
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
