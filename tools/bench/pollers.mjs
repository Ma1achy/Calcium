// F91's baseline — what two live parts reading one source actually do today.
//
// **Run by hand, never from `make all`.** It sleeps on the real clock and counts
// what a driver did in that window; under contention that is a flake and not a
// gate (Group 12's rule, `VERIFYING.md` §7). Nothing here fails except the
// liveness guard.
//
// **Against `dist/`, through the public surface only** — the same disposition as
// `frame.mjs`, and for the same two reasons. A probe against a stale build gives
// a wrong negative and nothing revisits a ruled-out candidate; and the mechanism
// under test (`refresh.ts`) is reachable from outside only by declaring `b.live`
// parts and watching what happens, which is what a consumer does.
//
// It answers the three questions step 0 owes:
//
//   b. **the divergence** — two parts, one logical source, read from ONE frame.
//      If they cannot be made to disagree, F91's correctness half is wrong and
//      the row is a performance row. That is the point of measuring it first.
//   c. **the poll rate**, on screen and scrolled off. The second number is the
//      off-screen half, and it is the one that spawns subprocesses.
//   d. **the commit count** per source tick, against C03's 33 ms `stream`
//      window — the "one batch, one commit" consequence, which may already hold.
//
// Usage, inside the devcontainer, after `npm run build`:
//
//     node tools/bench/pollers.mjs [windowMs] [everyMs]
//
import { createTui, b, defaultTheme } from "../../dist/index.js";

const WINDOW_MS = Number(process.argv[2] ?? 1_000);
const EVERY_MS = Number(process.argv[3] ?? 100);
// `own` (the default) is what the tree did before F91: two parts, two fetches.
// `shared` is the same two parts naming one key. Both run against the same
// `dist/`, so the comparison is a flag rather than a checkout.
const MODE = process.argv[4] ?? "own";
const COLUMNS = 100;
const ROWS = 24;

// --- the fakes, transcribed from `test/support/fake-terminal.ts` ------------
// Transcribed rather than imported, for `frame.mjs`'s reason: that file is
// TypeScript under `test/` and this runs against the built package.

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

// --- the screen, the JS twin of `test/support/screen.ts` --------------------
const ESCAPE = String.fromCharCode(27);
const HOME_SEQ = `${ESCAPE}[H`;

