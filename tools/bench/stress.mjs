// The stress cases — a transcript full of one thing, and transcripts full of
// many things, read as frame rate, frame cost, input latency and live heap.
//
// **Pure cases first, then mixed.** A transcript holding nothing but spinners,
// or nothing but live line plots, or nothing but orbiting meshes, isolates one
// renderer's cost under the framework's own cadence; the mixed cases (`session`,
// `mixed`) are the shape a reader actually sits in front of — big patches, long
// text, tables, logs, a spinner at the tail — and say whether the pure figures
// compose. Every case loads `n` entries through the shell's own submit path,
// runs the animation for `seconds`, then scrolls and types with the latency of
// each keystroke measured from the byte in to the first byte out.
//
// **Run by hand, never from `make all`** — a timing assertion under contention
// is a flake and not a gate. Nothing here fails except the fixture guard.
//
// **Against `dist/`, through the public surface**, like `plots.mjs`: a probe
// against a stale build gives a wrong negative and nothing revisits a ruled-out
// candidate. Rebuild before every reading. Inside the devcontainer, after
// `make load-down` in `examples/docker`:
//
//     node --expose-gc --experimental-strip-types tools/bench/stress.mjs <case> [<cols>x<rows>] [n] [seconds]
//     node --expose-gc --experimental-strip-types tools/bench/stress.mjs matrix [<cols>x<rows>]
//
//     list                   every case with its default n
//     matrix                 the standard set, each in its own process, as a table
//
//     JSON=1                 one `STRESS {...}` line, for `matrix` and for A/B scripts
//     SPANS=1                the in-frame spans and kinds tables
//     SCREEN=1               the final screen, for a reader checking what drew
//     PROFILE_JSON=path      the whole ProfileReport
//
// **Frame rate has two readings and both are printed.** `fps` is what the
// framework drew per second under its own cadence — C03's `stream` window is
// 33 ms and the spinner's cadence 100 ms, so a spinner at 10 fps is the design
// and not a shortfall. `headroom` is `1000 / work p50`: the rate the frame's
// cost alone would allow. The second is the optimisation target; the first
// moves only when a cadence constant does.
//
// **The recording is unbounded** (F1194): `fakeStdout` keeps every byte, so the
// chunk record is emptied before each heap reading and the heap is read after a
// forced GC. Without `--expose-gc` the heap column reads the garbage too.
import "./env.mjs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { b, createTui, defaultTheme } from "../../dist/index.js";
import { CATALOGUE, FORMS, variantsOf } from "../../examples/plots/src/catalogue.ts";
import { fakeStdin, fakeStdout, screenRows } from "./fakes.mjs";

const CASE = process.argv[2] ?? "list";
const SIZE_ARG = /^(\d+)x(\d+)$/u.exec(process.argv[3] ?? "120x40");
if (SIZE_ARG === null) {
  console.error(`size must be <cols>x<rows>, got ${String(process.argv[3])}`);
  process.exit(2);
}
const SIZE = { columns: Number(SIZE_ARG[1]), rows: Number(SIZE_ARG[2]) };
const JSON_ONLY = process.env.JSON === "1";
const SECONDS_ARG = process.argv[5];

const ESC = String.fromCharCode(27);
const KEY = { pageUp: `${ESC}[5~`, pageDown: `${ESC}[6~`, down: `${ESC}[B`, up: `${ESC}[A`, escape: ESC };
const SYNC = new Set([`${ESC}[?2026h`, `${ESC}[?2026l`]);

// --- deterministic content ---------------------------------------------------

