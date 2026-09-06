// C25 §3c — windowing a patch for the fullscreen view.
//
// **The control is the measured height, not the shape of the block.** A window
// that produced the wrong hunks would still be a valid `Patch` and would still
// render; what separates a correct window from a plausible one is that it fits
// the region it was built for, and that the rows it shows are the rows the
// offset asked for. So every test here measures, and the property test measures
// at every offset rather than at the three anyone would pick by hand.
//
// The pairing row (I19) is the reason this file exists. §3c records the
// measurement: the illustration's hunk is seven rows split, and cut between its
// removed line and its two added ones the halves come to eight. Any window that
// cuts at an arbitrary line offset can invent a row, and the common case — a
// window landing in context — passes either way.
import { describe, expect, it } from "vitest";
import { block, changedRuns } from "../../src/data/viewmodel/index.js";
import type { Hunk, Patch } from "../../src/data/viewmodel/index.js";
import {
  clampOffset,
  hunkHeaderRows,
  totalRows,
  windowPatch,
} from "../../src/presentation/patch/window.js";
import { hunkRows, isCollapsed, layoutFor } from "../../src/presentation/patch/height.js";
import { PATCH_CORPUS } from "../support/blocks.js";

const UNIFIED = 80;
const SPLIT = 120;

const line = (kind: "add" | "remove" | "context", text: string): Hunk["lines"][number] => ({
  kind,
  text,
});

/** §2's illustration: three context, one removed, two added, two context. */
const ILLUSTRATION: Hunk = {
  header: "@@ -18,6 +18,7 @@",
  lines: [
    line("context", "spec:"),
    line("context", "  selector:"),
    line("context", "    matchLabels:"),
    line("remove", "      app: volatility-estimator"),
    line("add", "      app: volatility-estimator"),
    line("add", "      prism.fmx.io/family: volatility"),
    line("context", "  replicas: 2"),
    line("context", "  template:"),
  ],
  collapsedBefore: 14,
};

const patchOf = (hunks: readonly Hunk[], collapsedAfter?: number): Patch =>
  block({
    kind: "patch",
    id: "p1",
    path: "serving/volatility-estimator.yaml",
    language: "yaml",
    hunks,
    ...(collapsedAfter === undefined ? {} : { collapsedAfter }),
  } as Patch);

const THREE = patchOf(
  [
    ILLUSTRATION,
    { ...ILLUSTRATION, header: "@@ -60,4 +61,4 @@", collapsedBefore: 30 },
    { header: "@@ -90,4 +91,4 @@", lines: ILLUSTRATION.lines },
  ],
  170,
);

