// Whether a surface is a band, asked at a depth (C10 I66, I61; C09 I45, I110;
// C14 I54). Mutated (C10 T6.127–T6.132).
//
// **Every mutation here leaves a band that paints and a head that draws.** The
// high-contrast grounds and inks are untouched at the depths they are drawn
// at; what changes is whether the painters and the resolver agree about where
// a band is — at 1 bit, at 4 bits over a theme with half a band, and inside a
// stale panel, where the tone has receded rather than been spent on a ground.
//
// **T6.130 passes every agreement assertion**, and that is I66's stated blind
// spot rather than a gap: the resolver and `isBand` read the one predicate, so
// an agreement moves with it. The literals see it — T1.51's curated indices,
// and the lists of painted bands T2.72 and T1.84 write out beside their
// agreements (measured on landing: all three fail, all three agreements pass).
// The run names T1.51, the one row whose whole subject is the literal.
//
// **Left out, with the reason**: forcing `simple.ts`'s callers to 24 bits is an
// equivalent mutant for the head — `toneCarries` answers 1 bit before the band
// is asked — and T6.127 is the 1-bit half that is observable, at the cache.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run --maxWorkers=3 test/contract/band-at.test.ts test/contract/band-four-bit.test.ts " +
  "test/unit/render-focus.test.ts test/integration/copy-drag.test.ts";
const RESOLVE = "src/presentation/theme/resolve.ts";
const CONTRAST = "src/presentation/theme/contrast.ts";
const NOTICE = "src/presentation/blocks/kinds/simple.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const FOUR_BIT_CLAUSE = "  return caps.colourDepth !== 4 || theme.tokens.bandFourBit?.[surface] !== undefined;";

const MUTATIONS = [
  {
    // **T6.127 — `isBand` as it shipped, at 1 bit.** No frame changes: every
    // head at 1 bit already takes its state's mark. What changes is that a
    // selection keys the render cache for a picture it does not alter. T2.72
    // fails on the 1-bit HC cells as well; T4.37h is the observable one.
    name: "T6.127: bandAt answers the tokens at 1 bit",
    file: RESOLVE,
    from: "  if (caps.colourDepth === 1) return false;\n  if (theme.tokens.bandInk?.[surface] === undefined) return false;",
    to: "  if (theme.tokens.bandInk?.[surface] === undefined) return false;",
    expect: "T4.37h",
  },
  {
    // **T6.128 — every painted surface a band.** `dark`'s focused heads take
    // their state's marks on a ground whose inks are five.
    name: "T6.128: bandAt drops the bandInk clause",
    file: RESOLVE,
    from: "  if (theme.tokens.bandInk?.[surface] === undefined) return false;\n  return caps",
    to: "  return caps",
    expect: "T2.72",
  },
  {
    // **T6.129 — the pair ignored.** A band with no 4-bit pair is called a
    // band at 4 bits over the flat map's six inks: the state before C10 I61, now
    // reachable only by a theme built without the store.
    name: "T6.129: bandAt at 4 bits ignores the pair",
    file: RESOLVE,
    from: FOUR_BIT_CLAUSE,
    to: "  return true;",
    expect: "T2.72",
  },
  {
    // **T6.130 — no band at 4 bits anywhere.** Both sides move together, so
    // the agreements pass by construction; T1.51 reads the curated indices and
    // fails, as do T2.72's and T1.84's written-out band lists.
    name: "T6.130: bandAt answers no band at 4 bits (C10 I66's blind spot)",
    file: RESOLVE,
    from: FOUR_BIT_CLAUSE,
    to: "  return caps.colourDepth !== 4;",
    expect: "T1.51",
  },
  {
    // **T6.131 — the resolver reads the pair directly**, as before C10 I66. It is
    // what shows the resolver asks the shared predicate: an orphan pair paints
    // a 4-bit band `isBand` does not know about.
    name: "T6.131: the resolver's 4-bit ink arm bypasses bandAt",
    file: RESOLVE,
    from: "    const band = on !== undefined && bandAt(theme, on, FOUR_BIT) ? theme.tokens.bandFourBit?.[on] : undefined;",
    to: "    const band = on === undefined ? undefined : theme.tokens.bandFourBit?.[on];",
    expect: "T2.72",
    also: [
      {
        file: RESOLVE,
        from: "    const band = bandAt(theme, slot, FOUR_BIT) ? theme.tokens.bandFourBit?.[slot] : undefined;",
        to: "    const band = theme.tokens.bandFourBit?.[slot];",
      },
    ],
  },
  {
    // **T6.132 — the pair check behind the page's hex test**, where it sat:
    // a theme inheriting its page loads with a band that has no pair.
    name: "T6.132: validateBands returns before the pair check on an inheriting page",
    file: CONTRAST,
    from: "  const errors: ThemeError[] = [];\n  const bands = tokens.bandInk ?? {};\n",
    to: "  const errors: ThemeError[] = [];\n  const bands = tokens.bandInk ?? {};\n  if (!isHex(tokens.surfaces.bg)) return Object.freeze(errors);\n",
    expect: "T2.73",
  },
  {
    // **The orphan never read** — the other half of question 55. No T6 row of
    // its own: C10's block was six numbers, and T6.132 is the pair check's.
    name: "validateBands does not read an orphan pair",
    file: CONTRAST,
    from: "    if (bands[name] === undefined) {",
    to: "    if (bands[name] === undefined && false) {",
    expect: "T2.73",
  },
  {
    // **A stale panel's heads as fresh ones** (question 56): four started
    // states draw `●` in one dim ink. No T6 row of its own: C09's allocation
    // was T1.84 alone.
    name: "a head on a receded panel keeps the toned mark",
    file: NOTICE,
    from: '(ctx.washed?.has(block.id) === true && isBand(ctx.theme, "selection", ctx.capabilities)) ||\n                            ctx.theme.recedes !== undefined,',
    to: '(ctx.washed?.has(block.id) === true && isBand(ctx.theme, "selection", ctx.capabilities)),',
    expect: "T1.84",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254): nothing is a band at
    // any depth, so both high-contrast themes' focused heads keep `●` and
    // their 4-bit bands lose their grounds.
    file: RESOLVE,
    from: "  if (caps.colourDepth === 1) return false;\n  if (theme.tokens.bandInk",
    to: "  return false;\n  if (theme.tokens.bandInk",
    why:
      "no surface is a band anywhere, so T1.75's focused heads and T1.51's 4-bit " +
      "grounds fail — if this survives, nothing below reaches the predicate",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