const rng = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
const WORDS = "the frame holds under load a joint is weak where the row is measured twice every span pays for its own reset a cache that reports its misses is one the deck can read wrap the cell once and keep the height the tail is the tail only while the window follows it".split(" ");
const sentence = (r, n) => {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(WORDS[Math.floor(r() * WORDS.length)]);
  out[0] = out[0][0].toUpperCase() + out[0].slice(1);
  return `${out.join(" ")}.`;
};
const paragraph = (r) => Array.from({ length: 3 + Math.floor(r() * 4) }, () => sentence(r, 8 + Math.floor(r() * 12))).join(" ");
const markdownSource = (r, paras) => {
  const parts = [`## ${sentence(r, 4).slice(0, -1)}`];
  for (let i = 0; i < paras; i += 1) {
    parts.push(paragraph(r));
    if (i % 3 === 1) parts.push(`- ${sentence(r, 6)}\n- ${sentence(r, 5)}\n- ${sentence(r, 7)}`);
    if (i % 4 === 2) parts.push(`\`\`\`ts\n${codeText(r, 6)}\n\`\`\``);
  }
  return parts.join("\n\n");
};
const codeText = (r, lines) =>
  Array.from({ length: lines }, (_v, i) => {
    const k = i % 5;
    if (k === 0) return `export function f${String(i)}(x: number, y: string): string {`;
    if (k === 1) return `  const rows = [...x.toString()].map((c) => \`\${c}-\${y}\`); // ${sentence(r, 3)}`;
    if (k === 2) return `  if (rows.length > ${String(i)}) return rows.join(", ");`;
    if (k === 3) return `  return y.repeat(${String(i % 7)});`;
    return "}";
  }).join("\n");
const logLines = (r, n) =>
  Array.from({ length: n }, (_v, i) => ({
    ts: `12:${String(Math.floor(i / 60) % 60).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}`,
    level: ["info", "info", "info", "warn", "debug", "error"][Math.floor(r() * 6)],
    message: sentence(r, 6 + Math.floor(r() * 10)),
  }));
const hunk = (r, at, lines) => ({
  header: `@@ -${String(at)},${String(lines)} +${String(at)},${String(lines + 4)} @@ f${String(at)}`,
  lines: Array.from({ length: lines }, (_v, i) => {
    const t = r();
    const kind = t < 0.15 ? "remove" : t < 0.35 ? "add" : "context";
    const text = kind === "context" ? `  ${codeText(r, 1)}` : `  ${sentence(r, 5)}`;
    return kind === "remove"
      ? { kind, text, oldNo: at + i }
      : kind === "add"
        ? { kind, text, newNo: at + i }
        : { kind, text, oldNo: at + i, newNo: at + i };
  }),
});
const patchBlock = (r, id, hunks, lines) =>
  b.patch({
    id,
    path: `src/shell/${["session", "paint", "frame", "composite", "refresh"][Math.floor(r() * 5)]}.ts`,
    language: "ts",
    hunks: Array.from({ length: hunks }, (_v, h) => hunk(r, 10 + h * (lines + 30), lines)),
  });
const tableBlock = (id, rows) =>
  b.table({
    id,
    columns: [
      { key: "name", label: "NAME", align: "left", priority: 1, minWidth: 8, flex: true, sortable: true },
      { key: "state", label: "STATE", align: "left", priority: 2, minWidth: 6, sortable: true },
      { key: "cpu", label: "CPU", align: "right", priority: 3, minWidth: 5, sortable: true },
      { key: "mem", label: "MEM", align: "right", priority: 4, minWidth: 7, sortable: true },
    ],
    rows: Array.from({ length: rows }, (_v, i) => ({
      id: `r${String(i)}`,
      cells: {
        name: { text: `service-${String(i)}` },
        state: i % 9 === 0 ? { text: "restarting", tone: "warn", glyph: "!" } : { text: "running" },
        cpu: { text: `${String((i % 100) / 10)}%` },
        mem: { text: `${String((i * 7) % 1024)}MiB` },
      },
    })),
  });
const status = (id, message) => ({ kind: "status", id, state: "loading", message, height: 1 });
const caption = (id, text) => b.notice("muted", text, undefined, { id });

const PNG = existsSync(new URL("../../out/probe.png", import.meta.url))
  ? readFileSync(new URL("../../out/probe.png", import.meta.url)).toString("base64")
  : null;

// --- the live parts -----------------------------------------------------------

/** A live panel whose tick re-draws `form` at a moving phase — the `/live` shape. */
const liveForm = (form, i, every) => {
  let phase = i * 7;
  const entry = CATALOGUE[form];
  return b.live({
    id: `live-${form}-${String(i)}`,
    title: `${form} #${String(i)}`,
    every,
    fetch: () => Promise.resolve((phase += 1)),
    render: (v) => {
      const drawn = entry.at(typeof v === "number" ? v : 0, 10, { id: `fig-${form}-${String(i)}` });
      return "refused" in drawn ? b.notice("warn", drawn.refused) : drawn;
    },
  });
};

