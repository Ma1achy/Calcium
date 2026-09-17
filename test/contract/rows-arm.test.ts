// C09 I72 — the rows arm against the element arm: the same block both ways, byte for byte.
//
// **The element arm was the reference here**, because it is what every frame
// was made of before the rows arm existed: a block's rows lifted into a `Text`
// per row and written by Ink. The rows arm had to produce those bytes without
// Ink, for every block the corpus holds, at every width and capability set,
// and a sequence — with gaps, a floor and a cap — had to equal the sequence Ink
// would have written whole.
//
// **The arm is deleted and the reference is committed** (F1209). Every
// comparison below is against a capture taken while Ink existed, so the claim is
// still about Ink's bytes and no longer about a second implementation in the
// tree. T2.146 is what stops the corpus shrinking under it, and the probe still
// reads the arm a block took — there is one, and a row asserting that is a row
// asserting the composition happened at all.
import { describe, expect, it } from "vitest";
import { NO_PROBE, NO_SPAN } from "../../src/data/viewmodel/index.js";
import type { Block, Probe } from "../../src/data/viewmodel/index.js";
import { DEFAULT_WIDTHS } from "../../src/testing/measurement-conformance.js";
import type { BlockDefinition, RenderContextInput } from "../../src/presentation/blocks/index.js";
import { rows } from "../../src/presentation/blocks/paint.js";
import { renderSequenceToLines, renderToLines } from "../../src/presentation/render-lines.js";
import { CORPUS, ONE_PER_KIND } from "../support/blocks.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, MONO_CAPS, registry } from "../support/render.js";
import { TEST_KINDS } from "../support/lifted.js";
import { InkOracle, oracleName } from "../support/ink-oracle.js";

/** The same sets, named, because a capture's file name carries the arm it was taken under. */
const NAMED_CAPS = [["full", FULL_CAPS], ["ascii", ASCII_CAPS], ["mono", MONO_CAPS]] as const;
/** A block's key in the capture directory — **kind and id**, because ids repeat across the two corpora. */
const keyOf = (b: Block): string => `${b.kind}-${b.id}`;
const oracle = new InkOracle("rows-arm");
/**
 * **Below `DEFAULT_WIDTHS`' floor of 40**, which is where container
 * disagreements grow rather than where they are comfortable: a rail pair and a
 * gap cost the same columns at 12 as at 200, so the fraction of the width the
 * chrome takes is the axis, and the sweep never looked at the end of it. Held
 * here rather than added to `DEFAULT_WIDTHS` — that constant is exported and
 * drives the conformance sweeps, and widening it is a different change.
 */
const NARROW_WIDTHS: readonly number[] = [2, 12, 24, 32];
const WIDTHS: readonly number[] = [...NARROW_WIDTHS, ...DEFAULT_WIDTHS];

/** A probe that records the spans it is asked to open, and nothing else. */
function recording(): Readonly<{ probe: Probe; names: string[] }> {
  const names: string[] = [];
  const probe: Probe = {
    ...NO_PROBE,
    on: true,
    span: (name: string) => {
      names.push(name);
      return NO_SPAN;
    },
  };
  return { probe, names };
}

