// C09 I28 — the bar clamps and the number does not.
//
// **The mutations restore the two halves of the state that shipped**, because
// the defect was one clamp doing two jobs: `Math.min(1, …)` bounded the fill,
// which it must, and the percentage read off the same bounded value, which made
// `100/100` and `150/100` one picture. Each half alone is plausible — a bar
// cannot exceed its cells, and a percentage over 100 looks like a bug — and the
// pair is what says *complete* about something that is not.
//
// The third row is the arithmetic the guard exists for. `total: 0` has no
// proportion at all, and a division that reaches the frame is `NaN%`.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/blocks.test.ts test/golden/blocks.test.ts";
const SIMPLE = "src/presentation/blocks/kinds/simple.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: SIMPLE,
    from: "    const percent = `${Math.round(fraction * 100)}%`;",
    to: '    const percent = "";',
    why: "no percentage at all — if this survives, nothing reads the number and every row below is unearned",
  },
  mutations: [
    {
      // **THE DEFECT, restored.** One clamped value doing both jobs, which is
      // the state that shipped and the one `examples/docker`'s bar was written
      // against from the other side.
      name: "THE DEFECT: the number is read off the clamped fill",
      file: SIMPLE,
      from: "    const percent = `${Math.round(fraction * 100)}%`;",
      to: "    const percent = `${Math.round(fill * 100)}%`;",
      expect: "T1.24",
    },
    {
      // The other half: the fill unclamped. A bar has no cells past its last
      // one, so this writes past the width — a row the terminal wraps and no
      // measurer counted, which is the failure C09 I10 exists to prevent.
      name: "the fill is unclamped, so the bar runs past its cells",
      file: SIMPLE,
      from: "    const fill = Math.min(1, fraction);",
      to: "    const fill = fraction;",
      expect: "T1.24",
    },
    {
      // The zero guard. `current / 0` is `Infinity`, and `Math.round(Infinity *
      // 100)` reaches the frame as `Infinity%` — a number nobody can act on in
      // the one case where there is nothing to report.
      name: "a total of zero divides anyway",
      file: SIMPLE,
      from: "    const fraction = total === 0 ? 0 : Math.max(0, block.current / total);",
      to: "    const fraction = Math.max(0, block.current / total);",
      expect: "T1.24",
    },
    {
      // **The row this pass produced.** A negative `current` is the other end of
      // the same guard and it survived the first run: no fixture carried one, so
      // removing the floor changed nothing any assertion could see. It is not
      // cosmetic — `repeat()` with a negative count throws, so the block does
      // not render at all, which is C09 I2's *no block input throws*.
      name: "a negative current is not floored",
      file: SIMPLE,
      from: "    const fraction = total === 0 ? 0 : Math.max(0, block.current / total);",
      to: "    const fraction = total === 0 ? 0 : block.current / total;",
      expect: "T1.24",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
