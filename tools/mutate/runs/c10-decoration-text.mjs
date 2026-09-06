// C10 I35, §4g — a decoration palette painted as text, and the exemption whose
// conditional had fired.
//
// **The subject is which pairs are named, not which ratios clear.** Every arm of
// §4g's ruling passes on the shipped tokens — the wide one, the narrow one and
// the one that ships — so a suite indexed by results agrees with all of them.
// What separates them is the pairing, and that is what these mutations attack.
//
// **The three rows answer three different questions, and the pass is what shows
// it.** T2.29 asks which pairs exist; T2.29a asks what they measure; T2.29c asks
// whether the check is *called* at all, through `validateTokens`, because the
// first two survive a check nobody wired — a mechanism tested by calling it says
// nothing about its call site. A run in which one mutation kills all three would
// mean two of them are restatements of the third; measured by hand before this
// file was written, mutation 1 kills T2.29c alone and mutation 3 kills T2.29,
// T2.29a and T2.29c together, which is the surface count moving under all three.
//
// **The mutation this file cannot score, stated because a survivor with no row
// is a finding and not a licence**: `sankey.ts`'s half-block and `scatter3.ts`'s
// braille cells both put one `categorical` slot behind another through `slot()`
// rather than `resolveBackground`, taking I21's picture-cell admission by name.
// The worst pair there measures **1.00** on all three shipped themes, so the
// entire argument is *no text is in the cell* — and nothing asserts it. A
// mutation that put a glyph with a label in such a cell would survive every row
// in the suite. Owed as §4g.4's first bullet rather than mutated here.
//
// **One mutation was written and withdrawn, and the withdrawal is the finding.**
// Building the pairing from `Object.keys(tokens.palettes.categorical.slots)`
// instead of from `REQUIRED_SLOTS` is the defect the derivation exists to
// prevent — a theme's ambition deciding what gets checked — and every shipped
// theme declares exactly `c1`–`c8`, so the two expressions are the same list and
// the mutation is a guaranteed survivor. Scoring it would be A03 §2's vacuity
// dressed as coverage. It is real elsewhere: a theme declaring a `c9` would be
// checked against a slot `refOf` can never return, which is I30's stated limit
// arriving from the other side.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CONTRAST = "src/presentation/theme/contrast.ts";

// `test/contract/theme.test.ts` carries all three rows. The SVG colour suite is
// in the set because T2.29b's question — is every text fill a slot some pairing
// names — is the arm's as much as the theme's, and a mutation that moved the
// pairing while the arm's own rows stayed green would be a finding about them.
const FILES = "test/contract/theme.test.ts test/unit/theme.test.ts"
  + " test/unit/plot-svg-colour.test.ts";

// **Atomic, per F237** — a kill mid-write leaves a prefix, and `runPass`
// restores with whatever `write` it is handed.
const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 300_000,
    });
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
    file: CONTRAST,
    from: "  for (const [surfaceName, hex] of textSurfaces(tokens)) {",
    to: "  for (const [surfaceName, hex] of []) {",
    why: "an empty pairing is no pairing: every row that names §4g goes together, "
      + "which is what tells a real kill from a suite that cannot see this function at all",
  },
  mutations: [
    {
      // **The check unwired** (T6.88's shape, at the call site rather than at
      // the pairing). The pairing still exists and still measures correctly, so
      // T2.29 and T2.29a stay green and a theme with an illegible series name
      // loads. Measured by hand: this kills T2.29c and nothing else.
      name: "`validateTokens` stops calling the decoration check",
      file: CONTRAST,
      from: "  errors.push(...validateDecorationText(tokens));\n",
      to: "",
      expect: "T2.29c",
    },
    {
      // **The floor neutered rather than removed** (T6.88). The function is
      // called, the pairs are built, every error is suppressed — a check that
      // cannot fire dressed as one that passes, which is A03 §2's class and the
      // reason T2.14f exists one section over.
      name: "the decoration floor comparison always continues",
      file: CONTRAST,
      from: "    if (measured < DEFAULT_FLOOR) {",
      to: "    if (measured < 0) {",
      expect: "T2.29c",
    },
    {
      // **The pairing narrowed to one surface**, which is the arm §4g.2's last
      // row weighs and declines. `bgElev` is the half nothing in `src/` resolves
      // today, so this is the mutation whose survival would say the second
      // surface is decoration in the spec rather than a constraint — it is not:
      // light `c4` at 4.74 is the tightest pair the framework ships and it lives
      // there.
      name: "the decoration pairing covers `bg` alone",
      file: CONTRAST,
      from: "  for (const [surfaceName, hex] of textSurfaces(tokens)) {",
      to: "  for (const [surfaceName, hex] of textSurfaces(tokens).slice(0, 1)) {",
      expect: "T2.29",
    },
    {
      // **The wide arm taken instead** — the `decoration` skip deleted so the
      // family-wide check binds every decoration palette. It is the simpler
      // rule and it rejects the shipped light theme on 7 of `spectrum`'s 9
      // stops, worst 2.36 : 1.
      //
      // **The expected row was written as T2.4 and measured as T2.1**, which is
      // the finding this mutation produced before the pass ever ran. T2.4
      // recomputes its own ratios and never calls `validateTokens`, so it stays
      // green while the *light theme stops loading at all* — ten rows fail
      // together and the first of them is a purity test that has nothing to do
      // with contrast. A rejected theme is not a failing ratio, and an anchor
      // named from the rule rather than from a run says the wrong thing about
      // which check is holding the line.
      name: "every decoration palette joins the family-wide check",
      file: CONTRAST,
      from: '    if (palette.carries === "decoration") continue;',
      to: '    if (palette.carries === "never") continue;',
      expect: "T2.1",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