describe("C09 I72 — the two arms agree", () => {
  it("T2.143 (C09 I72): over the corpus × seven widths × three capability sets the rows arm equals the block rendered through Ink byte for byte, a mixed sequence with gaps, a floor and a cap equals the whole sequence through Ink, and the probe reads exactly one rows span for a block — it read rows or react while there were two arms (F1209)", () => {
    const r = registry();
    // **The union by identity, not by concatenation.** Every one of
    // `ONE_PER_KIND`'s twenty-two entries is the same object as a `CORPUS`
    // member today, so the plain concatenation rendered twenty-two blocks twice
    // at every width and arm and took its tallies over the doubled list. A
    // `Set` keeps the union — a `ONE_PER_KIND` entry the corpus stops holding is
    // still compared — and gives each block one capture rather than two names
    // for one.
    const blocks = [...new Set([...Object.values(ONE_PER_KIND), ...CORPUS])];
    let rowsArm = 0;
    // **Keys must not collide**, or one capture stands for two blocks and the
    // one it does not match is never compared.
    expect(new Set(blocks.map(keyOf)).size, "every block has its own key").toBe(blocks.length);
    for (const b of blocks) {
      for (const width of WIDTHS) {
        for (const [capsName, capabilities] of NAMED_CAPS) {
          const name = oracleName(`t2143-${keyOf(b)}`, capsName, width);
          const expected = oracle.frozen(name);
          const { probe, names } = recording();
          const got = renderToLines(r, b, width, { theme: DARK_THEME, capabilities, probe });
          // **A retired capture is asserted to differ, never skipped** (F1233).
          // A ruling changed what this kind draws, so Ink's bytes are the
          // record of the frame before it — and the day the two agree again the
          // retirement is a stale exemption and says so here rather than
          // sitting in the list being true of nothing.
          const ruling = oracle.retired(name);
          if (ruling !== null) {
            expect(got, `${name} is retired by ${ruling}, and still matches`).not.toEqual(expected);
          } else {
            expect(got, `${b.kind} at ${String(width)}`).toEqual(expected);
          }
          // **One arm span per block, and the filter names one arm.** It
          // read `n === "rows" || n === "react"` while there were two; the
          // `react` span went with Ink (F1209), and leaving the term in would
          // have been a live-looking clause over a name nothing can open.
          const arms = names.filter((n) => n === "rows");
          expect(arms, `${b.kind} at ${String(width)} opened ${names.join(",")}`).toHaveLength(1);
          rowsArm += 1;
        }
      }
    }
    // Both arms were exercised — a corpus that took one arm alone would prove
    // nothing about the seam between them.
    expect(rowsArm).toBeGreaterThan(200);
    // **No kind this component ships answers an element** since I73 reached
    // `mosaic`, and there is no element arm at all since F1209. This asserted
    // `elementArm === 0` over a tally of the second span, which was the right
    // row while the arm existed and is a count of something unconstructable
    // now: every block opens `rows` or the assertion above fails, so the zero
    // has nothing left to be wrong about (A03 §2). What is kept is the corpus
    // check — the sweep is over a corpus that still holds the kind that was
    // last to move.
    expect(blocks.some((b) => b.kind === "mosaic"), "the corpus still holds a mosaic").toBe(true);

    // **The mixed sequence.** Rows blocks and element blocks side by side, a gap
    // before some, a floor taller than the block, and a cap with its marker —
    // composed block by block against the whole tree written once.
    const capped = registry([], undefined, 6);
    const lines = Array.from({ length: 30 }, (_, i) => ({
      ts: `12:00:${String(i).padStart(2, "0")}`,
      level: "info",
      message: `line ${String(i + 1)} of the capped logs`,
    }));
    const sequence: readonly Block[] = [
      ONE_PER_KIND.notice,
      { ...ONE_PER_KIND.logs, padding: { t: 1 } } as Block,
      { ...ONE_PER_KIND.rule, minHeight: 4 } as unknown as Block,
      { ...ONE_PER_KIND.panel, padding: { t: 1 } } as Block,
      { ...ONE_PER_KIND.logs, id: "capped", lines } as Block,
      { ...ONE_PER_KIND.table, padding: { t: 1 } } as Block,
      ONE_PER_KIND.code,
      { ...ONE_PER_KIND.group, padding: { t: 1 } } as Block,
      ONE_PER_KIND.plot,
    ];
    for (const width of [24, 60, 100]) {
      for (const [capsName, capabilities] of NAMED_CAPS) {
        // **The producer is gone and the capture is not.** `renderSequence`
        // was the registry's whole-sequence element arm; it had no caller in
        // `src/` and this row was the only thing that read it, so its bytes
        // were captured first and the member deleted after. `frozen` rather
        // than `rows`: there is no thunk to call, and this capture is finished
        // rather than failing.
        const expected = oracle.frozen(oracleName("t2143-sequence", capsName, width));
        const got = renderSequenceToLines(capped, sequence, width, { theme: DARK_THEME, capabilities });
        expect(got, `sequence at ${String(width)}`).toEqual(expected);
        // The fixture responds: the cap's marker is in the frame, and the floor's
        // rows are, so the composition rules were exercised rather than absent.
        expect(got.some((line) => line.includes(" of 30 rows")), "the cap's marker").toBe(true);
        expect(got.length).toBeGreaterThan(sequence.length + 4); // cells-ok — rows
      }
    }
  });
  it("T2.144 (C09 I73, F1170): over a corpus of containers — column and row groups with gaps, alignment, flex, minRows and short, open-styled and solid children; panels with a title, a footer, live, empty and narrow; scrolls with a residue, pads and an offset; tables with an expanded detail and an action bar; images in the placement, cell and fault arms; the /all shape — at seven widths under three capability sets, the rows arm equals the container's element path rendered through Ink byte for byte, and the probe reads rows", () => {
    const r = registry(TEST_KINDS);
    const B = (spec: Record<string, unknown>): Block => spec as unknown as Block;
    const raw = (id: string, text: string): Block => B({ kind: "raw", id, text });
    const notice = (id: string, text: string): Block => B({ kind: "notice", id, tone: "info", text });
    const rule = (id: string): Block => B({ kind: "rule", id, label: "r" });
    const tile = (id: string, text: string): Block =>
      B({ kind: "group", id, direction: "column", children: [notice(`${id}-c`, text), ONE_PER_KIND.plot] });
    const containers: readonly Block[] = [
      B({ kind: "group", id: "g-col", direction: "column", align: ["left", "right", "centre"], minRows: 8,
        children: [notice("g-col-a", "first"), { ...raw("g-col-b", "two lines\nof text"), padding: { t: 1 } }, rule("g-col-c")] }),
      B({ kind: "group", id: "g-row2", direction: "row", flex: [1, 1], children: [raw("g-row2-a", "left\nside"), notice("g-row2-b", "right")] }),
      B({ kind: "group", id: "g-row3", direction: "row", flex: [2, 1, 1], align: ["top-left", "middle-right", "bottom-centre"],
        children: [raw("g-row3-a", "tall\ntall\ntall"), rule("g-row3-b"), notice("g-row3-c", "c")] }),
      B({ kind: "group", id: "g-short", direction: "row", flex: [1, 1], children: [B({ kind: "short", id: "sh" }), raw("g-short-b", "a\nb\nc")] }),
      B({ kind: "group", id: "g-dangle", direction: "row", flex: [1, 1], children: [B({ kind: "dangling", id: "dg" }), notice("g-dangle-b", "after")] }),
      B({ kind: "group", id: "g-solid", direction: "row", flex: [1, 1], children: [B({ kind: "solid", id: "s1" }), B({ kind: "solid", id: "s2" })] }),
      B({ kind: "panel", id: "p-title", title: "Summary", footer: "3 items", children: [raw("p-title-a", "two lines\nof text"), { ...notice("p-title-b", "n"), padding: { t: 1 } }] }),
      B({ kind: "panel", id: "p-live", title: "Live", live: true, children: [notice("p-live-a", "beating")] }),
      B({ kind: "panel", id: "p-empty", title: "", children: [] }),
      B({ kind: "panel", id: "p-tall", title: "Tall", children: [B({ kind: "tall", id: "tl" })] }),
      B({ kind: "scroll", id: "sc-residue", height: 2, children: [raw("sc-r-a", "one"), raw("sc-r-b", "two"), raw("sc-r-c", "three")] }),
      B({ kind: "scroll", id: "sc-pads", height: 6, children: [raw("sc-p-a", "one"), raw("sc-p-b", "two")] }),
      B({ kind: "scroll", id: "sc-off", height: 2, children: [raw("sc-o-a", "one"), raw("sc-o-b", "two"), raw("sc-o-c", "three"), raw("sc-o-d", "four")] }),
      B({ ...(ONE_PER_KIND.table as unknown as Record<string, unknown>), id: "t-detail",
        rows: ((ONE_PER_KIND.table as unknown as { rows: readonly Record<string, unknown>[] }).rows).map((row, i) =>
          i === 0 ? { ...row, expanded: true, detail: [notice("t-d-a", "detail"), { ...raw("t-d-b", "more"), padding: { t: 1 } }] } : row) }),
      B({ ...(ONE_PER_KIND.table as unknown as Record<string, unknown>), id: "t-actions", actionBar: true }),
      { ...(ONE_PER_KIND.image as unknown as Record<string, unknown>), id: "img-fault", data: "not-a-png" } as unknown as Block,
      ONE_PER_KIND.image,
      B({ kind: "group", id: "all", direction: "column", children: [
        notice("all-n", "3 tiles"),
        B({ kind: "group", id: "all-r1", direction: "row", flex: [1, 1], children: [tile("all-t1", "one"), tile("all-t2", "two")] }),
        B({ kind: "group", id: "all-r2", direction: "row", flex: [1, 1], children: [tile("all-t3", "three"), tile("all-t4", "four")] }),
      ] }),
    ];
    const KITTY = { ...FULL_CAPS, imageProtocol: "kitty" as const };
    const capsFor = (b: Block): readonly (readonly [string, typeof FULL_CAPS])[] =>
      b.id === "img-place" ? [["kitty", KITTY]] : NAMED_CAPS;
    const withPlacement = [...containers, { ...(ONE_PER_KIND.image as unknown as Record<string, unknown>), id: "img-place" } as unknown as Block];
    const widths = WIDTHS;
    const scrollOffsets = { "sc-off": 1 };
    let compared = 0;
    for (const b of withPlacement) {
      for (const width of widths) {
        for (const [capsName, capabilities] of capsFor(b)) {
          const expected = oracle.frozen(oracleName(`t2144-${keyOf(b)}`, capsName, width));
          const { probe, names } = recording();
          const got = renderToLines(r, b, width, {
            theme: DARK_THEME, capabilities, probe, scrollOffsets,
            ...(b.id === "img-place" ? { placementScope: "e1" } : {}),
          } as never);
          expect(got, `${b.id} at ${String(width)}`).toEqual(expected);
          expect(names.filter((n) => n === "rows"), `${b.id} at ${String(width)} took the rows arm`).toHaveLength(1);
          compared += 1;
        }
      }
    }
    expect(compared).toBeGreaterThan(400);
    // **The fixtures respond**: the seams the composition exists for are in the frames.
    const ctx: RenderContextInput = { width: 60, theme: DARK_THEME, capabilities: FULL_CAPS, focus: null, tick: 0 };
    const rowGroup = r.render(containers[1] as Block, ctx) as readonly string[];
    expect(rowGroup[0], "both cells on one line, a pad between").toMatch(/left\s+.*right/u);
    const panel = r.render(containers[6] as Block, ctx) as readonly string[];
    expect(panel.length, "rails, body and a gap").toBeGreaterThan(5); // cells-ok — rows
    const short = r.render(containers[3] as Block, ctx) as readonly string[];
    expect(short.length, "the short child leaves its cell blank below its row").toBe(3); // cells-ok — rows
  });

  it("T2.147 (C09 I73, I35; F1210): a mosaic cuts each cell's rows to its own region and not to the grid, a region with no room draws nothing, and both equal the committed capture of the element path", () => {
    const r = registry(TEST_KINDS);
    // **A second grid row is what makes the cut observable.** A single row of
    // cells is cut at the grid's height and per cell alike, so a one-row mosaic
    // passes either rule. Here `a` and `b` share the top half and `c` holds the
    // bottom: `a`'s child is eight rows in a region of three, and a cut taken at
    // the grid's height would let those rows reach the rows that belong to `c`.
    const block = {
      kind: "mosaic", id: "m-clip", height: 6, areas: "ab/cc",
      rows: [1, 1], columns: [1, 1],
      children: [
        { kind: "raw", id: "ca", text: "a1\na2\na3\na4\na5\na6\na7\na8" },
        { kind: "raw", id: "cb", text: "b1\nb2" },
        { kind: "raw", id: "cc", text: "c1\nc2\nc3" },
      ],
    } as unknown as Block;
    for (const width of [8, 20, 60]) {
      for (const [capsName, capabilities] of NAMED_CAPS) {
        const expected = oracle.frozen(oracleName(`t2147-${keyOf(block)}`, capsName, width));
        const { probe, names } = recording();
        const got = renderToLines(r, block, width, { theme: DARK_THEME, capabilities, probe });
        expect(got, `the clipped mosaic at ${String(width)}`).toEqual(expected);
        expect(names.filter((n) => n === "rows"), "the mosaic takes the rows arm").toHaveLength(1);
        expect(got.length, "the grid is its declared height").toBe(6); // cells-ok — rows
      }
    }

    // **A height below one draws one blank row.** C04 I71 refuses this at
    // validation, so no valid document reaches it — and the refusal's own
    // message says what the renderer draws for one, which makes this C09's
    // degraded answer for a block that came in past the gate rather than dead
    // code guarding an impossible state. Constructed by rendering the block
    // directly, which is exactly what a consumer bypassing validation does.
    const floored = { ...(block as unknown as Record<string, unknown>), id: "m-floor", height: 0 } as unknown as Block;
    for (const width of [8, 20, 60]) {
      const expected = oracle.frozen(oracleName(`t2147-${keyOf(floored)}`, "full", width));
      const got = renderToLines(r, floored, width, { theme: DARK_THEME, capabilities: FULL_CAPS });
      expect(got, `the floored mosaic at ${String(width)}`).toEqual(expected);
      expect(got, "one blank row, not none").toEqual([""]);
    }

    // **A region with no room is not drawn, and *drawn* includes rendered**
    // (C04 I72). The row's title claimed this and no assertion carried it, which
    // is why `CELL-EMPTY-DRAWN` survived: removing the guard lets a zero-wide
    // cell through, and the composition drops it anyway — `fitRow(row, 0)` is
    // empty and `composeRow` skips an empty piece — so every byte is identical
    // and only the work moves. **A count is the only instrument**, the same
    // reason T1.33 counts renders rather than reading a frame.
    //
    // A fixed share wider than the grid is the construction: `{cells: 40}`
    // against a width of 40 leaves the second column nothing.
    let drawn = 0;
    const counted: BlockDefinition = {
      kind: "counted",
      measure: () => 1,
      render: () => {
        drawn += 1;
        return rows(["x"]);
      },
    } as unknown as BlockDefinition;
    const r2 = registry([...TEST_KINDS, counted as unknown as BlockDefinition<never>]);
    const squeezed = {
      kind: "mosaic", id: "m-squeeze", height: 2, areas: "ab",
      rows: [1], columns: [{ cells: 40 }, 1],
      children: [
        { kind: "raw", id: "sa", text: "wide" },
        { kind: "counted", id: "sb" },
      ],
    } as unknown as Block;
    const squeezedRows = renderToLines(r2, squeezed, 40, { theme: DARK_THEME, capabilities: FULL_CAPS });
    // The control first: the fixture answers when it has room, or a count of
    // zero says nothing about the guard (test/support/README.md).
    expect(drawn, "the fixture is reached when the cell has room").toBe(0);
    const roomy = { ...(squeezed as unknown as Record<string, unknown>), id: "m-room", columns: [1, 1] } as unknown as Block;
    renderToLines(r2, roomy, 40, { theme: DARK_THEME, capabilities: FULL_CAPS });
    expect(drawn, "and it is, once the column has cells").toBe(1);
    expect(squeezedRows, "the squeezed grid is still its declared height").toHaveLength(2); // cells-ok — rows

    // **A cell cuts a child that answers past its own width** (C09 I35, I73;
    // F1211). No kind C09 ships does that, so the clip reads as redundant —
    // every child is rendered at `rect.width` and its rows are already no wider.
    // `wide` is the registered kind that breaks the contract, which is a
    // consumer's prerogative (I13) and the only construction that reaches the
    // cut. Without it the left cell's row runs into the right cell's column and
    // every count still agrees, which is the half a frame's height cannot see.
    //
    // **Held to the rule and not to a capture**, because Ink is gone and this
    // shape was never drawn through it: the row states the geometry C09 I35
    // commits to.
    const overflowing = {
      kind: "mosaic", id: "m-wide", height: 1, areas: "ab",
      rows: [1], columns: [1, 1],
      children: [
        { kind: "wide", id: "wl" },
        { kind: "raw", id: "wr", text: "RIGHT" },
      ],
    } as unknown as Block;
    const wideRows = renderToLines(r, overflowing, 20, { theme: DARK_THEME, capabilities: FULL_CAPS });
    expect(wideRows, "one row, the grid's declared height").toHaveLength(1); // cells-ok — rows
    const row0 = wideRows[0] ?? "";
    expect(row0.startsWith("W".repeat(10)), `the left cell fills its ten columns: ${JSON.stringify(row0)}`).toBe(true);
    expect(row0[10], "and stops there — the eleventh column is the right cell's").not.toBe("W");
    expect(row0, "which is where RIGHT is").toContain("RIGHT");

    // **A region declared before another that starts to its left** (C04 §3f,
    // F1213). `parseAreas` orders regions by first appearance, so the pinwheel
    // `AAB/DEB/DCC` yields A, B, D, E, C — and B, at the right-hand column,
    // reaches the composer before D and E, which begin at column 0. `composeRow`
    // walks a cursor left to right and cuts a piece behind it to nothing, so
    // both cells of the middle band were dropped and **every count still
    // agreed**: forty rows, the declared height, the right blocks rendered.
    //
    // The corpus has no such grid, so nothing saw it. What had been carrying it
    // is the decline this pass removed — the overlap sent the frame to Ink,
    // which drew it correctly (F1210, F1211).
    const pinwheel = {
      kind: "mosaic", id: "m-pin", height: 6, areas: "AAB/DEB/DCC",
      rows: [1, 1, 1], columns: [1, 1, 1],
      // **Every cell is filled to the grid's height**, because the defect needs
      // B on the same line as D and E: a piece the composer meets first, at a
      // column past theirs. A one-row child would leave the band empty and the
      // row would pass over the bug.
      children: ["A", "B", "D", "E", "C"].map((t) => ({
        kind: "raw", id: `p${t.toLowerCase()}`, text: Array.from({ length: 6 }, () => t.repeat(4)).join("\n"),
      })),
    } as unknown as Block;
    const pin = renderToLines(r, pinwheel, 30, { theme: DARK_THEME, capabilities: FULL_CAPS });
    expect(pin, "the grid's declared height").toHaveLength(6); // cells-ok — rows
    // Row 0 is the top band: A across two columns, B in the third.
    expect(pin[0], "the top band").toBe(`AAAA${" ".repeat(16)}BBBB`);
    expect(pin[1], "and its second row").toBe(`AAAA${" ".repeat(16)}BBBB`);
    // Row 2 is the middle band, and it is the one that was blank: D at column 0,
    // E at column 10, B continuing at column 20.
    expect(pin[2], "the middle band — D and E are not swallowed by B").toBe(`DDDD${" ".repeat(6)}EEEE${" ".repeat(6)}BBBB`);
    expect(pin[3], "and its second row").toBe(`DDDD${" ".repeat(6)}EEEE${" ".repeat(6)}BBBB`);
    // Row 4 is the bottom band: D continuing at column 0, C across the rest.
    expect(pin[4], "the bottom band").toBe(`DDDD${" ".repeat(6)}CCCC`);
    expect(pin[5], "and its second row").toBe(`DDDD${" ".repeat(6)}CCCC`);
  });

  it("T2.146 (C09 I72, I73; F1209): every capture the two rows ask for is a capture the tree holds, and every capture the tree holds is one a row asks for", () => {
    // **Equality, both ways.** A subset check passes a corpus that shrank — a
    // block that stopped being rendered would simply stop being compared, and
    // the run would be quieter rather than red. This is the gate the captured
    // oracle needs and the live one did not, because a live oracle cannot be
    // stale: it was computed from the corpus that ran.
    const { asked, committed } = oracle.settle();
    expect(asked.length, "the rows asked for captures").toBeGreaterThan(400);
    expect(committed, "the committed captures are exactly the ones the rows ask for").toEqual(asked);
  });
});
