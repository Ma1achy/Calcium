// C25 I10 tier 3 — where the span stream meets the other rules on the line:
// the truncation cut, a syntax token's boundary, a window's slice, a cluster.
import { describe, expect, it } from "vitest";
import { b } from "../../src/index.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import { windowRows } from "../../src/presentation/patch/window.js";
import { ASCII_CAPS, FULL_CAPS, measurable, visible } from "../support/render.js";
import { foregroundAt, underlinedRuns } from "../support/underline.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import type { Hunk, Patch } from "../../src/data/viewmodel/index.js";

type Line = Hunk["lines"][number];

const kit = (caps = FULL_CAPS): ReturnType<typeof measurable> =>
  measurable({ definitions: [patchDefinition as unknown as BlockDefinition<never>], capabilities: caps });

const pair = (removed: string, added: string, language = ""): Patch =>
  b.patch({
    // **No leading gap**, because this fixture is rendered alone and the rows
    // below are read by index. `b.patch` gaps by default, and under C04 §3a
    // that row is now the block's own rather than the sequence's — so a block
    // drawn on its own draws it, where `gapBefore` was invisible there.
    gapBefore: false,
    id: "e",
    path: "x",
    language,
    layout: "unified",
    hunks: [{ header: "@@", lines: [{ kind: "remove", text: removed, oldNo: 1 }, { kind: "add", text: added, newNo: 1 }] }],
  });

/**
 * A window as a rebuilt `Patch`, over the surviving seam (C25 I18, §3b).
 *
 * `windowPatch` was deleted with the pushed view (R-EXA-082); the transcript
 * route takes a row **range**, which is what this names. It does not clamp —
 * `clampOffset` was the caller's snap and retired with the caller (F1251).
 */
const windowPatch = (patch: Patch, width: number, offset: number, height: number): Patch =>
  windowRows(patch, width, offset, offset + height).block;

