// C25 I10 tier 3 — where the span stream meets the other rules on the line:
// the truncation cut, a syntax token's boundary, a window's slice, a cluster.
import { describe, expect, it } from "vitest";
import { b } from "../../src/index.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import { windowPatch, windowRows } from "../../src/presentation/patch/window.js";
import { ASCII_CAPS, FULL_CAPS, measurable, visible } from "../support/render.js";
import { foregroundAt, underlinedRuns } from "../support/underline.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import type { Hunk, Patch } from "../../src/data/viewmodel/index.js";

type Line = Hunk["lines"][number];

const kit = (caps = FULL_CAPS): ReturnType<typeof measurable> =>
  measurable({ definitions: [patchDefinition as unknown as BlockDefinition<never>], capabilities: caps });

const pair = (removed: string, added: string, language = ""): Patch =>
  b.patch({
    id: "e",
    path: "x",
    language,
    layout: "unified",
    hunks: [{ header: "@@", lines: [{ kind: "remove", text: removed, oldNo: 1 }, { kind: "add", text: added, newNo: 1 }] }],
  });

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
    const whole = b.patch({ id: "w", path: "x", language: "", hunks: [{ header: "@@", lines }] });
    const k = kit();
    // Split at 120: rows are path, header, ctx, pair 0, pair 1, ctx. Cut inside the run.
    const win = windowRows(whole, 120, 4, 5);
    const rows = k.renderToLines(win.block, 120);
    expect(rows.slice(win.skipRows).map(underlinedRuns)).toEqual([["b1", "c1"]]);
    // The spans travelled as objects, not as re-derived diffs.
    const kept = win.block.hunks[0]?.lines ?? [];
    expect(kept.map((l) => l.spans)).toEqual([whole.hunks[0]?.lines[2]?.spans, whole.hunks[0]?.lines[4]?.spans]);
  });

  it("T3.19 (C25 I10): windowPatch — the fullscreen view's slice — shows the same underline as the whole", () => {
    const lines: Line[] = [
      { kind: "context", text: "ctx", oldNo: 1, newNo: 1 },
      { kind: "remove", text: "a common b0", oldNo: 2 },
      { kind: "add", text: "a common c0", newNo: 2 },
      { kind: "context", text: "ctx", oldNo: 3, newNo: 3 },
    ];
    const whole = b.patch({ id: "v", path: "x", language: "", hunks: [{ header: "@@", lines }] });
    const k = kit();
    // Offset 2 is the first context line. The path header and the hunk header are
    // sticky and come out of the budget (I18), so four rows reach the removed line
    // — at three the window is the two headers and the context line, which is the
    // fixture this row was first written against, and it asserted nothing.
    const view = windowPatch(whole, 80, 2, 4);
    const rows = k.renderToLines(view, 80);
    expect(rows.map(visible).map((r) => r.trimEnd())).toEqual(["── x " + "─".repeat(75), "@@", "1 1   ctx", "2   - a common b0"]);
    expect(rows.map(underlinedRuns)).toEqual([[], [], [], ["b0"]]);
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
