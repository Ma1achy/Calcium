// C04 I124–I126 — the tape's window and its ladder (§3ao, §095).
//
// **Every clause here is one a reader would accept at a glance**, which is what
// the walk said about this kind before it existed: a window that grows greedily
// draws a plausible row, a ladder that puts the clocks back reads as generous,
// and a start taken as the globally smallest looks like *the minimum* until you
// ask minimum of what. None of them is visible in a frame you are not comparing
// against another frame.
//
// The two that matter most are the two the walk found and the two that are
// cheapest to write by accident: `grow while it fits` (D1) and the clocks
// coming back once the window has slid (C3).
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const WINDOW = "src/presentation/blocks/tape-window.ts";
const KIND = "src/presentation/blocks/kinds/tape.ts";
const FILES = "test/unit/tape.test.ts test/unit/trust-boundary.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 600_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 600000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change every arm of the sweep can see** (F1254): the window is always
    // the whole tape, so no mark is ever drawn and the sweep's reference
    // disagrees at every width that overflows.
    file: WINDOW,
    from: "  let lo = held;\n  let hi = endFrom(held);",
    to: "  let lo = 0;\n  let hi = n;",
    why:
      "the window is the whole tape at every width, so `«n` and `n»` are never drawn "
      + "and the sweep's exhaustive reference disagrees wherever the members do not all fit",
  },
  mutations: [
    {
      // **THE DEFECT the walk was run to find** (D1). The end bound stops at
      // the first width that does not fit, which is the implementation anyone
      // writes — and it draws one member where three fit, because reaching the
      // last one removes a `n»` worth more than the member costs.
      name: "THE DEFECT: the window grows while it fits, stopping at the first failure",
      file: WINDOW,
      from: "    let best = lo + 1;\n    for (let hi = lo + 1; hi <= n; hi += 1) if (cost(lo, hi) <= room) best = Math.max(best, hi);\n    return best;",
      to: "    let best = lo + 1;\n    while (best < n && cost(lo, best + 1) <= room) best += 1;\n    return best;",
      expect: "T1.49",
    },
    {
      // **The start taken as the globally smallest rather than the minimum
      // move.** It reads as *the minimum* and drags the window backwards to
      // reach something ahead of it — the cursor-dragging behaviour §095's
      // first paragraph separates a tape from.
      name: "the start is the smallest that fits rather than the least distance moved",
      file: WINDOW,
      from: "    for (let l = lo; l <= at; l += 1) {",
      to: "    for (let l = 0; l <= at; l += 1) {",
      expect: "T1.49",
    },
    {
      // **The window moves when it does not need to.** Dropping the *already
      // inside* arm re-anchors on every change of current, which is a cursor
      // dragging the row along rather than a tape.
      name: "the window re-anchors on the current even when the current is already in it",
      file: WINDOW,
      from: "  } else if (at >= hi) {",
      to: "  } else if (at >= lo) {",
      expect: "T1.49",
    },
    {
      // **`«0` and `0»`.** Zero hidden is no mark — a mark with nothing to
      // count says nothing, and it spends cells the members were using.
      name: "a mark is drawn even where nothing is hidden behind it",
      file: WINDOW,
      from: "    const left = lo === 0 ? 0 : measure(`${marks.left}${String(lo)}`) + marks.gap;",
      to: "    const left = measure(`${marks.left}${String(lo)}`) + marks.gap;",
      expect: "T1.49",
    },
    {
      // **THE OTHER DEFECT, and the one no sequence reaches** (C3). The ladder
      // stops being monotonic: once the window has slid, the few visible
      // members fit with their clocks again and a re-measuring implementation
      // puts them back — trading a member for a clock, which is rule 1 exactly.
      name: "THE DEFECT: the clocks come back once the window has slid",
      file: KIND,
      from: "  const rich = texts(block, true, ctx);\n  const detail = whole(rich);",
      to: "  const rich = texts(block, true, ctx);\n  const detail = whole(rich) || block.members.length > 3;",
      expect: "T1.50",
    },
    {
      // **The group shed one at a time.** Three clocks and two blanks says the
      // blanks are still running, which is a row that is wrong rather than
      // narrow — all-or-nothing is what makes the shed honest.
      name: "the details are shed per member rather than all together",
      file: KIND,
      from: "  const list = detail ? rich : texts(block, false, ctx);",
      to: "  const list = detail ? rich : rich.map((t, i) => (i % 2 === 0 ? t : texts(block, false, ctx)[i] ?? t));",
      expect: "T1.50",
    },
    {
      // **A member off the end loses its element**, which orphans the focus
      // §095's whole argument is about — and is exactly the refusal `steps`
      // recorded against shedding a row.
      name: "only the members inside the window declare an element",
      file: KIND,
      from: "  for (const m of block.members) {",
      to: "  for (const m of block.members.slice(0, 2)) {",
      expect: "T1.48",
    },
    {
      // **A state this build does not know throws instead of drawing nothing.**
      // `state` is not validated, so a tape from the far side can name
      // anything; C09 §7d's sweep is what found this and it is what keeps it.
      name: "an unknown call state is resolved to a glyph rather than to no mark",
      file: KIND,
      from: "  const slot = state === undefined ? undefined : CALL_STATE_GLYPH[state];",
      to: "  const slot = state === undefined ? undefined : (CALL_STATE_GLYPH[state] ?? \"ok\");",
      expect: "T1.48",
    },
    {
      // **The current's own lead is not priced into its width**, so the row it
      // is in overflows by the two cells `› ` takes — the arithmetic agreeing
      // with itself about a row that does not fit.
      name: "the current's lead is not counted in the width it needs",
      file: KIND,
      from: "  return list.map((t, i) => cells(t, caps.ambiguousWidth) + (i === current ? LEAD_CELLS : 0));",
      to: "  return list.map((t) => cells(t, caps.ambiguousWidth));",
      expect: "T1.50",
    },
  ],
});

// Printed and exited on, not merely computed (F768).
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
