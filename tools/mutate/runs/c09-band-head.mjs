// The head mark on a band — tone is spent per cell, not per terminal (C09 I45,
// C10 I45, `R-THM-003`).
//
// **Every mutation here leaves a head that draws.** A call head still has a
// mark, the page still reads, and at 1 bit every state still has its shape.
// What changes is whether a focused head in a high-contrast theme — the one
// cell whose tone the band has spent — keeps anything to say which state it is.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/render-focus.test.ts";
const GLYPHS = "src/presentation/blocks/glyphs.ts";
const NOTICE = "src/presentation/blocks/kinds/simple.ts";
const PAINT = "src/presentation/blocks/paint.ts";

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
    // **Asked of the terminal, as it shipped.** The predicate ignores the
    // ground, so a focused head in `hcDark` draws `●` in the band's one ink for
    // every state — which reads as correct on every theme without a band.
    name: "tone carries is asked of the terminal and not of the cell",
    file: GLYPHS,
    from: '  return caps.colourDepth > 1 && caps.unicode !== "ascii" && !onBand;',
    to: '  return caps.colourDepth > 1 && caps.unicode !== "ascii";',
    expect: "T1.75",
  },
  {
    // **Any focus, band or not.** Every focused head takes its shape, which is
    // harmless-looking and moves `dark`'s focused head off the design's `●`.
    name: "every focused head takes the state's mark, banded theme or not",
    file: NOTICE,
    from: '                      ? headMark(block.state, ctx.capabilities, focused && isBand(ctx.theme, "focusGround"))',
    to: "                      ? headMark(block.state, ctx.capabilities, focused)",
    expect: "T1.75",
  },
  {
    // **The theme asked instead of the cell.** A high-contrast theme has a
    // focus band, so every head on its page takes its shape — the unfocused
    // ones included, which are on the page and whose tone still carries.
    name: "the page's heads are taken as banded",
    file: NOTICE,
    from: '                      ? headMark(block.state, ctx.capabilities, focused && isBand(ctx.theme, "focusGround"))',
    to: '                      ? headMark(block.state, ctx.capabilities, isBand(ctx.theme, "focusGround"))',
    expect: "T1.75",
  },
  {
    // **Band found by exclusion** — C10 I45's recorded shape: any theme with a
    // `bandInk` map at all counts every surface as a band.
    name: "any theme with bands treats every ground as one",
    file: PAINT,
    from: "  return theme.tokens.bandInk?.[surface] !== undefined;",
    to: "  return theme.tokens.bandInk !== undefined;",
    expect: "T1.75",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254): tone never carries,
    // so every head on every theme takes its state's shape and the rows that
    // expect `●` above one bit fail.
    file: GLYPHS,
    from: '  return caps.colourDepth > 1 && caps.unicode !== "ascii" && !onBand;',
    to: "  return false;",
    why:
      "the collapse onto ● never happens, so every row reading a head above one " +
      "bit fails — if this survives, nothing below reaches the head",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
