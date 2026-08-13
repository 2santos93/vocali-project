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

    /*
     * The four parts this repository has. Deferred until the architecture
     * refactor landed, because an enum written while directories are moving
     * pins the names they had on the way past.
     *
     * Measured over the 149 commits in this history at the time this rule was
     * added: 55 `api`, 42 `web`, 22 `infra`, 4 `contracts`, and 26 with no
     * scope at all. Nothing else has ever been used, so the enum records the
     * convention rather than imposing one, and no existing commit fails it.
     *
     * An omitted scope stays legal — `scope-enum` constrains the value when
     * there is one and says nothing when there is not. That is the right shape
     * here: a sixth of this history is repository-wide work that belongs to no
     * single part, and forcing those to invent a scope would produce a worse
     * label rather than a more accurate one.
     *
     * What it buys is the typo. `fix(ap)` and `feat(webb)` are accepted by
     * every other rule in this file and are invisible in a log until someone
     * filters by scope and silently gets an incomplete answer.
     */
    'scope-enum': [2, 'always', ['api', 'web', 'infra', 'contracts']],
  },
};
