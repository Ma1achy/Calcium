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
import { cursorFor, FrameError, paint, type PaintDeps } from "../../src/shell/paint.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { createOverlayManager, type Placed } from "../../src/viewport/overlay/index.js";
import { displayCells } from "../../src/presentation/text.js";
import { anchored, registry as measurer, rows as contentRows } from "../support/overlay.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
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
    now: () => 1_700_000_000_000,
    size: () => ({ columns, rows }),
    promptRows: () => 1,
  });
}

function deps(overlays: () => readonly Placed[], base = "·"): PaintDeps {
  return {
    registry: createBlockRegistry({ defaults: true }),
    theme: DARK_THEME,
    capabilities: FULL_CAPS,
    // A fill character rather than blanks: a layer that failed to write a cell
    // of its own box shows the base through it, and a blank base would look
    // exactly like a correctly written one.
    transcriptRows: () => Array.from({ length: 40 }, () => base.repeat(200)),
    promptRows: () => [base.repeat(30)],
    overlays,
    promptCursor: () => ({ row: 0, col: 2 }),
    promptFocused: () => true,
  };
}

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

    overlays.push(layerWith("menu"));
    expect(
      cursorFor(f, deps(() => overlays.layout(f.overlayRegion))),
      "a menu has no cursor: nothing is entered into it",
    ).toBeNull();

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

  it("T1.12e (§6a trace row 8): a cursor above the windowed prompt is hidden, not clamped", () => {
    // `cursorCell.row` indexes the editor's full layout and the prompt paints
    // `promptRows` of it, so the untranslated row puts the terminal cursor in
    // the transcript. Clamping to the window's edge would claim the cursor is
    // on a row it is not on.
    const f = frameAt(40, 12);
    expect(f.promptRows, "a one-row prompt, so the window is one row").toBe(1);

    const windowed = (row: number): PaintDeps => ({
      ...deps(() => []),
      // Four display rows, of which the frame shows the last.
      promptRows: () => ["r0", "r1", "r2", "r3"],
      promptCursor: () => ({ row, col: 4 }),
    });

    expect(cursorFor(f, windowed(3)), "the row on screen").toEqual({
      row: f.region.top + f.region.height,
      col: 4,
    });
    expect(cursorFor(f, windowed(0)), "a row the window elided").toBeNull();
    expect(cursorFor(f, windowed(2)), "and the one just above it").toBeNull();
  });
});
