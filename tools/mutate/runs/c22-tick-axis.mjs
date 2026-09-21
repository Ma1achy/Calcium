// C22 I103 — a miss on the tick alone renders the blocks that animate and
// assembles the rest from the parts. Mutated (T6.117, F1189).
//
// **The frame is the same under every mutation here but one** — the parts
// hold the same rows the sequence render would lay, by I101's identity — so
// T4.89e reads the render count and the miss reasons as well as the frame.
// The one the frame can see is the animating block served from the parts:
// the glyph stops turning.
//
// **The control is the tick reported as the range.** No frame moves and no
// render is added; T4.89e's `tick: 1` reads 0.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/integration/render-cache.test.ts test/unit/profiler-seams.test.ts";
const RC = "src/shell/render-cache.ts";
const S = "src/shell/session.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
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
    file: RC,
    from: '    if (slot.tick !== tick) return this.#miss(id, "tick", slot.lines, slot.parts);',
    to: '    if (slot.tick !== tick) return this.#miss(id, "range", slot.lines, slot.parts);',
    why: "the tick reported under the range's name: no frame moves and T4.89e's tick count reads 0",
  },
  mutations: [
    {
      // **The counter folded back into the focus string.** Every tick is a
      // focus miss again, the parts are dropped, the kept block renders again.
      name: "FOLD-INTO-FOCUS: the tick rides in the compound slot and the axis is passed empty",
      file: S,
      from: "    const held = graph.rendered.get(entry.id, entry.rev, width, slot, theme, range, tickKey);",
      to: '    const held = graph.rendered.get(entry.id, entry.rev, width, `${slot}\\u0000${tickKey}`, theme, range, "");',
      also: [
        {
          file: S,
          from: "      graph.rendered.set(entry.id, entry.rev, width, slot, theme, range, lines, tickKey);",
          to: '      graph.rendered.set(entry.id, entry.rev, width, `${slot}\\u0000${tickKey}`, theme, range, lines, "");',
        },
      ],
      expect: "T4.89e",
    },
    {
      // **The tick miss drops the parts.** Reported right, rendered whole.
      name: "TICK-DROPS-PARTS: a tick miss closes the parts like a focus miss",
      file: RC,
      from: '    if (slot.tick !== tick) return this.#miss(id, "tick", slot.lines, slot.parts);',
      to: '    if (slot.tick !== tick) return this.#miss(id, "tick", slot.lines, null);',
      expect: "T4.89e",
    },
    {
      // **The animating block served from the parts.** The status's rows are
      // the last tick's: the glyph does not turn, and the frame says so.
      // **Both halves of the filter**, or the mutation is a no-op: with the read
      // unfiltered and the hold still filtered the spinner is never held, so
      // there is nothing stale to read — the first run's survivor (F1189).
      name: "ANIMATING-FROM-PARTS: the assembly takes the spinner's rows from the held parts",
      file: S,
      from: "    part: (key) => (animating.has(blockOf(key)) ? undefined : parts.part(key)),",
      to: "    part: (key) => parts.part(key),",
      also: [
        {
          file: S,
          from: "      if (!animating.has(blockOf(key))) parts.hold(key, lines);",
          to: "      parts.hold(key, lines);",
        },
      ],
      expect: "T4.89e",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
