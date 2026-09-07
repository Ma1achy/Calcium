// C04 tier 6 — each names the change that makes it fail.
//
// These are not extra coverage. Each one is a plausible edit to a file in
// `src/data/viewmodel/`, written out so that making it breaks a named test
// rather than passing review. Several are edits that were *made* during this
// component's implementation and caught here.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkModuleGraph } from "../../tools/enforce/module-graph.mjs";
import {
  applyPatch,
  block,
  deepFreeze,
  validateBlock,
  validateDocument,
  type MergeRow,
  type Table,
  type TableRow,
  type ViewDocument,
} from "../../src/data/viewmodel/index.js";
import { CORPUS, doc, ONE_PER_KIND, tableOf } from "../support/blocks.js";
import { axesOf } from "../../src/data/viewmodel/index.js";
import { ASCII_CAPS, FULL_CAPS, measurable } from "../support/render.js";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { createViewport } from "../../src/viewport/viewport/index.js";
import { measureSequence } from "../support/viewport.js";
import { SUBSTITUTIONS } from "../../src/presentation/blocks/index.js";
import { cells } from "../../src/presentation/text.js";
import { checkAsciiParity, formatReport } from "../../src/testing/measurement-conformance.js";

function unwrap(r: ReturnType<typeof applyPatch>): ViewDocument {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error.message}`);
  return r.doc;
}

describe("C04 fail-on-revert", () => {
  it("T6.4 (I9): a merge that rebuilds every row → T1.6 fails on reference identity", () => {
    // The viewport-jump regression, caught before anyone sees it. Reference
    // identity is the property; deep equality would pass a rebuild happily,
    // and C14's measurement cache would be invalidated on every tick.
    const d = doc({ blocks: [tableOf(10)] });
    const before = (d.blocks[0] as Table).rows;

    const after = (
      unwrap(
        applyPatch(d, {
          op: "merge",
          blockId: "t",
          rows: [{ id: "r5", cells: { name: { text: "changed" } } }],
        }),
      ).blocks[0] as Table
    ).rows;

    const identical = after.filter((row, i) => row === before[i]).length;
    expect(identical, "nine of ten rows must be the same object, not an equal one").toBe(9);
  });

  it("T6.5 (I1): returning a mutable block from any constructor → T1.1 fails", () => {
    const b = block({ kind: "raw", id: "r", text: "x" });
    expect(Object.isFrozen(b)).toBe(true);

    // And the depth, which is the half a shallow freeze passes.
    const nested = deepFreeze({ a: { b: { c: [1, 2] } } });
    expect(Object.isFrozen(nested.a.b.c)).toBe(true);
  });

  it("T6.6 (I5): a colour field on any block → T2.7 fails via SS16", () => {
    // The source scan is the guard and it is asserted in tier 2. What is
    // assertable here is that nothing in the shipped module carries one.
    // Documented in prose in the spec; enforced in `make enforce`.
    const asJson = JSON.stringify(ONE_PER_KIND);
    expect(asJson, "no hex literal anywhere in the default corpus").not.toMatch(
      /#[0-9a-fA-F]{3,8}\b/,
    );
  });

  it("T6.8 (I3): allowing error on an ok document → T1.2 fails", () => {
    expect(validateDocument(doc({ status: "ok", error: { message: "boom" } })).ok).toBe(false);
    expect(validateDocument(doc({ status: "error" })).ok).toBe(false);
  });

  it("T6.10 (I15): absorbing the four failures into a bare ViewDocument → T1.12 and T1.14 fail", () => {
    // If applyPatch returned a document again, each of these would have to
    // either throw — in the render path, on every stream tick — or silently
    // return the input, which is the no-op behaviour §4 withdraws.
    const d = doc({ blocks: [tableOf(2), block({ kind: "raw", id: "r", text: "x" })] });

    const results = [
      applyPatch(d, { op: "status", status: "error" }),
      applyPatch(d, { op: "merge", blockId: "r", rows: [] }),
      applyPatch(d, { op: "replace", blockId: "ghost", block: ONE_PER_KIND.raw }),
      applyPatch(d, { op: "append", block: block({ kind: "raw", id: "r", text: "y" }) }),
    ];

    expect(results.every((r) => r.ok === false), "all four must be expressible as failures").toBe(
      true,
    );
    // And the discriminant must be usable without a cast — a caller that
    // cannot narrow is a caller that will ignore the result.
    for (const r of results) {
      if (!r.ok) expect(typeof r.error.message).toBe("string");
    }
  });

  it("T6.11 (I16): typing the merge arm as TableRow[] → T1.8b stops compiling", () => {
    // The compile-level half lives in T1.8b. The runtime half is here: even a
    // payload that has been cast past the compiler cannot set view state.
    const d = doc({ blocks: [tableOf(3)] });

    const after = unwrap(
      applyPatch(d, {
        op: "merge",
        blockId: "t",
        rows: [{ id: "r1", cells: {}, expanded: true } as TableRow as MergeRow],
      }),
    );

    expect(
      (after.blocks[0] as Table).rows[0]?.expanded,
      "the type is the guard for authors; this is the guard for data",
    ).toBeUndefined();
  });

  it("T6.12 (I14): dropping the uniqueness check → T1.15 fails and T1.12's fourth case dies", () => {
    const duplicated = doc({
      blocks: [block({ kind: "raw", id: "same", text: "a" }), block({ kind: "raw", id: "same", text: "b" })],
    });
    expect(validateDocument(duplicated).ok).toBe(false);

    // Without uniqueness, `replace` would have to pick one of two blocks, and
    // "the first" is a rule nobody wrote down.
    const r = applyPatch(duplicated, { op: "replace", blockId: "same", block: ONE_PER_KIND.raw });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.message).toContain("more than once");
  });

  it("T6.17 (I27): a global seen-set instead of a path-scoped one → T1.17b fails", () => {
    // A subtree legitimately appearing twice is not a cycle. A global set calls
    // the second occurrence one and refuses a legal document — the failure is a
    // false positive, which is why T1.17b asserts the *absence* of a cycle
    // error rather than overall success.
    const shared = { kind: "raw", id: "s", text: "x" } as const;
    const r = validateDocument({
      ...doc(),
      blocks: [
        { kind: "panel", id: "p1", title: "A", children: [shared] },
        { kind: "panel", id: "p2", title: "B", children: [shared] },
      ],
    });

    expect(r.ok === false && r.error.join(" "), "shared is not cyclic").not.toContain("cyclic");
  });

  it("T6.16 (§4b): freezing in C24's b as well as in the constructor → T1.18 fails", () => {
    // C24 does not exist. What is assertable now is the property its builder
    // must preserve: `block()` is the freeze point, and a caller receives an
    // already-frozen value it has no reason to freeze again.
    const b = block({ kind: "notice", id: "n", tone: "info", text: "hello" });

    expect(Object.isFrozen(b)).toBe(true);
    expect(Object.isFrozen(b), "a second freeze would be a second enforcement point").toBe(
      Object.isFrozen(deepFreeze(b)),
    );
  });

  it("T6.17 (§4): carrying view state across a replace → T1.13's second half fails", () => {
    // The rejected alternative. If `replace` inherited `expanded` by row id, an
    // expansion would survive onto a row that happens to share an id with
    // something semantically different — and replace and merge would differ
    // only in deletion semantics.
    const table = tableOf(3);
    const opened: Table = {
      ...table,
      rows: table.rows.map((r) => (r.id === "r2" ? { ...r, expanded: true } : r)),
    };
    const d = doc({ blocks: [opened] });

    const after = unwrap(applyPatch(d, { op: "replace", blockId: "t", block: tableOf(3) }));

    expect(
      (after.blocks[0] as Table).rows.every((r) => r.expanded === undefined),
      "replace is wholesale — the block is now a different block",
    ).toBe(true);
  });

  it("T6.18 (§4): a merge that drops rows absent from the payload → T3.13b fails", () => {
    const d = doc({ blocks: [tableOf(5)] });

    const after = unwrap(
      applyPatch(d, { op: "merge", blockId: "t", rows: [{ id: "r3", cells: {} }] }),
    );

    expect(
      (after.blocks[0] as Table).rows,
      "absence from one tick is not evidence of absence",
    ).toHaveLength(5);
  });

  it("T6.19 (§4): a rewrite that finds a nested block but returns its parent unchanged → T1.19 fails", () => {
    // Made, and caught here. Descending into a table's detail to locate the
    // target while returning the table untouched reports `ok` and changes
    // nothing — the worst of the three possible outcomes.
    const table = block({
      kind: "table",
      id: "t",
      columns: [{ key: "n", label: "N", align: "left", priority: 1, minWidth: 4, sortable: false }],
      rows: [
        {
          id: "r1",
          cells: { n: { text: "one" } },
          detail: [{ kind: "raw", id: "d", text: "before" }],
        },
      ],
    });

    const after = unwrap(
      applyPatch(doc({ blocks: [table] }), {
        op: "replace",
        blockId: "d",
        block: block({ kind: "raw", id: "d", text: "after" }),
      }),
    );

    const detail = (after.blocks[0] as Table).rows[0]?.detail?.[0];
    expect(detail?.kind === "raw" && detail.text, "ok must mean something changed").toBe("after");
  });

  it("T6.20 (§3): defaulting a line plot's height → T1.16 fails", () => {
    expect(() => block({ kind: "plot", id: "p", form: "line", series: [] })).toThrow();
  });

  it("T6.27 (I46): a numeric check that is `typeof number` → T2.19 fails on NaN", () => {
    // The revert is dropping `Number.isFinite`, which is what every other
    // numeric field in this validator already carries — `height`, `current`,
    // `total` and `flex` — and which the numeric *arrays* did not.
    //
    // **The state it restores is the one that shipped**, and it is silent in
    // both directions: `[1, NaN]` validates, persists as `[1, null]`, and the
    // reloaded document validates too. The row asserts the refusal because that
    // is the only observable difference; nothing about the rendered plot says
    // which of the two it is drawing.
    const plot = (v: unknown): unknown => ({
      kind: "plot",
      id: "p",
      form: "line",
      height: 4,
      series: [{ values: [1, v] }],
    });

    expect(validateBlock(plot(Number.NaN)).ok).toBe(false);
    expect(validateBlock(plot(Number.POSITIVE_INFINITY)).ok).toBe(false);
    expect(validateBlock(plot(2)).ok, "the control — a finite value is accepted").toBe(true);
  });

  it("T6.28 (I46): checking the array and not its elements → T2.19 fails on Cell.spark", () => {
    // The other half, and the half no round trip would have found: `spark` is
    // reachable only through a table cell, so a document arriving from a far
    // side could carry strings there and every check passed.
    const withSpark = (spark: unknown): unknown => ({
      kind: "table",
      id: "t",
      columns: [{ key: "a", label: "A" }],
      rows: [{ id: "r1", cells: { a: { text: "x", spark } } }],
    });

    expect(validateBlock(withSpark(["1", "2"])).ok).toBe(false);
    expect(validateBlock(withSpark([1, 2])).ok, "the control").toBe(true);
  });

  it("T6.1 (I7): a measurer under-counting wrapped lines by one → T2.1 fails at the wrap width", () => {
    // The revert is a prefix left out of the wrapping width, or `floor` where
    // the count should be. Both are right at most widths and one row short at
    // the widths where the text wraps — which is why this asserts over a range.
    const kit = measurable();
    const notice = block({
      kind: "notice",
      id: "revert-wrap",
      tone: "error",
      glyph: "error",
      text: "x".repeat(97),
    });

    for (const width of [20, 30, 40, 50]) {
      expect(kit.measure(notice, width), `width ${width}`).toBe(
        kit.renderToLines(notice, width).length,
      );
    }
  });

  // C11's own T6.7 now covers the measurer half — a table measurer ignoring
  // `expanded` fails there, at every width. What is still deferred is this file's
  // claim, which is about viewport drift.
  it("T6.2 (I7): a measurer ignoring the expanded flag → viewport drift", () => {
    // `expanded` is view state that changes a height. A measurer reading the rows
    // and not the flag returns the collapsed height for an open row, and the
    // viewport places everything below it one detail-height too high — drift,
    // not a wrong-looking block.
    const store = createTranscriptStore();
    const viewport = createViewport(store, { width: 80, height: 10, measureSequence });
    const collapsed = tableOf(3, "t");
    const id = store.append(doc({ blocks: [collapsed] }), { streaming: true });
    const before = viewport.scroll.totalRows;

    store.patch(id, {
      op: "replace",
      blockId: "t",
      block: {
        ...collapsed,
        rows: collapsed.rows.map((r) =>
          r.id === "r1"
            ? { ...r, expanded: true, detail: [block({ kind: "raw", id: "d", text: "detail" })] }
            : r,
        ),
      },
    });

    expect(viewport.scroll.totalRows).toBeGreaterThan(before);
    expect(viewport.scroll.totalRows).toBe(
      measureSequence(store.entries[0]?.doc.blocks ?? [], 80),
    );
  });
  it("T6.7a (§1): importing theme into viewmodel/ → T2.9 fails", () => {
    // The half of T6.7 that C10 landing made writable. A block names a palette
    // slot and never resolves one, so `viewmodel/` importing `theme/` is the
    // layering violation that would let a colour value into a view model — and
    // SS16 would then have nothing left to catch, because the hex would be
    // arriving through an import rather than as a literal.
    const viewmodel = readdirSync("src/data/viewmodel")
      .filter((f) => f.endsWith(".ts"))
      .map((f) => `src/data/viewmodel/${f}`);

    expect(checkModuleGraph(viewmodel).filter((v) => v.rule === "MG4")).toEqual([]);

    expect(viewmodel.length).toBeGreaterThan(0);
    for (const file of viewmodel) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/from\s+["'][^"']*presentation/);
    }
  });

  it("T6.3: an ASCII fallback glyph of a different width → T2.6 fails", () => {
    // The 1:1 rule made checkable: every substitution is one cell on both
    // sides, so a fixture's measured height is identical in both unicode
    // modes. A two-cell fallback would pass every test run in a UTF-8 locale.
    for (const [unicode, ascii] of SUBSTITUTIONS) {
      expect(cells(ascii), `${unicode} → ${ascii}`).toBe(cells(unicode));
    }

    const report = checkAsciiParity(
      measurable(),
      measurable({ capabilities: ASCII_CAPS }),
      CORPUS.filter((b) => !["table", "plot", "patch"].includes(b.kind)),
    );
    expect(report.failures, formatReport(report)).toEqual([]);
  });

  it("T6.7b (§1): moving the registry into C04 → T2.9 fails", () => {
    // The registry pairs a measurer with a renderer, and `render` needs theme
    // (L1) and capabilities (L0 terminal). A registry at L0 data would import
    // upward and sideways at once — so the check is that `viewmodel/` still
    // imports neither, and that the registry is somewhere else entirely.
    const viewmodel = readdirSync("src/data/viewmodel")
      .filter((f) => f.endsWith(".ts"))
      .map((f) => `src/data/viewmodel/${f}`);

    for (const file of viewmodel) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must not reach L1`).not.toMatch(/from\s+["'][^"']*presentation/);
      expect(source, `${file} must not reach L0-terminal`).not.toMatch(/from\s+["'][^"']*terminal/);
      expect(source, `${file} must not hold a registry`).not.toMatch(/createBlockRegistry/);
    }

    expect(existsSync("src/presentation/blocks/registry.ts"), "the registry lives at L1").toBe(true);
  });

  it("T6.9 (I10): an assembly-only block representation → a partial document renders differently mid-stream", () => {
    // C13 landed, so a document can now be held *while incomplete* and compared
    // against the same document complete. That is what I10 is about: no block
    // kind may have an "assembling" form, because a `--watch` renders every
    // intermediate state and a kind that looks different half-built flickers.
    const kit = measurable({ capabilities: FULL_CAPS });
    // The default kinds only. `table`, `plot` and `patch` are registered by C11,
    // C12 and C25 — an unregistered kind still renders, as `raw`, so building
    // this out of tables would assert about `raw` while appearing to assert
    // about tables. That is the inert-option trap `measurable` warns about.
    const kinds = Object.values(ONE_PER_KIND).filter((b) => kit.kinds.includes(b.kind));
    expect(kinds.length).toBeGreaterThan(10);

    const alone = new Map(kinds.map((b) => [b.id, kit.renderToLines(b, 80).join("\n")]));

    const store = createTranscriptStore();
    const id = store.append(doc({ blocks: [kinds[0]!] }), { streaming: true });

    // Grow the document one block at a time. At every intermediate state — a
    // partial document, which is what a `--watch` renders continuously — each
    // block already present must render exactly as it does complete.
    for (let i = 1; i < kinds.length; i += 1) {
      expect(store.patch(id, { op: "append", block: kinds[i]! })).toMatchObject({ ok: true });

      for (const b of store.entries[0]!.doc.blocks) {
        expect(
          kit.renderToLines(b, 80).join("\n"),
          `${b.kind} renders differently at stage ${i} than it does complete`,
        ).toBe(alone.get(b.id));
      }
    }

    store.settle(id);
    expect(store.entries[0]?.doc.blocks).toHaveLength(kinds.length);
  });

  it("T6.14 (I17): removing the max(1, …) floor → T3.6 fails at all three kinds", () => {
    // `ceil(cells("") / w)` is 0 and an empty notice renders as a row. The
    // three are the kinds whose arithmetic reaches zero; an empty *container*
    // is the one legitimate zero, and is asserted alongside so that a floor
    // applied too widely fails here too.
    const kit = measurable();

    expect(kit.measure(block({ kind: "notice", id: "f-n", tone: "info", text: "" }), 80)).toBe(1);
    expect(kit.measure(block({ kind: "tip", id: "f-t", text: "" }), 80)).toBe(1);
    expect(kit.measure(block({ kind: "raw", id: "f-r", text: "" }), 80)).toBe(1);
    expect(
      kit.measure(block({ kind: "group", id: "f-g", direction: "column", children: [] }), 80),
      "the absence of content, rather than empty content",
    ).toBe(0);
  });

  it("T6.15 (§3): giving a row group's children the full width → T2.1 fails wherever a child wraps", () => {
    // A `row` group splits the width; a measurer that passes `w` through agrees
    // with nothing that renders, and only once a child wraps — which is why the
    // fixture is two children whose text wraps at the split width and not at
    // the full one.
    const kit = measurable();
    const text = "y".repeat(30);
    const group = block({
      kind: "group",
      id: "revert-row",
      direction: "row",
      children: [
        { kind: "notice", id: "revert-row-a", tone: "info", text },
        { kind: "notice", id: "revert-row-b", tone: "info", text },
      ],
    });

    // At 80 columns each child gets floor((80 - 1) / 2) = 39, so 30 cells fit
    // on one row. At 40 each child gets 19 and the same text takes two.
    expect(kit.measure(group, 80)).toBe(1);
    expect(kit.measure(group, 40), "the split width is what wraps").toBe(2);
    expect(kit.renderToLines(group, 40)).toHaveLength(2);
  });
});

