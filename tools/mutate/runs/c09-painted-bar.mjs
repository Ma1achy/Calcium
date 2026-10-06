// §034's painted rung, mutated — the ground, the fallback and the percent.
//
// **The subject is a channel, so every mutation here is invisible to a stripped
// read.** `design-surfaces.test.ts` folds SGR away, which is why §034's frame is
// a mask with a letter per distinct ground — a one-symbol mask draws fifteen
// cells of `meterFill` beside nine of `bgDeep` as twenty-four identical cells,
// and where the fill ends is the whole of what a bar says.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const BAR = "src/presentation/blocks/kinds/simple.ts";
const FILES = "test/contract/blocks.test.ts test/golden/design-surfaces.test.ts test/contract/spans.test.ts";

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
    // Nothing is ever painted, so the painted bar is the drawn one at every
    // rung — a change the mask can see in four rows of the census.
    file: BAR,
    from: "    const painted = block.painted === true && meter.background !== undefined;",
    to: "    const painted = false;",
    why: "the painted rung does not exist, so §034's figure is its own fallback everywhere",
  },
  mutations: [
    {
      // **The fallback becomes nothing rather than the alphabet.** §034 is
      // explicit — *the glyphs are the 1-bit rung* — and a painted bar that
      // degrades to spaces is a bar that vanishes where it is needed most.
      // Every width, every count and the percent are unmoved by it.
      name: "the painted bar degrades to blanks rather than to its alphabet",
      file: BAR,
      from: "    const onGlyph = painted ? \" \" : bar.on;",
      to: "    const onGlyph = block.painted === true ? \" \" : bar.on;",
      expect: "T2.160",
    },
    {
      // **One ground rather than two.** The extent is still drawn and still the
      // right length; what is lost is where the fill stops, which is the only
      // thing the figure is for. A row asserting *a background arrived* passes.
      name: "the track takes the fill's ground",
      file: BAR,
      from: "      ? withBackground(tone(\"default\", ctx.theme, ctx.capabilities), well)",
      to: "      ? withBackground(tone(\"default\", ctx.theme, ctx.capabilities), meter)",
      expect: "T2.160",
    },
    {
      // **The rung keyed on the depth rather than on the ground**, and this
      // one **survived its first pass** — which indicted the sentence rather
      // than the code. All ten shipped themes carry `meterFill`, so the two
      // predicates agree on every input the tree can produce and I96's *read
      // off the ground resolving, not off a depth* forbade nothing: A03 §2's
      // vacuity class arriving in prose. T2.160 now constructs the theme the
      // sentence is about — a `ThemeTokens` with the slot removed, under its
      // own `name` because the resolver caches on one (C10 I11) — and the
      // mutation is reachable.
      name: "the painted rung is read off the colour depth",
      file: BAR,
      from: "    const painted = block.painted === true && meter.background !== undefined;",
      to: "    const painted = block.painted === true && ctx.capabilities.colourDepth > 1;",
      expect: "T2.160"
    },
    {
      // **The percentage back to `meta`**, which is what the tree drew and what
      // §034 does not. The glyphs are identical, so only a row reading the
      // channel catches it.
      name: "the percentage takes meta again",
      file: BAR,
      from: "            { text: ` ${percent}`, style: muted },",
      to: "            { text: ` ${percent}`, style: tone(\"meta\", ctx.theme, ctx.capabilities) },",
      expect: "T2.160",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
