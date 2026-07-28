// The layer rules are enforced by `make enforce` (A03), not by eslint —
// they need a module graph, which a linter rule cannot see. This file is
// for ordinary correctness only.
//
// `src/` is deliberately absent. Linting TypeScript needs `typescript-eslint`
// and its 87 packages; see DEPENDENCIES.md for why that is not yet worth it and
// when the question reopens. `tsc --strict` carries correctness for `src/`, and
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
