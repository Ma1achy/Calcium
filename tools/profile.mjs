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
// honest way to reach it is to be a consumer. The three imports below are the
// three subpaths a consumer has — the package root, `@fmx/calcium/testing` and
// `@fmx/calcium/profiling` — reached by the paths `package.json` maps them to.
//
// Usage, inside the devcontainer, after `npm run build`:
//
//     node tools/profile.mjs [lines] [keystrokes] [tier]
//
import { b, createTui, defaultTheme } from "../dist/index.js";
import { checkBudget, formatBudget } from "../dist/testing/index.js";
import { PHASE_GROUP } from "../dist/shell/profiling/index.js";
import { fakeStdin, fakeStdout, screenRows } from "./bench/fakes.mjs";
import { liveness } from "./bench/liveness.mjs";

const LINES = Number(process.argv[2] ?? 2_000);
const KEYS = Number(process.argv[3] ?? 30);
// `spans` rather than `deep`: `deep` starts the inspector and writes capture
// files, which is a different tool's job. Every row of the appendix is
// answerable at `spans`.
const TIER = process.argv[4] ?? "spans";
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
  manifest: { schema: "tui.manifest/1", binary: "profile", version: "1.0.0", tools: [] },
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

console.log(`# make profile — ${String(LINES)} patch lines + a 40-row table + a 200-point plot`);
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

// --- the appendix -----------------------------------------------------------

console.log(`\n## A01 Appendix B\n`);
const budget = checkBudget(report);
console.log(formatBudget(budget));

const share = (part, of) => (of === 0 ? "-" : `${((part / of) * 100).toFixed(1)}%`);

// --- where the frame went ---------------------------------------------------
//
// **The compute/draw split, which is the question the component exists for.**
// `spans` is keyed by span name and carries no grouping; `PHASE_GROUP` supplies
// one, and it is published for exactly this.

const spans = report.spans ?? {};
const groups = new Map();
let unphased = 0;
for (const [name, hist] of Object.entries(spans)) {
  const group = PHASE_GROUP[name];
  // `frame` is not a phase: it is the *self* time of the frame span, meaning
  // the shell's own per-frame work outside every other span (C28 I40). It gets
  // a row below rather than a share of itself.
  if (group === "total") continue;
  // A component's own sub-span — `group.place` and its kin, from `ctx.probe`.
  // `PHASE_GROUP` is total over `SpanName` and these are not members, so they
  // have no phase and would vanish from a table that skipped them silently.
  if (group === undefined) {
    unphased += hist.sum;
    continue;
  }
  groups.set(group, (groups.get(group) ?? 0) + hist.sum);
}
// **The whole is `latency.work`, not `spans.frame`** (C28 I40, F885). Every
// histogram in `spans` carries self time, so `spans.frame` is the frame's work
// outside every other span — a real number, an order of magnitude smaller, and
// entirely plausible as a denominator. Dividing by it published `react` at 96%
// of a frame it is 72% of.
const whole = report.latency?.work.sum ?? 0;
const frameSelf = spans.frame?.sum ?? 0;

console.log(`\n## Where the frame went — ${String(report.frames)} frames, ${whole.toFixed(0)} ms of work\n`);
console.log("| phase | ms | share of work | spans |");
console.log("|---|---|---|---|");
for (const [group, ms] of [...groups].sort((a, x) => x[1] - a[1])) {
  const members = Object.keys(spans)
    .filter((n) => PHASE_GROUP[n] === group)
    .sort()
    .map((n) => `\`${n}\` ${(spans[n]?.sum ?? 0).toFixed(1)}`)
    .join(", ");
  console.log(`| ${group} | ${ms.toFixed(1)} | ${share(ms, whole)} | ${members} |`);
}
if (unphased > 0) {
  console.log(
    `| *no phase* | ${unphased.toFixed(1)} | ${share(unphased, whole)} | a component's own sub-spans, which \`PHASE_GROUP\` does not map |`,
  );
}
console.log(
  `| *the frame itself* | ${frameSelf.toFixed(1)} | ${share(frameSelf, whole)} | \`frame\`'s self time — per-frame work no other span brackets |`,
);
// **Unattributed, printed rather than left as a gap in the arithmetic.** The
// phases are the spans that exist; what `frame` holds and they do not is the
// work between them, and a table whose rows do not sum to the whole invites the
// reader to assume they do.
const attributed = [...groups.values()].reduce((n, x) => n + x, 0) + unphased + frameSelf;
if (whole > 0) {
  const left = whole - attributed;
  console.log(
    `| *unaccounted* | ${left.toFixed(1)} | ${share(left, whole)} | work in a frame that no span reaches at all |`,
  );
}

// --- which component ---------------------------------------------------------

console.log(`\n## Slowest elements — per instance, measured (C28 I31)\n`);
console.log("| element | total ms | self ms | calls | frames | calls/frame |");
console.log("|---|---|---|---|---|---|");
const worst = [...report.nodes].sort((a, x) => x.self - a.self).slice(0, 10);
for (const n of worst) {
  // **Against the node's own `frames`, not the session's** — the field's own
  // comment says so. A node on screen for 5 frames of 14, measured twice in
  // each, is thrashing at 2.0; divided by the session it reads 0.7 and looks
  // fine. The first draft divided by the session.
  const per = n.frames === 0 ? 0 : n.calls / n.frames;
  console.log(
    `| \`${n.key}\` | ${n.total.toFixed(2)} | ${n.self.toFixed(2)} | ${String(n.calls)} | ${String(n.frames)} | ${per.toFixed(1)}${per > 1.05 ? " <-- measured more than once per frame" : ""} |`,
  );
}

// --- the instrument's own cost -----------------------------------------------

const o = report.overhead;
console.log(
  `\nOverhead: ${String(o.spans)} spans opened, this machine's clock at ${o.clockNs.toFixed(1)} ns, ` +
    `estimate ${o.estimateMs.toFixed(1)} ms of ${whole.toFixed(0)} ms — an estimate, labelled one (C28 I34). ` +
    `Async store ${o.asyncEnabled ? "built" : "not built"}.`,
);
console.log(
  `Dropped: ${String(report.dropped.frames)} frames, ${String(report.dropped.samples)} samples, ` +
    `${String(report.dropped.marks)} marks. Excluded: ${String(report.excluded.selfInflicted)} self-inflicted, ` +
    `${String(report.excluded.fallback)} fallback.`,
);
