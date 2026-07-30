// C15 tier 4 — integration. Against C09, C10, C02 and C14, with real measurers.
//
// The seam under test throughout is that a layer measures like anything else in
// the transcript. That is what makes an overlay themed, degradable and
// positionable at all, and it is the payoff of `content` being blocks rather
// than React (I4).
import { describe, expect, it } from "vitest";

import { createOverlayManager } from "../../src/viewport/overlay/index.js";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { createViewport } from "../../src/viewport/viewport/index.js";
import { measurable, FULL_CAPS, ASCII_CAPS } from "../support/render.js";
import { measureSequence, rowsDoc } from "../support/viewport.js";
import { REGION, anchored, centred, placeIn, registry, rows, view } from "../support/overlay.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

const measurerFor = (caps: TerminalCapabilities) => {
  const kit = measurable({ capabilities: caps });
  return {
    measureSequence: (blocks: readonly Block[], width: number): number =>
      kit.registry.measureSequence(blocks, width),
  };
};

describe("C15 integration — measurement", () => {
  it("T4.1 (with C09): a layer measures through the same registry as the transcript", () => {
    const content = rows(6, "menu");
    const layer = { ...centred("menu", 0), content, maxHeightFraction: 1 };

    const [p] = placeIn([layer]);
    expect(p?.height).toBe(registry.measureSequence(content, REGION.width));
  });

  it("T4.2 (with C09, C10): geometry is identical in both themes and at 1-bit", () => {
    // C10 T4.1's guarantee reaching a layer: a palette changes appearance and
    // never a row count, which is why theme is absent from every cache key and
    // from this component entirely.
    const content = rows(6, "menu");
    const heights = new Set(
      [FULL_CAPS, { ...FULL_CAPS, colour: "mono" as const }].map((caps) =>
        measurerFor(caps).measureSequence(content, REGION.width),
      ),
    );
    expect(heights.size).toBe(1);
  });

  it("T4.3 (with C02, C09): under ASCII the height is unchanged", () => {
    // C09 §4's 1:1 cell-count substitution, which is what lets a confirm render
    // at 1-bit ASCII without moving.
    const content = rows(6, "menu");
    expect(measurerFor(ASCII_CAPS).measureSequence(content, REGION.width)).toBe(
      measurerFor(FULL_CAPS).measureSequence(content, REGION.width),
    );
  });
});

