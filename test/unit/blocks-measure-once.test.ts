// C09 I61, I62 — the registry answers a `(block, width)` once per call it is
// asked to make, and the cap's two measures are two questions.
//
// **Every row here counts, because no height can tell the two apart.** `measure`
// is pure (C09 I2), so a child measured three times in one frame gives the same
// number three times and every assertion about a row count passes either way.
// `make profile`'s node table is what separated them — `pills#chrome.header.left`
// at 3.0 calls per frame and `pills#chrome.footer.left` at 4.0 (F940) — and a
// count is the only assertion that can watch the fix rather than the frame.
//
// **The counted kind is `raw`, registered over an empty registry.** A counting
// definition under a kind `block()` knows lets the fixtures go through C04's
// constructor like every other row's, and the registry resolves it exactly as
// it resolves the shipped one. `defaults: false` is what makes the count this
// file's own: nothing else in the registry can reach the definition.
import { Box, Text } from "ink";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { block } from "../../src/data/viewmodel/index.js";
import type { Block, Group, MeasureFn } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import type { BlockDefinition, BlockFault, BlockRegistry, RenderContext } from "../../src/presentation/blocks/index.js";
import {
  groupDefinition,
  mosaicDefinition,
  panelDefinition,
  scrollDefinition,
} from "../../src/presentation/blocks/kinds/containers.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { DARK_THEME, FULL_CAPS, LOUD } from "../support/render.js";

const OPTIONS = { theme: DARK_THEME, capabilities: FULL_CAPS } as const;

type Tally = Readonly<{
  definition: BlockDefinition;
  /** Every `definition.measure` call, by block id, in order. */
  measured: string[];
  /** The width each of those calls was asked at. */
  widths: number[];
  /** Every `definition.render` call, by block id, in order. */
  rendered: string[];
  /** Every `definition.window` call, by block id — only when `windowed` is asked for. */
  windowed: string[];
}>;

function linesOf(b: Block): readonly string[] {
  return ("text" in b && typeof b.text === "string" ? b.text : "").split("\n");
}

/**
 * A `raw` that counts. Its height is its line count and its render draws exactly
 * those lines, so C09 I1 holds by construction and the count is the only thing
 * a row can learn from it.
 *
 * `narrow` answers a content width of five, so a centred child is rendered
 * narrower than its cell (C04 I101) — the one way a container asks the same
 * block at two widths inside one call (T3.81). `windowed` gives it a `window`
 * so the cap has a form to take (T3.83).
 */
function tally(opts: Readonly<{ narrow?: boolean; windowed?: boolean }> = {}): Tally {
  const measured: string[] = [];
  const widths: number[] = [];
  const rendered: string[] = [];
  const windowed: string[] = [];
  const definition: BlockDefinition = {
    kind: "raw",
    measure: (b, width) => {
      measured.push(b.id);
      widths.push(width);
      return linesOf(b).length; // cells-ok — a row count, not a width
    },
    render: (b) => {
      rendered.push(b.id);
      return createElement(
        Box,
        { flexDirection: "column" },
        ...linesOf(b).map((line, i) => createElement(Text, { key: String(i) }, line)),
      );
    },
    ...(opts.narrow === true ? { width: (_b: Block, w: number) => Math.min(w, 5) } : {}),
    ...(opts.windowed === true
      ? {
          window: (b: Block, _w: number, from: number, to: number) => {
            windowed.push(b.id);
            return {
              block: { ...b, text: linesOf(b).slice(from, to).join("\n") } as Block,
              skipRows: 0,
              dropRows: 0,
            };
          },
        }
      : {}),
  };
  return { definition, measured, widths, rendered, windowed };
}

/** The four containers over the counting `raw`, and nothing else. */
function containers(
  counted: Tally,
  onError: (fault: BlockFault) => void = LOUD,
  maxBlockRows?: number,
  ...more: readonly BlockDefinition[]
): BlockRegistry {
  const r = createBlockRegistry(maxBlockRows === undefined ? { defaults: false, onError } : { defaults: false, onError, maxBlockRows });
  for (const d of [groupDefinition, panelDefinition, scrollDefinition, mosaicDefinition]) {
    r.register(d as unknown as BlockDefinition);
  }
  r.register(counted.definition);
  for (const d of more) r.register(d);
  return r;
}

