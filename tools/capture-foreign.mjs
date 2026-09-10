/**
 * Capture a foreign program's raw PTY output, byte for byte, and render what
 * it drew — so a question like "is this gradient per-character or sub-cell"
 * is answered from the bytes rather than from a guess at the screenshot.
 *
 * Three pieces this repository already has, pointed outward:
 *
 *   the PTY harness    `node-pty`'s `spawn`, streamed the way
 *                       `test/support/pty.ts`'s `interactivePty` streams it —
 *                       a `TextDecoder` held across chunks, and a trailing
 *                       partial escape held rather than parsed early.
 *   painter()          `test/support/pty.ts` — applies the edit stream to a
 *                       screen model rather than slicing it (F149). Reused
 *                       directly, not reimplemented: its `styled()` already
 *                       emits real SGR escape sequences per row, which is
 *                       exactly the input `ansiToSvg` wants.
 *   catalogue-png.mjs   `parseLine` resolves those SGR sequences to concrete
 *                       colours (24-bit, indexed, the sixteen), and
 *                       `ansiToSvg` → `pngFromSvg` → `gifFrom` draw them.
 *                       `unparsedSgr` is the report of what neither of them
 *                       could read — carried through rather than dropped,
 *                       per F241's lesson: a form that falls through must be
 *                       counted, not silently rendered as the default.
 *
 * The capture is the raw bytes plus a timing sidecar. Frames are read off the
 * *applied* screen, not a slice of the stream, for F149's reason: a stream of
 * edits is not a screen until something plays it.
 *
 *     npx tsx tools/capture-foreign.mjs -- <command> [args...]
 *       --duration <ms>      stop after this long (default 8000)
 *       --cols/--rows <n>    PTY size (default 100x30)
 *       --interval <ms>      sample on a timer instead of on every write
 *       --region r,c,w,h     the rectangle the colour analysis reads
 *       --out <dir>          where everything is written (default a
 *                             timestamped dir under captures/)
 *       --gif                also write frames.gif
 */
import { spawn } from "node-pty";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { painter } from "../test/support/pty.js";
import { cells } from "../src/presentation/text.js";
import { parseLine, unparsedSgr, ansiToSvg, pngFromSvg, gifFrom } from "./catalogue-png.mjs";

/**
 * `painter()` reads absolute cursor positioning (`CUP`/`H`/`f`) and nothing
 * else that moves the cursor — it is scoped to the four things *this
 * framework's own components* emit, and none of them uses relative movement.
 * Claude Code's diff redraw does: `CSI n B` (down), `CSI n G` (column), seen
 * moving between the individual letters of its status-line shimmer. Neither
 * matches any arm of `painter`'s tokenizer, so both used to fall through to
 * `sanitizeForPainter`'s "unknown CSI" bucket and get stripped — silently
 * dropping the position, not just an unreadable code. Every subsequent
 * character then landed wherever the last real `CUP` left the cursor, and a
 * row addressed one line at a time collapsed onto a single line of the model.
 *
 * This tracks the cursor itself, mirroring painter's own rules for the
 * signals it already understands (`CUP`, `CR`, `LF`, erase, the alternate
 * screen, and text advancing by `cells()`) and translates everything
 * `painter` cannot read — `A B C D E F G` \` `d`, and DECSC/DECRC (`ESC 7`/
 * `ESC 8`) — into the equivalent absolute `CUP` before handing the stream
 * on. Painter's own cursor then arrives at the same place this tracker
 * computed, without painter needing to know a wider grammar exists.
 */
