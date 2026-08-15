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
import { tableDefinition } from "../../src/presentation/table/index.js";
import { applyPatch, descendants, validateDocument } from "../../src/data/viewmodel/index.js";
import { b } from "../../src/shell/builders/index.js";
import { liveParts } from "../../src/testing/live-parts.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import type { Block, Scroll, ViewDocument } from "../../src/data/viewmodel/index.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";

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
  const frame = (
    block: Scroll,
    width = 40,
    scrollOffsets: Readonly<Record<string, number>> = {},
  ): readonly string[] =>
    renderSequenceToLines(registry, [block], width, {
      theme: DARK_THEME,
      capabilities: FULL_CAPS,
      focus: null,
      scrollOffsets,
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

  it("T2.29 (C04 I48, §3c cell 4): an offset past the end is clamped at read, and the box stays full", () => {
    // **The mutation pass asked for this the day the store landed.** *The offset
    // used as given, without the clamp* survived while nothing could write one
    // out of range: `Math.trunc(0)` and a clamp of 0 are the same number, so the
    // arm was live code and an unreachable branch at once.
    //
    // The store floors at zero and deliberately does not ceiling — it knows no
    // width, so it cannot know the content's height — which makes *clamped at
    // read* the renderer's job and this row its only witness. Paging past the
    // end must leave the last screenful, not an empty box below the content.
    const block = scroll(2, [flat("a"), flat("b"), flat("c"), flat("d")]);

    expect(frame(block, 40, { s: 99 }), "the last two children, not nothing").toEqual([
      "c",
      "d",
      "⋯ 2 above, 0 below",
    ]);
  });

  it("T2.28 (C04 I49): a container that hides nothing draws two rows and no marker", () => {
    // The control for the row above, in the frame rather than in `measure`.
    expect(frame(scroll(4, [flat("a"), flat("b")]))).toEqual(["a", "b"]);
  });
});

describe("C04 §3c — the container is a tree, and the cap has to see it", () => {
  it("T2.30 (C13 I17, C04 I47): a scroll's children count against the session cap", () => {
    // **`descendants` enumerated `panel` and `group` and stopped**, so a
    // container of five hundred children counted one — the unenforceable-cap
    // sentence D40 states about `group`, arriving through the kind added after
    // it was written.
    //
    // `cap.ts` counts through this walk rather than a copy, and its comment
    // names the hazard as *a second copy would miss the next container kind*.
    // There was no second copy: the one walk lists kinds, so the defence was
    // against duplication and the failure was enumeration. The row asserts the
    // count rather than the walk, because a caller counting is what the cap
    // does.
    const block = scroll(2, [flat("a"), flat("b"), flat("c")]);

    expect([...descendants(block)].length, "three children, not zero").toBe(3);
  });
});