/** A live panel turning a mesh rung by phase: the camera moves, the data does not. */
const liveMesh = (rung, i, every) => {
  const variant = variantsOf("plot3d")[rung];
  if (variant === undefined) {
    console.error(`no rung "${rung}" on plot3d — ${Object.keys(variantsOf("plot3d")).join(", ")}`);
    process.exit(2);
  }
  let phase = i * 3;
  return b.live({
    id: `live3d-${rung}-${String(i)}`,
    title: `plot3d/${rung} #${String(i)}`,
    every,
    fetch: () => Promise.resolve((phase += 1)),
    render: (v) => {
      const p = typeof v === "number" ? v : 0;
      const drawn = CATALOGUE.plot3d.at(0, variant.height ?? 14, {
        ...variant.spec,
        id: `mesh-${rung}-${String(i)}`,
        camera: { ...(variant.spec.camera ?? {}), azimuth: (p * 0.1) % (Math.PI * 2) },
      });
      return "refused" in drawn ? b.notice("warn", drawn.refused) : drawn;
    },
  });
};

const staticForm = (form, i) => {
  const drawn = CATALOGUE[form].at(i, 10, { id: `fig-${form}-${String(i)}` });
  return "refused" in drawn ? b.notice("warn", drawn.refused) : drawn;
};
const staticMesh = (rung, i) => {
  const variant = variantsOf("plot3d")[rung];
  if (variant === undefined) {
    console.error(`no rung "${rung}" on plot3d — ${Object.keys(variantsOf("plot3d")).join(", ")}`);
    process.exit(2);
  }
  const drawn = CATALOGUE.plot3d.at(0, variant.height ?? 14, {
    ...variant.spec,
    id: `mesh-${rung}-${String(i)}`,
    camera: { ...(variant.spec.camera ?? {}), azimuth: (i * 0.4) % (Math.PI * 2) },
  });
  return "refused" in drawn ? b.notice("warn", drawn.refused) : drawn;
};

// --- the cases ----------------------------------------------------------------
//
// Each case: `entries(n, r)` → one array of blocks per transcript entry;
// `n` its default count; `env` when the terminal must differ (the image case
// needs kitty); `animated` says whether the animation window should draw at all.

