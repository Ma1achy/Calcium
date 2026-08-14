// C04 tier 1 — isolated. Pure data: no clock, no terminal, no I/O to fake.
//
// C04 executes nothing, which is what makes it easy to get wrong quietly. These
// assert the properties that cannot be seen by reading the types: that a freeze
// reaches the bottom, that a merge preserves identity rather than equality, and
// that a patch which cannot succeed says so instead of producing a document that
// violates I3.
import { describe, expect, it } from "vitest";
import {
  applyPatch,
  block,
  BlockShapeError,
  validateBlock,
  validateDocument,
  type MergeRow,
  type Table,
  type ViewDocument,
} from "../../src/data/viewmodel/index.js";
import { doc, ONE_PER_KIND, tableOf } from "../support/blocks.js";
import { b } from "../../src/shell/builders/index.js";

/** The document used wherever a table needs to be patched. */
function docWithTable(rows = 10): { document: ViewDocument; table: Table } {
  const table = tableOf(rows);
  return { document: doc({ blocks: [table] }), table };
}

function tableIn(d: ViewDocument, id = "t"): Table {
  const found = d.blocks.find((b) => b.id === id);
  if (found === undefined || found.kind !== "table") throw new Error(`no table "${id}"`);
  return found;
}

function unwrap(r: ReturnType<typeof applyPatch>): ViewDocument {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error.message}`);
  return r.doc;
}

describe("C04 immutability", () => {
  it("T1.1 (I1): every constructor returns a frozen value, at every nesting depth", () => {
    const b = block({
      kind: "panel",
      id: "p",
      title: "Deep",
      children: [
        {
          kind: "table",
          id: "p-t",
          columns: [
            { key: "a", label: "A", align: "left", priority: 1, minWidth: 4, sortable: false },
          ],
          rows: [{ id: "r1", cells: { a: { text: "x" } } }],
        },
      ],
    });

    // The top level is the easy part. A shallow freeze passes an assertion that
    // stops here, and leaves `rows[0].cells.a` writable — which is the bug.
    expect(Object.isFrozen(b)).toBe(true);

    const table = b.children[0] as Table;
    expect(Object.isFrozen(table), "child block").toBe(true);
    expect(Object.isFrozen(table.rows), "the rows array").toBe(true);
    expect(Object.isFrozen(table.rows[0]), "a row").toBe(true);
    expect(Object.isFrozen(table.rows[0]?.cells), "the cells record").toBe(true);
    expect(Object.isFrozen(table.rows[0]?.cells["a"]), "a cell, four levels down").toBe(true);

    expect(() => {
      (table.rows[0]?.cells["a"] as { text: string }).text = "mutated";
    }).toThrow();
    expect(table.rows[0]?.cells["a"]?.text).toBe("x");
  });

  it("T1.1b (I1): a cyclic literal freezes rather than hanging the constructor", () => {
    // Refusal is the validator's job (I27). A constructor that recursed forever
    // would fail worse than one that completes and lets validation name it.
    const child: Record<string, unknown> = { kind: "raw", id: "cyc-child", text: "x" };
    const parent: Record<string, unknown> = { kind: "panel", id: "cyc", title: "", children: [child] };
    child["loop"] = parent;

    expect(() => block(parent as never)).not.toThrow();
    expect(Object.isFrozen(parent)).toBe(true);
  });
});

describe("C04 validation", () => {
  it("T1.2 (I3): error is present iff status is error — both directions", () => {
    expect(validateDocument(doc({ status: "ok" })).ok).toBe(true);
    expect(
      validateDocument(doc({ status: "error", error: { message: "boom" } })).ok,
    ).toBe(true);

    const missing = validateDocument(doc({ status: "error" }));
    expect(missing.ok).toBe(false);
    expect(missing.ok === false && missing.error.join(" ")).toContain("required when status");

    const spurious = validateDocument(doc({ status: "ok", error: { message: "boom" } }));
    expect(spurious.ok, "an ok document carrying an error").toBe(false);
    expect(spurious.ok === false && spurious.error.join(" ")).toContain("non-error document");
  });

  it("T1.3 (I2): a tui.view/2 document is refused with a named error", () => {
    const r = validateDocument(doc({ schema: "tui.view/2" as never }));

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.join(" ")).toContain("tui.view/1");
    expect(r.ok === false && r.error.join(" "), "the reason, not just the mismatch").toContain(
      "refused at the boundary",
    );
  });

  it("T1.11 (I3): ErrorLike needs only a message", () => {
    expect(validateDocument(doc({ status: "error", error: { message: "just this" } })).ok).toBe(
      true,
    );

    const noMessage = validateDocument(
      doc({ status: "error", error: { code: "E1" } as never }),
    );
    expect(noMessage.ok).toBe(false);
  });

  it("T1.15 (I14): duplicate block ids are refused, including a nested one", () => {
    const flat = validateDocument(
      doc({ blocks: [block({ kind: "raw", id: "dup", text: "a" }), block({ kind: "raw", id: "dup", text: "b" })] }),
    );
    expect(flat.ok).toBe(false);
    expect(flat.ok === false && flat.error.join(" ")).toContain(`id "dup" appears 2 times`);

    // Nested counts: `replace` and `merge` reach inside a panel, so a duplicate
    // there is just as unaddressable as one at the top level.
    const nested = validateDocument(
      doc({
        blocks: [
          block({ kind: "raw", id: "dup", text: "a" }),
          block({ kind: "panel", id: "p", title: "T", children: [{ kind: "raw", id: "dup", text: "b" }] }),
        ],
      }),
    );
    expect(nested.ok, "a duplicate hidden one level down").toBe(false);
  });

  it("T1.16 (I31): duplicate row ids are refused, and two tables may share ids", () => {
    // A different namespace from I14's, and the test says so in both directions —
    // a check that rejected `r1` in two separate tables would break every merge
    // fixture in the tree.
    const table = (id: string, rowIds: readonly string[]) =>
      block({
        kind: "table",
        id,
        columns: [
          { key: "name", label: "Name", align: "left", priority: 10, minWidth: 8, sortable: true },
        ],
        rows: rowIds.map((rid) => ({ id: rid, cells: { name: { text: rid } } })),
      });

    const dup = validateDocument(doc({ blocks: [table("t", ["r1", "r2", "r1"])] }));
    expect(dup.ok).toBe(false);
    expect(dup.ok === false && dup.error.join(" ")).toContain(`row id "r1" appears 2 times`);

    const shared = validateDocument(
      doc({ blocks: [table("t1", ["r1", "r2"]), table("t2", ["r1", "r2"])] }),
    );
    expect(shared.ok, "row ids are scoped to their table, not to the document").toBe(true);
  });

  it("T1.17 (I27): a cyclic document is refused, and the call returns", () => {
    const inner: Record<string, unknown> = { kind: "raw", id: "inner", text: "x" };
    const outer: Record<string, unknown> = { kind: "panel", id: "outer", title: "T", children: [inner] };
    (inner as { children?: unknown[] }).children = [outer];
    inner["kind"] = "panel";
    inner["title"] = "I";

    const r = validateBlock(outer);

    // Returning at all is half the assertion. A validator without the seen-set
    // hangs here rather than failing, which is why this asserts a *result*.
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.join(" ")).toContain("cyclic structure");
  });

  it("T1.17b (I27): a subtree appearing twice is not a cycle", () => {
    // The seen-set is path-scoped for this case. A global one would call the
    // second, honest occurrence a cycle and refuse a legal document.
    const shared = { kind: "raw", id: "shared", text: "x" } as const;
    const r = validateBlock({
      kind: "group",
      id: "g",
      direction: "column",
      children: [
        { kind: "panel", id: "p1", title: "A", children: [shared] },
        { kind: "panel", id: "p2", title: "B", children: [shared] },
      ],
    });

    // It fails on I14 — `shared` appears twice, so its id does too — and that
    // is the *right* error. What matters is that it is not a cycle error.
    expect(r.ok === false && r.error.join(" ")).not.toContain("cyclic");
  });

  it("T1.19 (§3): a line plot without a height is a construction error", () => {
    expect(() =>
      block({ kind: "plot", id: "p", form: "line", series: [{ values: [1, 2] }] }),
    ).toThrow(BlockShapeError);

    expect(
      () => block({ kind: "plot", id: "p", form: "sparkline", series: [{ values: [1, 2] }] }),
      "a sparkline is always one row and takes no height",
    ).not.toThrow();
  });

  it("T1.20 (I42): a weight that means two things is a construction error", () => {
    // **Four values in one row**, because the field's whole risk is a number
    // that reads as meaningful and means two things. `0` is the one that
    // matters: *not placed* is what omitting the child says, and *placed at one
    // cell* is what `1` says, since the floor gives every placed child a column.
    const two = [b.raw("a"), b.raw("b")];

    for (const flex of [[0, 1], [-1, 1], [Number.NaN, 1], [Number.POSITIVE_INFINITY, 1]]) {
      expect(() => b.group("row", two, { flex }), JSON.stringify(flex)).toThrow(TypeError);
    }

    // And a length mismatch, which is refused for a different reason: there is
    // no reading to fall back on, and inferring the third weight would be the
    // framework choosing a layout.
    expect(() => b.group("row", two, { flex: [1] })).toThrow(TypeError);
    expect(() => b.group("row", two, { flex: [1, 1, 1] })).toThrow(TypeError);

    expect(() => b.group("row", two, { flex: [2, 1] }), "and a real pair does not").not.toThrow();

    // **The validator refuses the same block**, because a document can arrive
    // from a fixture or a far side with no constructor between (§4b) — and it
    // refuses it on a `column` group too, where layout ignores the field: a
    // wrong value is wrong wherever the block travels.
    //
    // **Asserted on the message rather than on `ok`, and the mutation pass is
    // why.** The first version handed `validateDocument` a bare `{command,
    // blocks}`, which is already invalid three ways over — no schema, no status,
    // no meta — so `ok === false` held whatever `flex` did, and neutering the
    // check failed nothing. A test that cannot construct the state it claims
    // agrees with the defect.
    const withFlex = (flex: readonly number[]): readonly string[] => {
      const result = validateBlock({
        kind: "group",
        id: "g",
        direction: "column",
        children: [{ kind: "raw", id: "a", text: "x" }],
        flex,
      } as never);
      return result.ok ? [] : result.error;
    };

    expect(withFlex([0]).join(" "), "a hand-built block with a zero weight").toContain("flex[0]");
    expect(withFlex([1]), "and a real weight on a column group is accepted").toEqual([]);
  });

  it("T1.16b (I41): an unknown `yFormat` is a construction error, not a silent number", () => {
    // **It was unvalidated, so a typo rendered plain values and said nothing** —
    // `formatValue`'s `default` arm took anything it did not recognise. The
    // `fraction`/`percent` rename is exactly the event that produces a typo,
    // because `percentage` is what a reader guesses, so the arm that catches it
    // lands with the rename rather than after someone hits it.
    expect(() =>
      block({
        kind: "plot",
        id: "p",
        form: "line",
        height: 4,
        series: [{ values: [1, 2] }],
        yFormat: "percentage",
      } as never),
    ).toThrow(BlockShapeError);

    // Both real arms, because a check that rejects everything passes the line
    // above and is the failure this project keeps finding in guards.
    for (const yFormat of ["fraction", "percent"] as const) {
      expect(
        () =>
          block({ kind: "plot", id: "p", form: "line", height: 4, series: [{ values: [1, 2] }], yFormat }),
        yFormat,
      ).not.toThrow();
    }

    // **And the validator, which is the half the constructor cannot cover.**
    // §3's standing reason: a document can arrive from a fixture without passing
    // through a constructor, so a check in one of them covers half the ways a
    // plot is built. Asserted through a raw document rather than a built block,
    // because a built block cannot carry the bad value that far.
    const raw = validateDocument({
      ...doc({ status: "ok" }),
      blocks: [
        { kind: "plot", id: "p", form: "line", height: 4, series: [{ values: [1, 2] }], yFormat: "percentage" },
      ],
    } as never);
    expect(raw.ok, "the fixture path rejects it too").toBe(false);
    expect(raw.ok === false && raw.error.join(" ")).toContain("yFormat");
  });

  it("T2.8 (I6): an error or warn tone without a glyph is a construction error", () => {
    expect(() => block({ kind: "notice", id: "n", tone: "error", text: "failed" })).toThrow(
      BlockShapeError,
    );
    // An empty glyph is now unrepresentable in the type, so this needs a cast
    // to be written at all — and the runtime check stays, because a fixture
    // arrives as JSON and the type does not travel with it.
    expect(() =>
      block({ kind: "notice", id: "n", tone: "warn", text: "slow", glyph: "" as never }),
    ).toThrow(BlockShapeError);
    expect(() =>
      block({ kind: "notice", id: "n", tone: "error", text: "failed", glyph: "error" }),
    ).not.toThrow();

    // And inside a table cell, which is the other half of I6.
    expect(() =>
      block({
        kind: "table",
        id: "t",
        columns: [{ key: "s", label: "S", align: "left", priority: 1, minWidth: 4, sortable: false }],
        rows: [{ id: "r", cells: { s: { text: "down", tone: "error" } } }],
      }),
    ).toThrow(BlockShapeError);
  });

  it("T1.13b (I13): a document without meta.origin is refused", () => {
    const { origin: _dropped, ...rest } = doc().meta;
    const r = validateDocument({ ...doc(), meta: rest });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.join(" ")).toContain("not optional");
  });
});

