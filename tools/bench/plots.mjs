// The plots example, measured — `/all`, one form at a time, and a mesh in orbit.
//
// **The instrument the optimisation pass reads, written before the pass.** The
// roadmap's rule is *profile, do not build on suspicion*, and F507 recorded
// that `tools/bench/` held four benches and none of them was 3-D — so the
// figures every 3-D ruling rested on were never re-taken and had drifted 3.5×
// to 4.6× by the time anyone looked. This is that bench, and the `/all` bench
// beside it.
//
// **Run by hand, never from `make all`.** A timing assertion under contention
// is a flake and not a gate — Group 12's rule. This prints numbers; nothing
// here fails except the fixture guard.
//
// **Against `dist/`, through the public surface, on the example's own
// documents.** `frame.mjs` says why `dist/`: a probe against a stale build gives
// a wrong negative and nothing revisits a ruled-out candidate. The documents
// come from `examples/plots/src/` rather than being transcribed here, because a
// transcription of `/all` is exactly what F396 was — a caption claiming every
// form while the document held one figure per form. The example resolves
// `@fmx/calcium` to `dist/` on its own, so the import is the consumer's path.
//
// **Shares are the reading; absolutes are the record** (F936). Four runs of one
// fixture measured 533, 613, 710 and 854 ms of work on one machine with every
// ratio stable across them, so a phase's share is what moves when the code
// does and an absolute is what moves when the machine does. Three runs a side,
// medians compared against the recorded spread.
//
// Usage, inside the devcontainer, after `make load-down` and `npm run build`:
//
//     node --experimental-strip-types tools/bench/plots.mjs <scenario> [<cols>x<rows>] [reps]
//
//     all              /all, then PageUp × reps and PageDown × reps
//     forms            every form as its own entry, re-rendered `reps` times by
//                      moving focus in and out of it (the key's focus axis, C22 I58)
//     orbit [rung]     one plot3d rung (default `bunny`), focused, `o`, two
//                      seconds of real time under the framework's own orbit
//
//     PROFILE_JSON=path   writes the whole ProfileReport
//
import { writeFileSync } from "node:fs";

import { createTui, defaultTheme } from "../../dist/index.js";
import { checkPhases, formatPhases } from "../../dist/testing/index.js";
import { CATALOGUE, FORMS, variantsOf } from "../../examples/plots/src/catalogue.ts";
import { everyForm } from "../../examples/plots/src/commands.ts";
import { fakeStdin, fakeStdout, screenRows } from "./fakes.mjs";
import { liveness } from "./liveness.mjs";

const SCENARIO = process.argv[2] ?? "all";
const SIZE_ARG = /^(\d+)x(\d+)$/u.exec(process.argv[3] ?? "80x24");
if (SIZE_ARG === null) {
  console.error(`size must be <cols>x<rows>, got ${String(process.argv[3])}`);
  process.exit(2);
}
const SIZE = { columns: Number(SIZE_ARG[1]), rows: Number(SIZE_ARG[2]) };
const REPS = Number(process.argv[4] ?? (SCENARIO === "forms" ? 10 : 40));
const RUNG = SCENARIO.startsWith("orbit") ? (process.argv[5] ?? "bunny") : null;
const ORBIT_MS = 2_000;

const ESC = String.fromCharCode(27);
const KEY = {
  pageUp: `${ESC}[5~`,
  pageDown: `${ESC}[6~`,
  down: `${ESC}[B`,
  escape: ESC,
};

// --- documents ---------------------------------------------------------------

/** A settled document. All ten `meta` fields: C04 refuses a short one and the
 * refusal is swallowed twice on the way to a blank screen (`frame.mjs`). */
const doc = (command, blocks) => ({
  schema: "tui.view/1",
  command,
  status: "ok",
  blocks,
  meta: {
    verb: command.slice(1).split(" ")[0] ?? "bench",
    adapter: "bench",
    exitCode: 0,
    durationMs: 0,
    truncated: false,
    argv: command.slice(1).split(" "),
    stderr: "",
    transport: "local",
    origin: "refresh",
  },
});

const caption = (text) => ({ kind: "notice", id: `cap-${text.replace(/[^a-z0-9]+/giu, "-")}`, tone: "muted", text });

const oneForm = (form) => {
  const drawn = CATALOGUE[form].at(0, 8);
  return "refused" in drawn
    ? [caption(`${form} — refused: ${drawn.refused}`)]
    : [caption(`${form} · ${CATALOGUE[form].says}`), drawn];
};