const CASES = {
  // pure — animating
  spinners: { n: 300, animated: true, says: "a status spinner per entry", entries: (n) => range(n, (i) => [caption(`c${String(i)}`, `step ${String(i)} of the run`), status(`s${String(i)}`, `working on ${String(i)}`)]) },
  steps: { n: 300, animated: true, says: "a five-step ladder with one active step per entry", entries: (n, r) => range(n, (i) => [b.steps([{ label: sentence(r, 3), state: "done" }, { label: sentence(r, 3), state: "done" }, { label: sentence(r, 4), state: "active", detail: sentence(r, 5) }, { label: sentence(r, 3) }, { label: sentence(r, 3) }], { id: `st${String(i)}` })]) },
  stream: { n: 200, animated: true, says: "a live part per entry ticking every 16 ms with a one-line render — the patch storm", entries: (n) => range(n, (i) => { let k = 0; return [b.live({ id: `tick-${String(i)}`, title: `tick ${String(i)}`, every: 16, fetch: () => Promise.resolve((k += 1)), render: (v) => b.notice("info", `tick ${String(v)} of source ${String(i)}`, undefined, { id: `tn-${String(i)}` }) })]; }) },
  // pure — still
  text: { n: 200, says: "a markdown response of eight paragraphs per entry", entries: (n, r) => range(n, (i) => b.markdown(markdownSource(r, 8), { idPrefix: `md${String(i)}-` })) },
  code: { n: 200, says: "an eighty-line code block per entry", entries: (n, r) => range(n, (i) => [b.code("ts", codeText(r, 80), { id: `code${String(i)}` })]) },
  logs: { n: 200, says: "two hundred log lines per entry", entries: (n, r) => range(n, (i) => [b.logs(logLines(r, 200), { id: `logs${String(i)}` })]) },
  table: { n: 100, says: "a two-hundred-row table per entry", entries: (n) => range(n, (i) => [tableBlock(`t${String(i)}`, 200)]) },
  bigtable: { n: 5, says: "a five-thousand-row table per entry", entries: (n) => range(n, (i) => [tableBlock(`t${String(i)}`, 5000)]) },
  kv: { n: 300, says: "twenty key-value pairs per entry", entries: (n, r) => range(n, (i) => [b.kv(Object.fromEntries(range(20, (k) => [`field-${String(k)}`, sentence(r, 4)])), { id: `kv${String(i)}` })]) },
  patch: { n: 100, says: "three hunks of a hundred and twenty lines per entry", entries: (n, r) => range(n, (i) => [patchBlock(r, `p${String(i)}`, 3, 120)]) },
  bigpatch: { n: 5, says: "twenty hunks of two hundred lines per entry — a four-thousand-line diff", entries: (n, r) => range(n, (i) => [patchBlock(r, `p${String(i)}`, 20, 200)]) },
  notice: { n: 500, says: "one notice per entry", entries: (n, r) => range(n, (i) => [b.notice(["info", "ok", "warn", "error"][i % 4], sentence(r, 14), undefined, { id: `n${String(i)}` })]) },
  tip: { n: 300, says: "a tip with two actions per entry", entries: (n, r) => range(n, (i) => [b.tip(sentence(r, 12), [b.fill("retry", `/retry ${String(i)}`), b.exec("open", `/open ${String(i)}`)], { id: `tip${String(i)}` })]) },
  pills: { n: 300, says: "eight chips per entry", entries: (n, r) => range(n, (i) => [b.pills(range(8, (k) => ({ label: WORDS[(i + k) % WORDS.length], tone: ["ok", "warn", "info", "dim"][k % 4], active: k === i % 8 })), { id: `pl${String(i)}` })]) },
  panel: { n: 150, says: "a panel holding markdown and key-values per entry", entries: (n, r) => range(n, (i) => [b.panel(`panel ${String(i)}`, [...b.markdown(markdownSource(r, 2), { idPrefix: `pm${String(i)}-` }), b.kv({ owner: sentence(r, 2), state: "held", rows: String(i) }, { id: `pkv${String(i)}` })], { id: `pn${String(i)}` })]) },
  progress: { n: 300, says: "a progress bar per entry", entries: (n) => range(n, (i) => [b.progress({ id: `pg${String(i)}`, label: `job ${String(i)}`, current: i % 100, total: 100 })]) },
  image: { n: 60, env: "kitty", says: "a PNG per entry under kitty", entries: (n) => range(n, (i) => PNG === null ? [b.notice("warn", "out/probe.png is missing", undefined, { id: `img${String(i)}` })] : [b.image({ id: `img${String(i)}`, data: PNG, height: 12, alt: `picture ${String(i)}` })]) },
  // plots
  everyplot: { n: 1, says: "every 2-D form once, still", entries: () => FORMS.filter((f) => f !== "plot3d").map((f, i) => [caption(`c${String(i)}`, `${f} · ${CATALOGUE[f].says}`), staticForm(f, 0)]) },
  everylive: { n: 1, animated: true, says: "every 2-D form once, live at 33 ms", entries: () => FORMS.filter((f) => f !== "plot3d").map((f, i) => [caption(`c${String(i)}`, f), liveForm(f, i, 33)]) },
  everymesh: { n: 1, animated: true, says: "every plot3d rung once, live at 33 ms", entries: () => Object.keys(variantsOf("plot3d")).map((rung, i) => [caption(`c${String(i)}`, `plot3d/${rung}`), liveMesh(rung, i, 33)]) },
  // mixed
  session: { n: 30, animated: true, says: "a coding session — response text, code, a patch, a table, logs, steps — with a spinner and a live plot at the tail", entries: (n, r) => [
    ...range(n, (i) => {
      const k = i % 6;
      if (k === 0) return b.markdown(markdownSource(r, 10), { idPrefix: `resp${String(i)}-` });
      if (k === 1) return [caption(`c${String(i)}`, `Edit src/shell/paint.ts`), patchBlock(r, `p${String(i)}`, 2, 60), b.steps([{ label: "read", state: "done" }, { label: "edit", state: "done" }, { label: "typecheck", state: "done" }], { id: `st${String(i)}` })];
      if (k === 2) return [caption(`c${String(i)}`, `Read src/shell/frame.ts`), b.code("ts", codeText(r, 40), { id: `code${String(i)}` })];
      if (k === 3) return [caption(`c${String(i)}`, `Bash: make test`), b.logs(logLines(r, 40), { id: `logs${String(i)}` }), b.kv({ exit: "0", files: "338", tests: "4,212", wall: "41 s" }, { id: `kv${String(i)}` })];
      if (k === 4) return [caption(`c${String(i)}`, `docker ps`), tableBlock(`t${String(i)}`, 30)];
      return [...b.markdown(markdownSource(r, 4), { idPrefix: `resp${String(i)}-` }), b.tip(sentence(r, 10), [b.fill("apply", "/apply")], { id: `tip${String(i)}` })];
    }),
    [caption("ctail", "cpu over the last minute"), liveForm("line", 0, 200)],
    [status("tail", "running the suite"), b.steps([{ label: "typecheck", state: "done" }, { label: "unit", state: "active" }, { label: "e2e" }], { id: "sttail" })],
  ] },
  mixed: { n: 60, animated: true, says: "round-robin: spinner, live line plot, mesh, text, patch, table — everything at once", entries: (n, r) => range(n, (i) => {
    const k = i % 6;
    if (k === 0) return [status(`s${String(i)}`, `working on ${String(i)}`)];
    if (k === 1) return [liveForm(["line", "bar", "heatmap", "scatter", "stackedarea"][Math.floor(i / 6) % 5], i, 33)];
    if (k === 2) return [liveMesh(["suzanne", "teapot"][Math.floor(i / 6) % 2], i, 100)];
    if (k === 3) return b.markdown(markdownSource(r, 6), { idPrefix: `md${String(i)}-` });
    if (k === 4) return [patchBlock(r, `p${String(i)}`, 2, 80)];
    return [tableBlock(`t${String(i)}`, 60)];
  }) },
};