describe("C04 patches", () => {
  it("T1.4 (I8): append returns a new document; the input is unchanged and frozen", () => {
    const before = doc({ blocks: [ONE_PER_KIND.rule] });
    const added = block({ kind: "raw", id: "added", text: "x" });

    const after = unwrap(applyPatch(before, { op: "append", block: added }));

    expect(after.blocks).toHaveLength(2);
    expect(before.blocks, "the input document").toHaveLength(1);
    expect(Object.isFrozen(before)).toBe(true);
    expect(Object.isFrozen(after)).toBe(true);
    expect(after).not.toBe(before);
  });

  it("T1.5: replace swaps the matching block and leaves the rest reference-identical", () => {
    const keep = ONE_PER_KIND.rule;
    const before = doc({ blocks: [keep, ONE_PER_KIND.raw] });
    const next = block({ kind: "raw", id: "raw-1", text: "replaced" });

    const after = unwrap(applyPatch(before, { op: "replace", blockId: "raw-1", block: next }));

    expect(after.blocks[0], "the untouched block, by reference").toBe(keep);
    expect(after.blocks[1]).toBe(next);
  });

  it("T1.6 (I9): merging three rows into ten leaves seven reference-identical", () => {
    const { document } = docWithTable(10);
    const original = tableIn(document).rows;

    const rows: MergeRow[] = [
      { id: "r2", cells: { name: { text: "changed 2" } } },
      { id: "r5", cells: { name: { text: "changed 5" } } },
      { id: "r9", cells: { name: { text: "changed 9" } } },
    ];
    const after = tableIn(unwrap(applyPatch(document, { op: "merge", blockId: "t", rows })));

    const untouched = ["r1", "r3", "r4", "r6", "r7", "r8", "r10"];
    for (const id of untouched) {
      const i = original.findIndex((r) => r.id === id);
      expect(after.rows[i], `${id} must be the same object, not an equal one`).toBe(original[i]);
    }
    expect(after.rows[1]).not.toBe(original[1]);
    expect(after.rows[1]?.cells["name"]?.text).toBe("changed 2");
  });

  it("T1.7 (I9): a merge that does not touch an expanded row leaves it expanded", () => {
    const table = tableOf(5);
    const expanded: Table = {
      ...table,
      rows: table.rows.map((r) => (r.id === "r4" ? { ...r, expanded: true } : r)),
    };
    const document = doc({ blocks: [expanded] });

    const after = tableIn(
      unwrap(
        applyPatch(document, {
          op: "merge",
          blockId: "t",
          rows: [{ id: "r1", cells: { name: { text: "tick" } } }],
        }),
      ),
    );

    expect(after.rows.find((r) => r.id === "r4")?.expanded).toBe(true);
  });

  it("T1.8 (I9): a merge that touches an expanded row keeps it expanded", () => {
    // The watch-tick regression, exactly. The row is updated, and the update
    // must not be able to close it.
    const table = tableOf(5);
    const expanded: Table = {
      ...table,
      rows: table.rows.map((r) => (r.id === "r4" ? { ...r, expanded: true } : r)),
    };
    const document = doc({ blocks: [expanded] });

    const after = tableIn(
      unwrap(
        applyPatch(document, {
          op: "merge",
          blockId: "t",
          rows: [{ id: "r4", cells: { name: { text: "new data" } } }],
        }),
      ),
    );

    const row = after.rows.find((r) => r.id === "r4");
    expect(row?.expanded, "the user opened it; a tick may not close it").toBe(true);
    expect(row?.cells["name"]?.text, "and the data did update").toBe("new data");
  });

  it("T1.8b (I16): a merge payload cannot carry view state — compile-level", () => {
    // The assertion is the annotation. `MergeRow` omits `expanded`, so this
    // object literal is only assignable because it does not set it; adding
    // `expanded: false` below stops the file compiling, which is the guard.
    const row: MergeRow = { id: "r1", cells: { name: { text: "x" } } };
    expect(row).not.toHaveProperty("expanded");

    // @ts-expect-error — `expanded` is not a field of MergeRow (I16).
    const illegal: MergeRow = { id: "r1", cells: {}, expanded: true };
    void illegal;

    // And the runtime path agrees with the type: a payload that smuggles the
    // flag past the compiler still cannot set it.
    const table = tableOf(3);
    const document = doc({ blocks: [table] });
    const after = tableIn(
      unwrap(
        applyPatch(document, {
          op: "merge",
          blockId: "t",
          rows: [{ id: "r1", cells: {}, expanded: true } as MergeRow],
        }),
      ),
    );
    expect(after.rows[0]?.expanded, "incoming view state is discarded, not merged").toBeUndefined();
  });

  it("T1.9: a status patch changes only status", () => {
    const before = doc({ blocks: [ONE_PER_KIND.rule] });
    const after = unwrap(applyPatch(before, { op: "status", status: "partial" }));

    expect(after.status).toBe("partial");
    expect(after.blocks).toBe(before.blocks);
    expect(after.command).toBe(before.command);
    expect(after.meta).toBe(before.meta);
  });

  it("T1.10 (I15): an unknown blockId fails rather than silently doing nothing", () => {
    const before = doc({ blocks: [ONE_PER_KIND.rule] });

    for (const patch of [
      { op: "replace" as const, blockId: "nope", block: ONE_PER_KIND.raw },
      { op: "merge" as const, blockId: "nope", rows: [] },
    ]) {
      const r = applyPatch(before, patch);
      expect(r.ok, `${patch.op} against a missing id`).toBe(false);
      expect(r.ok === false && r.error.message).toContain("not there");
    }
  });

  it("T1.12 (I15): all four failure cases return, and leave the input untouched", () => {
    const table = tableOf(3);
    const notATable = block({ kind: "raw", id: "r", text: "x" });
    const base = doc({ blocks: [table, notATable] });

    const cases: Array<[string, Parameters<typeof applyPatch>[1], ViewDocument]> = [
      // 1. A status transition that would violate I3.
      ["status → error with no error", { op: "status", status: "error" }, base],
      // 2. A merge against a block that is not a table.
      ["merge against a raw block", { op: "merge", blockId: "r", rows: [] }, base],
      // 3. An unknown blockId.
      ["replace an absent id", { op: "replace", blockId: "ghost", block: notATable }, base],
      // 4. A duplicate blockId.
      [
        "append a colliding id",
        { op: "append", block: block({ kind: "raw", id: "r", text: "y" }) },
        base,
      ],
    ];

    for (const [name, patch, input] of cases) {
      const r = applyPatch(input, patch);

      expect(r.ok, name).toBe(false);
      expect(r.ok === false && r.error.message.length, `${name}: a populated message`).toBeGreaterThan(0);
      expect(r.ok === false && r.error.stage, `${name}: the stage`).toBeDefined();

      expect(input.blocks, `${name}: the input is unchanged`).toHaveLength(2);
      expect(Object.isFrozen(input), `${name}: and still frozen`).toBe(true);
    }
  });

  it("T1.12b (I15): applyPatch never throws, on any of the four", () => {
    const base = doc({ blocks: [tableOf(2)] });
    expect(() => applyPatch(base, { op: "status", status: "error" })).not.toThrow();
    expect(() => applyPatch(base, { op: "merge", blockId: "ghost", rows: [] })).not.toThrow();
  });

  it("T1.13 (I15): merge, merge, replace — the composition, both halves", () => {
    const table = tableOf(3);
    const withExpansion: Table = {
      ...table,
      rows: table.rows.map((r) => (r.id === "r2" ? { ...r, expanded: true } : r)),
    };
    let d = doc({ blocks: [withExpansion] });

    // Merge one: update r1, add r4.
    d = unwrap(
      applyPatch(d, {
        op: "merge",
        blockId: "t",
        rows: [
          { id: "r1", cells: { name: { text: "tick one" } } },
          { id: "r4", cells: { name: { text: "new" } } },
        ],
      }),
    );

    // Merge two: update r2 (the expanded one) and add r5.
    d = unwrap(
      applyPatch(d, {
        op: "merge",
        blockId: "t",
        rows: [
          { id: "r2", cells: { name: { text: "tick two" } } },
          { id: "r5", cells: { name: { text: "newer" } } },
        ],
      }),
    );

    const merged = tableIn(d);
    expect(
      merged.rows.map((r) => r.id),
      "new rows append in payload order, after the existing ones",
    ).toEqual(["r1", "r2", "r3", "r4", "r5"]);
    expect(merged.rows[0]?.cells["name"]?.text).toBe("tick one");
    expect(merged.rows[1]?.cells["name"]?.text).toBe("tick two");
    expect(merged.rows[1]?.expanded, "view state survives both merges, touched or not").toBe(true);

    // And now the second half: replace is wholesale, and takes the expansion
    // with it. This is the design (§4), which is why it is asserted rather than
    // left to be discovered as a bug.
    const fresh = tableOf(2);
    d = unwrap(applyPatch(d, { op: "replace", blockId: "t", block: fresh }));

    const replaced = tableIn(d);
    expect(replaced.rows.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(
      replaced.rows.every((r) => r.expanded === undefined),
      "replace discards view state — the block is now a different block",
    ).toBe(true);
  });

  it("T1.14 (I15): a failing patch mid-sequence leaves the last good state", () => {
    let d = doc({ blocks: [tableOf(2)] });

    d = unwrap(
      applyPatch(d, { op: "merge", blockId: "t", rows: [{ id: "r3", cells: { name: { text: "c" } } }] }),
    );
    const good = d;

    const failed = applyPatch(d, { op: "status", status: "error" });
    expect(failed.ok).toBe(false);

    // The document the caller still holds is the good one, and it still works.
    expect(tableIn(good).rows).toHaveLength(3);
    const after = unwrap(
      applyPatch(good, { op: "merge", blockId: "t", rows: [{ id: "r4", cells: { name: { text: "d" } } }] }),
    );
    expect(tableIn(after).rows).toHaveLength(4);
  });

  it("T1.19 (§4): replace reaches a block nested in an expanded row's detail", () => {
    // Expanding a row reveals blocks that can themselves be patched. A rewrite
    // that descends into detail to *find* the block but returns the table
    // unchanged would report success and do nothing.
    const table = block({
      kind: "table",
      id: "t",
      columns: [{ key: "n", label: "N", align: "left", priority: 1, minWidth: 4, sortable: false }],
      rows: [
        {
          id: "r1",
          cells: { n: { text: "one" } },
          expanded: true,
          detail: [{ kind: "raw", id: "detail-1", text: "before" }],
        },
      ],
    });

    const after = tableIn(
      unwrap(
        applyPatch(doc({ blocks: [table] }), {
          op: "replace",
          blockId: "detail-1",
          block: block({ kind: "raw", id: "detail-1", text: "after" }),
        }),
      ),
    );

    const detail = after.rows[0]?.detail?.[0];
    expect(detail?.kind === "raw" && detail.text).toBe("after");
  });
});

describe("C04 merge does not delete", () => {
  it("T3.13b (§4): rows absent from the payload survive", () => {
    // Absence from one tick is not evidence of absence. A watch tick that
    // returns fewer rows because a query timed out must not drop them.
    const document = doc({ blocks: [tableOf(6)] });

    const after = tableIn(
      unwrap(
        applyPatch(document, {
          op: "merge",
          blockId: "t",
          rows: [{ id: "r2", cells: { name: { text: "still here" } } }],
        }),
      ),
    );

    expect(after.rows.map((r) => r.id)).toEqual(["r1", "r2", "r3", "r4", "r5", "r6"]);
  });

  it("T3.13 (I8): a merge with an empty payload leaves the document unchanged", () => {
    const document = doc({ blocks: [tableOf(4)] });
    const after = unwrap(applyPatch(document, { op: "merge", blockId: "t", rows: [] }));

    expect(tableIn(after).rows).toBe(tableIn(document).rows);
  });
});
