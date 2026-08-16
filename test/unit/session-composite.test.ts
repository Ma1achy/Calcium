// C22 §6a — the drawer, and the frame's first look at C15's output.
//
// C15 has placed layers correctly since it landed and nothing composited one:
// `layout()` was called twice in the whole tree, for mouse hit-testing and for
// the completion menu's own remainder count, and neither drew a `Placed`. The
// frame's arithmetic could not see it, because a layer floats above the four
// regions rather than taking rows from them — `heightsSum` holds identically
// with three overlays open and with none (S01 §3a).
//
// **Every layer here comes from the real manager and the real placer.** A
// hand-built `Placed` would let the drawer agree with a box C15 would never
// produce, which is the half of the split this file exists to hold.
import { describe, expect, it } from "vitest";

import { compose, type Composed } from "../../src/shell/frame.js";
import { composeFrame, type FrameResult } from "../../src/shell/render-frame.js";
import { cursorFor, FrameError, paint, type PaintDeps } from "../../src/shell/paint.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { createOverlayManager, type Placed } from "../../src/viewport/overlay/index.js";
import { displayCells } from "../../src/presentation/text.js";
import { anchored, registry as measurer, rows as contentRows } from "../support/overlay.js";
import { DARK_THEME, FULL_CAPS, visible } from "../support/render.js";
import type { SessionSnapshot } from "../../src/shell/types.js";

const SESSION: SessionSnapshot = Object.freeze({
  cwd: "/work",
  env: Object.freeze({}),
  lastUuid: null,
  identity: null,
  cluster: "fmx-prod",
  health: "live" as const,
  version: "1.0.0",
  retained: null,
  stopping: false,
});

/** A frame with a recognisable base underneath, so a bleed is visible. */
function frameAt(columns = 40, rows = 12): Composed {
  return compose({
    chrome: { header: () => [], footer: () => [] },
    session: () => SESSION,
    copyMode: () => false,
    now: () => 1_700_000_000_000,
    size: () => ({ columns, rows }),
    promptRows: () => 1,
  });
}

/**
 * A frame whose prompt *wants* more rows than it gets, so the window is real.
 *
 * `frameAt` fixes the want at one, which caps at one and takes the branch that
 * draws no marker — the branch T1.12e was written in, and the reason it could
 * stay green through two defects in the marked one (C22 §6e.4).
 */
function frameWanting(columns: number, rows: number, wanted: number): Composed {
  return compose({
    chrome: { header: () => [], footer: () => [] },
    session: () => SESSION,
    copyMode: () => false,
    now: () => 1_700_000_000_000,
    size: () => ({ columns, rows }),
    promptRows: () => wanted,
  });
}

/**
 * `rows` is the **region's** height, and it is a parameter rather than a
 * generous constant (C22 I35). It was 40 for a 9-row region and the paint
 * trimmed the surplus, so five rows here asserted against a silently truncated
 * transcript — the same reconciliation that hid a viewport three rows too tall.
 * Now the double answers what C14 would answer, and the paint refuses anything
 * else.
 */
function deps(
  overlays: () => readonly Placed[],
  base = "·",
  rows = frameAt().region.height,
): PaintDeps {
  return {
    registry: createBlockRegistry({ defaults: true }),
    theme: DARK_THEME,
    capabilities: FULL_CAPS,
    // A fill character rather than blanks: a layer that failed to write a cell
    // of its own box shows the base through it, and a blank base would look
    // exactly like a correctly written one.
    transcriptRows: () => Array.from({ length: rows }, () => base.repeat(200)),
    promptRows: () => [base.repeat(30)],
    overlays,
    promptCursor: () => ({ row: 0, col: 2 }),
    promptSelection: () => [],
    promptFocused: () => true,
    suppressBackground: () => false,
  spinning: () => false,
  // C22 I50 — the ghost is a paint-time read like the spinner beside it.
  ghost: () => null,
  };
}

