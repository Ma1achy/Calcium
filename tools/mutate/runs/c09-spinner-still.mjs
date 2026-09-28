// Within a spinner set, the ASCII rung must move (C09 I98, question 39).
//
// **Each mutation freezes one set's ASCII rung** — the defect the ruling names:
// a fallback that turns an animation into a still mark in a slot that says
// *live*. One freezes the tree's table, one the rung's resolver, and one the
// registry's own pattern, because T2.190 reads both catalogues and a row that
// read one would pass a still set added to the other.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/glyph-registry.test.ts";
const GLYPHS = "src/presentation/blocks/glyphs.ts";
const REGISTRY = "docs/design/language/calcium-registry.json";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the corpus can see**: `noise`'s ASCII half, read by T2.190's
    // tree walk and by nothing that would excuse it.
    file: GLYPHS,
    from: '    ascii: Object.freeze(["#", "*", "."]),',
    to: '    ascii: Object.freeze(["#", "#", "#"]),',
    why: "noise's ASCII rung frozen on # — if this survives, the row reads no set",
  },
  mutations: [
    {
      // The tree's own table: `triangle` turning through four directions,
      // flattened to one.
      name: "a set's ASCII half is one character",
      file: GLYPHS,
      from: '    ascii: Object.freeze(["v", "<", "^", ">"]),',
      to: '    ascii: Object.freeze(["^", "^", "^", "^"]),',
      expect: "T2.190",
    },
    {
      // **The rung's resolver, not the table**: every set's ASCII answer taken
      // as its first frame repeated, which no single set's record shows.
      name: "the ASCII rung answers its first frame for every frame",
      file: GLYPHS,
      from: "  return atAsciiRung(caps, set) ? set.ascii : set.frames;",
      to: '  return atAsciiRung(caps, set) ? set.ascii.map(() => set.ascii[0] ?? "") : set.frames;',
      expect: "T2.190",
    },
    {
      // **The design's side**: `toggle`'s registered pattern frozen. The tree
      // still moves, so only the registry half of the row can see it.
      name: "a registered set's ASCII pattern is one character",
      file: REGISTRY,
      from: '"asciiPattern": [\n        "<",\n        ">"\n      ],',
      to: '"asciiPattern": [\n        "<",\n        "<"\n      ],',
      expect: "T2.190",
    },
  ],
});
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
