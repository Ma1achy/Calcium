// C09 I72 — the rows arm against the element arm: the same block both ways, byte for byte.
//
// **The element arm is the reference here**, because it is what every frame
// was made of before the rows arm existed: a block's rows lifted into a `Text`
// per row and written by Ink. The rows arm must produce those bytes without
// Ink, for every block the corpus holds, at every width and capability set,
// and a sequence that mixes the two arms — with gaps, a floor and a cap —
// must equal the sequence Ink would have written whole. The probe reads which
// arm a block took, and exactly one of them.
import { describe, expect, it } from "vitest";
import { Box, Text, renderToString } from "ink";
import { createElement } from "react";
import { NO_PROBE, NO_SPAN } from "../../src/data/viewmodel/index.js";
import type { Block, Probe } from "../../src/data/viewmodel/index.js";
import { DEFAULT_WIDTHS } from "../../src/testing/measurement-conformance.js";
import type { RenderContextInput } from "../../src/presentation/blocks/index.js";
import { elementOf } from "../../src/presentation/blocks/paint.js";
import { renderSequenceToLines, renderToLines } from "../../src/presentation/render-lines.js";
import { CORPUS, ONE_PER_KIND } from "../support/blocks.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, MONO_CAPS, registry } from "../support/render.js";
import { TEST_KINDS, twin } from "../support/lifted.js";
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

