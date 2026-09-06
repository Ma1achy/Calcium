// C26 §5 — the one 2-D `elements` implementer, and the sweep run over it.
//
// **`mosaic` is the only kind whose `cols` are not `0..width`.** `table` and
// `scroll` declare full-width rows and `pills` declares chips on a row, so every
// generic predicate had met a geometry with one free axis; a mosaic cell has
// two, and two cells can share a row without sharing a column. That is the case
// per-level disjointness was written for and never had a subject for — a
// fabrication in `block-elements.test.ts` collapses rows, and a collapse of
// *columns* had nothing to run against.
//
// **Containment is not correctness**, so the exact row asserts the numbers. A
// 2 × 2 at width 40 and height 6 has one answer, and an implementation that
// handed every child `cols: 0..width` would pass containment, order and
// stability and be wrong about which child a pointer lands on.
import { describe, expect, it } from "vitest";

import { checkElements, formatElementReport } from "../../src/testing/navigation-conformance.js";
import type { NavigableRegistry } from "../../src/testing/navigation-conformance.js";
import { measurable } from "../support/render.js";
import { block, parseAreas } from "../../src/data/viewmodel/index.js";
import { validateDocument } from "../../src/data/viewmodel/validate.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import type { NavElement } from "../../src/presentation/blocks/index.js";
import { b } from "../../src/shell/builders/index.js";

const raw = (id: string, text: string): Block => block({ kind: "raw", id, text });

/** The 2 × 2, whose rectangles a reader can compute by hand. */
const QUAD = block({
  kind: "mosaic",
  id: "quad",
  height: 6,
  areas: "AB/CD",
  children: [raw("a", "alpha"), raw("b", "beta"), raw("c", "gamma"), raw("d", "delta")],
});

const MOSAIC_CORPUS: readonly Block[] = Object.freeze([
  QUAD,
  // The pinwheel — the figure nested groups cannot draw (C04 §3f) — so a
  // spanning region meets every predicate.
  block({
    kind: "mosaic",
    id: "pinwheel",
    height: 6,
    areas: "AAB/DEB/DCC",
    children: ["a", "b", "c", "d", "e"].map((n) => raw(n, n)),
  }),
  // A hole: a cell named by no child, so the elements do not tile the block.
  block({ kind: "mosaic", id: "holed", height: 4, areas: "A.B", children: [raw("l", "left"), raw("r", "right")] }),
  // Weighted columns, and a height that does not divide evenly.
  block({
    kind: "mosaic",
    id: "weighted",
    height: 7,
    areas: "AB/AC",
    columns: [1, 3],
    rows: [2, 1],
    children: [raw("side", "side"), raw("top", "top"), raw("bottom", "bottom")],
  }),
]);

/** `mosaic` is one of C09's defaults, so no definition is passed. */
const nav = (): NavigableRegistry => measurable().registry as unknown as NavigableRegistry;

/** A registry whose `elementsOf` is bent, to prove the sweep can see it. */
function bent(mutate: (e: readonly NavElement[], width: number) => readonly NavElement[]): NavigableRegistry {
  const real = nav();
  return {
    measure: (blk, w) => real.measure(blk, w),
    get: (k) => real.get(k),
    elementsOf: (blk, w) => mutate(real.elementsOf(blk, w), w),
  };
}

const kinds = (r: ReturnType<typeof checkElements>): readonly string[] => [
  ...new Set(r.failures.map((f) => f.predicate)),
];

