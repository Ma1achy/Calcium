// C25 I10 tier 2 — the builder's pairing is the renderer's.
//
// **Asserted through the frame, over every run shape up to 3 × 3.** The two
// halves of a split row are drawn by `changedRuns` and diffed by `intralineLines`
// through the same grouping; the row that would fail is the one where a second
// pairing drifts — the *n*th remove diffed against the *n*+1th add — and its
// signature is an underline on the left half describing a change on some other
// row. The fixture is built so that mispairing changes *what* is underlined and
// not merely where: `a0 common b0` against `a0 common c0` underlines `b0`; against
// `a1 common c1` it would underline `a0` too.
import { describe, expect, it } from "vitest";
import { b } from "../../src/index.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import { FULL_CAPS, measurable } from "../support/render.js";
import { underlinedRuns } from "../support/underline.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import type { Hunk } from "../../src/data/viewmodel/index.js";

type Line = Hunk["lines"][number];

const kit = (): ReturnType<typeof measurable> =>
  measurable({ definitions: [patchDefinition as unknown as BlockDefinition<never>], capabilities: FULL_CAPS });

function runOf(removes: number, adds: number): readonly Line[] {
  const lines: Line[] = [{ kind: "context", text: "ctx", oldNo: 1, newNo: 1 }];
  for (let i = 0; i < removes; i += 1) lines.push({ kind: "remove", text: `a${String(i)} common b${String(i)}`, oldNo: 2 + i });
  for (let i = 0; i < adds; i += 1) lines.push({ kind: "add", text: `a${String(i)} common c${String(i)}`, newNo: 2 + i });
  lines.push({ kind: "context", text: "ctx", oldNo: 2 + removes, newNo: 2 + adds });
  return lines;
}

describe("C25 I10 — one pairing for the diff and the drawing", () => {
  it("T2.7 (C25 I10): for every run shape up to 3 × 3, split rows underline the nth remove's word beside the nth add's", () => {
    const k = kit();
    for (let removes = 0; removes <= 3; removes += 1) {
      for (let adds = 0; adds <= 3; adds += 1) {
        const patch = b.patch({ id: `r${String(removes)}a${String(adds)}`, path: "x", language: "", hunks: [{ header: "@@", lines: runOf(removes, adds) }] });
        const rows = k.renderToLines(patch, 120);
        // Path header, hunk header, context, the paired rows, context.
        const paired = Math.min(removes, adds);
        const body = rows.slice(3, 3 + Math.max(removes, adds));
        body.forEach((row, i) => {
          const expected = i < paired ? [`b${String(i)}`, `c${String(i)}`] : [];
          expect(underlinedRuns(row), `${patch.id} split row ${String(i)}`).toEqual(expected);
        });
        // And the rows around the run carry none.
        expect(underlinedRuns(rows[2] ?? "")).toEqual([]);
        expect(underlinedRuns(rows[rows.length - 1] ?? "")).toEqual([]); // cells-ok — a row index
      }
    }
  });

  it("T2.7 (C25 I10): unified draws the same spans one line per row — the remove's word on its row, the add's on its own", () => {
    const patch = b.patch({ id: "u", path: "x", language: "", layout: "unified", hunks: [{ header: "@@", lines: runOf(2, 3) }] });
    const rows = kit().renderToLines(patch, 80);
    expect(rows.slice(3, 8).map(underlinedRuns)).toEqual([["b0"], ["b1"], ["c0"], ["c1"], []]);
  });

  it("T2.7 (C25 I10): the spans on the block are the ones the renderer painted — attributes only, underline alone", () => {
    const patch = b.patch({ id: "s", path: "x", language: "", hunks: [{ header: "@@", lines: runOf(1, 1) }] });
    const lines = patch.hunks[0]?.lines ?? [];
    expect(lines[1]?.spans).toEqual([{ from: 10, to: 12, underline: true }]);
    expect(lines[2]?.spans).toEqual([{ from: 10, to: 12, underline: true }]);
    expect(lines[0]?.spans).toBeUndefined();
    expect(lines[3]?.spans).toBeUndefined();
  });
});
