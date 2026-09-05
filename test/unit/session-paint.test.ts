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
import { paint, type PaintDeps } from "../../src/shell/paint.js";
import { exact, FrameError } from "../../src/shell/frame-error.js";
import { displayCells } from "../../src/presentation/text.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, LIGHT_THEME, measurable } from "../support/render.js";
import { block } from "../../src/data/viewmodel/index.js";
import { patchDefinition } from "../../src/presentation/patch/definition.js";
import { SGR_RESET, sgr } from "../../src/terminal/escapes.js";
import { resolveBase } from "../../src/presentation/theme/index.js";
import type { SessionSnapshot } from "../../src/shell/types.js";

/** C09's measurer, for the footer's height (C22 I82). */
const MEASURE = createBlockRegistry({ defaults: true }).measureSequence;

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
    spinning: () => false,
    // C22 I50 — the ghost is a paint-time read like the spinner beside it.
    ghost: () => null,
    overlays: () => [],
    promptCursor: () => ({ row: 0, col: 2 }),
    promptSelection: () => [],
    suppressBackground: () => false,
    promptFocused: () => true,
    ...over,
  };
}

function frameAt(columns: number, rows: number, promptRows = 1): Composed {
  return compose({
    chrome: { header: () => [], footer: () => [] },
    measureSequence: MEASURE,
    session: () => SESSION,
    copyMode: () => false,
    now: () => 1_700_000_000_000,
    size: () => ({ columns, rows }),
    promptRows: () => promptRows,
  });
}

