// C22 §6 — the frame as rows, and the two rules that make it safe to write.
//
// Both failures corrupt state the application cannot see or correct, which is
// why both are asserted before any output rather than observed after it:
//
//   - **The heights must sum to `rows`** (S01 §3). One too many scrolls the
//     alternate screen; one too few leaves the previous frame showing through.
//   - **One width per frame** (`docs/notes/resize-and-compositor.md`). A frame
//     composed at two widths is coherent at neither, and the wrap it causes
//     scrolls the alternate screen.
import { describe, expect, it } from "vitest";

import { compose, heightsSum, type Composed } from "../../src/shell/frame.js";
import { exact, FrameError, paint, type PaintDeps } from "../../src/shell/paint.js";
import { displayCells } from "../../src/presentation/text.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import type { SessionSnapshot } from "../../src/shell/types.js";

const SESSION: SessionSnapshot = Object.freeze({
  cwd: "/work",
  env: Object.freeze({}),
  lastUuid: null,
  identity: null,
  cluster: "fmx-prod",
  health: "live",
  version: "1.0.0",
  retained: null,
  stopping: false,
});

function deps(over: Partial<PaintDeps> = {}): PaintDeps {
  const registry = createBlockRegistry({ defaults: true });
  return {
    registry,
    theme: DARK_THEME,
    capabilities: FULL_CAPS,
    transcriptRows: () => [],
    promptRows: () => [""],
    overlays: () => [],
    promptCursor: () => ({ row: 0, col: 2 }),
    promptFocused: () => true,
    ...over,
  };
}

function frameAt(columns: number, rows: number, promptRows = 1): Composed {
  return compose({
    chrome: { header: () => [], footer: () => [] },
    session: () => SESSION,
    now: () => 1_700_000_000_000,
    size: () => ({ columns, rows }),
    promptRows: () => promptRows,
  });
}

