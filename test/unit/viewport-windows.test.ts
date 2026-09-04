// C14 §4a — one block's rows on the render path are bounded, with a residue (I23).
//
// **The measurement that ruled it**: a 40-row window of a 2 000-line `code`
// block painted 2 000 rows in 934 ms and `logs` at the same size painted 40 in
// 14 ms, because `windowSequence` keeps a kind with no `window` whole. The rows
// here assert the **rows produced** and never the milliseconds — a CPU-fraction
// assertion measures the host, and the row count is the property the paint cost
// is linear in. The milliseconds are reported beside the table in C14 §4a.
//
// **The pin's row is the comment one, and no other row can be.** A `code`
// window that sliced its text is byte-identical to the pinned one for every
// block with no multi-line token, so a fixture of ordinary lines passes against
// both. The block comment is where the two parses differ (C09 I25a, F426).
import { describe, expect, it } from "vitest";
import { measurable, visible } from "../support/render.js";
import type { Block } from "../../src/data/viewmodel/index.js";

const H = 40;
const W = 100;

/** A block whose every line is a statement with a trailing comment — Lane F's probe shape. */
const long = (kind: "code" | "raw", n: number): Block => {
  const lines = Array.from({ length: n }, (_, i) => `line ${String(i)} — const value${String(i)} = compute(${String(i)}); /* trailing comment */`);
  return kind === "code"
    ? ({ kind, id: "c", language: "typescript", text: lines.join("\n") } as Block)
    : ({ kind, id: "r", text: lines.join("\n") } as Block);
};

describe("C14 §4a — the render path is bounded by the region", () => {
  it("T1.18 (I23): a 2 000-line `code` block and a 2 000-line `raw` block window to the region's rows plus a residue", () => {
    const r = measurable();

    for (const kind of ["code", "raw"] as const) {
      const block = long(kind, 2000);
      expect(r.measure(block, W), `${kind}: the whole block`).toBe(2000);

      // **The subject, before the claim**: without the window the sequence
      // keeps all 2 000 and the paint is linear in the block.
      const win = r.registry.windowSequence([block], W, 0, H);
      const piece = win.blocks[0] as Block;
      const inner = r.window(block, W, 0, H);
      const residue = win.skipRows + (inner?.dropRows ?? 0);
      expect(r.measure(piece, W), `${kind}: measures at most the region plus its residue`).toBeLessThanOrEqual(H + residue);
      expect(r.measure(piece, W) - residue, `${kind}: and exactly the region once the residue is paid (C09 I26)`).toBe(H);

      // **The rows produced, which is what bounds the paint.** `renderToLines`
      // is the same path `renderSequenceToLines` takes per block.
      const rows = r.renderToLines(piece, W);
      expect(rows.length, `${kind}: rows painted`).toBeLessThanOrEqual(H + residue);

      // And they are the forty the whole rendering would have put there (C09 I25).
      // The whole render is the 934 ms case, paid once here to have something
      // to compare against.
      const full = r.renderToLines(block, W);
      expect(rows.slice(win.skipRows, rows.length - (inner?.dropRows ?? 0)), `${kind}: the same forty rows`).toEqual(full.slice(0, H));

      // A window in the middle of the block, so the assertion is not about
      // offset zero alone (C25 T3.20's method).
      const mid = r.registry.windowSequence([block], W, 1000, 1000 + H);
      const midRows = r.renderToLines(mid.blocks[0] as Block, W);
      expect(midRows.length, `${kind}: bounded at offset 1000 too`).toBeLessThanOrEqual(H + 2);
      expect(midRows.slice(mid.skipRows, mid.skipRows + H), `${kind}: rows 1000–1039`).toEqual(full.slice(1000, 1000 + H));
    }

    // **`text` travels whole once the window has scrolled** (C04 I82, C09 I25a):
    // the same string reference, which is what keeps `tokenise`'s memo hitting on
    // every frame of a scrolled block. **At line 0 it slices instead** — nothing
    // precedes the slice, so the parse is the whole block's over those lines, and
    // the tokeniser runs over `to` lines rather than 2 000 (the arm F603 measured
    // at 1 696 ms against 196 ms for a capped block's first paint).
    const block = long("code", 2000);
    const source = (block as { text: string }).text;
    const top = r.registry.windowSequence([block], W, 0, H).blocks[0] as { text: string; lineRange?: readonly [number, number] };
    expect(top.text, "the first H lines, sliced").toBe(source.split("\n").slice(0, H).join("\n"));
    expect(top.lineRange, "and no pin").toBeUndefined();
    const scrolled = r.registry.windowSequence([block], W, 1000, 1000 + H).blocks[0] as { text: string; lineRange?: readonly [number, number] };
    expect(scrolled.text === source, "the same string").toBe(true);
    expect(scrolled.lineRange).toEqual([1000, 1000 + H]);
  });

  it("T1.18 (I23, C04 I82): a block comment opening above the window is still drawn in the comment slot inside it", () => {
    // **Read as a frame, not as a count.** The window's row count is right with
    // or without the pin; what the pin changes is which palette slot the rows
    // inside the comment resolve to. The whole rendering is the reference —
    // the same bytes, SGR included — and the control is the slice a window
    // *without* the pin would have handed back.
    const r = measurable();
    const text = [
      "const before = 1;",
      "/* a comment that opens on line 1",
      "   and is still open on line 2, where the window opens,",
      "   and on line 3,",
      "   closing on line 4 */",
      "const after = 2;",
    ].join("\n");
    const block = { kind: "code", id: "c", language: "typescript", text } as Block;
    const full = r.renderToLines(block, W);

    const win = r.registry.windowSequence([block], W, 2, 4);
    const kept = r.renderToLines(win.blocks[0] as Block, W);
    expect(win.skipRows, "a line is a row here, so no residue").toBe(0);
    expect(kept, "rows 2 and 3, in the comment slot").toEqual(full.slice(2, 4));

    // **The control**: the same two lines as their own text tokenise as
    // identifiers and draw in the default tone — the same characters, a
    // different frame. Without this the row above passes against a fixture
    // that cannot fail (test/support/README.md).
    const sliced = r.renderToLines({ ...block, text: text.split("\n").slice(2, 4).join("\n") } as Block, W);
    expect(sliced.map(visible), "the same characters").toEqual(kept.map(visible));
    expect(sliced, "in a different slot").not.toEqual(kept);
  });
});
