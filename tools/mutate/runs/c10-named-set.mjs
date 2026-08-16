// Entry 24's mechanism — the named set, the checked variant, the derived enum
// and the derived coverage set.
//
// **Three of these are invisible to a frame and two to a passing suite.** The
// enum declared at module scope works for exactly the two names it already
// carries, so every existing row agrees with it; the coverage set written as a
// literal covers exactly what the test knew about; and `variant` unchecked is a
// field that reads as meaningful and forbids nothing.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
// **And the survivor count is the verdict, not the label**: a mutation whose
// replacement names a symbol the file no longer has "catches" by throwing a
// ReferenceError, which is the instrument manufacturing its own evidence.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/theme.test.ts test/contract/theme.test.ts " +
  "test/contract/manifest.test.ts test/integration/theme.test.ts test/edge/theme.test.ts";
const STORE = "src/presentation/theme/store.ts";
const CONTRAST = "src/presentation/theme/contrast.ts";
const PARSE = "src/data/manifest/parse.ts";
const CONSTRUCT = "src/shell/construct.ts";
const HANDLERS = "src/shell/local/handlers.ts";
const CONTRACT = "test/contract/theme.test.ts";
const HC = "src/presentation/theme/tokens-high-contrast.ts";
const FOURBIT = "src/presentation/theme/four-bit.ts";
const INDEX = "src/presentation/theme/index.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // **The variant check dropped**, which is the state that shipped: a field
    // that reads as meaningful and constrains nothing.
    name: "`variant` is declared and never checked",
    file: CONTRAST,
    from: "  errors.push(...validateVariant(tokens));\n",
    to: "",
    expect: "T1.20",
  },
  {
    // **The polarity comparison inverted.** Both shipped themes clear the
    // threshold by an order of magnitude, so this is not a boundary mutation —
    // it asks whether the row reads the direction at all.
    name: "a light background reads as a dark ground",
    file: CONTRAST,
    from: '  const declares = measured >= 0.5 ? "light" : "dark";',
    to: '  const declares = measured >= 0.5 ? "dark" : "light";',
    expect: "T1.20",
  },
  {
    // **The switch by polarity rather than by name**, which is the two-theme
    // spelling: two dark themes become one, and the second is unreachable.
    name: "switching compares polarity",
    file: STORE,
    from: "      if (next === activeName) return;",
    to: "      if (wanted.variant === current.variant) return;",
    expect: "T1.21",
  },
  {
    // **An unknown name no-ops instead of throwing**, so `/theme solarised`
    // reports a theme change that did not happen.
    name: "an unknown theme is a silent no-op",
    file: STORE,
    from: '        throw new Error(`no theme named "${next}"; this set declares ${Object.keys(tokens).join(", ")}`);',
    to: "        return;",
    expect: "T1.21",
  },
  {
    // **The opening theme as a literal**, which is a name this component would
    // be requiring of every app's set.
    name: "the set opens on a name C10 invented",
    file: STORE,
    from: "  const opened = opening ?? first;",
    to: '  const opened = opening ?? "dark";',
    expect: "T1.21a",
  },
  {
    // **An empty set accepted**, which no token check can see: the failure is
    // about the collection rather than about a theme.
    name: "an empty theme set loads",
    file: STORE,
    from: '    errors.push({ path: "", message: "a theme set declares at least one theme" });',
    to: "",
    expect: "T1.21a",
  },
  {
    // **The enum left as the parse produced it.** The defect that would have
    // shipped: `/theme high-contrast` refused for a theme the session holds.
    name: "`/theme`'s values are never supplied",
    file: PARSE,
    from: "              arg.name === \"variant\" ? { ...arg, values: [...names] } : arg,",
    to: "              arg,",
    expect: "T2.22",
  },
  {
    // **The wiring, not the mechanism** — the composition root's call, which is
    // the only place both facts are held.
    name: "the composition root does not supply the names",
    file: CONSTRUCT,
    from: "    manifest.load(withThemeNames(parsed.value, Object.keys(config.theme)));",
    to: "    manifest.load(parsed.value);",
    expect: "T2.22",
  },
  {
    // **The persisted guard back to a literal pair**, which refuses a
    // legitimate name the moment a third theme exists.
    name: "the persisted preference is compared to two literals",
    file: CONSTRUCT,
    from: "      if (themed.value.names.includes(trimmed)) themed.value.setTheme(trimmed);",
    to: '      if (trimmed === "dark" || trimmed === "light") themed.value.setTheme(trimmed);',
    expect: "T4.36",
  },
  {
    // **The coverage set written as a literal**, which is §5a.4's finding
    // restored: eleven rows loop it and a third theme joins none of them.
    name: "the contrast suite writes its own coverage set",
    file: CONTRACT,
    from: "const VARIANTS = Object.keys(defaultTheme);",
    to: 'const VARIANTS = ["dark", "light"];',
    expect: "T2.23",
  },
  {
    // **The handler back to a closed vocabulary.** It passes for both shipped
    // names and refuses every theme an app adds.
    name: "the handler tests the variant against two literals",
    file: HANDLERS,
    from: '      if (typeof wanted !== "string") {',
    to: '      if (wanted !== "dark" && wanted !== "light") {',
    expect: "T4.35",
  },
  {
    // **The promise dropped to the framework's floor.** `#9f9f9f` at 7.93 goes
    // to a value that clears 4.5 and fails 7 — which `validateTokens` accepts,
    // because `FLOORS` is a minimum and a theme cannot declare more. The row
    // that would be the only thing between "high-contrast" and a name.
    name: "high-contrast's quietest slot meets the floor and not the promise",
    file: HC,
    from: '        muted: "#9f9f9f",',
    to: '        muted: "#767676",',
    expect: "T2.24",
  },
  {
    // **The three greys flattened.** `muted` at `default`'s value clears every
    // floor and every promise, and loses what a recessive tone is for — so the
    // sweep alone cannot catch it and the ordering assertion is why it is there.
    name: "the recessive greys are flattened into the promise",
    file: HC,
    from: '        muted: "#9f9f9f",',
    to: '        muted: "#ffffff",',
    expect: "T2.24",
  },
  {
    // **Two of the five collapsed at 4-bit**, which is the one promise this
    // rung can keep and the one an accessibility theme most owes.
    name: "high-contrast collapses two tones at 4-bit",
    file: FOURBIT,
    from: '  "tone.accent": 13,\n  "tone.meta": 5,\n  "tone.identifier": 6,\n\n  "syntax.keyword": 13,',
    to: '  "tone.accent": 14,\n  "tone.meta": 5,\n  "tone.identifier": 6,\n\n  "syntax.keyword": 13,',
    expect: "T2.3",
  },
  {
    // **The theme declared but not shipped**, which is entry 24's own residue
    // restored: a mechanism with no consumer.
    name: "the set holds two themes again",
    file: INDEX,
    from: '  "high-contrast": HIGH_CONTRAST,',
    to: "",
    expect: "T2.24",
  },
];

/** Survivors with a reason, and a staleness arm. */
const EXPECTED_SURVIVORS = new Map();

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: STORE,
    from: "    setTheme(next: string): void {",
    to: "    setTheme(_next: string): void {\n      throw new Error(`control`);\n    },\n    unusedSetTheme(next: string): void {",
    why:
      "no theme can be switched to at all — if this survives, nothing in the set reaches the " +
      "store's selection and every kill below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
const stale = results.filter((r) => r.killed && EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length + stale.length > 0 ? 1 : 0);
