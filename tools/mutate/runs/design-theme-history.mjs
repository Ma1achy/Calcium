// AUTHORITY §Release 5 — theme rules are released history, sealed like rules.
// Mutated at each place a theme rule is checked, sealed or read (A03-DSN4, C10 TG1,
// C10 T1.44): the one-value-per-slot check, the lint's theme walk, the release's
// theme seal, the cross-ref comparison, and the readers' `current` filter.
//
// **Two readers are not mutated, and the reason is the data.** `palette-port`
// reads `.syn-*`/`.cat-*` selectors and `theme.test.ts` T2.53 reads `.c-h-*`;
// no superseded record has either shape, so dropping their filter changes
// nothing they read — an equivalent mutation, which would survive and say
// nothing about the rows.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/enforce-rules.test.ts test/unit/theme-generator-check.test.ts test/unit/theme.test.ts -t \"DSN4|TG1|T1.44\"";
const BUILD = "docs/design/language/build-calcium.mjs";
const LINT = "docs/design/language/lint-immutable.mjs";
const RELEASE = "tools/design/release.mjs";
const AGAINST = "tools/design/released-against.mjs";
const GENERATOR = "tools/theme/from-registry.mjs";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: GENERATOR,
    from: 'const THEME_RULES = registry.themeRules.filter((rule) => rule.status === "current");',
    to: 'const THEME_RULES = registry.themeRules.filter((rule) => rule.status === "superseded");',
    why: "the generator reads only history — seven records, and every theme loses its tones",
  },
  mutations: [
    {
      name: "NO-SLOT-CHECK: two current values for one slot pass",
      file: BUILD,
      from: "        if (held !== undefined) {\n          throw new Error(",
      to: "        if (held !== undefined && false) {\n          throw new Error(",
      expect: "A03-DSN4",
    },
    {
      name: "GENERATOR-LEAK: the generator reads superseded records",
      file: GENERATOR,
      from: 'const THEME_RULES = registry.themeRules.filter((rule) => rule.status === "current");',
      to: "const THEME_RULES = registry.themeRules;",
      expect: "TG1",
    },
    {
      name: "LINT-RULES-ONLY: lint-immutable walks rules and not theme rules",
      file: LINT,
      from: '  { name: "themeRules", label: "theme rule", records: reg.themeRules ?? [], sealed: base.themeRules ?? {}, count: base.themeCount },\n',
      to: "",
      expect: "A03-DSN4",
    },
    {
      name: "RELEASE-RULES-ONLY: a release does not seal theme rules",
      file: RELEASE,
      from: "const { added: addedThemes, out: themeRules } = seal(registry.themeRules, baseline.themeRules ?? {});",
      to: "const { added: addedThemes, out: themeRules } = { added: [], out: baseline.themeRules ?? {} };",
      expect: "A03-DSN4",
    },
    {
      name: "AGAINST-RULES-ONLY: the cross-ref comparison walks rules alone",
      file: AGAINST,
      from: 'for (const map of ["rules", "themeRules"]) {',
      to: 'for (const map of ["rules"]) {',
      expect: "A03-DSN4",
    },
    {
      name: "TEST-READER-LEAK: T1.44's reading of the design takes superseded records",
      file: "test/unit/theme.test.ts",
      from: "  const declared = (): Map<string, string> => {\n    const registry = JSON.parse(\n      readFileSync(\"docs/design/language/calcium-registry.json\", \"utf8\"),\n    ) as { themeRules: { selector: string; declarations: string; status: string }[] };\n    const out = new Map<string, string>();\n    for (const rule of registry.themeRules.filter((r) => r.status === \"current\")) {",
      to: "  const declared = (): Map<string, string> => {\n    const registry = JSON.parse(\n      readFileSync(\"docs/design/language/calcium-registry.json\", \"utf8\"),\n    ) as { themeRules: { selector: string; declarations: string; status: string }[] };\n    const out = new Map<string, string>();\n    for (const rule of registry.themeRules) {",
      expect: "T1.44",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