describe("C22 §6 — the paint", () => {
  it("T3.30 (C09 I22, C22 I52): an ascii session draws no character above U+007F", () => {
    // **Over the whole frame, not per site** (F122). A row per fixed character
    // is a restatement of the fix; what this has to catch is the seventh site,
    // and a seventh site is by definition one nobody wrote a row for.
    //
    // The frame is driven into every state that draws a mark: a long command
    // that wraps past the prompt's window (the elision), a completion in flight
    // (the spinner), and the prompt itself on the first row of the region.
    const drawn = (caps: typeof FULL_CAPS): readonly string[] =>
      paint(
        // Ten wanted rows against a cap of `floor(16 / 2)` — the prompt windows,
        // which is the only state that draws the elision.
        frameAt(60, 16, 10),
        deps({
          capabilities: caps,
          promptRows: () =>
            Array.from({ length: 10 }, (_, i) => `/ps --flag${String(i)}=value${String(i)}`),
          spinning: () => true,
        }),
      );

    const ascii = drawn(ASCII_CAPS);
    const offending = ascii.flatMap((line, row) =>
      [...line]
        .filter((c) => (c.codePointAt(0) ?? 0) > 127)
        .map((c) => `row ${String(row)}: U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase()}`),
    );
    expect(offending, "a mark the framework drew and could not substitute").toEqual([]);

    // **Two controls, and the fixture must be shown to respond first.** Without
    // them a `paint` that returned blank rows would satisfy the assertion above,
    // and so would a session that never reached the spinner or the elision.
    const full = drawn(FULL_CAPS);
    expect(full.some((l) => l.includes("❯")), "the prompt is drawn at all").toBe(true);
    expect(full.some((l) => l.includes("⋯")), "the elision is reached").toBe(true);
    expect(full.some((l) => l.includes("⠋")), "the spinner is reached").toBe(true);

    // And the substitution is width-preserving, which is what `commandRows`
    // being the measurer's function requires (C22 I52).
    expect(ascii).toHaveLength(full.length);
    for (const [i, line] of ascii.entries()) {
      expect(displayCells(line), `ascii row ${String(i)}`).toBe(displayCells(full[i] ?? ""));
    }
  });

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
      measureSequence: MEASURE,
      session: () => SESSION,
      copyMode: () => false,
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
    expect(f.region.height, "the viewport keeps the rest").toBe(24 - 1 - 2 - 12 - 0); // no footer here: `[]` is zero rows (C22 I82)

    // **The cursor is named, and it was not** (I62, §6e.4). *The newest rows are
    // shown* was a consequence of the window being anchored on the buffer's end,
    // not of the cap — and this fixture left `promptCursor` at the default row 0,
    // so it asserted tail anchoring while reading as an assertion about the cap.
    // After a paste the cursor is at the end, which is what makes the newest rows
    // the right ones to show.
    const lines = paint(
      f,
      deps({ promptRows: () => rows, promptCursor: () => ({ row: 199, col: 0 }) }),
    );
    expect(lines).toHaveLength(24);
    expect(lines.some((l) => l.includes("⋯")), "windowed, with the elision marker").toBe(true);
    expect(
      lines.some((l) => l.includes("line 199")),
      "and the cursor's rows are shown, which after a paste are the newest",
    ).toBe(true);
  });

  it("T1.5b (S01 C14, C22 I62): a cap of one shows the cursor's row, not a marker with nothing after it", () => {
    // The window is the marker plus the rows that follow it, and at a cap of
    // one there are none: `rows.slice(len - 0)` is empty, so the prompt painted
    // as `⋯` alone with the typed command nowhere on the screen. An elision
    // that elides everything annotates nothing.
    //
    // **The ruling is *content beats a marker*, and which row was incidental to
    // it** (§6e.4). It read as *the last row* because the window was anchored
    // on the buffer's end; the row shown is the cursor's, and this fixture's
    // cursor is at row 0.
    //
    // Reachable below the size gate, which `frame.ts` already records as a real
    // window rather than a theoretical one — a resize can arrive between the
    // gate and the frame. That is also what keeps this branch alive under I62
    // (§6e table row 6).
    // **Constructed, since `compose` no longer reaches it** (C22 I81): the
    // chrome is four rows — header, two rules, a prompt — and a cap of one needs
    // three, so at three rows the sum is false and the fallback draws. The cap
    // path in `promptWindow` is still code, so the frame that exercises it is
    // built by hand with a region of zero rows, and it still sums.
    const f: Composed = { ...frameAt(40, 4, 3), promptRows: 1, promptWanted: 3, region: { top: 1, height: 0 }, overlayRegion: { width: 40, height: 0 } };
    expect(f.promptRows, "a cap of one").toBe(1);

    const lines = paint(f, deps({ promptRows: () => ["first", "second", "third"] }));
    const prompt = lines[2 + f.region.height]; // below the upper rule (C22 I81)

    expect(prompt?.startsWith("❯ first"), "the cursor's row, gutter and all").toBe(true);
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
    const prompt = lines.slice(2 + f.region.height, 2 + f.region.height + 3);

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

describe("C22 T4.7 (I50) — ghost text is composited, and is appearance not geometry", () => {
  /**
   * **The row C22 has claimed since it was written.** T4.7 sits in C22's test
   * list — *"ghost text is composited into the prompt without entering the
   * buffer"* — and did not exist. `test/contract/editor.test.ts` recorded the
   * other half as deferred *"when C22 lands"*; C22 landed, and a deferral
   * written as a comment cannot expire.
   *
   * `ghost()` had exactly one caller in the whole tree — the accept path in
   * `keys.ts`, which *inserts* it — so the suggestion was computed on every
   * keystroke and invisible until the key that consumed it.
   */
  const promptRow = (rows: readonly string[]): string => rows[rows.length - 2] ?? "";
  /** The row's printable text — the file measures cells and never strips, so this is local. */
  const plainOf = (row: string): string => row.replace(/\u001b\[[0-9;]*[a-zA-Z]/gu, "");

  it("it appears after the text", () => {
    const painted = paint(
      frameAt(80, 24),
      deps({ promptRows: () => ["/co"], ghost: () => "ntainer" }),
    );
    expect(plainOf(promptRow(painted))).toContain("/co");
    expect(plainOf(promptRow(painted))).toContain("/container");
  });

  it("it does not enter the buffer — the prompt rows are the editor's", () => {
    // The buffer is C17's and the ghost is not in it. Painting it *into* the
    // row the editor supplied is the mistake this rules out: the text would
    // then be indistinguishable from what the user typed, and the next
    // keystroke would land after a word nobody wrote.
    const supplied = ["/co"];
    paint(frameAt(80, 24), deps({ promptRows: () => supplied, ghost: () => "ntainer" }));
    expect(supplied, "the caller's array is untouched").toEqual(["/co"]);
  });

  it("it is styled apart from the text, or it reads as typed", () => {
    const plain = paint(frameAt(80, 24), deps({ promptRows: () => ["/co"] }));
    const ghosted = paint(
      frameAt(80, 24),
      deps({ promptRows: () => ["/co"], ghost: () => "ntainer" }),
    );
    // Not "contains an escape" — the row already has chrome. The claim is that
    // the suggestion arrives with styling the same row did not have without it.
    expect(promptRow(ghosted).length - plainOf(promptRow(ghosted)).length).toBeGreaterThan(
      promptRow(plain).length - plainOf(promptRow(plain)).length,
    );
  });

  it("**it never changes the frame's shape** — I50's half that is not decoration", () => {
    // A suggestion that lengthened a row would wrap it, and a wrapped prompt
    // moves the viewport underneath it on every keystroke.
    for (const columns of [40, 80, 120]) {
      const plain = paint(frameAt(columns, 24), deps({ promptRows: () => ["/co"] }));
      const ghosted = paint(
        frameAt(columns, 24),
        deps({ promptRows: () => ["/co"], ghost: () => "ntainer" }),
      );
      expect(ghosted).toHaveLength(plain.length);
      for (const row of ghosted) expect(displayCells(row)).toBe(columns);
    }
  });

  it("a suggestion that does not fit is dropped, not truncated", () => {
    // Half a suggestion is a different word, and `Tab` would insert the whole
    // one — so the two would disagree about what was on offer.
    const long = "x".repeat(200);
    const painted = paint(frameAt(40, 24), deps({ promptRows: () => ["/co"], ghost: () => long }));
    expect(plainOf(promptRow(painted))).not.toContain("xx");
    expect(displayCells(painted[painted.length - 2] ?? "")).toBe(40);
  });

  it("the spinner wins the row, because both are true at once", () => {
    // A `Tab` in flight over a prefix that also has a static suggestion. Showing
    // a stale suggestion beside *still thinking* states two things, one of which
    // is about to stop being true.
    const painted = paint(
      frameAt(80, 24),
      deps({ promptRows: () => ["/co"], ghost: () => "ntainer", spinning: () => true }),
    );
    expect(plainOf(promptRow(painted))).not.toContain("ntainer");
  });
});

describe("C22 — the selection wash (roadmap entry 23)", () => {
  /**
   * The cells whose appearance changed, as a frame-read asks it.
   *
   * Not *which characters were in the region* — every assertion about
   * `selectionSpans` already answers that, and answers it identically for the
   * defect this file is written against.
   */
  const washedCells = (row: string): string => {
    const m = new RegExp("\u001b\\[[0-9;]*m(.*?)\u001b\\[0m", "u").exec(row);
    return m?.[1] ?? "";
  };

  /** The painted index of prompt row `i`: header + viewport, then the prompt. */
  const promptAt = (f: Composed, i: number): number => f.region.height + 2 + i; // header, region, the upper rule

  it("T4.22 (C11 I17, I9): the wash is appearance — no row and no cell moves", () => {
    // **The invariant at every step, not a note about this one.** A row of
    // chrome — a marker line, a bracket, a status row — is forbidden by the
    // same rule that makes the wash free.
    const f = frameAt(20, 10, 2);
    const rows = () => ["one", "two"];
    const plain = paint(f, deps({ promptRows: rows }));
    const selected = paint(
      f,
      deps({ promptRows: rows, promptSelection: () => [{ row: 0, from: 2, to: 20 }] }),
    );

    expect(selected.length, "the same number of rows").toBe(plain.length);
    for (let i = 0; i < plain.length; i += 1) {
      expect(displayCells(selected[i] ?? ""), `row ${String(i)} is the same width`).toBe(
        displayCells(plain[i] ?? ""),
      );
    }
  });

  it("T4.23 (entry 23): a row the region passes THROUGH is washed to the full width", () => {
    // **The mutation this row was written for**, and a frame-read is the only
    // instrument that reaches it: a wash stopping at the last cluster reads as
    // *highlighted* rather than *selected*, and it passes every assertion about
    // which characters are in the region — because they are all still in it.
    const f = frameAt(20, 10, 2);
    const rows = paint(
      f,
      deps({
        promptRows: () => ["abc", "de"],
        // From row 0's first cell into the middle of row 1, so row 0 is passed
        // through and row 1 is where the head is.
        promptSelection: () => [
          { row: 0, from: 2, to: 20 },
          { row: 1, from: 2, to: 4 },
        ],
      }),
    );

    const through = washedCells(rows[promptAt(f, 0)] ?? "");
    expect(displayCells(through), "through the padding, not to the last cluster").toBe(18);
    expect(through.startsWith("abc"), "and it still covers the text").toBe(true);
  });

  it("T4.24 (entry 23): the LAST row of a region stops at the head", () => {
    // The control for the row above. Without it, "full width" is satisfied by
    // washing every row of the region to the edge — a different defect, and one
    // that looks correct on any single-row selection.
    const f = frameAt(20, 10, 2);
    const rows = paint(
      f,
      deps({
        promptRows: () => ["abc", "de"],
        promptSelection: () => [
          { row: 0, from: 2, to: 20 },
          { row: 1, from: 2, to: 4 },
        ],
      }),
    );

    expect(displayCells(washedCells(rows[promptAt(f, 1)] ?? "")), "two cells").toBe(2);
  });

  it("T4.26 (entry 23, S01 §3): the span is mapped through the prompt's window", () => {
    // **The row the mutation pass demanded.** An editor row and a painted row
    // are the same number until the prompt exceeds its cap and windows around
    // its end — and every other row here has an unwindowed prompt, so dropping
    // the mapping failed nothing. Four editor rows into a cap of two puts the
    // elision marker up and shifts everything by one.
    // Four wanted rows in a five-row terminal: the cap is `floor(rows / 2)`,
    // which is two, so the prompt windows and the marker takes one of them.
    const f = frameAt(20, 5, 4);
    const rows = paint(
      f,
      deps({
        promptRows: () => ["aa", "bb", "cc", "dd"],
        // The last editor row, which is the only content row the window shows.
        promptSelection: () => [{ row: 3, from: 2, to: 4 }],
        // **The cursor this row was implicitly relying on** (I62, §6e.4). The
        // window follows the cursor, so a fixture that leaves it at row 0 puts
        // the window at the head and drops this span entirely — the mapping
        // this row is about would then be tested by nothing.
        promptCursor: () => ({ row: 3, col: 4 }),
      }),
    );

    expect(washedCells(rows[promptAt(f, 0)] ?? ""), "the marker row is untouched").toBe("");
    expect(washedCells(rows[promptAt(f, 1)] ?? ""), "the wash lands on the shown row").toBe(
      "dd",
    );
  });

  it("T4.25 (entry 23, C10 §4b): at 1-bit the wash is reverse video, not nothing", () => {
    // **The rung that stops the ladder falling from a background straight to a
    // glyph.** `resolveBackground` answers nothing where there is no colour, so
    // a wash alone would vanish; `inverse` needs no colour at all.
    const f = frameAt(20, 10, 1);
    const rows = paint(
      f,
      deps({
        capabilities: { ...FULL_CAPS, colourDepth: 1 },
        promptRows: () => ["abc"],
        promptSelection: () => [{ row: 0, from: 2, to: 5 }],
      }),
    );

    const row = rows[promptAt(f, 0)] ?? "";
    expect(row, "SGR 7 — reverse video").toContain("[7m");
    expect(washedCells(row)).toBe("abc");
  });
});

describe("C22 §6g — the theme's background is a base, not a span (C22 I65)", () => {
  // **The painting arm has never run**, which is the risk this block exists for:
  // `dark` inherits and the shipped default paints nothing, so every frame ever
  // drawn in this suite has been drawn on the arm that emits no base. `light`
  // declares `surface` (C10 I25) and is the only fixture that exercises it.
  const BASE = sgr(resolveBase(LIGHT_THEME, FULL_CAPS));
  /** Ink's close for a background run — the terminal's default, never ours. */
  const DEFAULT_BG = "\x1b[49m";

  /**
   * A frame whose transcript row **closes a background run**, which is the
   * sequence a base has to survive.
   *
   * **The fixture is checked against the thing under test before it is asserted
   * against**, and this one moved the ruling when it was: a notice row was the
   * first draft, and it carries no reset at all — L1 closes a foreground run
   * with `39`, which a base survives untouched. A patch row ends with `49`,
   * *default background*, and that is the terminal's rather than ours.
   */
  function styledFrame(): readonly string[] {
    const kit = measurable({ theme: LIGHT_THEME, definitions: [patchDefinition] });
    const rows = kit.renderToLines(
      block({
        kind: "patch",
        id: "p1",
        path: "a.ts",
        language: "text",
        hunks: [
          { header: "@@ -1 +1 @@", lines: [{ kind: "add", text: "added" }, { kind: "remove", text: "gone" }] },
        ],
      }),
      40,
    );
    expect(
      rows.some((r) => r.includes(DEFAULT_BG)),
      "the fixture must carry a return-to-terminal-default to repair",
    ).toBe(true);

    // Eight rows: one header, one footer, one prompt, and a region that holds
    // the patch's five without the viewport check refusing it.
    return paint(frameAt(40, 8), deps({ theme: LIGHT_THEME, transcriptRows: () => rows }));
  }

  it("T1.23 (C22 I65): every reset in a painted row returns to the base, not to the terminal's", () => {
    // **The repair is one pass over a finished row**, so the assertion is on the
    // rows rather than on the sites: by the time a row is here, `fitStyled`'s
    // cut-close, `composite`'s two and the shell's own `paint()` are all inside
    // this string, and `render-frame`'s prefix is answered by the row's leading
    // base. A frame read, because every one of these is invisible to a
    // structural assertion — the cells that lose the base are the ones with the
    // least on them.
    expect(BASE, "the fixture must actually paint, or this whole block is vacuous").not.toBe("");

    for (const [i, row] of styledFrame().entries()) {
      expect(row.startsWith(BASE), `row ${String(i)} opens with the base`).toBe(true);

      // **Every return to the terminal's default is followed by the base**, and
      // the set is two sequences rather than one: `\x1b[0m` and `\x1b[49m`. A
      // foreground close (`39`) is not in it, because a base survives one.
      //
      // **The row's own closing reset is removed first, and the mutation pass
      // is why.** The first version split the whole row and skipped the last
      // part, which asserts nothing at all when a row contains exactly one
      // occurrence — and a patch row's `49` is at its end, so the two mutations
      // this exists for both survived against sixteen passing assertions.
      expect(row.endsWith(SGR_RESET), `row ${String(i)} closes itself`).toBe(true);
      const body = row.slice(0, -SGR_RESET.length);

      for (const seq of [SGR_RESET, DEFAULT_BG]) {
        for (const [j, part] of body.split(seq).slice(1).entries()) {
          expect(
            part.startsWith(BASE),
            `row ${String(i)} resumes after ${JSON.stringify(seq)} ${String(j)}`,
          ).toBe(true);
        }
      }
    }
  });

  it("T1.23a (C22 I65): a theme that inherits writes not one byte more", () => {
    // The arm every existing golden frame is drawn against, asserted rather
    // than assumed — a base applied unconditionally would change every frame in
    // the suite and the diff would be too large to read.
    const inheriting = paint(frameAt(40, 6), deps({ theme: DARK_THEME }));
    expect(sgr(resolveBase(DARK_THEME, FULL_CAPS)), "dark inherits").toBe("");
    for (const row of inheriting) expect(row.includes(BASE)).toBe(false);
  });

  it("T1.23b (C22 I65): no painted row ends with a live attribute", () => {
    // **This is what makes every lifecycle path need nothing.** The alternate
    // screen restores cell contents and not SGR state, so a row ending with the
    // base live would leave the user's shell painted after exit — and the walk
    // ruled a reset at `suspend()` and `release()` for exactly that. Closing the
    // row makes the state unreachable instead, and covers exit, fault, signal
    // and handoff at once rather than the paths someone remembered.
    for (const [i, row] of styledFrame().entries()) {
      expect(row.endsWith(SGR_RESET), `row ${String(i)}`).toBe(true);
    }
  });

  it("T1.23c (C22 I65, C10 I25): `--no-bg` paints nothing, and the theme still says it would", () => {
    const suppressed = paint(
      frameAt(40, 6),
      deps({ theme: LIGHT_THEME, suppressBackground: () => true }),
    );
    for (const row of suppressed) expect(row.includes(BASE)).toBe(false);
    expect(LIGHT_THEME.tokens.background, "the declaration is untouched").toBe("surface");
  });

  it("T1.23d (C22 I65, C10 I26): at 1-bit a painting theme paints nothing", () => {
    // The rung where the question does not arise: no background is painted and
    // no foreground is coloured, so the frame is the terminal's own pair.
    const mono = { ...FULL_CAPS, colourDepth: 1 as const };
    expect(sgr(resolveBase(LIGHT_THEME, mono)), "surfaces vanish at 1-bit").toBe("");

    const rows = paint(frameAt(40, 6), deps({ theme: LIGHT_THEME, capabilities: mono }));
    for (const row of rows) expect(row.includes("\x1b[")).toBe(false);
  });
});