describe("C25 §3c — windowing", () => {
  it("T1.20b (C25 I19b): a window's cuts fall on `changedRuns`' boundaries, over the whole corpus", () => {
    // **The characterisation this file owes the de-duplication (F595/P2).** The
    // row above states the cut rule with a predicate of its own — changed, and
    // changed before it — which is a *fourth* spelling of the grouping, on one
    // fixture. This one states it against the single implementation: a window may
    // begin and end only where `changedRuns` closes a group, and the boundaries
    // are derived from that function rather than restated here.
    //
    // **What it covers, and what it cannot** (the blind spot, stated because an
    // unrecorded one reads as strength). It fails the moment a *fourth* copy of
    // the grouping appears in `window.ts` and drifts: reading a run's span as
    // `max(removes, adds)` — its rows — rather than their sum fails this row and
    // two others. It does **not** catch a change to `changedRuns` itself, because
    // the expectation is derived from the same function the code now calls, so a
    // mutation moves both together. Measured: dropping `changedRuns`' flush at a
    // context line leaves this row green and fails the two rows below, whose
    // predicate is independent of it. That is the reason the row below stays —
    // the two are complementary, one stating the rule and one the agreement, and
    // deleting either on grounds of duplication loses a mutation.
    //
    // Split only, and **`layoutFor` decides that rather than the width** — the
    // corpus holds `patch-forced-unified`, whose `layout` field wins over a split
    // width (C25 §3), and reading the layout off the width alone charges a
    // unified window with a split boundary set. The first run of this row failed
    // on exactly that fixture and the code was right.
    //
    // Unified is not asserted because it gives every line its own unit, so every
    // index is a boundary and the row would be vacuous there.
    const boundaries = (lines: Hunk["lines"]): ReadonlySet<number> => {
      const out = new Set<number>([0]);
      let at = 0;
      for (const group of changedRuns(lines)) {
        at += "kind" in group ? 1 : group.removes.length + group.adds.length; // cells-ok — line counts
        out.add(at);
      }
      return out;
    };

    let cuts = 0; // cells-ok — a count of assertions made, not a width
    for (const candidate of PATCH_CORPUS) {
      if (candidate.kind !== "patch") continue;
      const patch = candidate;
      if (layoutFor(patch, SPLIT) !== "split") continue;
      const total = totalRows(patch, SPLIT);
      for (let height = 3; height <= 9; height += 1) {
        for (let offset = 0; offset <= total; offset += 1) {
          for (const win of windowPatch(patch, SPLIT, offset, height).hunks) {
            if (win.lines.length === 0) continue;
            // The window slices the source array, so the lines are the same
            // objects — an exact index rather than a match on text.
            const source = patch.hunks.find((h) => h.lines.includes(win.lines[0] as never));
            if (source === undefined) continue;
            const from = source.lines.indexOf(win.lines[0] as never);
            const to = from + win.lines.length; // cells-ok — a line count
            const bounds = boundaries(source.lines);
            const where = `${patch.id} h${String(height)} o${String(offset)}`;
            expect(bounds.has(from), `${where}: opens at line ${String(from)}`).toBe(true);
            expect(bounds.has(to), `${where}: closes at line ${String(to)}`).toBe(true);
            if (from > 0) cuts += 1;
          }
        }
      }
    }
    // The control: with no window opening past line 0 this asserts only that 0 is
    // a boundary, which it is by construction.
    expect(cuts).toBeGreaterThan(0);
  });

  it("T1.20c (C25 I1, I19b): the window's row model and `measure` agree, row for row", () => {
    // **Containment is not correctness, and this row is what measured that.** Every
    // other row here bounds a window from above — it never exceeds its region — and
    // a unit that *over-states* its height satisfies all of them: it shows less
    // diff, never more. Restating a unit's rows as its line count rather than
    // asking `pairedRows` survived the whole patch suite, 99 rows across eight
    // files (measured 2026-09-04). Nothing said the window had shrunk.
    //
    // So this states the equality instead, and it states it across the seam: the
    // header positions come from `hunkHeaderRows`, which walks `rowsOf` and
    // therefore `unitsOf`, and the expectation comes from `height.ts`'s `hunkRows`,
    // which `measure` uses and which never sees a unit. A window that disagreed
    // with `pairedRows` about what a row is is the drift I1 exists to prevent, and
    // until now the suite took that agreement on trust.
    for (const candidate of PATCH_CORPUS) {
      if (candidate.kind !== "patch") continue;
      const patch = candidate;
      for (const width of [UNIFIED, SPLIT]) {
        const layout = layoutFor(patch, width);
        const expected: number[] = [];
        let at = 1; // the path header
        for (const hunk of patch.hunks) {
          if (isCollapsed(hunk.collapsedBefore)) at += 1;
          expected.push(at);
          at += hunkRows(hunk, layout) - (isCollapsed(hunk.collapsedBefore) ? 1 : 0);
        }
        const where = `${patch.id} at ${String(width)}`;
        expect([...hunkHeaderRows(patch, width)], where).toEqual(expected);
        expect(at + (isCollapsed(patch.collapsedAfter) ? 1 : 0), `${where}: total`).toBe(
          totalRows(patch, width),
        );
      }
    }
  });

  it("T1.20 (I19): a window never measures taller than its region, at any offset or width", () => {
    // **The property, asserted over every offset rather than three.** A window
    // that cut inside a changed run would exceed the region exactly where the
    // run straddles the boundary, which is one offset out of twelve in this
    // fixture — and the eleven others pass under both implementations.
    for (const width of [UNIFIED, SPLIT]) {
      const total = totalRows(THREE, width);
      for (let height = 3; height <= 12; height += 1) {
        for (let offset = 0; offset <= total; offset += 1) {
          const win = windowPatch(THREE, width, offset, height);
          expect(
            totalRows(win, width),
            `width ${width}, height ${height}, offset ${offset}`,
          ).toBeLessThanOrEqual(height);
        }
      }
    }
  });

  it("T1.20 (I19): in split layout a window's lines never begin inside a changed run", () => {
    // The direct statement of the cut rule. A line is inside a run when it is
    // changed and the line before it is changed too — cutting there is what
    // makes the two halves measure more than the whole.
    const hunk = THREE.hunks[0];
    if (hunk === undefined) throw new Error("fixture");

    const starts = new Set<number>();
    const total = totalRows(THREE, SPLIT);
    for (let offset = 0; offset <= total; offset += 1) {
      const win = windowPatch(THREE, SPLIT, offset, 6);
      const first = win.hunks[0];
      if (first === undefined || first.lines.length === 0) continue;
      const text = first.lines[0]?.text;
      const idx = hunk.lines.findIndex((l) => l.text === text && l.kind === first.lines[0]?.kind);
      if (idx > 0) starts.add(idx);
    }

    for (const idx of starts) {
      const here = hunk.lines[idx];
      const before = hunk.lines[idx - 1];
      const insideRun = here?.kind !== "context" && before?.kind !== "context";
      expect(insideRun, `line ${String(idx)} begins a window inside a changed run`).toBe(false);
    }
    // The control: without at least one non-zero start this asserts nothing.
    expect(starts.size).toBeGreaterThan(0);
  });

  it("T1.20 (I19): every line is reachable from some offset — snapping down, never up", () => {
    // **Added because a mutation failed nothing.** Disabling the snap left all
    // nine tests green, and the reason is that the walk skips interior rows of a
    // unit anyway — so without the snap an offset landing inside a run *skips
    // the run* rather than starting at it. That is snapping up, and it can make
    // a line unreachable: if the offset ceiling falls inside a unit, the lines
    // of that unit are never drawn at any offset. D38's rule, one level down.
    //
    // The property is the one worth asserting rather than the direction: sweep
    // every offset and every line must appear somewhere.
    for (const width of [UNIFIED, SPLIT]) {
      const seen = new Set<string>();
      const ceiling = clampOffset(THREE, width, 6, 10_000);
      for (let offset = 0; offset <= ceiling; offset += 1) {
        for (const hunk of windowPatch(THREE, width, offset, 6).hunks) {
          for (const l of hunk.lines) seen.add(`${hunk.header}|${l.kind}|${l.text}`);
        }
      }
      for (const hunk of THREE.hunks) {
        for (const l of hunk.lines) {
          expect(seen.has(`${hunk.header}|${l.kind}|${l.text}`), `${width}: ${l.text}`).toBe(true);
        }
      }
    }
  });

  it("T1.20 (I19): an offset inside a run opens at the run, not past it", () => {
    // **The assertion two mutations asked for, and the second attempt at it.**
    // The first compared `windowPatch(offset)` with `windowPatch(clamped)` and
    // was self-referential — `windowPatch` clamps its own argument, so both
    // sides took the same path and every mutation passed.
    //
    // So the row map is computed here by hand instead. A single-hunk patch at a
    // split width lays out as:
    //
    //   0 path · 1 marker · 2 header · 3,4,5 context · 6,7 the run · 8,9 context
    //
    // Row 7 is the interior of the two-row run, and it is the only offset in
    // this fixture that can distinguish the three rulings: snapping down opens
    // at `r1`, snapping up steps over the run to `c4`, and no snap at all does
    // the same as snapping up.
    const one = patchOf([ILLUSTRATION], 170);
    const INSIDE_RUN = 7;

    const win = windowPatch(one, SPLIT, INSIDE_RUN, 6);
    expect(win.hunks[0]?.lines[0]?.text).toBe("      app: volatility-estimator");
    expect(win.hunks[0]?.lines[0]?.kind).toBe("remove");
    expect(clampOffset(one, SPLIT, 6, INSIDE_RUN)).toBe(6);

    // The control: the row above is already a valid start, and clamping leaves
    // it alone. Without this the assertion above passes for an implementation
    // that snaps every offset to 6.
    expect(clampOffset(one, SPLIT, 6, 5)).toBe(5);
  });

  it("T1.21 (I18): the path header and a touched hunk's header are sticky and cost rows", () => {
    // A window opening inside the first hunk's body. Two rows are gone before a
    // single line of diff appears, and a budget computed as `height` rather than
    // `height - 2` produces a window C15 reports as truncated.
    const headers = hunkHeaderRows(THREE, UNIFIED);
    const firstHeader = headers[0];
    if (firstHeader === undefined) throw new Error("fixture");

    const win = windowPatch(THREE, UNIFIED, firstHeader + 3, 6);
    expect(win.path).toBe(THREE.path);
    expect(win.hunks).toHaveLength(1);
    expect(win.hunks[0]?.lines.length).toBe(4); // 6 rows − path header − hunk header
    expect(totalRows(win, UNIFIED)).toBe(6);
  });

  it("T1.22 (I20): a collapse marker appears only on the window containing its row", () => {
    const headers = hunkHeaderRows(THREE, UNIFIED);
    const first = headers[0];
    if (first === undefined) throw new Error("fixture");

    // Top: the first hunk's `collapsedBefore` is in range.
    const top = windowPatch(THREE, UNIFIED, 0, 6);
    expect(top.hunks[0]?.collapsedBefore).toBe(14);
    expect(top.collapsedAfter).toBeUndefined();

    // Middle: past the marker, nowhere near the tail.
    const middle = windowPatch(THREE, UNIFIED, first + 4, 5);
    expect(middle.hunks[0]?.collapsedBefore).toBeUndefined();
    expect(middle.collapsedAfter).toBeUndefined();

    // Bottom: the tail marker is the last row of the last window.
    const total = totalRows(THREE, UNIFIED);
    const bottom = windowPatch(THREE, UNIFIED, total, 6);
    expect(bottom.collapsedAfter).toBe(170);
  });

  it("T1.23 (I21): a sliced hunk carries its original header verbatim", () => {
    const headers = hunkHeaderRows(THREE, UNIFIED);
    const first = headers[0];
    if (first === undefined) throw new Error("fixture");

    const win = windowPatch(THREE, UNIFIED, first + 2, 5);
    expect(win.hunks[0]?.header).toBe("@@ -18,6 +18,7 @@");
    // And the slice really is a slice — without this the assertion above passes
    // for a window that returned the whole hunk.
    expect(win.hunks[0]?.lines.length).toBeLessThan(ILLUSTRATION.lines.length);
  });

  it("clampOffset stops at the first offset that reaches the end, not at total − height", () => {
    // **`total - height` was the first ceiling and it was wrong, and this test
    // is what said so.** That figure is arithmetic over the full rendering, and
    // a window is a slice plus sticky headers (I18) — so a window opened there
    // stops short and `collapsedAfter`, the row that says how much file is
    // below, is unreachable. A reader would press `G` and not see the bottom.
    //
    // Asserted as the property rather than as the number: the ceiling's window
    // reaches the last row, and one row above it does not.
    const total = totalRows(THREE, UNIFIED);
    const height = 10;
    const ceiling = clampOffset(THREE, UNIFIED, height, 10_000);

    expect(ceiling).toBeGreaterThan(total - height);
    expect(windowPatch(THREE, UNIFIED, ceiling, height).collapsedAfter).toBe(170);
    expect(windowPatch(THREE, UNIFIED, ceiling - 1, height).collapsedAfter).toBeUndefined();

    expect(clampOffset(THREE, UNIFIED, height, -5)).toBe(0);
    expect(clampOffset(THREE, UNIFIED, height, Number.NaN)).toBe(0);
    // A region taller than the document pins the offset at the top rather than
    // going negative, which is what a short diff in a tall terminal is.
    expect(clampOffset(THREE, UNIFIED, total + 20, 5)).toBe(0);
  });

  it("hunkHeaderRows names a row per hunk, in order, and each one is a header", () => {
    const rows = hunkHeaderRows(THREE, UNIFIED);
    expect(rows).toHaveLength(3);
    expect([...rows]).toEqual([...rows].sort((a, b) => a - b));
    // Windowing at a header row puts that hunk first with its full header —
    // which is what makes `n` and `p` land somewhere legible.
    for (const [i, row] of rows.entries()) {
      const win = windowPatch(THREE, UNIFIED, row, 6);
      expect(win.hunks[0]?.header, `hunk ${String(i)}`).toBe(THREE.hunks[i]?.header);
    }
  });

  it("a one-row region is the path header alone, and does not throw", () => {
    const win = windowPatch(THREE, UNIFIED, 4, 1);
    expect(win.hunks).toHaveLength(0);
    expect(totalRows(win, UNIFIED)).toBe(1);
  });

  it("a patch with no hunks windows to itself", () => {
    const empty = patchOf([]);
    expect(totalRows(windowPatch(empty, UNIFIED, 0, 10), UNIFIED)).toBe(1);
  });
});
