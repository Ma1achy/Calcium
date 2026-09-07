// `make profile` — A01 Appendix B, filled from a real session (C28 T5.3, I37).
//
// **The appendix is a six-row decision gate that has been empty since it was
// written**, and its own instruction is *fill this from real numbers; do not
// estimate*. This runs a scripted session and prints the table. Four rows come
// back measured; two come back refused, naming what they would need, because a
// plausible zero in a decision gate closes an experiment nobody ran.
//
// **Reports, never fails.** Same disposition as `make regime`: a budget is a
// claim about a regime, a runner is not the regime it was measured in, and a
// gate that went red on a busy machine would teach people to re-run gates.
//
// **Against `dist/`, through the public surface**, for `frame.mjs`'s two
// reasons. A probe against a stale build gives a wrong negative and nothing
// revisits a ruled-out candidate; and the expensive path is private, so the only
// honest way to reach it is to be a consumer. The imports below reach two of
// the three subpaths a consumer has — the package root and
// `@fmx/calcium/testing` — by the paths `package.json` maps them to.
// `@fmx/calcium/profiling` was the third and is no longer needed: the phase
// table moved into the harness, because a reading computed in a script is a
// reading no row can be written against, which is how its negative residue went
// unasserted (C28 I41, F888).
//
// Usage, inside the devcontainer, after `npm run build`:
//
//     node tools/profile.mjs [lines] [keystrokes] [tier]
//
import { writeFileSync } from "node:fs";

import { b, createTui, defaultTheme } from "../dist/index.js";
import { checkBudget, checkPhases, formatBudget, formatPhases } from "../dist/testing/index.js";
import { fakeStdin, fakeStdout, screenRows } from "./bench/fakes.mjs";
import { liveness } from "./bench/liveness.mjs";

const LINES = Number(process.argv[2] ?? 2_000);
const KEYS = Number(process.argv[3] ?? 30);
// `spans` rather than `deep`: `deep` starts the inspector and writes capture
// files, which is a different tool's job. Every row of the appendix is
// answerable at `spans`.
const TIER = process.argv[4] ?? "spans";
// **Transcript entries, which the greeting alone cannot supply.** Two of P11's
// seven defects are O(entries) — the `entries.find` inside the visible loop
// (`session.ts:1221`) and the whole-transcript `flatMap` before `transmitImage`
// (`:799`) — and a document with one entry makes both correct-for-small-n by
// construction. That is a property of the fixture, not of the code, so their
// cost here is unmeasured rather than small (F886).
const ENTRIES = Number(process.argv[5] ?? 1);
const SIZE = { columns: 200, rows: 50 };

// --- the workload -----------------------------------------------------------
//
// **Several kinds, not one.** The budget rows are about the frame as a whole,
// but the same report answers *which component is slow*, and a document holding
// one kind reports that kind. A patch supplies the rows, a table and a plot
// supply the two measures that cost.

function workload(lines) {
  const patch = b.patch({
    id: "profile-patch",
    path: "src/deep/module.ts",
    language: "typescript",
    hunks: [
      {
        header: `@@ -1,${String(lines)} +1,${String(lines)} @@`,
        lines: Array.from({ length: lines }, (_, i) => ({
          kind: i % 7 === 0 ? "add" : i % 11 === 0 ? "remove" : "context",
          text: `  const value${String(i)} = compute(${String(i)});`,
          oldNo: i + 1,
          newNo: i + 1,
        })),
      },
    ],
  });

  const table = b.table({
    id: "profile-table",
    columns: [b.col("name", "name"), b.col("calls", "calls"), b.col("ms", "ms")],
    rows: Array.from({ length: 40 }, (_, i) =>
      b.row(`r${String(i)}`, {
        name: `handler${String(i)}`,
        calls: String(i * 13),
        ms: (i * 0.37).toFixed(2),
      }),
    ),
  });

  const plot = b.plot({
    id: "profile-plot",
    height: 12,
    series: [
      {
        name: "latency",
        values: Array.from({ length: 200 }, (_, i) => Math.sin(i / 9) * 40 + 50),
      },
    ],
  });

  return {
    schema: "tui.view/1",
    command: "/profile",
    status: "ok",
    // **The patch last, because the viewport follows the tail.** What is on
    // screen is the bottom of the document, so the block the liveness marker
    // looks for has to be the one down there — and it is also the block whose
    // rows make the frame cost real.
    blocks: [table, plot, patch],
    // All ten fields. C04's validator refuses a short `meta`, `appendAndCommit`
    // swallows the throw and `session.ts` swallows the greeting rejection on top
    // of it — so a short one starts a session that draws a prompt and shows
    // nothing, and reports timings for a blank screen (`frame.mjs`, FINDINGS).
    meta: {
      verb: "profile",
      adapter: "profile",
      exitCode: 0,
      durationMs: 0,
      truncated: false,
      argv: ["profile"],
      stderr: "",
      transport: "local",
      origin: "refresh",
    },
  };
}