describe("C22 §6 — the paint", () => {
  it("T4.12 (S01 §3): the frame is exactly rows × columns, at every size", () => {
    // The whole rectangle, not a sample. A frame one row over scrolls and a row
    // one cell over wraps, and both are unrecoverable — so the assertion is on
    // the shape of everything written, at the sizes a terminal actually takes.
    for (const [columns, rows] of [
      [60, 16],
      [80, 24],
      [100, 30],
      [120, 40],
      [160, 50],
    ] as const) {
      const f = frameAt(columns, rows);
      const lines = paint(f, deps());

      expect(lines, `${String(columns)}x${String(rows)}: row count`).toHaveLength(rows);
      for (const [i, line] of lines.entries()) {
        expect(displayCells(line), `${String(columns)}x${String(rows)} row ${String(i)}`).toBe(columns);
      }
    }
  });

  it("T4.12b (S01 §3): the sum is checked before anything is written", () => {
    // The clamps in `compose` mean this cannot fail today, which is exactly why
    // it is asserted: a clamp is a fact about the current arithmetic and this
    // is a claim about the frame. A hand-built frame that does not sum is
    // refused rather than written short.
    const good = frameAt(100, 30);
    expect(heightsSum(good)).toBe(true);

    const broken: Composed = Object.freeze({
      ...good,
      region: Object.freeze({ top: 1, height: good.region.height + 1 }),
    });

    expect(heightsSum(broken)).toBe(false);
    expect(() => paint(broken, deps())).toThrow(FrameError);
    expect(() => paint(broken, deps())).toThrow(/do not sum to 30 rows/);
  });

  it("T4.12c (the width hazard): every line is built from one width", () => {
    // **The note's rule, asserted structurally.** `paint` takes the composed
    // frame and reads no stream, so a size that changes between compose and
    // write cannot reach a line. The subject that can tell the two apart is a
    // size function that returns a different answer on every call: if anything
    // downstream re-read it, the rows would disagree with each other.
    let reads = 0;
    const shrinking = (): { columns: number; rows: number } => {
      reads += 1;
      return { columns: 100 - reads * 10, rows: 30 };
    };

    const f = compose({
      chrome: { header: () => [], footer: () => [] },
      session: () => SESSION,
      now: () => 1_700_000_000_000,
      size: shrinking,
      promptRows: () => 1,
    });

    expect(reads, "compose reads it once").toBe(1);
    const lines = paint(f, deps());

    expect(reads, "and paint does not read it at all").toBe(1);
    for (const line of lines) expect(displayCells(line)).toBe(90);
  });

  it("T4.12d (S01 §3): the prompt is capped at half the terminal", () => {
    // Pasting two hundred lines is a real thing people do (C17 T5.2). An
    // uncapped prompt takes the whole frame and leaves the viewport at zero —
    // the transcript vanishes at the moment you most want it.
    const rows = Array.from({ length: 200 }, (_, i) => `line ${String(i)}`);
    const f = frameAt(80, 24, 200);

    expect(f.promptRows, "half of 24").toBe(12);
    expect(f.promptWanted, "and what it wanted is kept, so §3 can window").toBe(200);
    expect(f.region.height, "the viewport keeps the rest").toBe(24 - 1 - 1 - 12);

    const lines = paint(f, deps({ promptRows: () => rows }));
    expect(lines).toHaveLength(24);
    expect(lines.some((l) => l.includes("⋯")), "windowed, with the elision marker").toBe(true);
    expect(lines.some((l) => l.includes("line 199")), "and the newest rows are shown").toBe(true);
  });

  it("T1.5b (S01 C14): a cap of one shows the last row, not a marker with nothing after it", () => {
    // The window is the marker plus the rows that follow it, and at a cap of
    // one there are none: `rows.slice(len - 0)` is empty, so the prompt painted
    // as `⋯` alone with the typed command nowhere on the screen. An elision
    // that elides everything annotates nothing.
    //
    // Reachable below the size gate, which `frame.ts` already records as a real
    // window rather than a theoretical one — a resize can arrive between the
    // gate and the frame.
    const f = frameAt(40, 3, 3);
    expect(f.promptRows, "half of three, floored").toBe(1);

    const lines = paint(f, deps({ promptRows: () => ["first", "second", "third"] }));
    const prompt = lines[1 + f.region.height];

    expect(prompt?.startsWith("❯ third"), "the last row, gutter and all").toBe(true);
    expect(lines.join("").includes("⋯"), "and no marker, because there is no room for one").toBe(
      false,
    );
  });

  it("T1.5c (S01 C15): a frame composed for one prompt row and painted from three is refused", () => {
    // The height enters the frame twice — as a number when the regions are
    // computed, as rows when the prompt is drawn — and `heightsSum` cannot see
    // them disagree, because it compares the frame with itself and stays
    // consistent at every width. This is the live defect the session shipped:
    // `#composed()` passed `() => 1` while `#paintDeps` handed over the
    // editor's real rows, so every wrapped prompt hit the degeneracy above.
    const f = frameAt(80, 24, 1);
    expect(f.promptWanted, "the frame was composed against one row").toBe(1);

    expect(() => paint(f, deps({ promptRows: () => ["one", "two", "three"] }))).toThrow(FrameError);

    // And the agreeing case still paints, so the comparison is not simply a
    // throw with a condition that never holds.
    expect(paint(frameAt(80, 24, 3), deps({ promptRows: () => ["one", "two", "three"] }))).toHaveLength(
      24,
    );
  });

  it("T4.12e: the prompt glyph is on the first row and the gutter on the rest", () => {
    // The gutter C22 passes must match the prompt it draws (T4.9), and this is
    // the drawing half — `displayRows` is computed against `{first: 2}` and the
    // glyph is two cells wide.
    const f = frameAt(80, 24, 3);
    const lines = paint(f, deps({ promptRows: () => ["one", "two", "three"] }));
    const prompt = lines.slice(1 + f.region.height, 1 + f.region.height + 3);

    expect(prompt[0]?.startsWith("❯ one")).toBe(true);
    expect(prompt[1]?.startsWith("  two")).toBe(true);
    expect(prompt[2]?.startsWith("  three")).toBe(true);
  });

  it("T4.12f: the transcript is bottom-aligned against the prompt", () => {
    // Content grows towards the prompt, which is where the eye is. A top-aligned
    // half-full transcript puts a gap between the newest output and the cursor.
    const f = frameAt(40, 20);
    const lines = paint(f, deps({ transcriptRows: () => ["newest"] }));
    const body = lines.slice(1, 1 + f.region.height);

    expect(body.at(-1)?.trimEnd(), "the one row sits at the bottom").toBe("newest");
    expect(body[0]?.trim(), "and the top is blank").toBe("");
  });

  it("`exact` squares a row in both directions, in cells", () => {
    // Short leaves the previous frame showing at the end of the row; long
    // wraps. Only the second is corruption, and both look like a bug.
    expect(exact("ab", 5)).toBe("ab   ");
    expect(exact("abcdef", 3), "an unstyled cut gains no bytes").toBe("abc");
    expect(displayCells(exact("世世世", 5)), "a straddling glyph is padded, not halved").toBe(5);
    expect(exact("世世世", 5)).toBe("世世 ");
  });

  it("T4.12g: SGR costs no cells, and a styled cut is closed", () => {
    // **The live defect this found.** `stripControl` drops the ESC and keeps
    // `[38;5;241m` as printable text, so `cells()` measured every themed chrome
    // row eleven cells too wide per colour change — the frame padded to 80
    // counted-with-escapes and left a visible row of about 38.
    const styled = "\u001b[31mred\u001b[39m";
    expect(displayCells(styled), "three cells, not fourteen").toBe(3);
    expect(exact(styled, 5)).toBe(`${styled}  `);

    // And the worse half: a cut inside an escape leaks `[38;5` as text and
    // never terminates the SGR, so the colour bleeds down every row below.
    const cut = exact("\u001b[31mabcdef", 3);
    expect(cut).toBe("\u001b[31mabc\u001b[0m");
    expect(displayCells(cut)).toBe(3);
  });
});
