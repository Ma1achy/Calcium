// C22 I104 — a sliced block is held under its window, and a miss that
// reaches the same window takes it. Mutated (T6.118, F1190).
//
// **The frame is the same under every mutation but one** — a slice served at
// the window it was rendered for is the render it replaces — so T4.89f reads
// the dividing kind's render count across a tick, and the parts at the cache.
// The one the frame can see is the window dropped from the key: a one-row
// scroll then lays the last window's rows, and the tail is no longer the tail.
//
// **The control is the slice never read.** Every tick renders the slice again
// and T4.89f's "no further time" reads one more.
//
// **Blind spot, stated.** The animating filter over the slice (`withoutAnimating`
// in session.ts) is not mutated here: no shipped kind both declares `window`
// and animates, so no row can construct a sliced block the filter would
// withhold. The read and hold halves are the same shape as I103's, which
// `c22-tick-axis` mutates on the whole-block path.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/integration/render-cache.test.ts";
const RC = "src/shell/render-cache.ts";
const EL = "src/shell/entry-layout.ts";

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
    file: EL,
    from: "      let lines = held.slice(block.id, window);",
    to: "      let lines: readonly string[] | undefined = undefined;",
    why: "the slice is never read back: the tick renders the dividing kind again and T4.89f counts one more",
  },
  mutations: [
    {
      // **The window dropped from the key.** A scroll reaches the same key and
      // is served the last window's rows: the tail on screen is not the tail.
      name: "KEY-WITHOUT-WINDOW: the slice is held and read under the block's id alone",
      file: EL,
      from: "      const window = `${String(piece.localFrom)}\\u0000${String(piece.take)}`;",
      to: '      const window = "";',
      expect: "T4.89f",
    },
    {
      // **The hold does not replace.** Keyed on id and window, the store grows
      // by one per scroll and the first window is still served after the second.
      name: "HOLD-ACCUMULATES: slices keyed on id and window, one entry per window visited",
      file: RC,
      from: "      holdSlice: (id, window, lines) => void open.parts.slices.set(id, { window, lines }),",
      to: "      holdSlice: (id, window, lines) => void open.parts.slices.set(`${id}\\u0000${window}`, { window, lines }),",
      also: [
        {
          file: RC,
          from: "        const held = open.parts.slices.get(id);",
          to: "        const held = open.parts.slices.get(`${id}\\u0000${window}`);",
        },
      ],
      expect: "T4.89f",
    },
    {
      // **Held by nobody**, which is the tree before I104: the read finds
      // nothing and every tick renders the slice.
      name: "HELD-BY-NOBODY: the rendered slice is not held",
      file: EL,
      from: "        held.holdSlice(block.id, window, lines);",
      to: "        void window;",
      expect: "T4.89f",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