/** `plot:<form>`, `live:<form>`, `mesh:<rung>`, `livemesh:<rung>` — one form or rung, `n` times. */
function parametric(name) {
  const m = /^(plot|live|mesh|livemesh):(.+)$/u.exec(name);
  if (m === null) return null;
  const [, kind, arg] = m;
  if ((kind === "plot" || kind === "live") && !FORMS.includes(arg)) {
    console.error(`no form "${arg}" — ${FORMS.join(", ")}`);
    process.exit(2);
  }
  if (kind === "plot") return { n: 40, says: `${arg}, still, ${String(40)} times`, entries: (n) => range(n, (i) => [caption(`c${String(i)}`, `${arg} #${String(i)}`), staticForm(arg, i)]) };
  if (kind === "live") return { n: 40, animated: true, says: `${arg}, live at 33 ms`, entries: (n) => range(n, (i) => [caption(`c${String(i)}`, `${arg} #${String(i)}`), liveForm(arg, i, 33)]) };
  if (kind === "mesh") return { n: 12, says: `plot3d/${arg}, still`, entries: (n) => range(n, (i) => [caption(`c${String(i)}`, `plot3d/${arg} #${String(i)}`), staticMesh(arg, i)]) };
  return { n: 12, animated: true, says: `plot3d/${arg}, live at 33 ms`, entries: (n) => range(n, (i) => [caption(`c${String(i)}`, `plot3d/${arg} #${String(i)}`), liveMesh(arg, i, 33)]) };
}

function range(n, f) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(f(i));
  return out;
}

// --- list / matrix --------------------------------------------------------------

const STANDARD = [
  "spinners", "steps", "stream", "text", "code", "logs", "table", "bigtable", "kv", "patch", "bigpatch",
  "notice", "tip", "pills", "panel", "progress", "image", "everyplot", "everylive", "everymesh",
  "live:line", "live:heatmap", "live:bar", "livemesh:suzanne", "livemesh:bunny", "session", "mixed",
];

if (CASE === "list") {
  for (const [name, c] of Object.entries(CASES)) console.log(`${name.padEnd(12)} n ${String(c.n).padStart(4)}  ${c.says}`);
  console.log(`${"plot:<form>".padEnd(12)} n   40  one 2-D form, still · live:<form> the same live at 33 ms`);
  console.log(`${"mesh:<rung>".padEnd(12)} n   12  one plot3d rung, still · livemesh:<rung> the same live at 33 ms`);
  console.log(`forms: ${FORMS.join(" ")}`);
  console.log(`rungs: ${Object.keys(variantsOf("plot3d")).join(" ")}`);
  process.exit(0);
}

