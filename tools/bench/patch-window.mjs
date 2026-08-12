// The cost of building one patch window — the path nothing benched.
//
// **This exists because the row that fixed the fullscreen view's correctness
// could not say what it cost** (F134). `windowPatch` is called once per frame by
// `patch-view.ts`, and C25 I21a added a `numberWidth(patch)` walk to it — a
// second O(n) pass on a path that already walked every line in `rowsOf`. The
// whole tier is about a claim with no measurement behind it, so leaving that one
// unmeasured was the state being complained about.
//
// **What it measures and what it does not.** This times the *window build*, not
// the frame around it: no React, no paint, no diff. So it is the right
// instrument for "did the pin cost anything" and the wrong one for "how fast is
// the fullscreen view" — that needs the view driven through a PTY, and is
// stated here rather than implied by a number that looks like a frame time.
//
// Against `dist/`, so a stale build gives a wrong answer rather than a wrong
// negative nobody revisits (`probes build before they measure`).
//
//     node tools/bench/patch-window.mjs [lines] [reps]
//
import { windowPatch, totalRows, clampOffset } from "../../dist/presentation/patch/window.js";
import { numberWidth } from "../../dist/presentation/patch/layout.js";
import { gutter } from "./liveness.mjs";

const LINES = Number(process.argv[2] ?? 5_000);
const REPS = Number(process.argv[3] ?? 200);
const WIDTH = 200;
const HEIGHT = 50;

/** One hunk of `n` lines, a third of them changed, so split layout pairs runs. */
function patchOf(n) {
  const lines = [];
  for (let i = 0; i < n; i += 1) {
    const kind = i % 3 === 0 ? "remove" : i % 3 === 1 ? "add" : "context";
    if (kind === "remove") lines.push({ kind, text: `  const v${i} = f(${i});`, oldNo: i + 1 });
    else if (kind === "add") lines.push({ kind, text: `  const v${i} = g(${i});`, newNo: i + 1 });
    else lines.push({ kind, text: `  // ${i}`, oldNo: i + 1, newNo: i + 1 });
  }
  return {
    kind: "patch",
    id: "bench",
    path: "src/module.ts",
    language: "typescript",
    hunks: [{ header: `@@ -1,${String(n)} +1,${String(n)} @@`, lines }],
  };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const ms = (t0, t1) => Number(t1 - t0) / 1e6;

const patch = patchOf(LINES);

// The subject before the claim: a patch whose window could not be trivial.
const total = totalRows(patch, WIDTH);
if (total < HEIGHT * 4) {
  console.error(`FIXTURE TOO SMALL: ${String(total)} rows against a ${String(HEIGHT)}-row window.`);
  process.exit(1);
}

console.log(`# window build — ${String(LINES)} patch lines, ${String(total)} rows, ${String(REPS)} reps`);
console.log(`# node ${process.version}\n`);

const times = [];
for (let r = 0; r < REPS; r += 1) {
  // Offsets spread across the document, so the walk is not always from the top.
  const offset = clampOffset(patch, WIDTH, HEIGHT, Math.floor((total * r) / REPS));
  const t0 = process.hrtime.bigint();
  const w = windowPatch(patch, WIDTH, offset, HEIGHT);
  const t1 = process.hrtime.bigint();
  times.push(ms(t0, t1));

  // **The guard, every rep.** A window that returned an empty patch would be the
  // fastest possible and would mean nothing — and the pin is the thing under
  // test, so it is checked rather than assumed present.
  if (r === 0) {
    if (w.hunks.length === 0) {
      console.error("WINDOW EMPTY: nothing below would mean anything.");
      process.exit(1);
    }
    // **This exits now; it used to print `← DRIFT` and carry on.** The two
    // guards above it exit, and a drift is the more serious of the three: an
    // empty window is obviously nothing, and a drifted one is a plausible number
    // for a path that is not the one under test. See `test/unit/bench-liveness.test.ts`.
    const { drift, line } = gutter(numberWidth(w), numberWidth(patch));
    console.log(line);
    if (drift) process.exit(1);
  }
}

console.log(
  `window build  ${median(times).toFixed(3)} ms median   ` +
    `${Math.min(...times).toFixed(3)} min   ${Math.max(...times).toFixed(3)} max`,
);
