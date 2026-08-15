// C04 §3c — the scroll container, at the three cells the walk said would be got
// wrong.
//
// **Every row here is one of the walk's, and the shapes were chosen before the
// code existed.** Cell 1 asserts a composition rather than a result; trace 4
// needs a fabricated resize or it agrees with the defect; cell 5 is a refusal at
// parse. Rows that only checked what the box draws at one width would pass
// against three different wrong implementations.
import { describe, expect, it } from "vitest";

import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { scrollDefinition } from "../../src/presentation/blocks/kinds/containers.js";
import { validateDocument } from "../../src/data/viewmodel/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import type { Block, Scroll } from "../../src/data/viewmodel/index.js";

const registry = createBlockRegistry({ defaults: true });
const measureChild = (block: Block, width: number): number => registry.measure(block, width);

/**
 * A child that is one row at every width, so the arithmetic below is about the
 * container and never about wrapping.
 */
const flat = (id: string): Block => ({ kind: "raw", id, text: id });

/**
 * A child whose height depends on the width — three rows narrow, one row wide.
 *
 * **The fixture trace 4 needs, and it took two tries.** `raw` is one row per
 * line at every width, so a corpus of `raw` children cannot move an element's
 * rows by resizing and a row built on one passes for an offset stored as an
 * element index. The first replacement was `logs`, which **also** measured 1 at
 * both widths — it truncates rather than wrapping — and the guard assertion
 * below is what said so rather than the row failing somewhere subtler. `notice`
 * is the one that wraps (`wrapCells`, `kinds/simple.ts`).
 *
 * Fourth instance of *a fixture must be shown to respond to the thing under test
 * before it is asserted against* in this session, and the first where the guard
 * had been written in advance and did the catching.
 */
const wrapping = (id: string, text: string): Block => ({
  kind: "notice",
  id,
  tone: "info",
  text,
});

const scroll = (height: number, children: readonly Block[], id = "s"): Scroll =>
  ({ kind: "scroll", id, height, children }) as Scroll;

describe("C04 §3c cell 1 — the composition, not the result", () => {
  it("T2.20 (C04 I47): the box measures its declared height plus the residue row, at every offset", () => {
    // **The composition asserted.** The natural implementation adds the
    // transcript's window offset to the container's own, and is wrong by exactly
    // the offset — a difference that vanishes wherever both are zero, which is
    // every fixture that does not scroll. So the assertion is that the box's
    // size is a function of `(block, width)` **alone**: rendering it at three
    // offsets must not move `measure`, and if the two were ever added, one of
    // the three would differ.
    const block = scroll(2, [flat("a"), flat("b"), flat("c"), flat("d")]);
    const heights = [0, 1, 2].map(() => scrollDefinition.measure?.(block, 40, measureChild));

    expect(new Set(heights).size, "one height across every offset").toBe(1);
    expect(heights[0], "two rows of content and one of residue").toBe(3);
  });

  it("T2.21 (C04 §3c cell 1): the container declares no `window`, so the transcript keeps it whole", () => {
    // **The other half of the composition, and the one the build discovered.**
    // `window` must return a block that *measures the slice*; a declared height
    // cannot. Declaring one is how the two windows would come to be added, so
    // the absence is the mechanism rather than an omission — and a row that
    // asserted rendered output instead would pass for a `window` that happened
    // to return the whole block.
    expect(scrollDefinition.window, "no window seam, by C09's conformance sweep").toBeUndefined();
    expect(scrollDefinition.elements, "and an element list, which is the half it does have")
      .toBeTypeOf("function");
  });
});

describe("C04 §3c — the residue row, and the two rows the mutation pass asked for", () => {
  it("T2.25 (C04 I49): a container whose content fits draws no residue row", () => {
    // **The mutation pass wrote this row.** *The marker drawn unconditionally*
    // survived, because every scroll fixture in the tree overflows — the golden
    // corpus's holds three children in a box of two — and an unconditional
    // marker is invisible against all of them. **The fixture is a short child**,
    // and nothing had one.
    const fits = scroll(4, [flat("a"), flat("b")]);
    const spills = scroll(1, [flat("a"), flat("b")]);

    expect(scrollDefinition.measure?.(fits, 40, measureChild), "no row spent").toBe(4);
    expect(scrollDefinition.measure?.(spills, 40, measureChild), "one row spent").toBe(2);
  });

  it("T2.26 (C04 I47, §3c cell 8): the element list holds every child, including the hidden ones", () => {
    // **The other survivor.** *The element list stops at the box's height*
    // passed T2.22, whose fixture happens not to overflow — so the row that
    // proves elements are content-scoped needs a container that spills, and the
    // trace-4 row was measuring something else.
    //
    // This is C26 I4's exception asserted rather than described: a child at
    // content row 3 of a box of one is outside `[0, measure)` and is still an
    // element, because clipping the list would make it depend on view state.
    const block = scroll(1, [flat("a"), flat("b"), flat("c"), flat("d")]);
    const elements = scrollDefinition.elements?.(block, 40, measureChild) ?? [];

    expect(elements.map((e) => e.id), "all four, not the one that fits").toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(
      elements[3]?.rows.from,
      "and the last one is addressed outside the box, which is the exception",
    ).toBeGreaterThan(scrollDefinition.measure?.(block, 40, measureChild) ?? 0);
  });
});