const meshFigure = (rung) => {
  const variant = variantsOf("plot3d")[rung];
  if (variant === undefined) {
    console.error(`no rung "${rung}" on plot3d — ${Object.keys(variantsOf("plot3d")).join(", ")}`);
    process.exit(2);
  }
  const drawn = CATALOGUE.plot3d.at(0, variant.height ?? 14, { ...variant.spec, id: `bench-${rung}` });
  if ("refused" in drawn) {
    console.error(`plot3d/${rung} refused: ${drawn.refused}`);
    process.exit(2);
  }
  return [caption(`plot3d/${rung} · ${variant.says}`), drawn];
};

// **A handler's throw is swallowed on its way to a notice** — so each one
// reports to stderr first, or a refused document reads as a blank screen.
const reporting = (fn) => (argv, ctx) => {
  try {
    return fn(argv, ctx);
  } catch (e) {
    console.error(`handler ${ctx.command} threw: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
    throw e;
  }
};
const localHandlers = {
  all: reporting((_argv, ctx) => doc(ctx.command, [everyForm(0)])),
  one: reporting((argv, ctx) => doc(ctx.command, oneForm(argv[0] ?? "line"))),
  mesh: reporting((argv, ctx) => doc(ctx.command, meshFigure(argv[0] ?? "bunny"))),
};
const arg = (name) => [{ name, type: "string", required: false, summary: name }];
const tools = [
  { name: "all", local: true, summary: "every form and rung", args: [], flags: [] },
  { name: "one", local: true, summary: "one form", args: arg("form"), flags: [] },
  { name: "mesh", local: true, summary: "one plot3d rung", args: arg("rung"), flags: [] },
];

// --- the run -----------------------------------------------------------------

const settle = async (turns = 3) => {
  for (let i = 0; i < turns; i += 1) await new Promise((r) => setImmediate(r));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stdout = fakeStdout(SIZE);
const stdin = fakeStdin();
let report = null;

const tui = createTui({
  name: "plots-bench",
  binary: "/bin/true",
  manifest: { schema: "tui.manifest/1", binary: "plots-bench", version: "1.0.0", tools },
  localHandlers,
  theme: defaultTheme,
  env: { TERM: "xterm-256color", COLORTERM: "truecolor", LANG: "en_GB.UTF-8" },
  stdout,
  stdin,
  greeting: () => doc("/greeting", [caption("plots bench — the example's own documents, measured")]),
  // `sampleMs` well under the run, for `profile.mjs`'s reason: a rate needs two samples.
  profile: { tier: "spans", sampleMs: 25, onReport: (r) => void (report = r) },
});

/** Type a command and submit it as two chunks: a burst carrying `\r` is a paste. */
async function submit(line) {
  stdin.emit(line);
  await settle(1);
  stdin.emit("\r");
  await settle(4);
}

async function press(key, times = 1, turns = 1) {
  for (let i = 0; i < times; i += 1) {
    stdin.emit(key);
    await settle(turns);
  }
}

/** The fixture is shown to respond before a number is read (`test/support/README.md`). */
function guard(marker, kind, min = 1) {
  const live = liveness(screenRows(stdout.chunks, SIZE), { marker, kind, min });
  if (live.dead) {
    console.error(live.line);
    // The screen itself, because a dead fixture's next question is *what did draw*.
    for (const row of screenRows(stdout.chunks, SIZE)) console.error(`| ${row}`);
    process.exit(1);
  }
  console.log(live.line);
}

console.log(`# plots bench — ${SCENARIO}${RUNG === null ? "" : ` ${RUNG}`} at ${String(SIZE.columns)}x${String(SIZE.rows)}, reps ${String(REPS)}, node ${process.version}`);

await tui.start();
await settle();

const t0 = performance.now();

if (SCENARIO === "all") {
  await submit("/all");
  await settle(6);
  guard(" · ", "figure captions"); // the viewport follows the tail, so the header notice is off screen
  // **The scroll is the reading.** `/all` draws once; the keystrokes are what a
  // reader does next, and every PageUp was a full re-render of every figure.
  await press(KEY.pageUp, REPS);
  await press(KEY.pageDown, REPS);
} else if (SCENARIO === "forms") {
  for (const form of FORMS) {
    await submit(`/one ${form}`);
    // Focus in, focus out — each pair moves the render-cache key's focus axis
    // for the live entry only, so this entry re-renders while the rest hit.
    for (let i = 0; i < REPS; i += 1) {
      await press(KEY.down, 1, 2);
      await press(KEY.escape, 1, 2);
      await sleep(60); // past the decoder's escape disambiguation window (C16)
    }
  }
  guard(" · ", "form captions");
} else if (SCENARIO === "orbit") {
  await submit(`/mesh ${RUNG}`);
  await settle(6);
  guard("▀", "mesh rows"); // the figure fills the region and its caption scrolls off above it
  // Two: the entry's command head is itself the first element (C09 I47), and
  // the caption declares none, so the second `↓` lands on the plot (C12 I85).
  await press(KEY.down, 2, 2);
  await press("o", 1, 2); // orbit on; the framework commits `stream` at its own rate
  await sleep(ORBIT_MS);
  await press("o", 1, 2); // orbit off
  await settle(4);
} else {
  console.error(`unknown scenario ${SCENARIO} — all · forms · orbit [rung]`);
  process.exit(2);
}

const wall = performance.now() - t0;
await tui.stop("exit");

if (report === null) {
  console.error("\nno report — `onReport` did not fire (C28 I38)");
  process.exit(1);
}
if (process.env.PROFILE_JSON !== undefined) {
  writeFileSync(process.env.PROFILE_JSON, JSON.stringify(report, null, 1));
}

// --- the reading -------------------------------------------------------------

const ms = (n) => (n >= 100 ? n.toFixed(0) : n.toFixed(1)).padStart(7);
const pct = (part, of) => (of === 0 ? "     -" : `${((part / of) * 100).toFixed(1).padStart(5)}%`);

const work = report.latency?.work;
console.log(`\n## frames\n`);
console.log(
  `${String(report.frames)} frames in ${wall.toFixed(0)} ms wall · work p50 ${ms(work?.p50 ?? 0)} p95 ${ms(work?.p95 ?? 0)} max ${ms(work?.max ?? 0)} ms · ` +
    `sum ${ms(work?.sum ?? 0)} ms · excluded ${String(report.excluded.selfInflicted)} self-inflicted ${String(report.excluded.fallback)} fallback · dropped ${String(report.dropped.frames)}`,
);

// **The phase table is the harness's** (C28 I55, F1099) — a reading computed
// in a script is a reading no row can be written against.
console.log(`\n## where the frame went\n`);
console.log(formatPhases(checkPhases(report)));

// In-frame spans by share of the frames' work, deepest first. `latency.work`
// is the denominator because every span here is opened inside a frame; a
// share taken over a union of populations is F888.
console.log(`\n## in-frame spans by share of work\n`);
const spans = Object.entries(report.spans ?? {})
  .map(([name, h]) => ({ name, sum: h.sum, count: h.count, p50: h.p50, p95: h.p95 }))
  .sort((a, b) => b.sum - a.sum);
console.log(`${"span".padEnd(18)} ${"share".padStart(6)} ${"sum ms".padStart(8)} ${"n".padStart(6)} ${"p50".padStart(8)} ${"p95".padStart(8)}`);
for (const s of spans.slice(0, 24)) {
  console.log(`${s.name.padEnd(18)} ${pct(s.sum, work?.sum ?? 0)} ${ms(s.sum)} ${String(s.count).padStart(6)} ${ms(s.p50)} ${ms(s.p95)}`);
}

console.log(`\n## block kinds by self time\n`);
const kinds = Object.entries(report.byKind)
  .map(([kind, h]) => ({ kind, sum: h.sum, count: h.count, p50: h.p50 }))
  .sort((a, b) => b.sum - a.sum);
console.log(`${"kind".padEnd(14)} ${"share".padStart(6)} ${"sum ms".padStart(8)} ${"n".padStart(6)} ${"p50".padStart(8)}`);
for (const k of kinds.slice(0, 10)) {
  console.log(`${k.kind.padEnd(14)} ${pct(k.sum, work?.sum ?? 0)} ${ms(k.sum)} ${String(k.count).padStart(6)} ${ms(k.p50)}`);
}

// Per element: self time per render is the figure `forms` exists for, and the
// measures-per-frame ratio is F1098's thrash figure, never `calls/frames`.
console.log(`\n## elements by self time — self per render\n`);
const nodes = [...report.nodes].sort((a, b) => b.self - a.self);
console.log(`${"element".padEnd(34)} ${"self ms".padStart(8)} ${"renders".padStart(8)} ${"per".padStart(8)} ${"meas/fr".padStart(8)}`);
for (const n of nodes.slice(0, SCENARIO === "forms" ? 60 : 15)) {
  const per = n.renders === 0 ? 0 : n.self / n.renders;
  const thrash = n.frames === 0 ? 0 : n.measures / n.frames;
  console.log(`${n.key.padEnd(34)} ${ms(n.self)} ${String(n.renders).padStart(8)} ${ms(per)} ${thrash.toFixed(2).padStart(8)}`);
}

console.log(`\n## cache misses by axis\n`);
for (const [cache, axes] of Object.entries(report.misses)) {
  console.log(`${cache.padEnd(16)} ${Object.entries(axes).map(([a, n]) => `${a} ${String(n)}`).join(" · ")}`);
}

const o = report.overhead;
console.log(
  `\nOverhead: ${String(o.spans)} spans, clock ${o.clockNs.toFixed(1)} ns, estimate ${o.estimateMs.toFixed(1)} ms of ${ms(work?.sum ?? 0).trim()} ms (C28 I34, an estimate).`,
);