describe("C25 I10 edge — the span stream against the line's other rules", () => {
  it("T3.17 (C25 I10): a span straddling the truncation cut is cut with the text, and the marker is never underlined", () => {
    // `alpha beta` → `alpha bets`: the span is [6, 10). The gutter is `1 1 - ` (6
    // cells) so a width of 15 leaves 9 for text: `alpha be` + the marker.
    const patch = pair("alpha beta gamma", "alpha bets gamma");
    for (const caps of [FULL_CAPS, ASCII_CAPS]) {
      const rows = kit(caps).renderToLines(patch, 15);
      const remove = rows[2] ?? "";
      const marker = caps.unicode === "ascii" ? "~" : "…";
      expect(visible(remove).endsWith(marker), `row ends in the marker: ${visible(remove)}`).toBe(true);
      expect(underlinedRuns(remove)).toEqual(["be"]);
      expect(underlinedRuns(rows[3] ?? "")).toEqual(["be"]);
    }
  });

  it("T3.18 (C25 I10): a span boundary inside a syntax token splits the token; both halves keep the slot and only the covered half is underlined", () => {
    // YAML tokenises the quoted string as one syntax token; the word-level span
    // covers `world` alone, so the token is cut in two and the colour must
    // survive on both halves.
    const patch = pair('msg: "hello world"', 'msg: "hello there"', "yaml");
    const rows = kit().renderToLines(patch, 80);
    const remove = rows[2] ?? "";
    expect(underlinedRuns(remove)).toEqual(["world"]);
    expect(underlinedRuns(rows[3] ?? "")).toEqual(["there"]);
    const before = foregroundAt(remove, '"hello');
    const inside = foregroundAt(remove, "world");
    expect(before, "the string token is coloured").not.toBe("");
    expect(inside, "the cut half keeps the string's colour").toBe(before);
    // And the key beside it is a different slot — the assertion above is not
    // passing because everything is one colour.
    expect(foregroundAt(remove, "msg")).not.toBe(before);
  });

  it("T3.19 (C25 I10): windowRows carries spans with the lines it slices, row-wise inside a run", () => {
    const lines: Line[] = [
      { kind: "context", text: "ctx", oldNo: 1, newNo: 1 },
      { kind: "remove", text: "a common b0", oldNo: 2 },
      { kind: "remove", text: "a common b1", oldNo: 3 },
      { kind: "add", text: "a common c0", newNo: 2 },
      { kind: "add", text: "a common c1", newNo: 3 },
      { kind: "context", text: "ctx", oldNo: 4, newNo: 4 },
    ];
    const whole = b.patch({ gapBefore: false, id: "w", path: "x", language: "", hunks: [{ header: "@@", lines }] });
    const k = kit();
    // Split at 120: rows are path, header, ctx, pair 0, pair 1, ctx. Cut inside the run.
    const win = windowRows(whole, 120, 4, 5);
    const rows = k.renderToLines(win.block, 120);
    expect(rows.slice(win.skipRows).map(underlinedRuns)).toEqual([["b1", "c1"]]);
    // The spans travelled as objects, not as re-derived diffs.
    const kept = win.block.hunks[0]?.lines ?? [];
    expect(kept.map((l) => l.spans)).toEqual([whole.hunks[0]?.lines[2]?.spans, whole.hunks[0]?.lines[4]?.spans]);

    // **The other branch, and a mutation is what named it** (F1123). The cut
    // above lands *inside* a run, so it takes the row-wise slice. A run that
    // fits **whole** inside the window takes `out.push(...lines)` one branch
    // above, and that branch had no row: a mutation rebuilding those lines from
    // their four named members — dropping the fifth, `spans` — applied cleanly
    // and survived every assertion in this file, which reads as a weak row.
    const all = windowRows(whole, 120, 0, 20);
    const allKept = all.block.hunks[0]?.lines ?? [];
    expect(
      allKept.map((l) => l.spans),
      "a run inside the window keeps its spans too",
    ).toEqual((whole.hunks[0]?.lines ?? []).map((l) => l.spans));

    // **The control**: an assertion over lines that never had spans is satisfied
    // by a window that drops every one of them.
    expect(
      allKept.some((l) => l.spans !== undefined),
      "the fixture carries spans to lose",
    ).toBe(true);
  });

  it("T3.19 (C25 I10): a window's slice shows the same underline as the whole", () => {
    const lines: Line[] = [
      { kind: "context", text: "ctx", oldNo: 1, newNo: 1 },
      { kind: "remove", text: "a common b0", oldNo: 2 },
      { kind: "add", text: "a common c0", newNo: 2 },
      { kind: "context", text: "ctx", oldNo: 3, newNo: 3 },
    ];
    const whole = b.patch({ gapBefore: false, id: "v", path: "x", language: "", hunks: [{ header: "@@", lines }] });
    const k = kit();
    // Row 2 is the first context line, and the range runs to the removed one.
    // **The headers are re-added on top and declared rather than charged**
    // (C25 §3b, M9b): the pushed view took them out of a height budget, so four
    // rows reached the removed line; a range caller asks for the rows it wants
    // and the window says how many it put above them.
    const view = windowPatch(whole, 80, 2, 4);
    const rows = k.renderToLines(view, 80);
    expect(rows.map(visible).map((r) => r.trimEnd())).toEqual([
      "── x " + "─".repeat(75),
      "@@",
      "1 1   ctx",
      "2   - a common b0",
      "  2 + a common c0",
      "3 3   ctx",
    ]);
    expect(rows.map(underlinedRuns)).toEqual([[], [], [], ["b0"], ["c0"], []]);
  });

  it("T3.21 (C25 I10): a span the writer opens inside a grapheme cluster is snapped outward, so the cluster paints whole", () => {
    // 👨 ZWJ 👩 against 👨 ZWJ 👧: the writer's tokens are code-point sized, so
    // its span begins after the ZWJ — inside the cluster. `runsOf` snaps it to the
    // cluster's edges (C04 I84).
    const family = "\u{1F468}‍\u{1F469}";
    const other = "\u{1F468}‍\u{1F467}";
    const patch = pair(`${family} x`, `${other} x`);
    const spans = patch.hunks[0]?.lines[1]?.spans;
    expect(spans?.[0]?.from, "the writer's span starts inside the cluster").toBeGreaterThan(0);
    const rows = kit().renderToLines(patch, 40);
    expect(underlinedRuns(rows[2] ?? "")).toEqual([family]);
    expect(underlinedRuns(rows[3] ?? "")).toEqual([other]);
    expect(kit().measure(patch, 40)).toBe(rows.length); // cells-ok — a row count
  });
});