describe("C04 §3 both axes — fail-on-revert", () => {
  it("T6.87 (C04 I100): parsing the entry horizontal-first → T2.110 fails on the refusal and T3.72 draws at the top", () => {
    expect(axesOf("bottom-right")).toEqual({ v: "bottom", h: "right" });
    expect(axesOf("right"), "one axis, horizontal").toEqual({ v: "top", h: "right" });
    expect(axesOf(undefined), "absent is top-left").toEqual({ v: "top", h: "left" });
    const outcome = validateBlock({
      kind: "group", id: "g", direction: "row", children: [{ kind: "raw", id: "r", text: "x" }], align: ["right-bottom"],
    });
    expect(outcome.ok, "the swapped order is refused").toBe(false);
  });

  it("T6.88 (C04 I102): dropping minRows from the measure or from the render → T3.72 fails; both halves are asserted", () => {
    // The render-only revert keeps the height agreeing while the frame is
    // wrong, which is why the row reads the frame and not the count.
    const kit = measurable({});
    const group = block({
      kind: "group", id: "g", direction: "row", children: [{ kind: "raw", id: "r", text: "x" }], minRows: 5, align: ["bottom"],
    });
    expect(kit.measure(group, 20)).toBe(5);
    const frame = kit.renderToLines(group, 20).map((l) => l.replace(/\s+$/u, ""));
    expect(frame, "five rows drawn").toHaveLength(5);
    expect(frame[4], "the child on the last row").toBe("x");
  });

  it("T6.89 (C04 I103): placing every child at the row's top in the element walk → T3.74 fails; the render is untouched", () => {
    const kit = measurable({});
    const group = block({
      kind: "group", id: "g", direction: "row",
      children: [
        { kind: "raw", id: "tall", text: "a\nb\nc\nd" },
        { kind: "pills", id: "chips", chips: [{ id: "one", label: "one" }] },
      ],
      align: ["top", "bottom"],
    });
    const frame = kit.renderToLines(group, 40);
    const drawn = frame.findIndex((l) => l.includes("one"));
    const element = kit.registry.elementsIn([group], 40).find((e) => e.blockId === "chips");
    expect(element?.element.rows.from, "the walk agrees with the frame").toBe(drawn);
    expect(drawn, "and the frame is F816's").toBe(3);
  });
});
