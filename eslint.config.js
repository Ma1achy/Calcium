// The layer rules are enforced by `make enforce` (A03), not by eslint —
// they need a module graph, which a linter rule cannot see. This file is
// for ordinary correctness only.
export default [
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
    rules: {
      "no-console": "error",       // C01 owns stdout; nothing else writes
      "eqeqeq": ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
];