const CURSOR_TOKEN = new RegExp(
  [
    "\\x1b\\[(?<cupR>\\d*)(?:;(?<cupC>\\d*))?[Hf]",
    "\\x1b\\[(?<eraseN>\\d*)J",
    "\\x1b\\[\\?1049(?<alt>[hl])",
    "\\x1b\\[(?<dirN>\\d*)(?<dir>[ABCD])",
    "\\x1b\\[(?<nlN>\\d*)(?<nl>[EF])",
    "\\x1b\\[(?<colN>\\d*)[G`]",
    "\\x1b\\[(?<vpaN>\\d*)d",
    "(?<save>\\x1b7)",
    "(?<restore>\\x1b8)",
    "(?<cr>\\r)",
    "(?<lf>\\n)",
    // Every other escape form — SGR, OSC, charset select, an unrecognised CSI
    // — matched whole and passed through untouched for `sanitizeForPainter`
    // to judge. **Without this arm the bug this file exists to fix comes
    // back at one remove**: an ESC that matches none of the specific
    // alternatives above makes the whole regex fail at that position, the
    // engine skips the lone ESC byte, and the `text` arm below then
    // swallows the sequence's payload as literal characters — silently, the
    // same failure `painter`'s narrower grammar produced.
    "(?<other>\\x1b\\[[0-9;:<=>?]*[ -\\/]*[@-~]|\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)|\\x1b[()][0-9A-Za-z]|\\x1b[0-9A-Za-z])",
    "(?<text>[^\\x1b\\r\\n]+)",
  ].join("|"),
  "g",
);

export function trackAndTranslateCursor(text, state) {
  let out = "";
  for (const m of text.matchAll(CURSOR_TOKEN)) {
    const g = m.groups;
    const emitCup = () => `\x1b[${String(state.row + 1)};${String(state.col + 1)}H`;
    if (g.cupR !== undefined) {
      state.row = Math.max(0, (g.cupR === "" ? 1 : Number(g.cupR)) - 1);
      state.col = Math.max(0, (g.cupC === undefined || g.cupC === "" ? 1 : Number(g.cupC)) - 1);
      out += m[0];
    } else if (g.eraseN !== undefined || g.alt !== undefined) {
      state.row = 0;
      state.col = 0;
      out += m[0];
    } else if (g.dir !== undefined) {
      const n = g.dirN === "" ? 1 : Number(g.dirN);
      if (g.dir === "A") state.row = Math.max(0, state.row - n);
      else if (g.dir === "B") state.row = state.row + n;
      else if (g.dir === "C") state.col = state.col + n;
      else if (g.dir === "D") state.col = Math.max(0, state.col - n);
      out += emitCup();
    } else if (g.nl !== undefined) {
      const n = g.nlN === "" ? 1 : Number(g.nlN);
      state.col = 0;
      state.row = g.nl === "E" ? state.row + n : Math.max(0, state.row - n);
      out += emitCup();
    } else if (g.colN !== undefined) {
      state.col = Math.max(0, (g.colN === "" ? 1 : Number(g.colN)) - 1);
      out += emitCup();
    } else if (g.vpaN !== undefined) {
      state.row = Math.max(0, (g.vpaN === "" ? 1 : Number(g.vpaN)) - 1);
      out += emitCup();
    } else if (g.save !== undefined) {
      state.saved = { row: state.row, col: state.col };
    } else if (g.restore !== undefined) {
      if (state.saved !== null) {
        state.row = state.saved.row;
        state.col = state.saved.col;
      }
      out += emitCup();
    } else if (g.cr !== undefined) {
      state.col = 0;
      out += m[0];
    } else if (g.lf !== undefined) {
      state.row += 1;
      out += m[0];
    } else if (g.text !== undefined) {
      state.col += cells(g.text);
      out += m[0];
    } else {
      out += m[0];
    }
  }
  return out;
}

/**
 * `atEscapeBoundary` and `painter`'s own tokenizer both know a narrower CSI
 * grammar than ECMA-48's — `[0-9;?]*` for the parameter bytes, because that
 * is everything the framework's own components emit. **A foreign program is
 * not bound by that**, and Claude Code sends `CSI > 4 m` (xterm
 * modifyOtherKeys) and `CSI < u` (Kitty keyboard protocol release) within the
 * first few hundred bytes of a session — neither matches, so the tokenizer's
 * fallback treats the ESC as unmatched, skips it, and paints the rest of the
 * sequence as literal text. A row that should be blank shows `[>0q` sitting
 * in it.
 *
 * The full grammar (ECMA-48 §5.4): parameter bytes `0x30–0x3F` (digits, `;`,
 * `:`, and the private markers `< = > ?`), intermediate bytes `0x20–0x2F`,
 * one final byte `0x40–0x7E`. Matched here, but **not all of it is handed
 * to `painter`** — only the forms it already has arms for (cursor
 * positioning, erase, the alternate screen, SGR) pass through unchanged, so
 * its documented behaviour is untouched. Everything else is dropped, and
 * counted in `strippedCsi` rather than silently absorbed — the same
 * discipline `unparsedSgr` already carries for colour codes that fall
 * through.
 */
