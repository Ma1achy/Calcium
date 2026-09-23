// C10 I49, §4b.1 — the pairing derived from the design, and the values it carries.
//
// **Two defects composed here and each made the other silent**, so the two rows
// are attacked separately and neither is allowed to stand in for the other. The
// generator read one pairing per registry rule; the pairing was `tone.default`
// alone. A value nobody delivered, onto a scope nobody measured.
//
// **The run's own hazard is the one the section is about.** T1.45 derives its
// corpus from `composed`, so a mutation that removes a composition removes the
// pair with it and nothing fails — which is not a survivor about the tests but
// the derivation's stated blind spot arriving. Those mutations are aimed at
// T1.44, which reads the registry, and the expectations say so.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CONTRAST = "src/presentation/theme/contrast.ts";
const GENERATED = "src/presentation/theme/tokens.generated.ts";
const FILES = "test/unit/theme.test.ts test/contract/theme.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change the corpus can see** (F1254): `mono`'s `meta` on a selection is
    // the one value this whole section turns on, and moved to the ink it used to
    // carry it is 3.86 : 1 against a 4.5 floor. If this survives, nothing below
    // reaches either row and every kill is unearned.
    file: GENERATED,
    from: '        "tone.meta": "#b8b8b8",\n        "tone.muted": "#b8b8b8",',
    to: '        "tone.meta": "#8e8e8e",\n        "tone.muted": "#b8b8b8",',
    why:
      "mono's meta falls back to #8e8e8e, which is 3.86 : 1 on #333 against a 4.5 floor — "
      + "T1.44 fails on the value and T1.45 on the ratio, so a survivor here means neither row runs",
  },
  mutations: [
    {
      // **The defect as it shipped.** One pairing per rule, anchored at the
      // selector's start — the reading whose comment was true about the two
      // selector forms and wrong about the rule. It is invisible from the token
      // set, because a lost composition takes its own pair with it.
      name: "THE DEFECT: the pairing is read from the first selector of a rule and the rest are dropped",
      file: CONTRAST,
      from: "  for (const ref of Object.keys(tokens.composed?.[\"surface.selection\"] ?? {})) refs.add(ref);",
      to: "  for (const ref of Object.keys(tokens.composed?.[\"surface.selection\"] ?? {}).slice(0, 1)) refs.add(ref);",
      expect: "T2.14d",
    },
    {
      // **The narrowing put back**, which is the state before this MR. It reads
      // as the careful choice it was, and it is green on every ratio: the pairs
      // it drops are the ones no floor was ever computed for.
      name: "the selection pairing is `tone.default` alone again",
      file: CONTRAST,
      from: "  for (const ref of Object.keys(tokens.composed?.[\"surface.selection\"] ?? {})) refs.add(ref);",
      to: "  void tokens;",
      expect: "T2.14d",
    },
    {
      // **A pairing for a ref the palette cannot resolve.** `inkOn` answers with
      // the composed value, so the pair reads as measured on a slot that does not
      // exist — a check that is green because it is asking about nothing.
      name: "a composed ref with no flat slot is paired anyway",
      file: CONTRAST,
      from: "    const value = tokens.palettes[palette]?.slots[slot];\n    if (value === undefined || !isHex(value)) continue;\n    out.push([palette, slot, \"selection\", hex]);",
      to: "    out.push([palette, slot, \"selection\", hex]);",
      // **T1.45, not T2.14d, and it took a constructed state to get there.** No
      // shipped composition names a slot its palette lacks, so this survived the
      // first pass with nothing observable changing — a green run reporting the
      // guard untested rather than unnecessary. T1.45 now builds the theme that
      // has one (F1255).
      expect: "T1.45",
    },
    {
      // **The base dropped.** Derived alone, a theme that composes nothing gets
      // an empty pairing — the scope shrinking to nothing exactly where a theme
      // is plainest, and every ratio still green.
      name: "the pairing is derived only, with no base, so a plain theme is unmeasured",
      file: CONTRAST,
      from: "  for (const [palette, slots] of Object.entries(SELECTION_BASE)) {\n    for (const slot of slots) refs.add(`${palette}.${slot}`);\n  }",
      to: "  void SELECTION_BASE;",
      expect: "T2.14d",
    },
    {
      // **A declared value dropped from the token set**, which is the loss this
      // MR repaired, restored on one theme. Aimed at T1.44 deliberately: T1.45
      // cannot see it, and the run would be reporting a survivor about the
      // tests when what it found is the derivation's stated blind spot.
      name: "a declared composition is missing from the token set again",
      file: GENERATED,
      from: '        "tone.muted": "#bdbdbd",',
      to: "",
      expect: "T1.44",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