const one = (id: string): Block => block({ kind: "raw", id, text: `${id} one` });
const two = (id: string): Block => block({ kind: "raw", id, text: `${id} one\n${id} two` });

/** A measurer that throws, under a kind of its own — the fault path's subject. */
function booming(): BlockDefinition {
  return {
    kind: "boom",
    measure: () => {
      throw new Error("boom measures nothing");
    },
    render: () => createElement(Text, {}, "never drawn"),
  };
}
const boom = (id: string): Block => ({ kind: "boom", id }) as unknown as Block;

describe("C09 §6 — a (block, width) is answered once per registry call (I61)", () => {
  it("T1.32 (C09 I61): a row group rendered through the registry measures each child once and renders it once", () => {
    const counted = tally();
    const registry = containers(counted);
    const group = block({ kind: "group", id: "g", direction: "row", children: [one("a"), two("b")] });

    const lines = renderToLines(registry, group, 80, OPTIONS);

    // **The frame is right either way — the count is the row.** Two children,
    // the taller of two rows, and the same picture whether each child was
    // measured once or four times.
    expect(lines, "the row is its tallest child").toHaveLength(2);
    expect(counted.rendered, "each child drawn once").toEqual(["a", "b"]);
    expect(counted.measured, "each child's measure ran once for the whole render").toEqual(["a", "b"]);

    // **The kind alone asks twice, so the once is the registry's.** Called
    // directly with a counting seam, `group` measures its children in `measure`
    // and again in `render`'s placements (C04 I103) — the shape `make profile`
    // read as 3.0 per frame. This is the control that the fixture responds to
    // the thing under test: the count moves when the seam does not dedupe.
    const asked: string[] = [];
    const counting: MeasureFn = (child) => {
      asked.push(child.id);
      return 1;
    };
    const ctx: RenderContext = {
      width: 80,
      theme: DARK_THEME,
      capabilities: FULL_CAPS,
      focus: null,
      tick: 0,
      measureChild: counting,
      widthChild: (_child, w) => w,
      renderChild: () => createElement(Text, {}, "x"),
      windowChild: () => null,
    };
    groupDefinition.measure(group as Group, 80, counting);
    groupDefinition.render(group as Group, ctx);
    expect(asked, "the kind asks in `measure` and again in `render`").toEqual(["a", "b", "a", "b"]);
  });

  it("T1.33 (C09 I61): every container kind measures each child once per render — panel, group in both directions, scroll, mosaic", () => {
    const cases: readonly Readonly<{
      kind: string;
      make: () => Block;
      children: readonly string[];
      drawn?: readonly string[];
      overdraws?: true;
    }>[] = [
      {
        kind: "panel",
        make: () => block({ kind: "panel", id: "p", title: "t", children: [one("a"), two("b")] }),
        children: ["a", "b"],
      },
      {
        kind: "group/row",
        make: () => block({ kind: "group", id: "gr", direction: "row", children: [one("a"), two("b")] }),
        children: ["a", "b"],
      },
      {
        kind: "group/column",
        make: () =>
          block({
            kind: "group",
            id: "gc",
            direction: "column",
            children: [one("a"), { ...two("b"), gapBefore: true } as Block],
          }),
        children: ["a", "b"],
      },
      {
        // Content taller than the box, so the residue row and the slice path are
        // both exercised: `render` asks for the content height, the ranges and
        // the drawn total, and every one is the same question of the same child.
        kind: "scroll",
        make: () => block({ kind: "scroll", id: "s", height: 2, children: [one("a"), two("b"), one("c")] }),
        children: ["a", "b", "c"],
        // Two rows hold `a` and the top of `b`; `c` is below the box and is
        // measured for the content height without being drawn. `raw` here
        // declares no `window`, so `b` is kept whole and the box over-draws by
        // one row — I59's recorded overrun (T3.76, F855), a property of this
        // fixture and not of the count, so I1 is not asserted for it.
        drawn: ["a", "b"],
        overdraws: true,
      },
      {
        // `mosaic` measures no child in `measure` (C04 I71) — its arm is the
        // control that a once is not a zero.
        kind: "mosaic",
        make: () => block({ kind: "mosaic", id: "m", height: 3, areas: "AB", children: [one("a"), two("b")] }),
        children: ["a", "b"],
      },
    ];

    for (const c of cases) {
      const counted = tally();
      const registry = containers(counted);
      const container = c.make();
      const lines = renderToLines(registry, container, 80, OPTIONS);
      // The counts first: `registry.measure` below is a second call, and a
      // second call measures again — that is T1.35's row, not this one's.
      expect([...counted.measured].sort(), `${c.kind}: each child measured once for the render`).toEqual([...c.children]);
      expect([...counted.rendered].sort(), `${c.kind}: and each child in the box drawn once`).toEqual([...(c.drawn ?? c.children)]);
      if (c.overdraws !== true) {
        expect(lines.length, `${c.kind}: measure equals rendered rows (C09 I1)`).toBe(registry.measure(container, 80));
      }
    }
  });

  it("T1.34 (C09 I61): the element walk measures a column group's children once, not once per placement and once per row cursor", () => {
    const counted = tally();
    const registry = containers(counted);
    const group = block({ kind: "group", id: "g", direction: "column", children: [one("a"), two("b"), one("c")] });

    // `raw` declares no elements, so the walk's only work here is placing the
    // children — `groupPlacements` measures each of them and the row cursor
    // measured each of them again (C26 §5, C04 I103).
    expect(registry.elementsIn([group], 80)).toEqual([]);
    expect(counted.measured, "placed once, and the cursor read the same answer").toEqual(["a", "b", "c"]);
  });

  it("T1.35 (C09 I61): the answer lives for one call and is never a fault — two calls are two measures, and a throwing child is asked again", () => {
    const counted = tally();
    const registry = containers(counted);
    const group = block({ kind: "group", id: "g", direction: "row", children: [one("a"), two("b")] });

    // **Two public calls are two scopes.** A memo that outlived the call would
    // be the cache across `measure` and `render` F914 refused: it would serve a
    // height for a block object that a later document might carry mutated, and
    // no row about a single call could see it.
    registry.measure(group, 80);
    registry.measure(group, 80);
    expect(counted.measured, "each call measures every child afresh").toEqual(["a", "b", "a", "b"]);

    // **A fault is not an answer.** The render-time ask is the one that carries
    // the fitted request (C09 I34) — `#measured` with capabilities in hand — so
    // an answer recorded from the parent's measure-time ask, which has none,
    // would leave every report at `rows: 0` and the box never re-fitted.
    const faults: BlockFault[] = [];
    const loud = containers(tally(), (f) => void faults.push(f), undefined, booming());
    const mixed = { kind: "group", id: "gx", direction: "row", children: [one("a"), boom("x")] } as unknown as Block;
    const lines = renderToLines(loud, mixed, 80, OPTIONS);
    const reports = faults.filter((f) => f.id === "x" && f.member === "measure");
    expect(reports.length, "the throwing child is asked more than once, because a throw is not an answer").toBeGreaterThan(1);
    expect(
      reports.some((f) => f.rows > 0),
      "and the render-time ask still reports the rows its box needs",
    ).toBe(true);
    expect(lines.join("\n"), "the error block is drawn (I11)").toContain("boom failed to measure");
  });
});