describe("C22 §6f — the frame carries the cursor's shape (I63)", () => {
  it("T1.22d (C22 I63, §6f table rows 4 and 5): the shape is in the write, from the target, once", () => {
    // **The wiring, and it is a separate row because a seam-level test passes
    // on the day nothing calls the seam.** Every other row about the shape
    // calls `cursorShapeSequence` directly; the two mutations this one exists
    // for are at the call site — dropping it from the frame's `write`, and
    // resolving it from the prompt rather than from `router.target`.
    const f = frameAt();
    const emitted: string[] = [];
    let target = "prompt";

    const compose = (): FrameResult =>
      composeFrame({
        composed: () => f,
        paintDeps: () => deps(() => []),
        resizeViewport: () => undefined,
        cursorSequence: () => "",
        cursorShape: () => {
          // A stand-in for C01's record: bytes on a change, nothing otherwise.
          const style = target === "prompt" ? "[6 q" : "[2 q";
          if (emitted[emitted.length - 1] === style) return "";
          emitted.push(style);
          return style;
        },
        previous: () => null,
      });

    const first = compose();
    if (first.kind !== "frame") throw new Error("unreachable");
    expect(first.write, "the shape is in the frame's one write").toContain("[6 q");

    // **Once over three frames at the same target**, which is the property no
    // reading of a single frame can see: every frame is correct and the stream
    // is not.
    const second = compose();
    const third = compose();
    if (second.kind !== "frame" || third.kind !== "frame") throw new Error("unreachable");
    expect(second.write, "and not again").not.toContain(" q");
    expect(third.write).not.toContain(" q");
    expect(emitted, "one emission across three frames").toEqual(["[6 q"]);

    // And it follows the **target**, not the prompt: a resolution wired to
    // `promptFocused` answers the position's question, not this one.
    target = "overlay";
    const fourth = compose();
    if (fourth.kind !== "frame") throw new Error("unreachable");
    expect(fourth.write, "a different target, a different shape").toContain("[2 q");
  });
});

