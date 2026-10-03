// C09 I138, ruling 85 — a failed status leads with the failure mark, and the
// warning's mark is never a status's (F1461, T6.192).
//
// **One line decides the mark, and it can be wrong four ways.** It can name
// the warning's character again (what shipped), it can drop the mark from one
// of the two failed states, it can hand a mark to a state that did not fail,
// and the set it reads from can give the failure mark the warning's ASCII
// half — the rung where the mark is one of two carriers, so a collision there
// is the whole defect with none of it visible at 24 bits.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const STATUS = "src/presentation/blocks/kinds/status.ts";
const GLYPHS = "src/presentation/blocks/glyphs.ts";
const FILES = "test/contract/blocks.test.ts test/edge/status.test.ts test/unit/image-halfblock.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const MARK = 'const mark = block.state === "error" || block.state === "retrying" ? `${g.cross} ` : "";';

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change the corpus can see** (F1254): no failed state draws a mark,
    // so every row naming the lead — T2.230, T3.46, T3.47, HB8 — has nothing
    // to read.
    file: STATUS,
    from: MARK,
    to: 'const mark = "";',
    why:
      "a failed status draws no mark at all — if this survives, the rows are not reading the "
      + "message row the status draws",
  },
  mutations: [
    {
      // **What shipped**: the warning's character, through the vocabulary's
      // `warn` token now that `GlyphSet.warning` is retired. Inlined as the
      // two arms so the mutation fails on what it draws and not on an import.
      name: "T6.192: the failed states lead with the warning's mark again",
      file: STATUS,
      from: MARK,
      to:
        'const mark = block.state === "error" || block.state === "retrying" ? '
        + '`${ctx.capabilities.unicode === "ascii" ? "!" : "\\u25b2"} ` : "";',
      expect: "T2.230",
    },
    {
      // `retrying` is the error box plus a line (C09 I32), so a mark decided
      // for one state alone draws the two failures differently.
      name: "T6.192: only `retrying` carries the mark",
      file: STATUS,
      from: MARK,
      to: 'const mark = block.state === "retrying" ? `${g.cross} ` : "";',
      expect: "T2.230",
    },
    {
      // `loading` did not fail (I85's reasoning, §047): a mark on it says it did.
      name: "T6.192: every state but `empty` carries the mark",
      file: STATUS,
      from: MARK,
      to: 'const mark = block.state !== "empty" ? `${g.cross} ` : "";',
      expect: "T2.230",
    },
    {
      // **The ASCII rung, where the collision is the whole defect**: the
      // failure mark's ASCII half given the warning's `!`. The Unicode rung
      // still draws ✗, so a row asserting at 24 bits alone agrees.
      name: "T6.192: the failure mark's ASCII half is the warning's `!`",
      file: GLYPHS,
      from: '  cross: "x",',
      to: '  cross: "!",',
      expect: "T2.230",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