describe("C26 §5 — mosaic under the conformance sweep", () => {
  it("T2.27 (C26 I4, I5, I6): the mosaic corpus is clean, and it is a corpus", () => {
    const report = checkElements(nav(), MOSAIC_CORPUS);
    expect(report.failures, formatElementReport(report)).toEqual([]);
    // Four blocks, fourteen children, four widths.
    expect(report.checked, "elements were actually walked").toBeGreaterThan(40);
    expect(report.kinds, "the kind under test is the one covered").toContain("mosaic");
  });

  it("T2.28 (C04 I72, C26 I4): a 2 × 2 at width 40 — each element's rows and cols, as numbers", () => {
    // Two equal shares of 40 are 20 and 20; two of 6 are 3 and 3. Region order
    // is first appearance in a row-major scan, which is reading order.
    const es = nav().elementsOf(QUAD, 40);
    expect(es.map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
    expect(es.map((e) => e.level)).toEqual(["block", "block", "block", "block"]);
    expect(es.map((e) => [e.rows.from, e.rows.to])).toEqual([[0, 3], [0, 3], [3, 6], [3, 6]]);
    expect(es.map((e) => [e.cols.from, e.cols.to])).toEqual([[0, 20], [20, 40], [0, 20], [20, 40]]);
    // The copy is the child's source (C26 I17), not the cell's painted text.
    expect(es.map((e) => e.copy)).toEqual(["alpha", "beta", "gamma", "delta"]);

    // **The frame agrees with the numbers**: at width 40 the right-hand column
    // starts where `b`'s element says it does.
    const lines = measurable().renderToLines(QUAD, 40).map((l) => l.replace(/\x1b\[[0-9;]*m/gu, ""));
    expect(lines).toHaveLength(6);
    expect(lines[0]?.indexOf("beta"), "beta is drawn in the right-hand cell").toBe(20);
    expect(lines[3]?.indexOf("delta"), "delta below it").toBe(20);
  });

  it("T2.29 (C04 I71): a grid that does not parse is refused at both gates, and `elements` agrees with `render`", () => {
    // **Measured, not assumed**: the `[]` arm is unreachable from a validated
    // document and from `b.mosaic`, because both refuse the string first. It is
    // reachable through `block()`, which checks the literal's shape and not the
    // grid — so the arm's job is consistency with `render`, which draws an empty
    // box of the declared height for the same fault rather than throwing. No
    // cells drawn, no elements declared; a throw here would cost the entry an
    // error box for a fault two gates already named.
    const split = { kind: "mosaic", id: "split", height: 4, areas: "ABA", children: [raw("a", "a"), raw("b", "b")] };
    expect(parseAreas("ABA").ok, "the control — this string does not parse").toBe(false);

    const validated = validateDocument({
      schema: "tui.view/1", id: "d", command: "x", status: "ok", meta: {}, blocks: [split],
    } as never);
    expect(validated.ok, "the validator refuses it").toBe(false);
    expect(() => b.mosaic({ height: 4, areas: "ABA", children: [b.raw("a"), b.raw("b")] }), "the builder refuses it")
      .toThrow(/not a rectangle/u);

    const unparsable = block(split as never);
    expect(nav().elementsOf(unparsable, 40), "no elements").toEqual([]);
    expect(measurable().renderToLines(unparsable, 40), "and an empty box of the declared height").toHaveLength(4);
  });

  it("T2.30: a fabricated violation of each 2-D predicate fails its own", () => {
    // 1 — every child full-width: two cells on one row now share every column,
    // which is the collapse `table` could never produce.
    const fullWidth = checkElements(
      bent((es, w) => es.map((e) => ({ ...e, cols: { from: 0, to: w } }))),
      MOSAIC_CORPUS,
    );
    expect(kinds(fullWidth), formatElementReport(fullWidth)).toContain("disjoint");

    // 2 — two children's rectangles swapped: the list no longer reads row-major.
    const swapped = checkElements(
      bent((es) => {
        const [first, second, ...rest] = es;
        if (first === undefined || second === undefined) return es;
        return [
          { ...first, rows: second.rows, cols: second.cols },
          { ...second, rows: first.rows, cols: first.cols },
          ...rest,
        ];
      }),
      MOSAIC_CORPUS,
    );
    expect(kinds(swapped), formatElementReport(swapped)).toContain("order");
  });
});