/** The element arm, as `render-lines` ran it for every block before C09 I72: a sentinel row below, then split. */
function throughInk(element: Parameters<typeof renderToString>[0], width: number): readonly string[] {
  const painted = renderToString(
    createElement(Box, { flexDirection: "column" }, element, createElement(Text, { key: "sentinel" }, ".")),
    { columns: width },
  );
  const lines = painted.split("\n");
  return lines.slice(0, Math.max(0, lines.length - 1)); // cells-ok — rows, not columns
}

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
  it("T2.143 (C09 I72): over the corpus × seven widths × three capability sets the rows arm equals the block rendered through Ink byte for byte, a mixed sequence with gaps, a floor and a cap equals the whole sequence through Ink, and the probe reads rows or react for a block, never both", () => {
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
    let elementArm = 0;
    // **Keys must not collide**, or one capture stands for two blocks and the
    // one it does not match is never compared.
    expect(new Set(blocks.map(keyOf)).size, "every block has its own key").toBe(blocks.length);
    for (const b of blocks) {
      for (const width of WIDTHS) {
        for (const [capsName, capabilities] of NAMED_CAPS) {
          const ctx: RenderContextInput = { width, theme: DARK_THEME, capabilities, focus: null, tick: 0 };
          const expected = oracle.rows(oracleName(`t2143-${keyOf(b)}`, capsName, width), () =>
            throughInk(elementOf(r.render(b, ctx)), width),
          );
          const { probe, names } = recording();
          const got = renderToLines(r, b, width, { theme: DARK_THEME, capabilities, probe });
          expect(got, `${b.kind} at ${String(width)}`).toEqual(expected);
          const arms = names.filter((n) => n === "rows" || n === "react");
          expect(arms, `${b.kind} at ${String(width)} opened ${names.join(",")}`).toHaveLength(1);
          if (arms[0] === "rows") rowsArm += 1;
          else elementArm += 1;
        }
      }
    }
    // Both arms were exercised — a corpus that took one arm alone would prove
    // nothing about the seam between them.
    expect(rowsArm).toBeGreaterThan(200);
    // **No kind this component ships answers an element** since I73 reached
    // `mosaic`. Asserted as a count of zero rather than as a count naming the
    // kind that takes the arm: the previous form was `mosaics × widths × caps`,
    // which is exactly the shape that goes stale silently the day that kind
    // moves — it would have passed a mosaic that had stopped rendering as
    // readily as one that had moved. T3.89 keeps the fallback honest with a
    // registered test kind, which is the only constructor left for it.
    expect(blocks.some((b) => b.kind === "mosaic"), "the corpus still holds a mosaic").toBe(true);
    expect(elementArm, "no corpus block reaches the element arm").toBe(0);

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
      { ...ONE_PER_KIND.logs, gapBefore: true } as Block,
      { ...ONE_PER_KIND.rule, minHeight: 4 } as unknown as Block,
      { ...ONE_PER_KIND.panel, gapBefore: true } as Block,
      { ...ONE_PER_KIND.logs, id: "capped", lines } as Block,
      { ...ONE_PER_KIND.table, gapBefore: true } as Block,
      ONE_PER_KIND.code,
      { ...ONE_PER_KIND.group, gapBefore: true } as Block,
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
        children: [notice("g-col-a", "first"), { ...raw("g-col-b", "two lines\nof text"), gapBefore: true }, rule("g-col-c")] }),
      B({ kind: "group", id: "g-row2", direction: "row", flex: [1, 1], children: [raw("g-row2-a", "left\nside"), notice("g-row2-b", "right")] }),
      B({ kind: "group", id: "g-row3", direction: "row", flex: [2, 1, 1], align: ["top-left", "middle-right", "bottom-centre"],
        children: [raw("g-row3-a", "tall\ntall\ntall"), rule("g-row3-b"), notice("g-row3-c", "c")] }),
      B({ kind: "group", id: "g-short", direction: "row", flex: [1, 1], children: [B({ kind: "short", id: "sh" }), raw("g-short-b", "a\nb\nc")] }),
      B({ kind: "group", id: "g-dangle", direction: "row", flex: [1, 1], children: [B({ kind: "dangling", id: "dg" }), notice("g-dangle-b", "after")] }),
      B({ kind: "group", id: "g-solid", direction: "row", flex: [1, 1], children: [B({ kind: "solid", id: "s1" }), B({ kind: "solid", id: "s2" })] }),
      B({ kind: "panel", id: "p-title", title: "Summary", footer: "3 items", children: [raw("p-title-a", "two lines\nof text"), { ...notice("p-title-b", "n"), gapBefore: true }] }),
      B({ kind: "panel", id: "p-live", title: "Live", live: true, children: [notice("p-live-a", "beating")] }),
      B({ kind: "panel", id: "p-empty", title: "", children: [] }),
      B({ kind: "panel", id: "p-tall", title: "Tall", children: [B({ kind: "tall", id: "tl" })] }),
      B({ kind: "scroll", id: "sc-residue", height: 2, children: [raw("sc-r-a", "one"), raw("sc-r-b", "two"), raw("sc-r-c", "three")] }),
      B({ kind: "scroll", id: "sc-pads", height: 6, children: [raw("sc-p-a", "one"), raw("sc-p-b", "two")] }),
      B({ kind: "scroll", id: "sc-off", height: 2, children: [raw("sc-o-a", "one"), raw("sc-o-b", "two"), raw("sc-o-c", "three"), raw("sc-o-d", "four")] }),
      B({ ...(ONE_PER_KIND.table as unknown as Record<string, unknown>), id: "t-detail",
        rows: ((ONE_PER_KIND.table as unknown as { rows: readonly Record<string, unknown>[] }).rows).map((row, i) =>
          i === 0 ? { ...row, expanded: true, detail: [notice("t-d-a", "detail"), { ...raw("t-d-b", "more"), gapBefore: true }] } : row) }),
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
          const ctx: RenderContextInput = {
            width, theme: DARK_THEME, capabilities, focus: null, tick: 0, scrollOffsets,
            ...(b.id === "img-place" ? { placementScope: "e1" } : {}),
          };
          const expected = oracle.rows(oracleName(`t2144-${keyOf(b)}`, capsName, width), () =>
            throughInk(elementOf(r.render(twin(b), ctx)), width),
          );
          const { probe, names } = recording();
          const got = renderToLines(r, b, width, {
            theme: DARK_THEME, capabilities, probe, scrollOffsets,
            ...(b.id === "img-place" ? { placementScope: "e1" } : {}),
          } as never);
          expect(got, `${b.id} at ${String(width)}`).toEqual(expected);
          expect(names.filter((n) => n === "rows"), `${b.id} at ${String(width)} took the rows arm`).toHaveLength(1);
          expect(names.filter((n) => n === "react"), `${b.id} at ${String(width)} never opened react`).toHaveLength(0);
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
        const ctx: RenderContextInput = { width, theme: DARK_THEME, capabilities, focus: null, tick: 0 };
        const expected = oracle.rows(oracleName(`t2147-${keyOf(block)}`, capsName, width), () =>
          // **`twin` and not the block itself.** Mosaic answers rows now, so
          // `elementOf(r.render(block))` would lift the arm's own answer and
          // compare it with itself — a comparison that cannot fail. `twin`
          // lifts the leaves, which sends the container down its element path,
          // and that path is Ink's independent layout.
          throughInk(elementOf(r.render(twin(block), ctx)), width),
        );
        const { probe, names } = recording();
        const got = renderToLines(r, block, width, { theme: DARK_THEME, capabilities, probe });
        expect(got, `the clipped mosaic at ${String(width)}`).toEqual(expected);
        expect(names.filter((n) => n === "react"), "the mosaic takes the rows arm").toHaveLength(0);
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
      const ctx: RenderContextInput = { width, theme: DARK_THEME, capabilities: FULL_CAPS, focus: null, tick: 0 };
      const expected = oracle.rows(oracleName(`t2147-${keyOf(floored)}`, "full", width), () =>
        throughInk(elementOf(r.render(twin(floored), ctx)), width),
      );
      const got = renderToLines(r, floored, width, { theme: DARK_THEME, capabilities: FULL_CAPS });
      expect(got, `the floored mosaic at ${String(width)}`).toEqual(expected);
      expect(got, "one blank row, not none").toEqual([""]);
    }
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
