// The frame's cost, measured before F90's render chain changes it.
//
// **Run by hand, never from `make all`.** A timing assertion under contention is
// a flake and not a gate — Group 12's rule, and `VERIFYING.md` §7 carries the
// occasion. This prints numbers; nothing here fails.
//
// **Against `dist/`, through the public surface only.** Two reasons, and the
// second is the one worth stating. It has to be `dist/` because a probe against
// a stale build gives a wrong negative and nothing revisits a ruled-out
// candidate. And it has to be the public surface because the expensive path —
// `visibleRows` in `session.ts` — is a private function inside a class, so the
// only honest way to time it is to be a consumer: `createTui`, a greeting, and
// keystrokes on a fake stdin. That is also the instrument that found three of
// step 8's eleven findings.
//
// Usage, inside the devcontainer, after `npm run build`:
//
//     node tools/bench/frame.mjs [lines] [reps]
//
import { createTui, b, defaultTheme } from "../../dist/index.js";

const LINES = Number(process.argv[2] ?? 5_000);
const REPS = Number(process.argv[3] ?? 20);
const COLUMNS = 200;
const ROWS = 50;

// --- the fakes, transcribed from `test/support/fake-terminal.ts` ------------
//
// Transcribed rather than imported: that file is TypeScript under `test/`, and
// this runs against the built package as a consumer would. The two things it
// must model are the ones the doubles there model — a stream that records what
// it was given, and a stdin that delivers only while flowing.

function fakeStdout(size) {
  const chunks = [];
  const stream = {
    isTTY: true,
    write(chunk) {
      chunks.push(String(chunk));
      return true;
    },
    get chunks() {
      return chunks;
    },
    get columns() {
      return size.columns;
    },
    get rows() {
      return size.rows;
    },
    on: () => stream,
    once: () => stream,
    off: () => stream,
    removeListener: () => stream,
    emit: () => false,
    end: () => stream,
  };
  return stream;
}

function fakeStdin() {
  const data = new Set();
  let flowing = null;
  const stream = {
    isTTY: true,
    emit(chunk) {
      if (flowing !== true) return;
      for (const cb of [...data]) cb(Buffer.from(chunk, "utf8"));
    },
    on(event, cb) {
      if (event === "data") {
        data.add(cb);
        if (flowing !== false) flowing = true;
      }
      return stream;
    },
    once: () => stream,
    off(event, cb) {
      if (event === "data") data.delete(cb);
      return stream;
    },
    removeListener: () => stream,
    resume() {
      flowing = true;
      return stream;
    },
    pause() {
      flowing = false;
      return stream;
    },
    isPaused: () => flowing === false,
    setRawMode: () => stream,
  };
  return stream;
}

// --- the screen ------------------------------------------------------------
//
// **The JS twin of `test/support/screen.ts`**, and the duplication is named
// rather than hidden. That file is TypeScript under `test/`; this runs against
// the built package as a consumer would, and `dist/` does not carry it.
// `tools/screen.py` is the third, on the PTY side. Three copies of one model,
// each on its own side of a boundary — which is the same disposition
// `VERIFYING.md` records for its instruments.
const ESCAPE = String.fromCharCode(27);
const HOME_SEQ = `${ESCAPE}[H`;