const FULL_CSI = /\x1b\[[0-9;:<=>?]*[ -\/]*[@-~]/g;
const PAINTER_KNOWN_CSI = /^\x1b\[(?:[0-9]*(?:;[0-9]*)?[Hf]|[0-9]*J|\?1049[hl]|[0-9;]*m)$/;

/** `atEscapeBoundary`'s own test, widened to the same full CSI grammar `FULL_CSI` matches. */
const COMPLETE_ESCAPE_FOREIGN =
  /^\x1b(?:\[[0-9;:<=>?]*[ -\/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[()][0-9A-Za-z]|[0-9A-Za-z])/u;

export function atCsiBoundary(buf) {
  const last = buf.lastIndexOf("\x1b");
  if (last === -1 || COMPLETE_ESCAPE_FOREIGN.test(buf.slice(last))) {
    return { ready: buf, partial: "" };
  }
  return { ready: buf.slice(0, last), partial: buf.slice(last) };
}

/** Strip every CSI form `painter` cannot read, and say by final byte how many of each. */
// Bare C0 control bytes outside a CSI/OSC sequence — SO/SI (0x0E/0x0F) switch
// VT100's alternate character set and need no `ESC` at all, so they pass
// straight through `painter`'s tokenizer as ordinary text (it is not `\r`,
// `\n` or `\x1b`). Harmless in a terminal; fatal to an SVG, whose XML forbids
// most C0 bytes outright — `sharp` refused the file with "invalid Char value
// 15" the first time this tool met one. Stripped and counted for the same
// reason unrecognised CSI forms are: silently rendering a byte the writer
// meant as a mode switch, as if it were ink, is the F241 failure again.
// 0x0e-0x1f minus 0x1b: ESC is not a "bare" control here, it introduces every
// other escape form (OSC, charset select, single-char) that `FULL_CSI` does
// not touch — stripping it and leaving the payload behind is exactly the
// corruption this function exists to prevent, and it is what a `0x0e-0x1f`
// range does the moment it includes 0x1b.
const BARE_CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1a\x1c-\x1f]/g;

export function sanitizeForPainter(text) {
  const stripped = {};
  const csiClean = text.replace(FULL_CSI, (m) => {
    if (PAINTER_KNOWN_CSI.test(m)) return m;
    const finalByte = m[m.length - 1];
    stripped[finalByte] = (stripped[finalByte] ?? 0) + 1;
    return "";
  });
  const clean = csiClean.replace(BARE_CONTROL, (c) => {
    const key = `\\x${c.codePointAt(0).toString(16).padStart(2, "0")}`;
    stripped[key] = (stripped[key] ?? 0) + 1;
    return "";
  });
  return { clean, stripped };
}

function parseArgs(argv) {
  const dashdash = argv.indexOf("--");
  const flags = dashdash === -1 ? argv : argv.slice(0, dashdash);
  const command = dashdash === -1 ? "" : argv.slice(dashdash + 1).join(" ");

  const get = (name, dflt) => {
    const i = flags.indexOf(name);
    return i === -1 ? dflt : flags[i + 1];
  };
  const fromRaw = get("--from-raw", null);
  if (fromRaw === null && command === "") {
    throw new Error("usage: capture-foreign.mjs [flags] -- <command> [args...]  (or --from-raw <dir>)");
  }
  const region = get("--region", null);
  return {
    command,
    fromRaw,
    durationMs: Number(get("--duration", "8000")),
    cols: get("--cols", null) === null ? null : Number(get("--cols", "100")),
    rows: get("--rows", null) === null ? null : Number(get("--rows", "30")),
    intervalMs: get("--interval", null) === null ? null : Number(get("--interval", "0")),
    region: region === null ? null : Object.fromEntries(
      ["row", "col", "width", "height"].map((k, i) => [k, Number(region.split(",")[i])]),
    ),
    out: get("--out", join("captures", new Date().toISOString().replace(/[:.]/g, "-"))),
    gif: flags.includes("--gif"),
  };
}

/**
 * A styled row (real SGR + text, as `painter().styled()` emits) expanded to
 * one resolved colour per character.
 *
 * `parseLine` already does the SGR resolution — this only turns its spans
 * into a flat array so a region can be sliced at cell granularity without
 * caring where a span boundary fell.
 */
function expandRow(styledRow) {
  const cells = [];
  for (const span of parseLine(styledRow)) {
    for (const ch of span.text) {
      cells.push({ ch, colour: span.colour, background: span.background, bold: span.bold });
    }
  }
  return cells;
}

/** Consecutive cells sharing a colour+background, as `{ len, colour, background }`. */
function runsOf(cells) {
  const runs = [];
  for (const cell of cells) {
    const last = runs[runs.length - 1];
    if (last !== undefined && last.colour === cell.colour && last.background === cell.background) {
      last.len += 1;
    } else {
      runs.push({ len: 1, colour: cell.colour, background: cell.background });
    }
  }
  return runs;
}

/**
 * The colour analysis for one frame's region: distinct colours, the run
 * shape (so "per-character" and "per-run" are a measurement, not a read of
 * the picture), and whether any cell carried both a foreground and a
 * background — the sub-cell case the shimmer might be using.
 */
function analyseRegion(styledRows, region) {
  const rowsOut = [];
  const coloursInRegion = new Set();
  let dualChannelCells = 0;
  for (let r = region.row; r < region.row + region.height; r += 1) {
    const row = styledRows[r];
    if (row === undefined) continue;
    const cells = expandRow(row).slice(region.col, region.col + region.width);
    for (const c of cells) {
      coloursInRegion.add(`${c.colour}|${c.background ?? ""}`);
      if (c.background !== null) dualChannelCells += 1;
    }
    rowsOut.push({ row: r, runs: runsOf(cells) });
  }
  const runLens = rowsOut.flatMap((r) => r.runs.map((run) => run.len));
  return {
    distinctColours: coloursInRegion.size,
    dualChannelCells,
    runLengths: runLens,
    // A single-character run everywhere is the per-character case; anything
    // longer is coarser than that, and this is reported as a number rather
    // than a label so "coarser than it looks" has a figure behind it.
    meanRunLength: runLens.length === 0 ? 0 : runLens.reduce((a, b) => a + b, 0) / runLens.length,
    rows: rowsOut,
  };
}

/** Every SGR form's category, so the summary can say which forms appeared and how often. */
function categorise(first, params) {
  if (first === 38 && params[1] === 2) return "24bit-fg";
  if (first === 38 && params[1] === 5) return "indexed-fg";
  if (first === 48 && params[1] === 2) return "24bit-bg";
  if (first === 48 && params[1] === 5) return "indexed-bg";
  if ((first >= 30 && first <= 37) || (first >= 90 && first <= 97)) return "16-fg";
  if ((first >= 40 && first <= 47) || (first >= 100 && first <= 107)) return "16-bg";
  if (first === 1) return "bold";
  if (first === 2) return "dim";
  if (first === 22) return "normal-intensity";
  if (first === 7) return "inverse";
  if (first === 27) return "inverse-off";
  if (first === 0) return "reset";
  if (first === 39) return "default-fg";
  if (first === 49) return "default-bg";
  return `unknown-${String(first)}`;
}

function sgrHistogram(bytes) {
  const hist = {};
  for (const m of bytes.matchAll(/\x1b\[([0-9;]*)m/g)) {
    const params = m[1].split(";").map((p) => (p === "" ? 0 : Number(p)));
    const kind = categorise(params[0], params);
    hist[kind] = (hist[kind] ?? 0) + 1;
  }
  return hist;
}

/**
 * The region analysis, the SGR histogram, the PNGs and the GIF — everything
 * downstream of "a screen model was fed a byte stream", shared by the live
 * spawn and the `--from-raw` replay. Neither knows which one produced `frames`
 * and `allText`.
 */
async function finish(opts, command, exitCode, allText, frames, strippedCsi) {
  const framesDir = join(opts.out, "frames");
  mkdirSync(framesDir, { recursive: true });

  const region = opts.region ?? { row: 0, col: 0, width: opts.cols, height: opts.rows };
  const perFrame = frames.map((f, i) => ({
    index: i,
    tMs: Math.round(f.tMs),
    ...analyseRegionSummary(analyseRegion(f.rows, region)),
  }));

  const summary = {
    command,
    exitCode,
    frameCount: frames.length,
    region,
    sgrHistogram: sgrHistogram(allText),
    unparsedSgr: unparsedSgr(allText),
    // CSI forms `painter` has no arm for, dropped before the screen model saw
    // them rather than left to leak as text — see `sanitizeForPainter`.
    strippedCsi,
    perFrame,
  };
  writeFileSync(join(opts.out, "summary.json"), JSON.stringify(summary, null, 2));

  const pngBuffers = [];
  for (let i = 0; i < frames.length; i += 1) {
    const svg = ansiToSvg(frames[i].rows.join("\n"));
    const buf = await pngFromSvg(svg);
    writeFileSync(join(framesDir, `frame-${String(i).padStart(4, "0")}.png`), buf);
    pngBuffers.push(buf);
  }
  if (opts.gif && pngBuffers.length > 1) {
    const delays = frames.slice(1).map((f, i) => Math.max(2, Math.round((f.tMs - frames[i].tMs) / 10)));
    delays.push(delays[delays.length - 1] ?? 10);
    await gifFrom(pngBuffers, delays, join(opts.out, "frames.gif"), `capture-foreign: ${command}`);
  }

  return summary;
}

/**
 * Replay a recording `capture-foreign-record.mjs` made — on the host, against
 * a target the container has no route to — through the same screen model and
 * analysis this file uses for a live spawn.
 *
 * **Reading `raw.bin`, not a description of it.** The recorder's job was only
 * to get the bytes down faithfully; this is where they are first interpreted,
 * which keeps the "read the bytes, not a reconstruction" rule on the actual
 * capture rather than on whatever the recorder happened to log about it.
 */
export async function fromRaw(rawDir, opts) {
  const meta = JSON.parse(readFileSync(join(rawDir, "meta.json"), "utf8"));
  const cols = opts.cols ?? meta.cols;
  const rows = opts.rows ?? meta.rows;
  const rawBytes = readFileSync(join(rawDir, "raw.bin"));
  // For the report only — a whole-buffer decode, so `sgrHistogram` and
  // `unparsedSgr` see correctly formed multi-byte characters throughout.
  const allText = rawBytes.toString("utf8");
  const timings = readFileSync(join(rawDir, "timings.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));

  const paint = painter(cols, rows);
  const cursor = { row: 0, col: 0, saved: null };
  let held = "";
  let bytePos = 0;
  // **`len` in `timings.jsonl` is a byte count, and `allText` is already
  // decoded.** Slicing the decoded string at a byte offset drifts the moment
  // any multi-byte character appears before it — every glyph in the framework's
  // own output, and most of what a foreign TUI draws — which tore SGR sequences
  // in half mid-parameter and printed the tail as text (`115;115;115m` with no
  // `ESC[38;2;` before it). The replay has to decode byte-sliced chunks through
  // a streaming decoder, the way the live spawn already does, not slice text.
  const decoder = new TextDecoder("utf-8");
  const frames = [];
  const strippedCsi = {};
  let lastStyled = null;
  const snapshot = (tMs) => {
    const styled = paint.styled();
    const joined = styled.join("\n");
    if (joined === lastStyled) return;
    lastStyled = joined;
    frames.push({ tMs, rows: styled });
  };

  let nextSampleAt = opts.intervalMs ?? null;
  for (const { tMs, len } of timings) {
    const chunk = decoder.decode(rawBytes.subarray(bytePos, bytePos + len), { stream: true });
    bytePos += len;
    const { ready, partial } = atCsiBoundary(held + chunk);
    held = partial;
    const translated = trackAndTranslateCursor(ready, cursor);
    const { clean, stripped } = sanitizeForPainter(translated);
    for (const [k, v] of Object.entries(stripped)) strippedCsi[k] = (strippedCsi[k] ?? 0) + v;
    paint.apply(clean);
    if (opts.intervalMs === null) {
      snapshot(tMs);
    } else if (tMs >= nextSampleAt) {
      snapshot(tMs);
      while (nextSampleAt <= tMs) nextSampleAt += opts.intervalMs;
    }
  }
  snapshot(timings.length > 0 ? timings[timings.length - 1].tMs : 0);

  return finish({ ...opts, cols, rows }, meta.command, null, allText, frames, strippedCsi);
}

export async function capture(rawOpts) {
  const opts = { ...rawOpts, cols: rawOpts.cols ?? 100, rows: rawOpts.rows ?? 30 };
  mkdirSync(opts.out, { recursive: true });
  const rawPath = join(opts.out, "raw.bin");
  const timingPath = join(opts.out, "timings.jsonl");
  writeFileSync(rawPath, "");
  writeFileSync(timingPath, "");
  writeFileSync(join(opts.out, "meta.json"), JSON.stringify({ command: opts.command, cols: opts.cols, rows: opts.rows }, null, 2));

  const term = spawn("/bin/sh", ["-c", opts.command], {
    name: "xterm-256color",
    cols: opts.cols,
    rows: opts.rows,
    // The whole environment, not a rebuilt pair — F147's lesson one layer out:
    // the target here is often an interactive CLI (auth tokens, HOME, config
    // dirs) rather than a fixture, so only TERM and LANG are pinned, last.
    env: { ...process.env, TERM: "xterm-256color", LANG: "en_GB.UTF-8" },
    encoding: null,
  });

  const start = performance.now();
  const decoder = new TextDecoder("utf-8");
  const paint = painter(opts.cols, opts.rows);
  const cursor = { row: 0, col: 0, saved: null };
  let held = "";
  let allText = "";
  const frames = []; // { tMs, rows: styled() }
  const strippedCsi = {};
  let lastStyled = null;

  function snapshot(tMs) {
    const styled = paint.styled();
    const joined = styled.join("\n");
    if (joined === lastStyled) return;
    lastStyled = joined;
    frames.push({ tMs, rows: styled });
  }

  term.onData((d) => {
    const buf = Buffer.from(d);
    appendFileSync(rawPath, buf);
    const tMs = performance.now() - start;
    appendFileSync(timingPath, JSON.stringify({ tMs, len: buf.length }) + "\n");

    const text = decoder.decode(buf, { stream: true });
    allText += text;
    const { ready, partial } = atCsiBoundary(held + text);
    held = partial;
    const translated = trackAndTranslateCursor(ready, cursor);
    const { clean, stripped } = sanitizeForPainter(translated);
    for (const [k, v] of Object.entries(stripped)) strippedCsi[k] = (strippedCsi[k] ?? 0) + v;
    paint.apply(clean);
    if (opts.intervalMs === null) snapshot(tMs);
  });

  let sampler = null;
  if (opts.intervalMs !== null) {
    sampler = setInterval(() => snapshot(performance.now() - start), opts.intervalMs);
  }

  const exitCode = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      term.kill();
    }, opts.durationMs);
    term.onExit(({ exitCode }) => {
      clearTimeout(timer);
      resolve(exitCode);
    });
  });
  if (sampler !== null) clearInterval(sampler);
  snapshot(performance.now() - start);

  return finish(opts, opts.command, exitCode, allText, frames, strippedCsi);
}

/** Strip the per-row detail out of the region analysis for the summary file — kept in `rows` for a caller that wants it. */
function analyseRegionSummary(a) {
  return {
    distinctColours: a.distinctColours,
    dualChannelCells: a.dualChannelCells,
    meanRunLength: Number(a.meanRunLength.toFixed(2)),
    runLengths: a.runLengths,
  };
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  const summary = opts.fromRaw !== null ? await fromRaw(opts.fromRaw, opts) : await capture(opts);
  console.log(`captured ${String(summary.frameCount)} frames -> ${opts.out}`);
  console.log(JSON.stringify({ sgrHistogram: summary.sgrHistogram, unparsedSgr: summary.unparsedSgr }, null, 2));
}