function screenRows(chunks, size) {
  const grid = Array.from({ length: size.rows }, () => " ".repeat(size.columns));
  let row = 0;
  let col = 0;
  const put = (text) => {
    if (text === "" || row < 0 || row >= size.rows) return;
    const line = grid[row] ?? "";
    grid[row] = (line.slice(0, col) + text + line.slice(col + text.length)).slice(0, size.columns);
    col += text.length;
  };
  const all = chunks.join("");
  let i = 0;
  while (i < all.length) {
    if (all.startsWith(HOME_SEQ, i)) {
      row = 0;
      col = 0;
      i += HOME_SEQ.length;
      continue;
    }
    const cup = /^\x1b\[(\d+);(\d+)H/.exec(all.slice(i));
    if (cup !== null) {
      row = Number(cup[1]) - 1;
      col = Number(cup[2]) - 1;
      i += cup[0].length;
      continue;
    }
    if (all.startsWith("\r\n", i)) {
      row += 1;
      col = 0;
      i += 2;
      continue;
    }
    const esc = /^\x1b(\[[0-9;?]*[A-Za-z]|[()][A-Za-z0-9]|[A-Za-z=>])/.exec(all.slice(i));
    if (esc !== null) {
      i += esc[0].length;
      continue;
    }
    const next = all.slice(i).search(/[\x1b\r]/);
    const text = next === -1 ? all.slice(i) : all.slice(i, i + next);
    put(text);
    i += text.length === 0 ? 1 : text.length;
  }
  return grid;
}

// --- the source under test --------------------------------------------------
//
// **One logical source, two `fetch` closures**, which is exactly what
// `container.ts:288` and `:301` are: both run
// `docker container stats --no-stream --format json <id>` and each gets its own
// answer. The counter stands in for the far side moving between two spawns —
// the cheapest possible model of it, and the one that cannot be accused of
// measuring subprocess noise.
let ticks = 0;
const readSource = async () => {
  ticks += 1;
  return { sample: ticks };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const size = { columns: COLUMNS, rows: ROWS };
const stdout = fakeStdout(size);
const stdin = fakeStdin();

/** A part reading the shared source and printing whichever value it got. */
const part = (id, title) =>
  b.live({
    id,
    title,
    every: EVERY_MS,
    ...(MODE === "shared" ? { source: "bench-stats" } : {}),
    fetch: readSource,
    render: (data) => b.kv({ sample: String(data.sample) }, { id: `${id}-body` }),
    renderLoading: () => b.kv({ sample: "-" }, { id: `${id}-body` }),
  });

const tui = createTui({
  name: "bench",
  binary: "/bin/true",
  manifest: {
    schema: "tui.manifest/1",
    binary: "bench",
    version: "1.0.0",
    // `local: true` is what lets `seal()` accept the handler below: the registry
    // and the manifest are two records of one fact and C23 I27 compares them.
    tools: [{ name: "fill", local: true, summary: "push the live entry off screen", args: [], flags: [] }],
  },
  localHandlers: {
    // **A second entry, because visibility is per *host*.** The live parts and a
    // filler block inside one document are one entry, and an entry with any row
    // on screen is visible — so the only way to get the parts off screen is to
    // put something else below them. That is C23 I46's stated granularity
    // arriving in the instrument that measures it.
    // **`schema`, `command` and `status` too.** `LocalDocument` omits only `meta`,
    // so a handler returning `{blocks}` alone is a document C04 refuses — and the
    // refusal is swallowed twice on the way out, which is F135 arriving a third
    // time in an instrument. The guard below is what said so; the numbers above
    // it were fine and the ones after it would have been a measurement of
    // nothing.
    fill: () => ({
      schema: "tui.view/1",
      command: "/fill",
      status: "ok",
      blocks: [
        b.logs(
          Array.from({ length: 200 }, (_, i) => ({
            ts: "12:00:00",
            level: "info",
            message: `filler ${String(i)}`,
          })),
          { id: "filler" },
        ),
      ],
    }),
  },
  theme: defaultTheme,
  env: { TERM: "xterm-256color", COLORTERM: "truecolor", LANG: "en_GB.UTF-8" },
  stdout,
  stdin,
  greeting: () => ({
    schema: "tui.view/1",
    command: "/bench",
    status: "ok",
    blocks: [part("alpha", "ALPHA"), part("beta", "BETA")],
    // All ten fields. Six of them is a document C04 refuses, `appendAndCommit`
    // swallows the throw and the session draws a blank screen — the defect that
    // made `frame.mjs` report identical numbers at 100 and 50,000 lines.
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
  }),
});

console.log(`# F91 — two parts, ${MODE === "shared" ? "one shared source" : "a source each"}, every ${String(EVERY_MS)} ms`);
console.log(`# node ${process.version}, window ${String(WINDOW_MS)} ms`);

await tui.start();
await sleep(WINDOW_MS);

// **The fixture is shown to respond before a number is read from it.** A part
// that never ticked prints its loading `-` and would report a perfect agreement
// between two panels that are both dead.
const seen = screenRows(stdout.chunks, size);
const samples = seen.flatMap((r) => {
  const m = /sample\s+(\S+)/.exec(r);
  return m === null ? [] : [m[1]];
});
if (ticks === 0 || samples.length !== 2 || samples.includes("-")) {
  console.error(
    `\nFIXTURE DEAD: ${String(ticks)} fetches, samples ${JSON.stringify(samples)}.\n` +
      "The parts did not tick. Nothing below would mean anything.",
  );
  console.error(seen.filter((r) => r.trim() !== "").join("\n"));
  process.exit(1);
}

// b — the divergence, read from ONE frame.
console.log(`\nfixture live: ${String(ticks)} fetches in the window`);
console.log(`  ALPHA and BETA, from one frame: ${samples.join("  vs  ")}`);
console.log(
  samples[0] === samples[1]
    ? "  THEY AGREE — F91's correctness half does not reproduce here"
    : `  THEY DISAGREE by ${String(Math.abs(Number(samples[0]) - Number(samples[1])))} — two views of one source, different numbers`,
);

// c — the poll rate on screen, then scrolled off.
const onScreen = ticks;
console.log(
  `\n  on screen:   ${String(onScreen)} fetches / ${String(WINDOW_MS)} ms ` +
    `= ${(onScreen / (WINDOW_MS / 1000)).toFixed(1)}/s across 2 parts`,
);

// **Push the live entry off screen with a second entry, then read the rate.**
// A `⌃Home` on a two-row transcript scrolls nothing, so an earlier draft of this
// measured a part that had never left the viewport and reported the pause as
// absent — the fixture agreeing with itself. Two hundred rows below it is what
// makes the question askable.
for (const ch of "/fill\r") stdin.emit(ch);
await sleep(50);
// **The fixture must be shown to respond before the number is read.** A `/fill`
// that was refused leaves the parts on screen, and the rate below would report
// the pause as absent while measuring nothing at all.
const afterFill = screenRows(stdout.chunks, size);
if (!afterFill.some((r) => r.includes("filler"))) {
  console.error("\nFIXTURE DEAD: /fill did not append. The parts never left the screen.");
  console.error(afterFill.filter((r) => r.trim() !== "").join("\n"));
  process.exit(1);
}
const before = ticks;
await sleep(WINDOW_MS);
const off = ticks - before;
console.log(
  `  off screen:  ${String(off)} fetches / ${String(WINDOW_MS)} ms ` +
    `= ${(off / (WINDOW_MS / 1000)).toFixed(1)}/s`,
);

// And back. `⌃Home` is `scrollTop` (C16's keymap).
stdin.emit(`${ESCAPE}[1;5H`);
await sleep(50);
const resumedFrom = ticks;
await sleep(WINDOW_MS);
console.log(
  `  back on:     ${String(ticks - resumedFrom)} fetches / ${String(WINDOW_MS)} ms ` +
    `= ${((ticks - resumedFrom) / (WINDOW_MS / 1000)).toFixed(1)}/s`,
);

// d — commits per source tick. C03 gives `stream` a 33 ms window, so two patches
// landing together are already one frame; what two parts still cost is two
// `patch` calls and two C14 invalidations. Counted as frames written.
const frames = stdout.chunks.filter((c) => c.includes(HOME_SEQ) || c.includes(`${ESCAPE}[`)).length;
console.log(`\n  writes to stdout across the run: ${String(stdout.chunks.length)} (${String(frames)} carrying escapes)`);
console.log(`  fetches: ${String(ticks)} — a shared source would be half of that`);

await tui.stop("exit");
