// The layer rules are enforced by `make enforce` (A03), not by eslint —
// they need a module graph, which a linter rule cannot see. This file is
// for ordinary correctness only.
//
// `src/` is deliberately absent. Linting TypeScript needs `typescript-eslint`
// — 13 packages on top of this tree, measured 2026-09-03, and a peer range
// (`typescript <6.1.0`) that excludes the 7.0.2 this repository compiles with.
// Run ad hoc against `src/` it reported 106 findings and 0 defects, and
// `no-floating-promises`, the rule the question was held open for, fired zero
// times; DEPENDENCIES.md carries the figures and the two conditions that
// reopen it. `tsc --strict` carries correctness for `src/`, and
// `no-console` moved to A03 as SS33, where it is stronger — it catches
// console.error and console.warn, and it cannot fall silent because a parser
// could not read a file.
export default [
  {
    /**
     * **The corpus is the repository's own sources, and it was not** (F1079).
     *
     * `eslint .` lints every `.js`/`.mjs` it can reach, and it had no `ignores`
     * at all. Measured three ways rather than derived, because the arithmetic
     * and the measurement disagreed the first time:
     *
     * | corpus | files |
     * |---|---|
     * | as it stood | **745** — 371 `dist/`, 87 scratch under `out/` |
     * | as it stood, with the verification worktree in place | **999** |
     * | with these ignores | **282** |
     *
     * So 62% of what decided this gate was build output or scratch, and 71%
     * during the one procedure that verifies a commit.
     *
     * **What can fail on them is parsing, not the rules**, which is why it had
     * never been noticed: the rule block below is `tools/**` relative to this
     * file, so a nested `out/verify/tools/*.mjs` gets no rules at all — a
     * fabricated `var x = 1; if (x == 1)` there fires nothing. A **syntax
     * error** fires everywhere, and that is not hypothetical: a scratch probe
     * under `out/probe/` with one stray paren took `make check` red, and the
     * verification worktree this repository's own recipe creates under `out/`
     * puts a whole second copy of the tree one typo away from the same thing.
     *
     * Named rather than derived from `.gitignore`: `out/` is not in it, and a
     * lint corpus and a commit corpus are different questions that happen to
     * overlap. T2.129 asks eslint itself, through `isPathIgnored`.
     */
    ignores: ["dist/**", "out/**", "coverage/**", ".calcium/**", "~/**"],
  },
  {
    files: ["tools/**/*.mjs"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
    rules: {
      "no-console": "off",         // the enforcement suite reports to stdout
      "eqeqeq": ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
];
