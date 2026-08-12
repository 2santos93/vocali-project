/**
 * Conventional Commits, enforced on every commit by .husky/commit-msg and on
 * every pull request by the `commits` job in CI.
 *
 * @type {import('@commitlint/types').UserConfig}
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    /*
     * 100, restated rather than inherited, because the number is a decision.
     *
     * Measured over the 101 commits in this history: the median subject is 65
     * characters, the longest is 86, and 22 exceed 72. So the 72-character
     * convention is what this history reaches for and not what it keeps.
     *
     * Tightening to 72 was considered and rejected. History may not be
     * rewritten, so the rule would be one a fifth of the repository already
     * fails — and a check that its own subject fails teaches whoever reads the
     * output to stop reading it. The long subjects are long because they are
     * specific ("capture full call arguments and inject clock in storage and
     * provider doubles"), and the shorter version of that line is a worse
     * commit message, not a tidier one.
     *
     * 100 still sits above the longest subject with room to spare, so it
     * catches what the limit is actually for: a pasted sentence, or a body's
     * first paragraph that ended up on the subject line.
     */
    'header-max-length': [2, 'always', 100],
  },
};
