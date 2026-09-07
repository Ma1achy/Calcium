// C12 I98 — a colour per axis, and whether a row can tell a coloured axis from a
// recoloured frame.
//
// **The subject is one optional field, and the risk is entirely in the seam.**
// The frame draws last into cells the data did not take, so a tone that never
// arrives and a tone that arrives everywhere both leave a frame that looks
// plausible — the first is the field being ignored and the second is the ruling
// about the box being lost. One mutation each.
//
// **Which rows this reaches, stated.** Four mutations kill AT1, AT2 and AT3.
// **AT4 and AT5 have none**: AT4 asserts a *limit* — that no `Tone` is
// validated anywhere (F479) — and a mutation making the gate stricter would
// kill it while being an improvement, which is not what this instrument is for;
// AT5 asserts the absence of a default, and every mutation that gives the field
// one is the same mutation as the first below.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-axis-tone.test.ts";
const SCATTER = "src/presentation/plot/scatter3.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: SCATTER,
    // The frame's own colour, which AT5 asserts every frame cell carries by
    // default and AT1 counts exactly.
    from: '  const frameStyle: Style = slot("tone.muted", ctx.theme, ctx.capabilities);',
    to: '  const frameStyle: Style = slot("tone.accent", ctx.theme, ctx.capabilities);',
    why: "AT5 asserts no accent appears by default and AT1 counts the muted cells exactly; a run where recolouring the whole frame survives cannot see a kill",
  },
  mutations: [
    {
      // **The field is ignored.** The axis draws in the frame's colour and
      // everything still looks like a frame — which is the failure this whole
      // row exists to distinguish, and the reason AT1 puts the axis in front of
      // the data rather than counting coloured cells anywhere.
      name: "the axis tone never reaches the stroke",
      file: SCATTER,
      //
      // **Re-anchored twice** — once when `strokeSeg` took the tie rule as a
      // required argument (C12 I101), and again when the callback took the
      // sample's own coordinates so the mask arm could link a diagonal's corner
      // cell. The mutation is unchanged through both: the ink never arriving.
      from: "        paint(i, mark, ink, px, py, from, nearer);",
      to: "        paint(i, mark, undefined, px, py, from, nearer);",
      expect: "AT1",
    },
    {
      // **The box takes it too** (§6l row 1), which is the ruling rather than
      // an omission: `box3: "full"` would become a twelve-edge cage in three
      // colours. AT1's exact accounting is what catches it — the muted count
      // falls by more than the accent gains.
      name: "the box edges take the x axis's tone",
      file: SCATTER,
      from: "  for (const e of boxEdges(corner, boxMode)) stroke(e);",
      to: "  for (const e of boxEdges(corner, boxMode)) stroke(e, inkOf(block.axisStyle3?.x));",
      expect: "AT1",
    },
    {
      // **The label keeps the pass's ink** (§6l row 2). The line changes colour
      // and its name does not — two answers to *which axis is this*, and
      // invisible to any row asserting that an accent cell exists.
      name: "the label keeps the frame's ink",
      file: SCATTER,
      from: "    const own = l.ink ?? colour;",
      to: "    const own = colour;",
      expect: "AT2",
    },
    {
      // **The tone survives the colour rungs** (§6l row 5). `slot` degrades by
      // capability, so forcing a 24-bit resolution puts colour on a frame that
      // has none — AT3's 1-bit and ascii arms are what refuse it.
      name: "the tone is resolved at 24-bit whatever the terminal is",
      file: SCATTER,
      from: "      : slot(`tone.${spec.tone}`, ctx.theme, ctx.capabilities).colour;",
      to: "      : slot(`tone.${spec.tone}`, ctx.theme, { ...ctx.capabilities, colourDepth: 24 }).colour;",
      expect: "AT3",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
