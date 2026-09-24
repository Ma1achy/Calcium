// The floor's scope as a ground table (C10 I60, C25 I23, A03 SS67, `R-THM-002`,
// `R-THM-004`).
//
// **Three halves, and each can fail alone.** The table (`textGrounds`) can
// lose a ground; the validator can walk the old list; the compositions can be
// missing; and the renderer can resolve a diff row's ink on the page instead
// of on the row. Any one of them leaves a frame that reads correct in every
// theme without a declared floor, which is every theme but two.
//
// SS67's arms are here too, because a scan whose violations are never
// fabricated is a scan whose green means nothing.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/theme.test.ts test/contract/patch-window.test.ts";
const CONTRAST = "src/presentation/theme/contrast.ts";
const LINES = "src/presentation/patch/lines.ts";
const SCANS = "tools/enforce/source-scans.mjs";
const LENDER = "src/presentation/theme/tokens-high-contrast.ts";
const GENERATED = "src/presentation/theme/tokens.generated.ts";

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
    // **The validator walks the page grounds only**, as it shipped — the
    // promise kept on the page and nowhere a diff or a chip is drawn.
    name: "validateHighContrast walks textSurfaces",
    file: CONTRAST,
    from: "  for (const [surface, ground, refs] of textGrounds(tokens)) {\n    if (!isHex(ground)) continue;",
    to: "  for (const [surface, ground, refs] of textGrounds(tokens).slice(0, textSurfaces(tokens).length)) {\n    if (!isHex(ground)) continue;",
    expect: "T2.60",
  },
  {
    // **`bgDeep` excluded again**, on the premise that no text lands on it.
    name: "textGrounds drops the chip's well",
    file: CONTRAST,
    from: '  if (deep !== undefined) rows.push(["bgDeep", deep, flatten(CHIP_SLOTS)]);',
    to: "",
    expect: "T2.59",
  },
  {
    name: "textGrounds drops the diff grounds",
    file: CONTRAST,
    from: "    if (hex !== undefined) rows.push([name, hex, flatten(DIFF_SLOTS)]);",
    to: "",
    expect: "T2.59",
  },
  {
    // **The gutter resolved on the page**: the composed ink exists and is
    // never drawn — hcDark's `+` at 4.80 : 1 on `diffAdd`.
    name: "the gutter's tone ignores the row's ground",
    file: LINES,
    from: "  const style = tone(TONES[line.kind], ctx.theme, ctx.capabilities, groundOf(line.kind));",
    to: "  const style = tone(TONES[line.kind], ctx.theme, ctx.capabilities);",
    expect: "T1.27",
  },
  {
    // **A lent composition reverted to the flat slot** — the lender's record
    // is the only author of hcDark's syntax on a diff row (C10 I46).
    name: "hcDark's keyword on diffAdd is the flat slot",
    file: LENDER,
    from: '      "syntax.keyword": "#ff9eff",',
    to: '      "syntax.keyword": "#e46dfb",',
    expect: "T2.60",
  },
  {
    // **A registry composition reverted** in the generated tokens.
    name: "hcDark's tone.ok on diffAdd is the flat slot",
    file: GENERATED,
    from: '        "tone.ok": "#2fdd4c",',
    to: '        "tone.ok": "#0ab827",',
    expect: "T1.27",
  },
  {
    name: "SS67 accepts an undispositioned ground",
    file: SCANS,
    from: "        if (Object.hasOwn(roles, name)) continue;\n        violations.push({\n          rule: \"SS67\"",
    to: "        continue;\n        violations.push({\n          rule: \"SS67\"",
    expect: "T2.62",
  },
  {
    name: "SS67 keeps a dead entry",
    file: SCANS,
    from: "    if (named.has(name)) continue;\n    violations.push({\n      rule: \"SS67\"",
    to: "    continue;\n    violations.push({\n      rule: \"SS67\"",
    expect: "T2.62",
  },
  {
    name: "SS67 reads comment lines",
    file: SCANS,
    from: "a `//` inside a string opens nothing.\n      if (/^\\s*(?:\\/\\/|\\/\\*|\\*)/u.test(line)) return;",
    to: "a `//` inside a string opens nothing.\n",
    expect: "T2.62",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254): no theme is held to
    // its promise, so every removed composition in T2.60 passes in silence.
    file: CONTRAST,
    from: "  const promised = tokens.floor;\n  if (promised === undefined) return Object.freeze([]);",
    to: "  const promised = tokens.floor;\n  if (promised !== -1) return Object.freeze([]);",
    why:
      "the high-contrast validator reports nothing, so T2.60's removals go " +
      "unreported — if this survives, nothing reaches the validator",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