describe("C04 §3c — the class: every walk that asks which blocks hold blocks", () => {
  // **The instance was `descendants`; the class is that six walks enumerated the
  // container kinds independently and four of them never heard of `scroll`.**
  // None was a copy of any other, which is why the comment warning about a
  // second copy did not reach them. `tree.ts` is the one answer now, derived
  // from the union by the compiler.
  //
  // These rows are the four that were wrong, and each asserts an outcome a
  // caller can see rather than the walk — a test that called `hasChildren` would
  // pass on the day nothing else did.

  const meta = {
    verb: "x",
    adapter: "t",
    exitCode: 0,
    durationMs: 0,
    truncated: false,
    argv: [],
    stderr: "",
    transport: "local",
    origin: "user",
  } as const;

  const docOf = (blocks: readonly Block[]): ViewDocument =>
    ({ schema: "tui.view/1", command: "/x", status: "ok", blocks, meta }) as ViewDocument;

  it("T2.31 (C04 I14): `replace` reaches a block inside a scroll", () => {
    // **The defect answered `ok`** — `rewrite` returned the scroll untouched and
    // reported a change, which is the silent no-op `patch.ts` records against
    // `table` arriving a second time through the kind added after that fix.
    const doc = docOf([scroll(2, [flat("inner")])]);

    const outcome = applyPatch(doc, {
      op: "replace",
      blockId: "inner",
      block: { kind: "raw", id: "inner", text: "changed" },
    });

    expect(outcome.ok, outcome.ok ? "" : outcome.error.message).toBe(true);
    const inner = outcome.ok ? [...descendants(outcome.doc.blocks[0] as Block)][0] : undefined;
    expect(inner, "and the replacement is the block that is there now").toMatchObject({
      text: "changed",
    });
  });

  it("T2.32 (C04 I14): a duplicate of an id held inside a scroll is refused", () => {
    // The other half of the same walk. `countId` not descending made a nested id
    // invisible, so `append` would admit a second block with it — and every
    // later `replace` addressing it has two targets and picks one.
    const doc = docOf([scroll(2, [flat("dup")])]);

    const outcome = applyPatch(doc, {
      op: "append",
      block: { kind: "raw", id: "dup", text: "second" },
    });

    expect(outcome.ok, "a duplicate must be refused wherever the first one lives").toBe(false);
  });

  it("T2.33 (C24 I24): a live part inside a scroll is declared and found", () => {
    // The most expensive of the four to have shipped: the part renders its
    // loading placeholder, ticks never reach it, and nothing anywhere reports a
    // fault. That is exactly the dashboard fault `liveDeclarations`' own
    // recursion was written to prevent, one container kind later.
    const panel = b.live({
      id: "ticker",
      title: "Ticker",
      fetch: () => Promise.resolve({ value: 1 }),
      render: () => ({ kind: "raw", id: "ticker-body", text: "1" }),
      every: 1000,
    });

    expect(liveParts(docOf([scroll(4, [panel])])), "found through the container").toHaveLength(1);
  });

  it("T2.34 (C26 §4b cell 3): the walk stops where the definition answers", () => {
    // **And the class fix is not `descend into everything with children`.** A
    // scroll declares one element per child, so descending would emit each child
    // twice and the second copy at the wrong rows — content coordinates, not the
    // sequence's. `elementsIn` asks the definition rather than a list of kinds,
    // which is the only form that stays right for a container that answers and
    // one that does not.
    const table: Block = b.table({
      id: "t",
      columns: [b.col("a")],
      rows: [
        { id: "r1", cells: { a: { text: "1" } } },
        { id: "r2", cells: { a: { text: "2" } } },
      ],
    });

    // **The registry is local and carries C11**, because `defaults: true` does
    // not: a table resolved through the fallback renders as `raw` and declares
    // no elements, so the unwrapped half agreed with the wrapped one for a
    // reason that had nothing to do with the walk. The `bare` assertion is the
    // guard that said so — a fixture shown to respond before it is asserted
    // against (`test/support/README.md`).
    const withTable = createBlockRegistry({ defaults: true });
    withTable.register(tableDefinition as unknown as BlockDefinition);
    const inScroll = withTable.elementsIn([scroll(6, [table])], 40);
    const bare = withTable.elementsIn([table], 40);

    expect(bare.map((e) => e.element.id), "the table's own rows, unwrapped").toEqual(["r1", "r2"]);
    expect(inScroll.map((e) => e.element.id), "one element, and it is the child").toEqual(["t"]);
    expect(inScroll.every((e) => e.blockId === "s"), "declared by the container").toBe(true);
  });
});

describe("C04 §3c — the boundary, and what a copy carries across it", () => {
  // **The ruling needed no new principle and the rows have to show that.** C26
  // I17 says the copy is the source and never the rendering; a child the offset
  // scrolled past is a third form of *the rendering could not show it*, beside a
  // dropped column and a truncated value.
  //
  // There is no row asserting *the same copy at every offset*, and its absence
  // is deliberate: `elements` is not given the offset, so such a row could not
  // be violated and would read exactly like a rule that is obeyed (A03 §2).
  // What can be wrong is the join, and these assert that.

  const copies = (block: Scroll): readonly (string | undefined)[] =>
    registry.elementsOf(block, 40).map((e) => e.copy);

  it("T2.35 (C04 I50): the children below the box are in the copy, in full", () => {
    // A box of one row holding three children. Two of them are unreachable
    // without scrolling and one is unreachable at every offset the box allows —
    // and all three are copied, which is the whole of the ruling.
    expect(copies(scroll(1, [flat("a"), flat("b"), flat("c")]))).toEqual(["a", "b", "c"]);
  });

  it("T2.35b (C04 I50): a nested container joins its own children, one level down", () => {
    // The recursion, and the reason it is not a special case: elements are one
    // per child, so a child that is a container is one element whose source is
    // everything it holds. The inner box's height does not enter it either.
    const inner = scroll(1, [flat("x"), flat("y")], "inner");

    expect(copies(scroll(2, [flat("a"), inner]))).toEqual(["a", "x\ny"]);
  });

  it("T2.36 (C04 I50): a kind with no expressible source contributes nothing", () => {
    // **Nothing rather than its painted rows** — a `rule` draws a line and has
    // no data behind it, so joining what it renders would put a row of dashes in
    // a paste. The empty string is what `copyElement` filters out.
    const withRule = scroll(2, [flat("a"), { kind: "rule", id: "r" } as Block, flat("b")]);

    expect(copies(withRule), "the rule contributes an empty source").toEqual(["a", "", "b"]);
    expect(
      copies(scroll(1, [{ kind: "rule", id: "r" } as Block])),
      "and a container of nothing but those carries no source at all — which is " +
        "the state `y` returned early on, saying nothing",
    ).toEqual([""]);
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
