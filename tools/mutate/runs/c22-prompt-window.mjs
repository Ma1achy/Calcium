// Entry 28 — the prompt window, mutated.
//
// **The subject is one comparison.** Membership in the window was tested on the
// *painted* index, where a marker row and a content row are the same kind of
// number, so the editor row immediately above a marked window mapped to painted
// 0 — the marker's own row — and both consumers wrote there. The terminal cursor
// was drawn on the elision marker; a selection span washed it. Neither consumer
// was wrong about its own rule.
//
// Both defects are **at rest**, which is why the classification table found them
// and the sequence trace would not have (C22 §6e).
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/session-composite.test.ts test/unit/session-paint.test.ts";
const PAINT = "src/shell/paint.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // **The cursor's half of the shipped defect, and it cannot fire alone.**
    // Listed as an expected survivor with its reason below: with a
    // cursor-following window the cursor is inside by construction, so the
    // painted-index test never meets a row it should refuse. It needed the end
    // anchoring to produce one, and the two shipped together.
    name: "membership is tested on the painted index (cursor)",
    file: PAINT,
    from: "  if (!shows(window, cell.row)) return null;\n  const within = cell.row - window.first + window.offset;",
    to: "  const within = cell.row - window.first + window.offset;\n  if (within < 0 || within >= frame.promptRows) return null;",
    expect: "—",
  },
  {
    // **The same defect's second consumer.** One fault, two writers — and the
    // reason the fix is a coordinate rather than a guard at each site.
    name: "membership is tested on the painted index (wash)",
    file: PAINT,
    from: "    if (shows(window, span.row)) spans.set(span.row - window.first + window.offset, span);",
    to: "    const at = span.row - window.first + window.offset;\n    if (at >= 0 && at < cap) spans.set(at, span);",
    expect: "T1.21b",
  },
  {
    // **The window anchored on the buffer's end again**, which is the state the
    // tree shipped in. T1.21d must pass throughout: with the cursor where it
    // usually is the two rules give the same window, and that is exactly why
    // the deferral survived so long.
    name: "the window is anchored on the end rather than the cursor",
    file: PAINT,
    from: "  const tail = n - (cap - 1);\n  if (at >= tail) {",
    to: "  const tail = n - (cap - 1);\n  if (true) {",
    expect: "T1.21c",
  },
  {
    // **The bottom marker dropped**, cursor-following kept. Nothing about the
    // cursor's position changes and no assertion about a number moves; a wash
    // running past the lower edge simply reads as one that ended there.
    name: "elision below is not marked",
    file: PAINT,
    from: '    return { rows: [...rows.slice(0, cap - 1), elision], first: 0, offset: 0, count: cap - 1 };',
    to: '    return { rows: rows.slice(0, cap), first: 0, offset: 0, count: cap };',
    expect: "T1.21c",
  },
  {
    // **The cap-of-one branch showing the last row again.** T1.5b's ruling is
    // *content beats a marker* and its choice of row was incidental to it —
    // this is the half that changed, and it must be caught rather than assumed.
    name: "a cap of one shows the last row rather than the cursor's",
    file: PAINT,
    from: "  if (cap === 1) return { rows: [rows[at] ?? \"\"], first: at, offset: 0, count: 1 };",
    to: "  if (cap === 1) return { rows: [rows[n - 1] ?? \"\"], first: n - 1, offset: 0, count: 1 };",
    expect: "T1.5b",
  },
  {
    // **The spinner and ghost back on the last painted row**, justified as
    // *that is where the cursor is* — true only while the window was tail
    // anchored, and with a marker below the last row **is** the marker.
    name: "the spinner is written into the last painted row",
    file: PAINT,
    from: "  const last = shows(window, cursor.row)\n    ? cursor.row - window.first + window.offset\n    : out.length - 1;",
    to: "  const last = out.length - 1;",
    expect: "T1.21e",
  },
];

/**
 * Survivors with a reason, and a staleness arm.
 *
 * The pass fails if a listed mutation is caught after all, so an entry cannot
 * outlive its reason.
 */
const EXPECTED_SURVIVORS = new Map([
  [
    "membership is tested on the painted index (cursor)",
    "**the state is unconstructible once the window follows the cursor**, and that is a finding " +
      "about the defect rather than an excuse. The painted-index test is wrong about a row " +
      "outside the window; a cursor-following window has none, so nothing reaches the " +
      "comparison. It shipped in conjunction with the end anchoring, and *the window is " +
      "anchored on the end rather than the cursor* above restores the pair — which is caught, " +
      "by T1.21 as well as T1.21c. **The wash's identical half IS independently catchable**, " +
      "because a span is not the cursor and can lie outside a window the cursor is inside, so " +
      "the two consumers are not symmetric even though the fault was one comparison. The " +
      "harness applies one edit and the pair is not expressible as one; recorded here rather " +
      "than by widening the harness for a single row",
  ],
]);

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: PAINT,
    from: "function shows(window: PromptWindow, row: number): boolean {",
    to: "function shows(_window: PromptWindow, _row: number): boolean {\n  throw new Error(`control`);\n}\nfunction unusedShows(window: PromptWindow, row: number): boolean {",
    why:
      "membership refuses to answer at all — if this survives, nothing in the set reaches the " +
      "window's range test and every kill below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
const stale = results.filter((r) => r.killed && EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length + stale.length > 0 ? 1 : 0);