describe("C22 §6a — compositing", () => {
  it("T1.12 (C22 I28): the layer region is the viewport region, and the drawer adds its top", () => {
    const f = frameAt();

    // The two are one number. Widening this to the terminal costs nothing any
    // check can see — the sum holds at every width with every layer misplaced.
    expect(f.overlayRegion.height, "the same height as the transcript").toBe(f.region.height);
    expect(f.overlayRegion.width).toBe(f.size.columns);

    // And a layer at the region's first row draws on the frame's second, so the
    // header survives. This is the conversion where a region row and a terminal
    // row differ by exactly the header's height.
    const overlays = createOverlayManager({ registry: measurer });
    // Anchored to the region's second row and preferring above, so it lands on
    // the region's first — `below` of row 0 is row 1, which would test the
    // offset against a number that is right either way.
    overlays.push(anchored("top", 1, { row: 1, prefer: "above" }));
    const placed = overlays.layout(f.overlayRegion);
    expect(placed[0]?.top, "placed at the region's first row").toBe(0);

    const lines = paint(f, deps(() => placed));
    expect(lines[0], "the header is untouched").not.toContain("top row 0");
    expect(lines[1], "and the layer is on the frame's second row").toContain("top row 0");
  });

  it("T1.12b (C22 I29): the lower of two overlapping layers keeps the cells the upper does not cover", () => {
    // **The walk's row 3, and the one that would have shipped.** The natural
    // loop is `row = splice(baseRow, layer)` per layer, which is right for one
    // layer and discards the previous one for two — a menu under a search
    // vanishes entirely with the search drawn perfectly, and no invariant of
    // C15's is violated by it.
    const f = frameAt();
    const overlays = createOverlayManager({ registry: measurer });

    overlays.push({
      id: "under",
      kind: "overlay",
      placement: { kind: "anchored", row: 6, prefer: "above" },
      content: contentRows(3, "under"),
      dismissable: true,
      width: 30,
    });
    overlays.push({
      id: "over",
      kind: "overlay",
      placement: { kind: "anchored", row: 6, prefer: "above" },
      content: contentRows(1, "over"),
      dismissable: true,
      width: 10,
    });

    const placed = overlays.layout(f.overlayRegion);
    expect(placed.map((p) => p.layer.id), "bottom-first, so the top lands last").toEqual([
      "under",
      "over",
    ]);

    const lines = paint(f, deps(() => placed));
    const drawn = lines.join("\n");

    expect(drawn, "the upper layer is drawn").toContain("over row 0");
    // The rows of `under` the narrower `over` cannot reach.
    expect(drawn, "and the layer beneath it survives").toContain("under row 0");
    expect(drawn, "every row of it").toContain("under row 1");

    // **The overlapped row is the assertion that matters**, and it is a
    // remainder rather than a presence: `over row 0` takes the first ten cells
    // of `under row 2` and the `2` survives at cell ten. A drawer compositing
    // onto the base rows instead of the accumulated ones loses that cell along
    // with the two rows above, and draws the upper layer perfectly.
    const overlapped = lines[f.region.top + (placed[1]?.top ?? 0)] ?? "";
    expect(overlapped.replaceAll(/\[[0-9;]*m/g, "").slice(0, 11)).toBe("over row 02");
  });

  it("T1.12c (C22 I29): a layer writes every cell of its box, background included", () => {
    // Asserted against a layer narrower and shorter than its box, because a
    // full-bleed one passes whatever the loop does. The failure is the prompt
    // showing through the gaps in a menu, which reads as a C09 defect.
    const f = frameAt();
    const overlays = createOverlayManager({ registry: measurer });
    overlays.push({
      id: "narrow",
      kind: "overlay",
      placement: { kind: "anchored", row: 6, prefer: "above" },
      // One short row in a box the width of the layer: the cells to the right
      // of the text are inside the box and produced by nothing.
      content: contentRows(1, "n"),
      dismissable: true,
      width: 20,
    });

    const placed = overlays.layout(f.overlayRegion)[0];
    expect(placed, "the fixture places").toBeDefined();
    if (placed === undefined) return;
    expect(placed.width, "a box wider than the text it holds").toBe(20);

    const lines = paint(f, deps(() => [placed]));
    const row = lines[f.region.top + placed.top] ?? "";
    const cells = [...row.replaceAll(/\[[0-9;]*m/g, "")];

    // Cells 0 to 19 belong to the layer; the base's fill character must appear
    // in none of them, and must still be there at cell 20.
    expect(cells.slice(0, 20).join(""), "no base showing through the box").not.toContain("·");
    expect(cells[20], "and the base owns the cell past the box").toBe("·");
    expect(displayCells(row), "the row is still the frame's width").toBe(f.size.columns);
  });

  it("T1.12d (C22 I30): a box escaping the region refuses the frame", () => {
    // Constructed by hand, because C15's clamp makes it unreachable through
    // `layout()` — which is the reason to assert it rather than the reason not
    // to. A clip would repair the symptom and leave a placement defect drawing
    // something plausible for as long as nobody looked.
    const f = frameAt();
    const overlays = createOverlayManager({ registry: measurer });
    overlays.push(anchored("real", 1, { row: 3, prefer: "below" }));
    const real = overlays.layout(f.overlayRegion)[0];
    expect(real, "the control: an honest box paints").toBeDefined();
    if (real === undefined) return;
    expect(() => paint(f, deps(() => [real]))).not.toThrow();

    const escaping: Placed = { ...real, top: f.region.height - 1, height: 3 };
    expect(() => paint(f, deps(() => [escaping]))).toThrow(FrameError);
  });

  it("T1.12f (C22 I35): a selection longer than the region refuses the frame", () => {
    // **The state the shipped code was in for the whole life of the component.**
    // The viewport was sized to the terminal and the region is three rows
    // shorter, so `visible()` chose three rows more than there was room for —
    // and `transcript()` kept `rows[0 … height)`, the *top* of the selection.
    // The bottom three rows of the document were dropped before they reached the
    // screen, `End`, `PageDown` and `↓` all stopped at the same row, and nothing
    // in six tiers disagreed: `heightsSum` compares the frame with itself and
    // C14 I10 compares the viewport with itself. The trim was the only place the
    // two quantities met, and it reconciled them silently.
    //
    // By hand, for T1.12d's reason: with C22 I34 held a real viewport cannot produce
    // this, which is why the refusal is asserted rather than assumed.
    const f = frameAt();

    // The control first — the honest count paints, so the throw below is about
    // the surplus and not about the double.
    expect(() => paint(f, deps(() => []))).not.toThrow();

    const over = { ...deps(() => []), transcriptRows: () => Array.from({ length: f.region.height + 1 }, () => "x") };
    expect(() => paint(f, over)).toThrow(FrameError);
  });

  it("T1.12 (S01 §3a): layers take no rows — the frame is the same shape with and without them", () => {
    // The property that made this whole absence invisible. Asserted so that it
    // stays the reason the sum cannot see a layer, rather than becoming the
    // reason nobody checks.
    const f = frameAt();
    const overlays = createOverlayManager({ registry: measurer });
    overlays.push(anchored("a", 3, { row: 6, prefer: "above" }));

    const bare = paint(f, deps(() => []));
    const withLayers = paint(f, deps(() => overlays.layout(f.overlayRegion)));

    expect(withLayers).toHaveLength(bare.length);
    for (const [i, line] of withLayers.entries()) {
      expect(displayCells(line), `row ${String(i)}`).toBe(f.size.columns);
    }
    expect(withLayers.join("\n"), "and something actually changed").not.toBe(bare.join("\n"));
  });
});

describe("C22 §6a — the cursor (C15 I19)", () => {
  /** A layer with a stated cursor, and one without. The two live cases. */
  function layerWith(id: string, cursor?: Readonly<{ row: number; col: number }>) {
    return {
      id,
      kind: "overlay" as const,
      placement: { kind: "anchored" as const, row: 6, prefer: "above" as const },
      content: contentRows(1, id),
      dismissable: true,
      width: 20,
      ...(cursor !== undefined && { cursor }),
    };
  }

  it("T1.20 (C15 I19): the focused layer's cursor, and hidden when it has none", () => {
    // Both arms, because either alone is satisfied by a constant. The two live
    // producers answer oppositely and that is what makes this a field.
    const f = frameAt();
    const overlays = createOverlayManager({ registry: measurer });

    // **Both arms of row 2/2a, and `promptFocused` is what separates them**
    // (C22 §6a, I51). A layer with no cursor of its own does not decide alone:
    // it hides the cursor when nothing beneath is taking keys — a confirm, or a
    // menu the user asked for and is choosing in — and yields to the prompt
    // when the prompt is still answering, which is the menu that opened by
    // itself (C19 I20). The predicate is the router's precedence rather than a
    // second opinion about it, so the two cannot disagree.
    overlays.push(layerWith("menu"));
    const inert = deps(() => overlays.layout(f.overlayRegion));
    expect(
      cursorFor(f, { ...inert, promptFocused: () => false }),
      "a requested menu has no cursor: the choice is being made in it",
    ).toBeNull();
    expect(
      cursorFor(f, inert),
      "a menu that opened by itself: the prompt still holds the keys and the row",
    ).toEqual({ row: f.region.top + f.region.height, col: 2 });

    overlays.dismiss("menu");
    overlays.push(layerWith("search", { row: 0, col: 5 }));
    const placed = overlays.layout(f.overlayRegion)[0];
    expect(placed?.cursor, "stated on the layer, copied through by placement").toEqual({
      row: 0,
      col: 5,
    });

    const at = cursorFor(f, deps(() => overlays.layout(f.overlayRegion)));
    expect(at, "and offset into frame coordinates").toEqual({
      row: f.region.top + (placed?.top ?? 0),
      col: (placed?.left ?? 0) + 5,
    });
  });

  it("T1.20 (C15 I19): the prompt's cursor when nothing is stacked, and hidden when focus is elsewhere", () => {
    const f = frameAt();
    const promptRow = f.region.top + f.region.height;

    expect(cursorFor(f, deps(() => []))).toEqual({ row: promptRow, col: 2 });
    expect(
      cursorFor(f, { ...deps(() => []), promptFocused: () => false }),
      "focus in the live block: the prompt is not taking keys",
    ).toBeNull();
  });

  it("T1.12e (C22 I62, §6e.4): the window contains the cursor, so windowing never hides it", () => {
    // **Restated rather than kept green** (§6e.4). This row said *a cursor above
    // the windowed prompt is hidden, not clamped*, which is about the window's
    // arithmetic and reads as the cursor's hiding *policy* — and its fixture
    // made `cap` one, so it exercised only the branch where no marker is drawn.
    // The branch a real frame reaches is the marked one, and that is where both
    // shipped defects lived. It stayed green through all of it.
    //
    // Under I62 the subject is gone: a window anchored on the cursor contains
    // it, so there is no row for the prompt's cursor to be hidden *by the
    // window* on. What survives is that the row is translated — the untranslated
    // one would put the terminal cursor in the transcript.
    const f = frameAt(40, 12);
    expect(f.promptRows, "a one-row prompt, so the window is one row").toBe(1);

    const windowed = (row: number): PaintDeps => ({
      ...deps(() => []),
      // Four display rows and room for one, so every row is a windowed one.
      promptRows: () => ["r0", "r1", "r2", "r3"],
      promptCursor: () => ({ row, col: 4 }),
    });

    for (const row of [0, 1, 2, 3]) {
      expect(cursorFor(f, windowed(row)), `row ${String(row)} is on screen`).toEqual({
        row: f.region.top + f.region.height,
        col: 4,
      });
    }

    // The guard that remains, and it is a different claim: `promptCursor` and
    // `promptRows` are read separately, so a cursor past the buffer's last row
    // is refused rather than drawn somewhere plausible.
    expect(cursorFor(f, windowed(9)), "a cursor the buffer has no row for").toBeNull();
  });

  it("T1.21 (C22 I62, §6e table row 1): the cursor is never drawn on the elision marker", () => {
    // **The state the shipped defect needed, and no fixture built it.**
    // `within = row − first + offset` is 0 for the row immediately above a
    // marked window, 0 passes `0 ≤ within < cap`, and painted row 0 is the
    // marker. Measured before the fix at `cap` 4 with six editor rows: the
    // cursor on editor row 2 landed on the `❯ ⋯` row.
    //
    // Asserted against the **painted marker row** rather than against a number,
    // because every number agreed with every other while it was wrong.
    const f = frameWanting(40, 9, 6);
    expect(f.promptRows, "half of nine, floored").toBe(4);

    const rows = ["r0", "r1", "r2", "r3", "r4", "r5"];
    const at = (row: number): PaintDeps => ({
      ...deps(() => [], "·", f.region.height),
      promptRows: () => rows,
      promptCursor: () => ({ row, col: 3 }),
    });

    for (const row of [0, 2, 3, 5]) {
      const cursor = cursorFor(f, at(row));
      if (cursor === null) throw new Error(`row ${String(row)} was hidden`);
      const painted = paint(f, at(row))[cursor.row];
      expect(painted, `row ${String(row)} is not the marker`).not.toContain("⋯");
    }
  });

  it("T1.21b (C22 I62, §6e table row 2): a span outside the window does not wash the marker", () => {
    // **The same fault reaching its second consumer**, which is why one fix
    // serves both: neither the cursor nor the wash was wrong about its own
    // rule, and both tested membership in painted coordinates.
    //
    // T4.26's *"the marker row is untouched"* cannot construct this — its span
    // is inside the window, where the marker cannot be washed either way.
    const f = frameWanting(40, 9, 6);
    const painted = paint(f, {
      ...deps(() => [], "·", f.region.height),
      promptRows: () => ["r0", "r1", "r2", "r3", "r4", "r5"],
      promptCursor: () => ({ row: 5, col: 2 }),
      // Editor row 2 is one above the window, which shows rows 3, 4 and 5.
      promptSelection: () => [{ row: 2, from: 0, to: 10 }],
    });

    const marker = painted.find((l) => l.includes("⋯"));
    expect(marker, "the marker is drawn").toBeDefined();
    expect(marker, "and carries no wash").toBe(visible(marker ?? ""));
  });

  it("T1.21c (C22 I62, §6e.5): a mid-buffer cursor is marked at both ends", () => {
    // **The bottom marker is what makes the clipped wash honest** (§6e table 4).
    // Spans are per row, so dropping the rows outside the window clips a wash
    // exactly — and without a marker below, a wash that continues past the
    // lower edge reads as one that ended there.
    // **Nine rows and not six**, because with six there is no middle: `cap` is
    // four, the head branch takes rows 0–2 and the tail branch rows 3–5, and
    // the two meet with no gap. A both-ends window needs `n > 2·cap − 2`, which
    // is the arithmetic the walk's ruling implies and did not state.
    const f = frameWanting(40, 9, 9);
    expect(f.promptRows).toBe(4);

    const painted = paint(f, {
      ...deps(() => [], "·", f.region.height),
      promptRows: () => ["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"],
      promptCursor: () => ({ row: 4, col: 2 }),
    }).slice(1 + f.region.height, 1 + f.region.height + f.promptRows);

    expect(painted.filter((l) => l.includes("⋯")), "a marker at each end").toHaveLength(2);
    expect(painted[0]?.includes("⋯"), "above").toBe(true);
    expect(painted[painted.length - 1]?.includes("⋯"), "and below").toBe(true);
    expect(painted[1], "with the cursor's own row between them").toContain("r4");

    // **A marker wherever rows are elided, and nowhere else** — the claim the
    // middle case alone does not carry. At the head only the lower end elides,
    // and dropping *that* marker leaves the middle case untouched: the first
    // draft of this row asserted the middle only, and the mutation that removes
    // the head's bottom marker was caught by something else entirely.
    const head = paint(f, {
      ...deps(() => [], "·", f.region.height),
      promptRows: () => ["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"],
      promptCursor: () => ({ row: 0, col: 2 }),
    }).slice(1 + f.region.height, 1 + f.region.height + f.promptRows);

    expect(head[0], "at the head the first row is the command").toContain("r0");
    expect(head.filter((l) => l.includes("⋯")), "and one marker, below").toHaveLength(1);
    expect(head[head.length - 1]?.includes("⋯"), "on the last painted row").toBe(true);
  });

  it("T1.21e (C22 I62, §6e table row 5): the spinner goes on the cursor's row, not the last", () => {
    // **The comment's stated reason, made true.** The spinner and the ghost went
    // into `out[out.length - 1]` *"because that is where the cursor is"* — which
    // held only while the window was anchored on the buffer's end. With a marker
    // below, the last painted row **is the marker**, and a spinner would be
    // drawn on it.
    //
    // Mid-buffer, so the two rows differ: nine rows into a cap of four puts a
    // marker at each end and the cursor on painted row 1.
    const f = frameWanting(40, 9, 9);
    const painted = paint(f, {
      ...deps(() => [], "·", f.region.height),
      promptRows: () => ["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"],
      promptCursor: () => ({ row: 4, col: 2 }),
      spinning: () => true,
    }).slice(1 + f.region.height, 1 + f.region.height + f.promptRows);

    const spinner = painted.filter((l) => /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u.test(l));
    expect(spinner, "one row carries it").toHaveLength(1);
    expect(spinner[0], "and it is the cursor's row").toContain("r4");
    expect(painted[painted.length - 1], "never the bottom marker").toContain("⋯");
    expect(
      /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u.test(painted[painted.length - 1] ?? ""),
      "which carries none",
    ).toBe(false);
  });

  it("T1.21d (C22 I62, §6e.5): the cursor at the end gives the window it always gave", () => {
    // **The row that says the common frame did not change**, and the reason
    // T6.49's revert is invisible without it: with the cursor in the last
    // window's worth, cursor-following and tail-anchoring are the same window.
    // It is also the argument for centring over `menuWindow`'s keep-it-last
    // rule — a prompt wants to see what follows the edit.
    const f = frameWanting(40, 9, 6);
    const painted = paint(f, {
      ...deps(() => [], "·", f.region.height),
      promptRows: () => ["r0", "r1", "r2", "r3", "r4", "r5"],
      promptCursor: () => ({ row: 5, col: 2 }),
    }).slice(1 + f.region.height, 1 + f.region.height + f.promptRows);

    expect(painted[0], "the marker above").toContain("⋯");
    expect(painted.filter((l) => l.includes("⋯")), "and only above").toHaveLength(1);
    expect(painted[1]).toContain("r3");
    expect(painted[3], "the newest row is still the last").toContain("r5");
  });
});