if (CASE === "matrix") {
  const self = fileURLToPath(import.meta.url);
  const rows = [];
  for (const name of STANDARD) {
    const r = spawnSync(process.execPath, ["--expose-gc", "--experimental-strip-types", self, name, `${String(SIZE.columns)}x${String(SIZE.rows)}`], {
      encoding: "utf8",
      env: { ...process.env, JSON: "1" },
      maxBuffer: 64 * 1024 * 1024,
    });
    const line = r.stdout.split("\n").find((l) => l.startsWith("STRESS "));
    if (line === undefined) {
      rows.push({ name, failed: (r.stderr || r.stdout).trim().split("\n").slice(-3).join(" | ") });
      console.error(`${name}: no STRESS line (exit ${String(r.status)})`);
      continue;
    }
    const j = JSON.parse(line.slice(7));
    rows.push(j);
    console.error(`${name.padEnd(18)} done`);
  }
  console.log(`# stress matrix at ${String(SIZE.columns)}x${String(SIZE.rows)}, node ${process.version}`);
  console.log(table(rows));
  process.exit(0);
}

function table(rows) {
  const f1 = (x) => (x === null || x === undefined || Number.isNaN(x) ? "-" : x.toFixed(1));
  const f0 = (x) => (x === null || x === undefined || Number.isNaN(x) ? "-" : x.toFixed(0));
  const head = ["case", "n", "load ms", "fps", "ms/frame", "headroom", "work p50", "p95", "max", "key p50", "p95", "type p50", "cpu %", "heap MB", "frames"];
  const lines = [head, head.map((h) => "-".repeat(h.length))];
  for (const r of rows) {
    if (r.failed !== undefined) {
      lines.push([r.name, "FAILED", r.failed]);
      continue;
    }
    lines.push([r.case, String(r.n), f0(r.loadMs), f1(r.fps), f1(r.animMsPerFrame), f0(r.headroomFps), f1(r.work.p50), f1(r.work.p95), f0(r.work.max), f1(r.key.p50), f1(r.key.p95), f1(r.type.p50), f0(r.cpuPct), f1(r.heapMb), String(r.frames)]);
  }
  const widths = head.map((_h, c) => Math.max(...lines.map((l) => (l[c] ?? "").length)));
  return lines.map((l) => l.map((cell, c) => (c === 0 ? cell.padEnd(widths[c]) : cell.padStart(widths[c]))).join("  ")).join("\n");
}

// --- one case --------------------------------------------------------------------

const spec = CASES[CASE] ?? parametric(CASE);
if (spec === null || spec === undefined) {
  console.error(`unknown case ${CASE} — run \`list\``);
  process.exit(2);
}
const N = process.argv[4] === undefined || process.argv[4] === "" ? spec.n : Number(process.argv[4]);
const SECONDS = SECONDS_ARG === undefined || SECONDS_ARG === "" ? (spec.animated === true ? 4 : 1) : Number(SECONDS_ARG);
const ENTRIES = spec.entries(N, rng(N * 7919 + CASE.length));

const meta = (verb) => ({ verb, adapter: "stress", exitCode: 0, durationMs: 0, truncated: false, argv: [verb], stderr: "", transport: "local", origin: "refresh" });
const doc = (command, blocks) => ({ schema: "tui.view/1", command, status: "ok", blocks, meta: meta(command.slice(1).split(" ")[0] ?? "e") });

const env = spec.env === "kitty"
  ? { TERM: "xterm-kitty", TERM_PROGRAM: "kitty", COLORTERM: "truecolor", LANG: "en_GB.UTF-8" }
  : { TERM: "xterm-256color", COLORTERM: "truecolor", LANG: "en_GB.UTF-8" };

const stdout = fakeStdout(SIZE);
const stdin = fakeStdin();
// Every write stamped, so a keystroke's latency is the byte in to the first byte out.
const writeTimes = [];
const rawWrite = stdout.write;
stdout.write = (chunk) => {
  writeTimes.push(performance.now());
  return rawWrite(chunk);
};
let report = null;

