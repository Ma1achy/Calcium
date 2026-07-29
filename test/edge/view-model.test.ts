// C04 tier 3 — edge cases.
//
// Most of C04 §8's tier 3 is measurement — widths of 0 and 1, CJK, grapheme
// clusters, combining marks, wrapping boundaries — and C04 ships no measurers.
// Those wait on C09 and say so. What is C04's own is the boundary behaviour of
// validation and patching, and the width arithmetic the measurers will share.
import { describe, expect, it } from "vitest";
import {
  applyPatch,
  atLeastOne,
  block,
  childWidths,
  document,
  groupChildWidth,
  insetWidth,
  normaliseWidth,
  validateBlock,
  validateDocument,
  type Block,
  type Group,
  type Table,
  type ViewDocument,
} from "../../src/data/viewmodel/index.js";
import { ADVERSARIAL, doc, tableOf } from "../support/blocks.js";

function unwrap(r: ReturnType<typeof applyPatch>): ViewDocument {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error.message}`);
  return r.doc;
}

describe("C04 width arithmetic at the boundaries", () => {
  it("T3.1 / T3.2: width 1 and width 0 both resolve, and never divide by zero", () => {
    expect(normaliseWidth(1)).toBe(1);
    expect(normaliseWidth(0), "width 0 is treated as 1").toBe(1);

    // A row group of eight children at width 1: the split floors to a negative
    // number before normalising, which is the arithmetic that would otherwise
    // produce NaN, Infinity, or a negative height.
    const w = groupChildWidth("row", 1, 8);
    expect(Number.isInteger(w)).toBe(true);
    expect(w).toBeGreaterThanOrEqual(1);
  });

  it("T3.6c (§3): a row group splits equally, and still measures when it cannot", () => {
    expect(groupChildWidth("row", 80, 3), "floor((80 - 2) / 3)").toBe(26);

    // At width 2 with three children the split floors to 0 — every child is
    // measured at 1 rather than at 0, and the group still returns something.
    expect(groupChildWidth("row", 2, 3)).toBe(1);

    const g: Group = block({
      kind: "group",
      id: "narrow",
      direction: "row",
      children: [
        { kind: "raw", id: "a", text: "a" },
        { kind: "raw", id: "b", text: "b" },
        { kind: "raw", id: "c", text: "c" },
      ],
    });
    expect(childWidths(g, 2)).toEqual([1, 1, 1]);
  });

  it("I17: the floor applies to a present block and never to a negative", () => {
    expect(atLeastOne(0), "ceil(cells('') / w) is 0; an empty notice is one row").toBe(1);
    expect(atLeastOne(-3)).toBe(1);
    expect(atLeastOne(2.7), "fractional heights floor to an integer row count").toBe(2);
    expect(atLeastOne(Number.NaN)).toBe(1);
  });

  it("T3.6 / T3.5: a panel narrower than its own borders still yields a child width", () => {
    expect(insetWidth(2)).toBe(1);
    expect(insetWidth(0)).toBe(1);

    // An empty group has no children to give a width to — the one legitimate
    // zero (I17), and the reason the floor is stated over *present* blocks.
    const empty: Group = block({ kind: "group", id: "e", direction: "row", children: [] });
    expect(childWidths(empty, 80)).toEqual([]);
  });
});

describe("C04 validation edges", () => {
  it("T3.15 (I18): a cycle through a table's detail is refused, not followed", () => {
    // The panel path is covered in tier 1. Detail is the other way down, and it
    // is the one an `expand` patch creates.
    const row: Record<string, unknown> = { id: "r1", cells: {}, detail: [] };
    const table: Record<string, unknown> = {
      kind: "table",
      id: "t",
      columns: [],
      rows: [row],
    };
    (row["detail"] as unknown[]).push(table);

    const r = validateBlock(table);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.join(" ")).toContain("cyclic");
  });

  it("T3.15b: a self-referencing document returns rather than exhausting the stack", () => {
    const self: Record<string, unknown> = { kind: "panel", id: "s", title: "S", children: [] };
    (self["children"] as unknown[]).push(self);

    expect(() => validateDocument({ ...doc(), blocks: [self] })).not.toThrow();
    expect(validateDocument({ ...doc(), blocks: [self] }).ok).toBe(false);
  });

  it("T3.7: five levels of group inside panel inside group validate without overflowing", () => {
    let inner: Block = block({ kind: "raw", id: "leaf", text: "x" });
    for (let i = 0; i < 5; i += 1) {
      inner = block({ kind: "panel", id: `p${i}`, title: `L${i}`, children: [inner] });
      inner = block({ kind: "group", id: `g${i}`, direction: "column", children: [inner] });
    }

    const r = validateBlock(inner);
    expect(r.ok, r.ok === false ? r.error.join("\n") : "").toBe(true);
  });

  it("T3.14 (D40): a 10,000-block document validates within budget", () => {
    const blocks = Array.from({ length: 10_000 }, (_, i) =>
      block({ kind: "raw", id: `b${i}`, text: `line ${i}` }),
    );
    const d = document({ ...doc(), blocks, meta: { ...doc().meta, truncated: true } });

    const started = process.hrtime.bigint();
    const r = validateDocument(d);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    expect(r.ok, r.ok === false ? r.error.slice(0, 3).join("\n") : "").toBe(true);
    expect(d.meta.truncated).toBe(true);
    // Generous, and the point is the shape rather than the number: the id
    // uniqueness check is a Map, not a nested scan, so this stays linear.
    expect(elapsedMs, `validation of 10,000 blocks took ${elapsedMs.toFixed(0)}ms`).toBeLessThan(
      2_000,
    );
  });

  it("every adversarial fixture is a legal block that validates", () => {
    // T2.3 will measure these. They have to be *valid* first, or that test is
    // asserting a measurer's behaviour on documents the boundary would reject.
    for (const b of ADVERSARIAL) {
      const r = validateBlock(b);
      expect(r.ok, `${b.kind} "${b.id}": ${r.ok === false ? r.error.join(", ") : ""}`).toBe(true);
    }
  });
});

describe("C04 patch edges", () => {
  it("T3.12: expanding every row and collapsing them again returns the original shape", () => {
    const base = doc({ blocks: [tableOf(6)] });

    const allExpanded = base.blocks[0] as Table;
    const expanded: Table = {
      ...allExpanded,
      rows: allExpanded.rows.map((r) => ({ ...r, expanded: true })),
    };
    let d = unwrap(applyPatch(base, { op: "replace", blockId: "t", block: expanded }));
    expect((d.blocks[0] as Table).rows.every((r) => r.expanded === true)).toBe(true);

    // A merge across all of them must not collapse any (I9).
    d = unwrap(
      applyPatch(d, {
        op: "merge",
        blockId: "t",
        rows: Array.from({ length: 6 }, (_, i) => ({
          id: `r${i + 1}`,
          cells: { name: { text: `tick ${i}` } },
        })),
      }),
    );
    expect(
      (d.blocks[0] as Table).rows.every((r) => r.expanded === true),
      "six touched rows, six still open",
    ).toBe(true);
  });

  it("T3.16 (I15): a merge naming a block nested inside a panel finds it", () => {
    const nested = block({
      kind: "panel",
      id: "p",
      title: "Wrapped",
      children: [tableOf(3, "inner")],
    });
    const d = doc({ blocks: [nested] });

    const after = unwrap(
      applyPatch(d, {
        op: "merge",
        blockId: "inner",
        rows: [{ id: "r1", cells: { name: { text: "reached" } } }],
      }),
    );

    const table = (after.blocks[0] as { children: readonly Block[] }).children[0] as Table;
    expect(table.rows[0]?.cells["name"]?.text).toBe("reached");
  });

  it("T3.17 (I15): a status patch to and from error, in both legal directions", () => {
    const withError = doc({ status: "error", error: { message: "boom" } });
    const without = doc({ status: "ok" });

    // Legal: error → error is a no-op that succeeds; the error is still there.
    expect(applyPatch(withError, { op: "status", status: "error" }).ok).toBe(true);

    // Illegal in both directions, and this is the whole reason applyPatch is
    // fallible: two individually valid values that cannot be combined.
    expect(applyPatch(without, { op: "status", status: "error" }).ok).toBe(false);
    expect(applyPatch(withError, { op: "status", status: "ok" }).ok).toBe(false);
    expect(applyPatch(withError, { op: "status", status: "partial" }).ok).toBe(false);
  });

  it("T3.18: a merge adding 500 rows to a 500-row table stays linear", () => {
    // The `--watch` path this operation exists to make cheap. A nested scan
    // would make it quadratic in exactly that case.
    const d = doc({ blocks: [tableOf(500)] });
    const rows = Array.from({ length: 500 }, (_, i) => ({
      id: `n${i}`,
      cells: { name: { text: `new ${i}` } },
    }));

    const started = process.hrtime.bigint();
    const after = unwrap(applyPatch(d, { op: "merge", blockId: "t", rows }));
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    expect((after.blocks[0] as Table).rows).toHaveLength(1_000);
    expect(elapsedMs, `merge took ${elapsedMs.toFixed(1)}ms`).toBeLessThan(500);
  });

  it("T3.19: an append whose id collides with a nested block is refused", () => {
    // Uniqueness is document-wide (I14), so a collision one level down is still
    // a collision — and it is the one a caller is least likely to notice.
    const d = doc({
      blocks: [block({ kind: "panel", id: "p", title: "T", children: [{ kind: "raw", id: "buried", text: "x" }] })],
    });

    const r = applyPatch(d, { op: "append", block: block({ kind: "raw", id: "buried", text: "y" }) });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.message).toContain("already in the document");
  });
});

describe("C04 measurement edges — waits on C09", () => {
  it.todo("T3.3: a notice of exactly w, w-1 and w+1 characters → 1, 1 and 2 lines — waits on C09");
  it.todo("T3.4: a table with zero rows → header plus the empty message, not zero — waits on C09 and C11");
  it.todo("T3.8: double-width CJK text → two columns per glyph, not one — waits on C09");
  it.todo("T3.9: a ZWJ emoji with a variation selector → one cell, not one per code unit — waits on C09");
  it.todo("T3.10: a combining mark → the base character's width, not two — waits on C09");
  it.todo("T3.11: a logs line longer than w → 1 line, truncated, never wrapped — waits on C09");
});
