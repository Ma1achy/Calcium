// C27 I2–I12 — the emulator, mutated at the gate, the walk, the cap, the trim
// and the disposal.
//
// Every mutation is a shape the landing measured or the walk named: the tally
// counting feeds (which is what the first implementation did and the spec's own
// wording invited), a filler cell emitted as an empty character, a run emitted
// for default cells, the trailing trim taking styled blanks with it, the lines
// arm returning the screen's height, a title stored on the block, disposal
// returning the last value, and the proposed-API flag dropped.
//
// The control is the containment gate: T2.4 walks a thousand random chunks, so a
// gate that lets everything through must fail — and if it does not, the corpus
// is reaching nothing and every row that trusts the gate is measuring the fake.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/emulator.test.ts test/contract/emulator.test.ts test/edge/emulator.test.ts test/revert/emulator.test.ts";
const EMULATOR = "src/data/emulator/emulator.ts";
const SNAPSHOT = "src/data/emulator/snapshot.ts";

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
    file: SNAPSHOT,
    from: "    out += isForbidden(cp) ? UNREPRESENTABLE : ch;",
    to: "    out += ch;",
    why:
      "T2.4 walks a thousand seeded random chunks through the gate and asserts no control survives; " +
      "a gate that passes everything must fail it. A green control means the corpus reaches no control " +
      "at all, and every row that trusts the gate is asserting against an empty subject",
  },
  mutations: [
    {
      // C27 I7 (T1.6, T5.2, T6.5) — the wording the spec first had: *lines lost
      // at the cap*, which a feed count satisfies while reading as correct.
      name: "dropped counts line feeds",
      file: EMULATOR,
      from: "    dropped = Math.max(0, feeds + 1 - normal.length);",
      to: "    dropped = feeds;",
      expect: "T1.6",
    },
    {
      // C27 I7 — the off-by-one the `+ 1` is: the row the buffer starts on.
      name: "the tally forgets the buffer's first row",
      file: EMULATOR,
      from: "    dropped = Math.max(0, feeds + 1 - normal.length);",
      to: "    dropped = Math.max(0, feeds - normal.length);",
      expect: "T1.6",
    },
    {
      // C27 I6 (T1.4, T6.4) — the filler cell emitted as an empty character.
      // `cells()` reads the same width either way, which is why T1.4 asserts a
      // second thing.
      name: "a wide cluster's filler cell is emitted",
      file: SNAPSHOT,
      from: "    if (cell.getWidth() === 0) continue;",
      to: "    if (false) continue;",
      expect: "T1.4",
    },
    {
      // C27 I5 (T1.2, T6.3) — a run for every cell, default styles included.
      name: "a default-styled cell gets its own run",
      file: SNAPSHOT,
      from: "    if (plain(piece.style)) continue;",
      to: "    if (false) continue;",
      expect: "T1.2",
    },
    {
      // C27 I6 (T1.12) — the trim taking styled blanks with it: a vim tilde row
      // and a bar in reverse video are background, and lose their only content.
      name: "the trailing trim ignores the style",
      file: SNAPSHOT,
      from: "    if (last.text.trim() !== \"\" || !plain(last.style)) break;",
      to: "    if (last.text.trim() !== \"\") break;",
      expect: "T1.12",
    },
    {
      // C27 I5 (T1.2) — the palette boundary: 16 colours below, 256 above.
      name: "every palette index is ansi256",
      file: SNAPSHOT,
      from: "  if (palette) return value < 16 ? { kind: \"ansi16\", index: value } : { kind: \"ansi256\", index: value };",
      to: "  if (palette) return { kind: \"ansi256\", index: value };",
      expect: "T1.2",
    },
    {
      // C27 I4 (T1.1, T6.6) — the lines arm returning the screen's height, so a
      // one-line write reports four lines and the block's measure jumps.
      name: "lines mode returns the screen's height",
      file: EMULATOR,
      from: "      const height = alternate ? rows : buffer.length;",
      to: "      const height = rows;",
      expect: "T1.1",
    },
    {
      // C27 I4 (T1.1) — the trim taking the cursor's row with it, so a child
      // that has just returned shows no row to write on.
      name: "the trim ignores the cursor's row",
      file: EMULATOR,
      from: "        while (last > cursorLine && (lines[last]?.text ?? \"\") === \"\") last -= 1;",
      to: "        while (last > 0 && (lines[last]?.text ?? \"\") === \"\") last -= 1;",
      expect: "T1.9",
    },
    {
      // C27 I7 (T2.6) — `dropped: 0` written into the block, so the marker row
      // draws "0 lines dropped at the cap".
      name: "dropped is always present",
      file: EMULATOR,
      from: "        ...(dropped > 0 ? { dropped } : {}),",
      to: "        dropped,",
      expect: "T2.6",
    },
    {
      // C27 I12 (T3.7, T6.8) — snapshot after dispose returning the last value,
      // which hides a caller holding a disposed emulator.
      name: "snapshot survives dispose",
      file: EMULATOR,
      from: "      refuseDisposed(\"snapshot\");",
      to: "      if (disposed) return { kind: \"terminal\", id, cols: 1, screen: \"lines\", lines: [] };",
      expect: "T3.7",
    },
    {
      // C27 §1 (T1.1, F847) — the proposed-API flag, whose absence throws at the
      // first buffer read and which the first wrapper simply did not carry.
      name: "the proposed API is not requested",
      file: EMULATOR,
      from: "    allowProposedApi: true,",
      to: "    allowProposedApi: false,",
      expect: "T1.1",
    },
    {
      // C27 I11 (T2.1, T6.9) — the package imported from the walk, so the
      // dependency stops being confined to one file.
      name: "the walk imports the package",
      file: SNAPSHOT,
      from: "import type { ColourValue, TerminalLine, TerminalRun } from \"../viewmodel/types.js\";",
      to: "import xterm from \"@xterm/headless\";\nimport type { ColourValue, TerminalLine, TerminalRun } from \"../viewmodel/types.js\";\nvoid xterm;",
      expect: "T2.1",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