// --- a second entry-producing verb -------------------------------------------
//
// **Through `localHandlers`, which is the public seam for it** (C22 I3a). The
// transcript grows one entry per submitted command and there is no other way in
// from outside the package: a consumer never reaches the store. Each entry
// carries four blocks rather than one, because the `flatMap` at `session.ts:799`
// is over *blocks in entries*, not over entries.

function benchDoc(n) {
  return {
    schema: "tui.view/1",
    command: `/bench ${String(n)}`,
    status: "ok",
    blocks: [
      b.rule(`entry ${String(n)}`, undefined, { id: `bench-rule-${String(n)}` }),
      b.kv({ entry: String(n), kind: "bench" }, { id: `bench-kv-${String(n)}` }),
      b.table({
        id: `bench-table-${String(n)}`,
        columns: [b.col("k", "k"), b.col("v", "v")],
        rows: Array.from({ length: 4 }, (_, i) =>
          b.row(`b${String(n)}-${String(i)}`, { k: `k${String(i)}`, v: String(i * n) }),
        ),
      }),
      b.spark(
        Array.from({ length: 20 }, (_, i) => Math.sin((i + n) / 4) * 10 + 10),
        { id: `bench-spark-${String(n)}` },
      ),
    ],
  };
}

let submitted = 0;
const localHandlers = { bench: () => benchDoc((submitted += 1)) };
const tools = [
  {
    name: "bench",
    local: true,
    summary: "append one transcript entry",
    args: [],
    flags: [],
  },
];

// --- the run ----------------------------------------------------------------

const settle = async (turns = 3) => {
  for (let i = 0; i < turns; i += 1) await new Promise((r) => setImmediate(r));
};

const stdout = fakeStdout(SIZE);
const stdin = fakeStdin();

/** @type {import("../dist/shell/profiling/index.js").ProfileReport | null} */
let report = null;

const tui = createTui({
  name: "profile",
  binary: "/bin/true",
  manifest: { schema: "tui.manifest/1", binary: "profile", version: "1.0.0", tools },
  localHandlers,
  theme: defaultTheme,
  env: { TERM: "xterm-256color", COLORTERM: "truecolor", LANG: "en_GB.UTF-8" },
  stdout,
  stdin,
  greeting: () => workload(LINES),
  // The only way in (C22 I93): a consumer never constructs a recorder, and
  // `onReport` is the only way one gets back out (C28 I38).
  // **`sampleMs` well under the run**, because the appendix's CPU row is a rate
  // and a rate needs two samples: the default 1000 ms never fires inside a
  // sub-second scripted session, and the row comes back refused for a reason
  // that has nothing to do with the code under test.
  profile: { tier: TIER, sampleMs: 25, onReport: (r) => void (report = r) },
});

console.log(`# make profile — ${String(LINES)} patch lines + a 40-row table + a 200-point plot, ${String(ENTRIES)} transcript ${ENTRIES === 1 ? "entry" : "entries"}`);
console.log(`# ${String(SIZE.columns)}x${String(SIZE.rows)}, ${String(KEYS)} keystrokes, tier ${TIER}, node ${process.version}\n`);

await tui.start();
await settle();

// **The fixture is shown to respond before a number is read from it**
// (`test/support/README.md`). A greeting C04 refuses leaves a blank screen and a
// perfectly plausible set of timings — flat across every size, which is the only
// reason it was ever noticed.
const live = liveness(screenRows(stdout.chunks, SIZE), { marker: "value", kind: "patch" });
if (live.dead) {
  console.error(live.line);
  process.exit(1);
}
console.log(live.line);

// **The submits, before the keystrokes.** Each one appends an entry, so the
// keystroke frames that follow are composed against the full transcript — which
// is the state the two O(entries) defects are about. Typing and the newline go
// as separate chunks with a settle between: a burst carrying `\r` is a *paste*
// to the decoder (C16 §7) and a pasted newline is content, which leaves the line
// typed and unsubmitted (`test/e2e/manifest.test.ts` records the same trap).
for (let i = 1; i < ENTRIES; i += 1) {
  stdin.emit("/bench");
  await settle(1);
  stdin.emit("\r");
  await settle(2);
}
if (ENTRIES > 1 && submitted !== ENTRIES - 1) {
  console.error(
    `\nFIXTURE DEAD: ${String(ENTRIES - 1)} submits asked for, ${String(submitted)} handler calls — ` +
      `the commands did not reach the far side, so every entry count below is the greeting's alone`,
  );
  process.exit(1);
}

for (let i = 0; i < KEYS; i += 1) {
  stdin.emit("x");
  await settle(1);
}
await settle();

await tui.stop("exit");

if (report === null) {
  console.error("\nno report — `onReport` did not fire, so nothing was recorded (C28 I38)");
  process.exit(1);
}