function screenRows(chunks, size) {
  const grid = Array.from({ length: size.rows }, () => " ".repeat(size.columns));
  let row = 0;
  let col = 0;
  const put = (text) => {
    if (text === "" || row < 0 || row >= size.rows) return;
    const line = grid[row] ?? "";
    grid[row] = (line.slice(0, col) + text + line.slice(col + text.length))
      .slice(0, size.columns)
      .padEnd(size.columns, " ");
    col += text.length;
  };
  const cup = new RegExp(`^${ESCAPE}\\[(\\d+);(\\d+)H`);
  const other = new RegExp(`${ESCAPE}\\[[0-9;?]*[a-zA-Z]`, "g");
  for (const chunk of chunks) {
    let i = 0;
    while (i < chunk.length) {
      if (chunk.startsWith(HOME_SEQ, i)) { row = 0; col = 0; i += HOME_SEQ.length; continue; }
      const m = cup.exec(chunk.slice(i));
      if (m !== null) { row = Number(m[1]) - 1; col = Number(m[2]) - 1; i += m[0].length; continue; }
      if (chunk.startsWith(ESCAPE, i)) {
        other.lastIndex = i;
        const e = other.exec(chunk);
        if (e !== null && e.index === i) { i += e[0].length; continue; }
        i += 1; continue;
      }
      if (chunk.startsWith("\r\n", i)) { row += 1; col = 0; i += 2; continue; }
      let j = i;
      while (j < chunk.length && chunk[j] !== ESCAPE && !chunk.startsWith("\r\n", j)) j += 1;
      put(chunk.slice(i, j));
      i = j;
    }
  }
  return grid;
}

// --- the document -----------------------------------------------------------

/**
 * One patch of `LINES` lines, in one hunk.
 *
 * One hunk rather than many on purpose: hunk headers are rows the window would
 * have to keep sticky, and a single run is the shape that makes the *body* the
 * whole of the cost. A realistic diff is cheaper than this, not dearer.
 */
function bigPatch(lines) {
  const body = [];
  for (let i = 0; i < lines; i += 1) {
    const kind = i % 7 === 0 ? "add" : i % 11 === 0 ? "remove" : "context";
    body.push({ kind, text: `  const value${String(i)} = compute(${String(i)});`, oldNo: i + 1, newNo: i + 1 });
  }
  return b.patch({
    id: "bench-patch",
    path: "src/deep/module.ts",
    language: "typescript",
    hunks: [{ header: `@@ -1,${String(lines)} +1,${String(lines)} @@`, lines: body }],
  });
}

// --- the harness ------------------------------------------------------------

const ms = (t0, t1) => Number(t1 - t0) / 1e6;

async function settle(turns = 3) {
  for (let i = 0; i < turns; i += 1) await new Promise((r) => setImmediate(r));
}