describe("C04 §3c trace 4 — the offset is rows, and only a resize can tell", () => {
  it("T2.22 (C04 I48): a child's element rows move with the width, so an index would not survive one", () => {
    // **A fabricated resize, because nothing else can see it.** An offset stored
    // as an element index agrees with every assertion taken at one width: the
    // reader is on the same child, the same rows are visible, every number
    // matches. It parts company only when the children change height.
    //
    // The row asserts the property that makes rows and indices differ — that a
    // child's row range is width-dependent — and then that the container's own
    // arithmetic is in that same space. Without the first half the second is a
    // tautology.
    const long = "wide enough to need two lines once the terminal is narrow indeed";
    const block = scroll(4, [wrapping("w", long), flat("tail")]);

    const wide = scrollDefinition.elements?.(block, 120, measureChild) ?? [];
    const narrow = scrollDefinition.elements?.(block, 24, measureChild) ?? [];

    expect(wide.length, "the same two children at both widths").toBe(2);
    expect(narrow.length).toBe(2);

    // The fixture responds to the thing under test before anything is asserted
    // against it (`test/support/README.md`).
    expect(
      narrow[0]?.rows.to,
      "the first child is taller narrow — without this the row below proves nothing",
    ).toBeGreaterThan(wide[0]?.rows.to ?? 0);

    // **The consequence: the second child sits at a different row at each
    // width, while its index is 1 at both.** An offset that meant *element 1*
    // would put the reader at two different places in the content; an offset
    // that means *row N* keeps them where they were.
    expect(narrow[1]?.rows.from, "and it starts lower down").toBeGreaterThan(
      wide[1]?.rows.from ?? 0,
    );
    expect(
      wide[1]?.rows.from === narrow[1]?.rows.from,
      "the two are genuinely different, which is what an index cannot express",
    ).toBe(false);
  });
});

describe("C04 §3c — the frame, read", () => {
  const frame = (block: Scroll, width = 40): readonly string[] =>
    renderSequenceToLines(registry, [block], width, {
      theme: DARK_THEME,
      capabilities: FULL_CAPS,
      focus: null,
    }).map((line) => line.replace(/\u001b\[[0-9;]*m/gu, "").trimEnd());

  it("T2.27 (C04 I49, §3c): the rows outside the box are ABSENT, not blank", () => {
    // **The frame-read, as a row.** *Absent* and *unpainted* are the same frame
    // if the window is wrong in one direction and different in the other, so
    // this asserts the whole list rather than the presence of what should show:
    // a box that drew `c` as an empty row would satisfy every assertion about
    // `a` and `b`, and every assertion about `c` not being visible.
    //
    // **And it is what makes the harness live.** The mutation pass refused to
    // run without it: the control — every child drawn, the box unbounded —
    // cannot be caught by a suite that only reads `measure` and `elements`, and
    // a harness that cannot catch its control reports thoroughness it does not
    // have.
    const block = scroll(2, [flat("a"), flat("b"), flat("c"), flat("d")]);

    expect(frame(block), "two children and the residue, and nothing else at all").toEqual([
      "a",
      "b",
      "⋯ 0 above, 2 below",
    ]);
  });

  it("T2.28 (C04 I49): a container that hides nothing draws two rows and no marker", () => {
    // The control for the row above, in the frame rather than in `measure`.
    expect(frame(scroll(4, [flat("a"), flat("b")]))).toEqual(["a", "b"]);
  });
});

describe("C04 §3c cell 5 — refused at parse", () => {
  const docWith = (block: unknown): unknown => ({
    schema: "tui.view/1",
    command: "/x",
    status: "ok",
    blocks: [block],
    meta: {
      verb: "x",
      adapter: "t",
      exitCode: 0,
      durationMs: 0,
      truncated: false,
      argv: [],
      stderr: "",
      transport: "local",
      origin: "user",
    },
  });

  it("T2.23 (C04 I47): a container with no children is refused, not rendered empty", () => {
    // **Refused rather than corrected** — C15 I20's placement precedent. An
    // empty box is a scroll nobody can aim, and rendering it would be the
    // validator deciding what a document that cannot mean anything meant.
    const outcome = validateDocument(docWith({ kind: "scroll", id: "s", height: 3, children: [] }));

    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : outcome.error.join(" "), "and it says why").toMatch(
      /at least one child/u,
    );
  });

  it("T2.24 (C04 I47): a non-positive or fractional height is refused with it", () => {
    // Three forms, because a guard written as `height <= 0` passes the third and
    // a box of two and a half rows has no reading.
    for (const height of [0, -1, 2.5]) {
      const outcome = validateDocument(
        docWith({ kind: "scroll", id: "s", height, children: [flat("a")] }),
      );
      expect(outcome.ok, `height ${String(height)} must be refused`).toBe(false);
    }

    expect(
      validateDocument(docWith({ kind: "scroll", id: "s", height: 1, children: [flat("a")] })).ok,
      "and the smallest legal box is accepted, or the rows above pass for a validator that refuses everything",
    ).toBe(true);
  });
});
