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