const tui = createTui({
  name: "stress",
  binary: "/bin/true",
  manifest: {
    schema: "tui.manifest/1",
    binary: "stress",
    version: "1.0.0",
    tools: [{ name: "e", local: true, summary: "entry i", args: [{ name: "i", type: "string", required: false, summary: "i" }], flags: [] }],
  },
  localHandlers: {
    e: (argv, ctx) => {
      const blocks = ENTRIES[Number(argv[0])];
      if (blocks === undefined) throw new Error(`no entry ${String(argv[0])}`);
      try {
        return doc(ctx.command, blocks);
      } catch (e) {
        console.error(`entry ${String(argv[0])} threw: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
        throw e;
      }
    },
  },
  theme: defaultTheme,
  env,
  stdout,
  stdin,
  greeting: () => doc("/greeting", [caption("g", `stress — ${CASE}: ${spec.says}`)]),
  // 250 ms, not `plots.mjs`'s 25: the sampler's own CPU would otherwise sit
  // inside the animation window's per-frame reading.
  profile: { tier: "spans", sampleMs: 250, onReport: (r) => void (report = r) },
});

const settle = async (turns = 3) => {
  for (let i = 0; i < turns; i += 1) await new Promise((r) => setImmediate(r));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const heapMb = () => {
  stdout.chunks.length = 0;
  globalThis.gc?.();
  return process.memoryUsage().heapUsed / 1048576;
};
const quantile = (xs, q) => {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, c) => a - c);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

/** One key: bytes in, first byte out. The input path is synchronous, so the write
 * usually lands inside `emit`; the wait is for the case where it does not. */
async function keyLatency(bytes) {
  const before = writeTimes.length;
  const t0 = performance.now();
  stdin.emit(bytes);
  for (let i = 0; i < 6 && writeTimes.length === before; i += 1) await new Promise((r) => setImmediate(r));
  const first = writeTimes.find((t, i) => i >= before && t >= t0);
  return first === undefined ? Number.NaN : first - t0;
}

const framesIn = (fromChunk) => stdout.chunks.slice(fromChunk).filter((c) => !SYNC.has(c)).length;

await tui.start();
await settle(4);
const heapStart = heapMb();

// load
const tLoad0 = performance.now();
for (let i = 0; i < ENTRIES.length; i += 1) {
  stdin.emit(`/e ${String(i)}`);
  await settle(1);
  stdin.emit("\r");
  await settle(2);
}
await settle(6);
const loadMs = performance.now() - tLoad0;
const heapLoaded = heapMb();

// The fixture is shown to have drawn before a number is read.
{
  const rows = screenRows(stdout.chunks.length === 0 ? [] : stdout.chunks, SIZE);
  // **A refused document reads as a quiet screen** — the shell swallows the
  // throw into a notice and every figure below would be the notice's. The
  // viewport follows the tail, so a pure case's last entry is on screen.
  const refused = rows.filter((r) => r.includes("TranscriptError") || r.includes("appendAndCommit"));
  if (refused.length > 0) {
    console.error(`the fixture refused a document — ${String(refused.length)} rows of refusal on screen:`);
    for (const row of rows) console.error(`| ${row}`);
    process.exit(1);
  }
}

// animation window
const chunks0 = stdout.chunks.length;
const cpu0 = process.cpuUsage();
const tAnim0 = performance.now();
await sleep(SECONDS * 1000);
const animWall = performance.now() - tAnim0;
const cpu = process.cpuUsage(cpu0);
const animFrames = framesIn(chunks0);
const fps = (animFrames / animWall) * 1000;
const cpuPct = ((cpu.user + cpu.system) / 1000 / animWall) * 100;
// **The frame's cost under animation is the CPU the window spent, per frame
// drawn** — the profiler's `work` is over every frame including the cheap
// keystroke ones below, so `1000 / work p50` would flatter an animated case.
const animMsPerFrame = animFrames === 0 ? Number.NaN : (cpu.user + cpu.system) / 1000 / animFrames;

// scroll latency
const key = [];
for (let i = 0; i < 20; i += 1) key.push(await keyLatency(KEY.pageUp));
for (let i = 0; i < 20; i += 1) key.push(await keyLatency(KEY.pageDown));
// typing latency
const type = [];
for (const ch of "the frame holds under load") type.push(await keyLatency(ch));
for (let i = 0; i < 26; i += 1) await keyLatency("");
await settle(3);

const screenAtEnd = process.env.SCREEN === "1" ? screenRows(stdout.chunks, SIZE) : null;
const heapEnd = heapMb();

await tui.stop("exit");
if (report === null) {
  console.error("no report — `onReport` did not fire (C28 I38)");
  process.exit(1);
}
if (process.env.PROFILE_JSON !== undefined) writeFileSync(process.env.PROFILE_JSON, JSON.stringify(report, null, 1));

const work = report.latency?.work ?? { p50: Number.NaN, p95: Number.NaN, max: Number.NaN, sum: 0 };
const out = {
  case: CASE,
  n: ENTRIES.length,
  size: `${String(SIZE.columns)}x${String(SIZE.rows)}`,
  seconds: SECONDS,
  loadMs,
  frames: report.frames,
  animFrames,
  fps,
  animMsPerFrame,
  headroomFps: Number.isNaN(animMsPerFrame) ? (work.p50 > 0 ? 1000 / work.p50 : Number.NaN) : 1000 / animMsPerFrame,
  work: { p50: work.p50, p95: work.p95, max: work.max, sum: work.sum },
  key: { p50: quantile(key, 0.5), p95: quantile(key, 0.95), max: Math.max(...key) },
  type: { p50: quantile(type, 0.5), p95: quantile(type, 0.95) },
  cpuPct,
  heapMb: heapEnd,
  heapStartMb: heapStart,
  heapLoadedMb: heapLoaded,
  dropped: report.dropped?.frames ?? 0,
  misses: report.misses,
};

if (JSON_ONLY) {
  console.log(`STRESS ${JSON.stringify(out)}`);
  process.exit(0);
}

const ms = (n) => (Number.isNaN(n) ? "    -" : n >= 100 ? n.toFixed(0).padStart(5) : n.toFixed(2).padStart(5));
console.log(`# stress — ${CASE} (${spec.says}) · n ${String(out.n)} at ${out.size} · node ${process.version}`);
console.log(`load ${loadMs.toFixed(0)} ms · heap start ${heapStart.toFixed(1)} → loaded ${heapLoaded.toFixed(1)} → end ${heapEnd.toFixed(1)} MB`);
console.log(`animation ${SECONDS} s: ${String(animFrames)} frames · ${fps.toFixed(1)} fps drawn · ${Number.isNaN(animMsPerFrame) ? "" : `${animMsPerFrame.toFixed(2)} cpu ms/frame · `}headroom ${Number.isNaN(out.headroomFps) ? "-" : out.headroomFps.toFixed(0)} fps · cpu ${cpuPct.toFixed(0)}% · dropped ${String(out.dropped)}`);
console.log(`work p50 ${ms(work.p50)} p95 ${ms(work.p95)} max ${ms(work.max)} ms over ${String(report.frames)} frames`);
console.log(`key latency (PageUp/PageDown ×40) p50 ${ms(out.key.p50)} p95 ${ms(out.key.p95)} max ${ms(out.key.max)} ms · typing p50 ${ms(out.type.p50)} p95 ${ms(out.type.p95)} ms`);
console.log(`misses: ${Object.entries(report.misses ?? {}).map(([c, axes]) => `${c} ${Object.entries(axes).map(([a, k]) => `${a} ${String(k)}`).join("/")}`).join(" · ")}`);

if (process.env.SPANS === "1") {
  const pct = (part, of) => (of === 0 ? "     -" : `${((part / of) * 100).toFixed(1).padStart(5)}%`);
  console.log(`\n## in-frame spans by share of work\n`);
  const spans = Object.entries(report.spans ?? {}).map(([name, h]) => ({ name, ...h })).sort((a, c) => c.sum - a.sum);
  for (const s of spans.slice(0, 20)) console.log(`${s.name.padEnd(20)} ${pct(s.sum, work.sum)} ${ms(s.sum)} n ${String(s.count).padStart(6)} p50 ${ms(s.p50)} p95 ${ms(s.p95)}`);
  console.log(`\n## block kinds by self time\n`);
  const kinds = Object.entries(report.byKind ?? {}).map(([kind, h]) => ({ kind, ...h })).sort((a, c) => c.sum - a.sum);
  for (const k of kinds.slice(0, 10)) console.log(`${k.kind.padEnd(14)} ${pct(k.sum, work.sum)} ${ms(k.sum)} n ${String(k.count).padStart(6)} p50 ${ms(k.p50)}`);
  const o = report.overhead;
  console.log(`\noverhead: ${String(o.spans)} spans, estimate ${o.estimateMs.toFixed(1)} ms of ${work.sum.toFixed(0)} ms`);
}
if (screenAtEnd !== null) {
  console.log("\n## screen at the end\n");
  for (const row of screenAtEnd) console.log(`| ${row}`);
}