/** Median, because one GC pause should not become the headline. */
function median(xs) {
  const s = [...xs].sort((a, x) => a - x);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function row(label, xs) {
  const bytes = xs.bytes === undefined ? "" : `  ${String(Math.round(xs.bytes)).padStart(9)} B/frame`;
  console.log(
    `${label.padEnd(34)} ${median(xs.times).toFixed(1).padStart(8)} ms median  ` +
      `${Math.min(...xs.times).toFixed(1).padStart(8)} min  ${Math.max(...xs.times).toFixed(1).padStart(8)} max${bytes}`,
  );
}

const size = { columns: COLUMNS, rows: ROWS };
const stdout = fakeStdout(size);
const stdin = fakeStdin();

const tui = createTui({
  name: "bench",
  binary: "/bin/true",
  manifest: { schema: "tui.manifest/1", binary: "bench", version: "1.0.0", tools: [] },
  theme: defaultTheme,
  env: { TERM: "xterm-256color", COLORTERM: "truecolor", LANG: "en_GB.UTF-8" },
  stdout,
  stdin,
  // `lines = 0` means no greeting at all — an empty transcript, which is the
  // floor: header, footer and prompt are recomposed and re-rendered every frame
  // whatever the transcript holds, and nothing in F90's four stages touches
  // them. Measuring it is how the transcript's share is separated from the
  // frame's fixed cost.
  ...(LINES === 0 ? {} : { greeting: () => ({
    schema: "tui.view/1",
    command: "/bench",
    status: "ok",
    blocks: [bigPatch(LINES)],
    // **All ten fields, and the first draft had six.** A document missing
    // `origin`, `transport`, `argv` or `stderr` is refused by C04's validator,
    // `appendAndCommit` swallows the throw, and `session.ts` swallows a greeting
    // rejection on top of it — so the session starts, draws its prompt, and
    // shows nothing. The bench then reported 1.5 ms per keystroke at 5,000 lines
    // and the same at 50,000, which is the fixture not responding to the thing
    // under test (`test/support/README.md`). See FINDINGS.
    meta: {
      verb: "bench",
      adapter: "bench",
      exitCode: 0,
      durationMs: 0,
      truncated: false,
      argv: ["bench"],
      stderr: "",
      transport: "local",
      origin: "refresh",
    },
  }) }),
});

console.log(`# F90 baseline — ${String(LINES)} patch lines, ${String(COLUMNS)}x${String(ROWS)}, ${String(REPS)} reps`);
console.log(`# node ${process.version}`);

const tStart = process.hrtime.bigint();
await tui.start();
await settle();
const tGreeting = process.hrtime.bigint();
console.log(`\nstart + greeting ${ms(tStart, tGreeting).toFixed(1)} ms, ${String(stdout.chunks.length)} writes`);

// **The fixture is shown to respond before a number is read from it**
// (`test/support/README.md`). The first draft of this file handed the greeting a
// six-field `meta`; C04 refused the document, two bare catches swallowed it, and
// the bench happily reported timings for a blank screen — flat across 100,
// 5,000 and 50,000 lines, which is the only reason it was noticed.
if (LINES > 0) {
  // **The screen, not the last write** (C22 I55). This read the last chunk and
  // split it on CRLF, which is a frame only while every frame is written whole
  // — and stage 1 made the write a difference, so the check reported a dead
  // fixture against a perfectly live one. The same defect the three test files
  // had, arriving in the instrument that found them.
  const seen = screenRows(stdout.chunks, size);
  const content = seen.filter((r) => r.trim() !== "").length;
  // **A body line, not the path header.** The viewport follows the tail, so what
  // is on screen is the *bottom* of the patch and the path row is thousands of
  // rows above it. Asserting on `module.ts` failed against a perfectly live
  // fixture — the assertion was wrong, not the document, and reading the frame
  // is what said which.
  const body = seen.filter((r) => r.includes("compute(")).length;
  if (body < 5 || content < 5) {
    console.error(
      `\nFIXTURE DEAD: ${String(content)} non-blank rows, ${String(body)} patch lines on screen.\n` +
        "The document did not reach the transcript. Nothing below would mean anything.",
    );
    process.exit(1);
  }
  console.log(`fixture live: ${String(content)} non-blank rows, ${String(body)} of them patch lines`);
}

// 1 — a keystroke. C03 gives `input` a zero window, so the whole frame happens
// inside the synchronous `emit` below and the clock brackets it exactly.
const keystroke = [];
let bytes = 0;
for (let i = 0; i < REPS; i += 1) {
  const before = stdout.chunks.length;
  const t0 = process.hrtime.bigint();
  stdin.emit("a");
  const t1 = process.hrtime.bigint();
  keystroke.push(ms(t0, t1));
  for (let c = before; c < stdout.chunks.length; c += 1) bytes += stdout.chunks[c].length;
}
row("keystroke → frame on screen", { times: keystroke, bytes: bytes / REPS });

// 2 — the drag. `resize` is never delayed (C03 I2) and a width change clears
// every cached height (C14 I8), so each step is a full remeasure plus a full
// render plus a full write. None of stages 1-4 help this.
const drag = [];
for (let i = 0; i < REPS; i += 1) {
  size.columns = COLUMNS - (i % 40) - 1;
  const t0 = process.hrtime.bigint();
  process.emit("SIGWINCH");
  const t1 = process.hrtime.bigint();
  drag.push(ms(t0, t1));
}
row("SIGWINCH → frame (a drag step)", { times: drag });

// 3 — the same width twice. C14 I21 refuses a resize to the size it holds, so
// this is what a SIGWINCH that changed nothing costs: the floor the drag figure
// should be read against.
size.columns = COLUMNS;
process.emit("SIGWINCH");
const noop = [];
for (let i = 0; i < REPS; i += 1) {
  const t0 = process.hrtime.bigint();
  process.emit("SIGWINCH");
  const t1 = process.hrtime.bigint();
  noop.push(ms(t0, t1));
}
row("SIGWINCH → frame (same size)", { times: noop });

await tui.stop("exit");
