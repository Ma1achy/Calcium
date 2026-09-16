// C09 I78 — a row under the width is returned as itself with the shortfall in
// blanks, and only a row over the width walks. Mutated (T6.124, F1204).
//
// **The answer is held from outside** — width, prefix, suffix, resets — so
// each mutation moves one of those: the pad a blank short, the early return
// taken for a row over the width, a reset appended to the padded row. The
// goldens run beside the unit rows because every frame row goes through this
// function, and a frame is the artefact the invariant is about.
//
// **The control pads one short**: every short row in T1.52 measures a cell
// under the width, and every golden frame with a padded row moves.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/text.test.ts test/edge/text-cursor.test.ts test/golden";
const TEXT = "src/presentation/text.ts";

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

const LINE = '  if (measured < width) return text + " ".repeat(width - measured);';

const results = runPass({
  read,
  write,
  run,
  control: {
    file: TEXT,
    from: LINE,
    to: '  if (measured < width) return text + " ".repeat(width - measured - 1);',
    why: "the pad a blank short: every short row a cell under the width, and every padded golden row moves",
  },
  mutations: [
    {
      // **A row over the width returned uncut**: the early return taken for
      // `!==`, so a long row is wider than the frame and wraps.
      name: "OVER-WIDTH-RETURNED: the early return taken for a row over the width",
      file: TEXT,
      from: LINE,
      to: '  if (measured !== width) return text + " ".repeat(Math.max(0, width - measured));',
      expect: "T1.52",
    },
    {
      // **A reset on the pad**: four bytes on every short styled row, which
      // T1.30's padded answer and every golden forbid.
      name: "RESET-ON-PAD: the padded row closed with the reset",
      file: TEXT,
      from: LINE,
      to: '  if (measured < width) return text + reset + " ".repeat(width - measured);',
      expect: "T1.52",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