// **The whole report, when asked for.** `make profile` prints a reading; a
// question the printed tables do not answer needs the object they were computed
// from, and writing it is cheaper than adding a table per question.
if (process.env.PROFILE_JSON !== undefined) {
  writeFileSync(process.env.PROFILE_JSON, JSON.stringify(report, null, 1));
}

// --- the appendix -----------------------------------------------------------

console.log(`\n## A01 Appendix B\n`);
const budget = checkBudget(report);
console.log(formatBudget(budget));

const share = (part, of) => (of === 0 ? "-" : `${((part / of) * 100).toFixed(1)}%`);

// --- where the frame went ---------------------------------------------------
//
// **Two tables, because there are two populations** (C28 I41). `latency.work`
// sums the frames' work, so a span opened between frames — `local`, `handler`,
// `route`, `decode` — is not in it, and a share taken over the union divides
// one population by another's total. This printed a residue of -460.5 ms the
// first time a session ran commands, and 1.1% of a reading before that (F888).
// The check is `checkPhases`, so the assertion lives in a row rather than here.

const phases = checkPhases(report);
console.log();
console.log(formatPhases(phases));

// --- which component ---------------------------------------------------------

console.log(`\n## Slowest elements — per instance, measured (C28 I31)\n`);
console.log("| entry | element | total ms | self ms | calls | frames | calls/frame |");
console.log("|---|---|---|---|---|---|---|");
const worst = [...report.nodes].sort((a, x) => x.self - a.self).slice(0, 10);
for (const n of worst) {
  // **Against the node's own `frames`, not the session's** — the field's own
  // comment says so. A node on screen for 5 frames of 14, measured twice in
  // each, is thrashing at 2.0; divided by the session it reads 0.7 and looks
  // fine. The first draft divided by the session.
  const per = n.frames === 0 ? 0 : n.calls / n.frames;
  console.log(
    `| ${n.entry === undefined ? "*chrome*" : `\`${n.entry}\``} | \`${n.key}\` | ${n.total.toFixed(2)} | ${n.self.toFixed(2)} | ${String(n.calls)} | ${String(n.frames)} | ${per.toFixed(1)}${per > 1.05 ? " <-- measured more than once per frame" : ""} |`,
  );
}

// --- per transcript entry ----------------------------------------------------

// **The other partition of the same population** (C28 I42). Every element close
// lands in one bucket of `byKind` and at most one of `byEntry`, so `Σ byKind` is
// `Σ nodes.self` exactly and `Σ byEntry` falls short by what belongs to no entry.
// That shortfall is printed rather than absorbed: a table omitting the chrome
// reads as *the chrome is free*, and the chrome is measured every frame.
const nodeSelf = report.nodes.reduce((sum, n) => sum + n.self, 0);
const entries = Object.entries(report.byEntry).sort((a, x) => x[1].sum - a[1].sum);
const entrySelf = entries.reduce((sum, [, h]) => sum + h.sum, 0);

console.log(`\n## Cost per transcript entry — what is on screen, not what kind it is (C28 I42)\n`);
console.log("| entry | self ms | share of element work | elements measured | slowest element |");
console.log("|---|---|---|---|---|");
for (const [id, h] of entries) {
  const slowest = report.nodes
    .filter((n) => n.entry === id)
    .reduce((best, n) => (best === null || n.self > best.self ? n : best), null);
  console.log(
    `| \`${id}\` | ${h.sum.toFixed(2)} | ${nodeSelf === 0 ? "—" : `${((h.sum / nodeSelf) * 100).toFixed(1)}%`} | ` +
      `${String(h.count)} | ${slowest === null ? "—" : `\`${slowest.key}\` ${slowest.self.toFixed(2)} ms`} |`,
  );
}
console.log(
  `| *no entry* | ${(nodeSelf - entrySelf).toFixed(2)} | ` +
    `${nodeSelf === 0 ? "—" : `${(((nodeSelf - entrySelf) / nodeSelf) * 100).toFixed(1)}%`} | — | ` +
    `chrome, prompt and overlays — measured every frame and belonging to no entry |`,
);

// --- the instrument's own cost -----------------------------------------------

const o = report.overhead;
console.log(
  `\nOverhead: ${String(o.spans)} spans opened, this machine's clock at ${o.clockNs.toFixed(1)} ns, ` +
    `estimate ${o.estimateMs.toFixed(1)} ms of ${phases.work.toFixed(0)} ms — an estimate, labelled one (C28 I34). ` +
    `Async store ${o.asyncEnabled ? "built" : "not built"}.`,
);
console.log(
  `Dropped: ${String(report.dropped.frames)} frames, ${String(report.dropped.samples)} samples, ` +
    `${String(report.dropped.marks)} marks. Excluded: ${String(report.excluded.selfInflicted)} self-inflicted, ` +
    `${String(report.excluded.fallback)} fallback.`,
);