describe("C09 §6 — the answer's bounds (I61)", () => {
  it("T3.80 (C09 I61): a throw escaping the outermost call leaves no answer behind — the next call measures afresh", () => {
    // **What the throw leaves behind.** A loud sink turns a contained fault into
    // a throw that escapes the registry, and the memo opened for that call must
    // close with it: a scope that survived would serve `a`'s height to the next
    // call from a document the caller may have replaced in between.
    const counted = tally();
    const registry = containers(counted, LOUD, undefined, booming());
    const group = { kind: "group", id: "g", direction: "column", children: [one("a"), boom("x")] } as unknown as Block;

    expect(() => renderToLines(registry, group, 80, OPTIONS)).toThrow();
    expect(counted.measured, "`a` was measured inside the call that threw").toEqual(["a"]);

    // The column gave `a` the group's own width, so this asks the same
    // `(block, width)` the aborted call answered — a stale scope would hit.
    expect(registry.measure(one("a"), 80)).toBe(1);
    expect(registry.measure(group.kind === "group" ? (group as Group).children[0] as Block : group, 80)).toBe(1);
    expect(counted.measured, "and is measured again by the call after it").toEqual(["a", "a", "a"]);
  });

  it("T3.81 (C09 I61): the answer is to (block, width), so a child asked at two widths in one call is measured at both", () => {
    // A centred child is measured at its cell and rendered at its content width
    // (C04 I101, C09 I43). One slot per block, validated on the width: the
    // second ask is a different question and gets a fresh measure, never the
    // cell's answer under a narrower width.
    const counted = tally({ narrow: true });
    const registry = containers(counted);
    const group = block({
      kind: "group",
      id: "g",
      direction: "row",
      children: [two("a"), one("b")],
      align: ["centre", "left"],
    });

    const lines = renderToLines(registry, group, 80, OPTIONS);
    expect(lines).toHaveLength(2);
    const asks = counted.measured.map((id, i) => `${id}@${String(counted.widths[i])}`);
    expect(asks.filter((s) => s.startsWith("a@")), "the cell's width and then the content's").toEqual(["a@39", "a@5"]);
    expect(asks.filter((s) => s.startsWith("b@")), "an unaligned child is one question").toEqual(["b@39"]);
  });

  it("T3.82 (C09 I61): the answer is keyed by the block's identity, never by its id", () => {
    // Two distinct blocks sharing an id are two questions with two answers; the
    // same block twice is one. A memo keyed on `id` gives the second child the
    // first's height and the group a row count the frame contradicts (I1).
    const counted = tally();
    const registry = containers(counted);
    const first = block({ kind: "raw", id: "same", text: "one" });
    const second = block({ kind: "raw", id: "same", text: "one\ntwo\nthree" });

    const distinct = { kind: "group", id: "g", direction: "column", children: [first, second] } as unknown as Block;
    expect(registry.measure(distinct, 80), "1 + 3, each its own").toBe(4);
    expect(counted.measured).toEqual(["same", "same"]);

    counted.measured.length = 0;
    const twice = { kind: "group", id: "g2", direction: "column", children: [second, second] } as unknown as Block;
    expect(registry.measure(twice, 80), "3 + 3, one answer read twice").toBe(6);
    expect(counted.measured, "one object is one question").toEqual(["same"]);
  });
});

