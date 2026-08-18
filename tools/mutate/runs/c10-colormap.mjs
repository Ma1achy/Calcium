// Continuous colour, mutated — C10 I31, and the rows are the three rulings.
//
// **Colour is the failure mode that renders best.** A map that replaces the
// density glyph instead of joining it, one that keeps painting at 4-bit, one
// whose stops are in the wrong order — every frame is a coloured matrix of the
// right size, and only the *relationship* between the two channels is wrong.
// That is why three rows below assert a difference between two renderings
// rather than against one.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/colormap.test.ts test/golden/plot.test.ts";
const MAP = "src/presentation/theme/colormap.ts";
// The heatmap left `definition.ts` for its own module, and the 24-bit arm
// stopped being a ternary when the 256-entry tables landed. Both anchors
// follow their subject.
const HEAT = "src/presentation/plot/heatmap.ts";
const DEF = "src/presentation/plot/definition.ts";
const VAL = "src/data/viewmodel/validate.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 180_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.code === "ETIMEDOUT" ? `${out}\nTIMED OUT after 180000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: MAP,
    from: "const CONTINUOUS_FLOOR = 8;",
    to: "const CONTINUOUS_FLOOR = 999;",
    why: "no depth ever gets a colour — if this survives, nothing reads the second channel and no row below is earned",
  },
  mutations: [
    {
      // **THE RULING**, inverted: colour below 8-bit. C10 I26 says 0–15 are whatever
      // the emulator's palette says, so this paints an *ordering* out of indices
      // whose luminances are unknown — sixteen colours in an arbitrary sequence
      // wearing viridis's name, on a frame that looks like a coloured heatmap.
      name: "THE RULING: a map still paints below 8-bit, where there is no ordering",
      file: MAP,
      from: "const CONTINUOUS_FLOOR = 8;",
      to: "const CONTINUOUS_FLOOR = 4;",
      expect: "T2.31",
    },
    {
      // 24-bit taking the cube entry. Every colour is still viridis-ish and every
      // count agrees; what is lost is the resolution the depth was detected for.
      name: "24-bit quantises to the cube it does not need",
      file: MAP,
      from: "  if (caps.colourDepth >= 24) {",
      to: "  if (caps.colourDepth >= 999) {",
      expect: "T2.31",
    },
    {
      // **The carrier replaced rather than joined.** The one thing F34 forbids:
      // colour becomes the only channel and the frame is beautiful at 24-bit and
      // empty at one bit.
      name: "THE F34 FAILURE: colour replaces the density glyph rather than joining it",
      file: HEAT,
      // The glyph stopped being a string built ahead of the colour run and
      // became a per-column read, so the mutation moved with it: blanking the
      // carrier is now blanking `glyphAt`, and the frame is beautiful at
      // 24-bit and empty at one bit exactly as before.
      from: "    run += glyphAt(x);",
      to: "    run += \" \";",
      expect: "T2.31",
    },
    {
      // The window derived differently from `rampRow`'s, so cell `k` and reading
      // `k` drift apart. Both are right-anchored today; anchoring one left is a
      // matrix whose colours and glyphs describe different ticks.
      name: "the colour window is left-anchored where the glyphs are right-anchored",
      file: HEAT,
      from: "  for (let x = 0; x < w; x += 1) out.push(x < pad ? null : start + (x - pad));",
      to: "  for (let x = 0; x < w; x += 1) out.push(x >= count ? null : x);",
      expect: "T2.31",
    },
    {
      // An unknown name accepted. It paints nothing, which is exactly what a
      // correct block paints at one bit — F172's collision, arriving on the
      // surface built to avoid it.
      name: "an unknown colormap name is accepted, and paints nothing",
      file: VAL,
      from: '    if (b["colormap"] !== undefined && !COLORMAP_SET.has(String(b["colormap"]))) {',
      to: "    if (false) {",
      expect: "T2.31",
    },
    {
      // Sampling unclamped, so a value above the ceiling walks off the table and
      // `mix` reads `undefined` — a colour computed from `NaN` channels.
      name: "sampling does not clamp, so a value past the ceiling leaves the table",
      file: MAP,
      from: "  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;",
      to: "  const clamped = t;",
      expect: "T2.31",
    },
    {
      // **The table reversed.** Every frame is a viridis heatmap and every value
      // reads as its opposite — high is dark, low is bright — which no count, no
      // width and no glyph assertion can see.
      name: "the map runs backwards, so high reads as low",
      file: MAP,
      from: "  const scaled = clamped * (data.length - 1); // cells-ok — a data length",
      to: "  const scaled = (1 - clamped) * (data.length - 1); // cells-ok — a data length",
      expect: "T2.31",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
