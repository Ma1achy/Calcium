// F149 — the harness's screen model, mutated.
//
// **The first mutation is the state the harness shipped in**, and it is here
// rather than in prose because that is the only way to ask whether the fixture
// can see it: `screen` reduced to a slice from the last home with the addresses
// stripped. The rest are the ways a screen model is quietly wrong — an off-by-
// one on CUP that produces a self-consistent screen one row low, a column
// ignored, a row that grows instead of being bounded, and an alternate screen
// that keeps what was underneath it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/pty-screen.test.ts";
const FILE = "test/support/pty.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: FILE,
    from: "        : place(line, ink, col, text);",
    to: "        : place(line, ink, col, \"\");",
    why: "a screen that writes no text can satisfy nothing here — every row states content, so a pass where this survives is a pass that saw no kill",
  },
  mutations: [
    {
      // **The measured instance**, in the shape it actually had: the current
      // frame is everything after the last `CSI H`, escapes removed, split on
      // newlines. It is what the getter did for the life of the build, and it
      // reads as correct because a "contains" assertion over the resulting blob
      // passes whenever the text was ever painted.
      name: "the frame is a slice from the last home, not an applied stream",
      file: FILE,
      from: "  const paint = painter(cols, rows);",
      to: "  const home = bytes.lastIndexOf(\"\\u001b[H\");\n  if (home !== -1) return bytes.slice(home).replace(/\\u001b\\[[0-9;?]*[a-zA-Z]/gu, \"\").split(/\\r*\\n/u);\n  const paint = painter(cols, rows);",
      // PS1 — the two addressed rows come back adjacent in one string.
      expect: "PS1",
    },
    {
      // CUP is 1-based on the wire. Converting in the model as well puts every
      // row one down, and the screen it produces is entirely self-consistent —
      // which is what made the same defect hard to see in the renderer (T4.12).
      name: "CUP converted twice, so every row lands one down",
      file: FILE,
      from: "      row = Math.max(0, (r === undefined || r === \"\" ? 1 : Number(r)) - 1);",
      to: "      row = Math.max(0, (r === undefined || r === \"\" ? 1 : Number(r)) - 2);",
      // PS3 — content addressed to row 3 arrives on row 1, self-consistently.
      expect: "PS3",
    },
    {
      // The port hazard, stated as a mutation. A model that reads the row and
      // ignores the column is right about everything the old slice was right
      // about, and CUP-ignores-its-column is exactly the row that stayed green
      // when six rows were ported into a fixture that had no column in it.
      name: "the column is ignored and every write starts at 0",
      file: FILE,
      from: "      col = Math.max(0, (c === undefined || c === \"\" ? 1 : Number(c)) - 1);",
      to: "      col = 0;",
      // PS4 — text addressed to column 11 is written flush left.
      expect: "PS4",
    },
    {
      // A screen has a height. Growing it makes `frame.length` a count of every
      // row ever painted, which is precisely the property that made four editor
      // rows fail when they were written against `output`.
      name: "a write past the last row grows the screen",
      file: FILE,
      from: "    const line = row >= 0 && row < rows ? grid[row] : undefined;",
      to: "    while (row >= 0 && grid.length <= row) grid.push([]);\n    const line = row >= 0 ? grid[row] : undefined;",
      // PS8 — the screen comes back longer than its height.
      expect: "PS8",
    },
    {
      // Without this the login shell's scrollback sits underneath the
      // application for the life of the session, and every row asserting that a
      // screen is empty is reading somebody else's output.
      name: "entering the alternate screen keeps what was underneath",
      file: FILE,
      from: "      grid = blank();\n      pens = blank();\n      if (alt !== undefined) {",
      to: "      if (alt !== undefined) {",
      // PS6 — the prompt painted before the switch is still on the screen.
      expect: "PS6",
    },
    {
      // `overrun` is the check that makes importing `cells()` honest. Measuring
      // in `.length` is the framework's oldest forbidden shortcut, and it is
      // invisible until a wide glyph arrives — which is the one case where a
      // row wraps and the alternate screen scrolls.
      name: "overrun measures .length rather than cells",
      file: FILE,
      from: "    .map((line, i) => ({ i, width: cells(line) }))",
      to: "    .map((line, i) => ({ i, width: line.length }))",
      // PS9 — two wide glyphs measure 2 against a screen of 3, unreported.
      expect: "PS9",
    },
    {
      // **The frame-read's finding, as a mutation.** Rebuilding and replaying at
      // the new geometry is internally consistent and puts every historical
      // write at the current width — 120-column content surviving an 80-column
      // pass, sitting in columns 80-119, reading as an application defect.
      name: "a resize re-flows instead of clipping",
      file: FILE,
      from: "      for (const line of grid) line.length = Math.min(line.length, cols);",
      to: "      for (const line of grid) line.length = Math.max(line.length, cols);",
      // PS14 - narrowing does not lose the cells beyond the new width.
      expect: "PS14",
    },
    {
      // The pen, without which a focused row and an unfocused one are the same
      // string — which is what sent C02's T5.4b into the raw stream in the
      // first place, and that reach was the third copy of the CSI H premise.
      name: "the pen is never recorded, so every cell is unstyled",
      file: FILE,
      from: "      ink[x] = pen;",
      to: "      ink[x] = null;",
      // PS15 - a toned row and a plain one compare equal.
      expect: "PS15",
    },
    {
      // A pen that never resets bleeds the first tone down every cell after it,
      // so a row painted after a reset compares unequal to an unstyled one.
      name: "SGR 0 accumulates rather than resetting the pen",
      file: FILE,
      from: '      pen = sgr === "" || sgr === "0" ? "" : pen + `\\u001b[${sgr}m`;',
      to: '      pen = pen + `\\u001b[${sgr}m`;',
      // PS15 - a reset no longer returns the pen.
      expect: "PS15",
    },
    {
      // The incremental path's own hazard. Everything ready means an address
      // split across two reads is dropped and its tail painted as text — a
      // plausible screen, wrong, and nothing about it looks partial.
      name: "a partial escape at the chunk boundary is applied rather than held",
      file: FILE,
      from: "  if (last === -1 || COMPLETE_ESCAPE.test(buf.slice(last))) {",
      to: "  if (true) {",
      // PS13 — a buffer ending in `CSI 12` reports nothing still arriving.
      expect: "PS13",
    },
    {
      // **The model shipped in this state for an hour**, and C03's T5.5 is what
      // caught it: a frame after a resume is whole exactly when every row has
      // one width, so trailing space is load-bearing there and invisible
      // everywhere else. Trimming is the change a screen model makes because
      // the rows look tidier in a failure message.
      name: "rows are trimmed rather than padded to the screen's width",
      file: FILE,
      from: "    return width >= cols ? text : text + \" \".repeat(cols - width);",
      to: "    return text.replace(/\\s+$/u, \"\");",
      // PS12 — the rows come back at several widths.
      expect: "PS12",
    },
    {
      // **This one is here because the pass found it.** PS6's mutation survived
      // a run that PS6 was written to catch, and the cause was the model rather
      // than the test: `head + text` indexes a cell cursor into a string, so a
      // write truncated everything to its right and clearing the screen looked
      // identical to not clearing it. A row is cells now, and PS10 is what came
      // out of it.
      name: "a write truncates the rest of the row",
      file: FILE,
      from: "      line[x] = ch;",
      to: "      line[x] = ch;\n      line.length = x + 1;",
      // PS10 — a two-character write into a ten-cell row leaves two cells.
      expect: "PS10",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