describe("C09 §2b — the cap asks two questions of two blocks (I62)", () => {
  it("T3.83 (C09 I62): the window is measured only when the whole block exceeds the cap, and the marker names both answers", () => {
    const counted = tally({ windowed: true });
    const registry = containers(counted, LOUD, 3);

    // Within the cap: the block's own measure decides, and no window is built.
    const within = block({ kind: "raw", id: "w", text: "1\n2\n3" });
    expect(registry.measure(within, 80)).toBe(3);
    expect(counted.windowed, "a block within the cap has no capped form").toEqual([]);
    expect(renderToLines(registry, within, 80, OPTIONS)).toHaveLength(3);
    expect(counted.windowed, "and rendering it builds none either").toEqual([]);

    // Over it: `total` is the block's rows, `shown` the window's, and the marker
    // carries both — two numbers from two blocks, which is why both are measured.
    const over = block({ kind: "raw", id: "o", text: "1\n2\n3\n4\n5" });
    expect(registry.measure(over, 80), "shown + the marker").toBe(4);
    expect(counted.windowed, "one window per ask, at the cap").toEqual(["o"]);
    const lines = renderToLines(registry, over, 80, OPTIONS);
    expect(lines).toHaveLength(4);
    expect(lines[3]?.replace(/\[[0-9;]*m/g, ""), "the marker names the shown rows and the total").toMatch(/3 of 5 rows/);
  });
});