describe("C15 integration — against the viewport", () => {
  it("T4.4 (with C14): a view occupies exactly the region the viewport reports", () => {
    const store = createTranscriptStore();
    for (let i = 0; i < 5; i += 1) store.append(rowsDoc(4, `e${i}`));
    const viewport = createViewport(store, { width: 60, height: 14, measureSequence });

    const region = { width: 60, height: viewport.scroll.viewportHeight };
    const [p] = placeIn([view("dash")], region);

    expect(p).toMatchObject({ top: 0, left: 0, height: region.height, width: region.width });
    viewport.dispose();
  });

  it("T4.5 (with C14, I14): an anchored layer follows a scrolling row through update", () => {
    // C15 is *driven* here, not subscribed. The owner translates a transcript
    // row into a region row and calls `update`; C15 learns nothing about C13.
    const store = createTranscriptStore();
    for (let i = 0; i < 20; i += 1) store.append(rowsDoc(3, `e${i}`));
    const viewport = createViewport(store, { width: 60, height: 20, measureSequence });

    const region = { width: 60, height: 20 };
    const m = createOverlayManager({ registry });

    // The owner's arithmetic: a transcript row translated into a region row.
    // C15 never sees the entry, the transcript, or the viewport.
    const ROW_IN_TRANSCRIPT = 45;
    const regionRow = () => ROW_IN_TRANSCRIPT - viewport.scroll.topRow;

    // Scrolled to the bottom first, so there is room to move up. The control
    // below caught the absence of this: at `topRow` 0 a `scrollBy(-4)` clamps
    // to nothing, and the two placements compared were of an anchor that had
    // not moved.
    viewport.scrollToBottom();
    const start = regionRow();
    m.push(anchored("tip", 3, { row: start, prefer: "above" }));
    const before = m.layout(region)[0]!.top;

    viewport.scrollBy(-4);

    // The control: the scroll actually moved the row this layer is following.
    // Without it, `update` could be a no-op and the assertion below would be
    // comparing two identical placements of an unmoved anchor.
    expect(regionRow()).toBe(start + 4);

    m.update("tip", { placement: { kind: "anchored", row: regionRow(), prefer: "above" } });
    expect(m.layout(region)[0]!.top).toBe(before + 4);

    viewport.dispose();
  });

  it("T4.5b (with C16): pop()'s null is disambiguated by top, not by the return value", () => {
    // C16's ladder: dismiss a dismissable overlay, no-op on a non-dismissable
    // one, fall through when there is no layer. `pop()` reports two of three.
    const m = createOverlayManager({ registry });
    const rung = (): "dismissed" | "noop" | "fellThrough" => {
      const top = m.top;
      if (top === null) return "fellThrough";
      if (!top.dismissable) return "noop";
      m.pop();
      return "dismissed";
    };

    expect(rung()).toBe("fellThrough");

    m.push(view("dash"));
    m.push(centred("confirm", 3, { dismissable: false }));
    expect(rung()).toBe("noop");
    // The whole point: the dashboard is still there. The collapsed form —
    // `if (pop()) …` — falls to the next rung and pops it out from under an
    // unanswered confirm.
    expect(m.stack.map((l) => l.id)).toEqual(["dash", "confirm"]);

    m.dismiss("confirm");
    expect(rung()).toBe("dismissed");
    expect(m.stack).toEqual([]);
  });
});

describe("C15 integration — against its consumers", () => {
  it("T4.7 (with C19): truncation is reported and no indicator is drawn here", () => {
    const menu = { ...anchored("menu", 30, { row: 18, rows: 2, prefer: "below" }) };
    const [p] = placeIn([menu]);

    expect(p?.truncated).toBe(true);
    // C15 renders no overflow indicator: only C19 knows what the remainder is
    // (I8). The placed height is the whole of what it reports.
    expect(Object.keys(p!).sort()).toEqual(
      ["height", "layer", "left", "top", "truncated", "width"].sort(),
    );
  });

  it("T4.7b (with C19, I14): narrowing is one push, N updates and one pop", () => {
    const m = createOverlayManager({ registry });
    const kinds: string[] = [];
    m.subscribe((c) => kinds.push(c.kind));

    m.push(anchored("menu", 8, { row: 18, rows: 2, prefer: "below" }));
    for (let typed = 7; typed >= 1; typed -= 1) m.update("menu", { content: rows(typed, "menu") });
    m.pop();

    expect(kinds.filter((k) => k === "push")).toHaveLength(1);
    expect(kinds.filter((k) => k === "pop")).toHaveLength(1);
    expect(kinds.filter((k) => k === "content")).toHaveLength(7);
  });

  it("T4.9 (with C25): a fullscreen patch is a view of one block, paged by update", () => {
    const hunk = (n: number): readonly Block[] => rows(n, "patch");
    const m = createOverlayManager({ registry });
    m.push({ ...view("patch"), content: hunk(40) });

    const first = m.layout(REGION)[0];
    expect(first?.height).toBe(REGION.height);
    // Taller than the region, and reported rather than clipped — C15 has no
    // scroll offset for views and must not grow one (§4).
    expect(first?.truncated).toBe(true);

    // `n`, the next hunk: the owner rewindows and calls update. `Placed` gains
    // nothing.
    m.update("patch", { content: hunk(40) });
    expect(m.layout(REGION)[0]).toMatchObject({ top: 0, left: 0 });
  });
});
