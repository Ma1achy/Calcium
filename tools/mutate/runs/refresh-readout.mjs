// C23 I53 — the running card's readout, mutated.
//
// **Every mutation here is a shape the mechanism could have shipped in.** The
// first is the running card's own defect — a figure composed once and never
// re-armed — expressed as the arming clause going missing; the second is the
// stall detector's §8a A4 class arriving one mechanism over, a stopped card that
// keeps counting; the third is C23 I52's guard written on the clock instead of the
// figure, which is the version every first draft writes. The control is the
// write itself: a readout that never patches cannot satisfy T3.61's second
// assertion, so a run where it survives cannot see anything.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/refresh.test.ts";
const FILE = "src/shell/refresh.ts";

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
  // **The sentinel is a mutation the lane killed by hand.** The first control here
  // was vacuous — its `why` described a kill no row constructed — and the harness
  // refused to report (`BlindHarnessError`, F784). A control must be the kill that
  // is not in doubt, not the cleverest change.
  control: {
    file: FILE,
    from: "    if (reading) soonest = Math.min(soonest, now + ELAPSED_TICK_MS);",
    to: "    if (reading && false) soonest = Math.min(soonest, now + ELAPSED_TICK_MS);",
    why: "T3.61 asserts the header reads · 4s after the wake; with no wake armed the card never re-composes — a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **The running card's defect, kept.** Nothing arms the wake, so the
      // header is composed once and stays — F771 exactly.
      name: "the readout arms no wake",
      file: FILE,
      from: "    if (reading) soonest = Math.min(soonest, now + ELAPSED_TICK_MS);",
      to: "    if (reading && false) soonest = Math.min(soonest, now + ELAPSED_TICK_MS);",
      expect: "T3.61",
    },
    {
      // C23 §8a A4's class: the mechanism stops and the block it wrote keeps
      // moving. A settled card counting up is a lie in the final document.
      name: "settlement leaves the readout counting",
      file: FILE,
      from: "      // C23 I53 — a settled card keeps its final figure; the readout stops here.\n      readouts.delete(id);",
      to: "      // C23 I53 — a settled card keeps its final figure; the readout stops here.\n      // readouts.delete(id);",
      expect: "T3.61",
    },
    {
      // C23 I52's guard written on the clock. Every wake inside the same second
      // writes a block that renders identically, bumps `rev`, and invalidates
      // C14's height cache for nothing.
      name: "the guard is the clock and not the figure",
      file: FILE,
      from: "      if (figure === r.last) continue;",
      to: "      if (since === 0) continue;",
      expect: "T3.61b",
    },
    {
      // C23 I46: a card nobody is looking at written into at one full frame each.
      name: "the readout writes off screen",
      file: FILE,
      from: '      if (!deps.visible({ kind: "entry", id })) continue;\n      const since = now - r.startedAt;',
      to: '      const since = now - r.startedAt;',
      expect: "T3.61c",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
