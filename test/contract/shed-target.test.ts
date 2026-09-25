// C09 I113, I108 — a row that sheds says so with `+n`, and is a target whose
// peek holds what it withheld (§104, parked 19).
//
// **Read from the frame and from the registry, never from `shedRow`.** The mark
// and the elements are two readers of one plan, so a row asserting the plan
// would agree with both whether or not they agree with each other.
import { describe, expect, it } from "vitest";

import { block, type Block } from "../../src/data/viewmodel/index.js";
import { ASCII_CAPS, FULL_CAPS, measurable, registry } from "../support/render.js";

const SGR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "gu");
const plain = (line: string): string => line.replace(SGR, "");

/** The row's last token, which is where the mark is drawn. */
const lastToken = (row: string): string => row.trimEnd().split(" ").at(-1) ?? "";

/**
 * Each shedding kind, the width it sheds at, the width it does not, and what
 * each item withheld at the narrow one — label against full text.
 *
 * **The narrow widths were read off the frame**, one per kind, as the widest
 * width at which the kind draws a mark — `keyValue` 7–9, `events` 16–24,
 * `comparison` 14 and below, `steps` 9 alone (below it the reservation gives
 * way and the detail goes unmarked). The expected detail is what the frame at
 * that width does not show.
 */
const CASES: readonly Readonly<{
  kind: string;
  block: Block;
  narrow: number;
  wide: number;
  firstRow: number;
  withheld: readonly (readonly Readonly<{ label: string; value: string }>[])[];
}>[] = [
  {
    kind: "keyValue",
    block: block({
      kind: "keyValue",
      id: "k",
      rows: [
        { label: "endpoint", value: "https://api.internal.example/v2" },
        { label: "region", value: "eu-west-1" },
      ],
    }),
    narrow: 9,
    wide: 60,
    firstRow: 0,
    withheld: [
      [{ label: "endpoint", value: "https://api.internal.example/v2" }],
      [{ label: "region", value: "eu-west-1" }],
    ],
  },
  {
    kind: "events",
    block: block({
      kind: "events",
      id: "e",
      events: [
        { ts: "22:13:20", type: "deploy", message: "rolled the fleet forward" },
        { ts: "22:14:02", type: "warn", message: "one node lagged" },
      ],
    }),
    narrow: 24,
    wide: 60,
    firstRow: 0,
    withheld: [
      [{ label: "type", value: "deploy" }],
      [{ label: "type", value: "warn" }],
    ],
  },
  {
    kind: "comparison",
    block: block({
      kind: "comparison",
      id: "c",
      labels: ["before", "after"],
      rows: [
        { field: "latency", a: "412 ms", b: "119 ms" },
        { field: "throughput", a: "3.2k/s", b: "9.8k/s" },
      ],
    }),
    narrow: 14,
    wide: 60,
    firstRow: 1,
    withheld: [
      [{ label: "before", value: "412 ms" }],
      [{ label: "before", value: "3.2k/s" }],
    ],
  },
  {
    kind: "steps",
    block: block({
      kind: "steps",
      id: "s",
      steps: [
        { label: "install dependencies", state: "done", detail: "412 packages in 9s" },
        { label: "run the whole suite", state: "active" },
      ],
    }),
    narrow: 9,
    wide: 60,
    firstRow: 0,
    // The second step has no detail: it draws the block's mark and withheld
    // nothing of its own, so it is a target with no peek.
    withheld: [[{ label: "install dependencies", value: "412 packages in 9s" }], []],
  },
];

describe("C09 I113 — a shed row is a target", () => {
  it("T1.80 (C09 I108, I113): the shed mark is `+n` and the same string at both rungs", () => {
    for (const c of CASES) {
      const full = measurable({ capabilities: FULL_CAPS }).renderToLines(c.block, c.narrow).map(plain);
      const ascii = measurable({ capabilities: ASCII_CAPS }).renderToLines(c.block, c.narrow).map(plain);
      const items = full.slice(c.firstRow);
      expect(items.length, `${c.kind} draws its items`).toBe(c.withheld.length);
      for (const row of items) expect(lastToken(row), `${c.kind}@${String(c.narrow)} |${row}|`).toMatch(/^\+[0-9]+$/u);
      // The same mark at both rungs, row for row — the lead is not a slot.
      expect(ascii.map(lastToken), `${c.kind}: the rungs draw one mark`).toEqual(full.map(lastToken));
      // The old lead is in no shed row, at either rung.
      for (const row of [...full, ...ascii]) expect(row, `${c.kind}: no residue lead`).not.toMatch(/(⋯|\.\.\.)[0-9]/u);
    }
  });

  it("T1.81 (C09 I113, C26 §5): a shedding kind publishes one row element per item whose detail is exactly the withheld parts, and none when nothing sheds", () => {
    const r = registry();
    for (const c of CASES) {
      const elements = r.elementsOf(c.block, c.narrow);
      expect(elements.map((e) => e.id), `${c.kind}: one element per item`).toEqual(
        c.withheld.map((_, i) => `shed-${String(i)}`),
      );
      elements.forEach((e, i) => {
        expect(e.level, `${c.kind} ${e.id}`).toBe("row");
        expect(e.rows, `${c.kind} ${e.id} sits on its item's row`).toEqual({ from: c.firstRow + i, to: c.firstRow + i + 1 });
        const want = c.withheld[i] ?? [];
        if (want.length === 0) {
          expect(e.detail, `${c.kind} ${e.id} lost nothing, so it has no peek`).toBeUndefined();
        } else {
          expect(e.detail?.kind, `${c.kind} ${e.id}`).toBe("keyValue");
          expect(e.detail?.kind === "keyValue" ? e.detail.rows.map(({ label, value }) => ({ label, value })) : null, `${c.kind} ${e.id}: exactly what it withheld`).toEqual(want);
        }
      });
      // **The frame agrees**: every withheld value is absent from the drawn row.
      const drawn = measurable({ capabilities: FULL_CAPS }).renderToLines(c.block, c.narrow).map(plain);
      c.withheld.forEach((parts, i) => {
        for (const p of parts) expect(drawn[c.firstRow + i], `${c.kind} row ${String(i)} does not draw ${p.value}`).not.toContain(p.value);
      });
      // The control: at a width that sheds nothing the kind is atomic, as it was.
      expect(r.elementsOf(c.block, c.wide), `${c.kind}@${String(c.wide)} sheds nothing`).toEqual([]);
    }
  });

  it("T1.82 (C09 I113, C02 I9): the elements never under-list at the wide convention", () => {
    // `±` is East-Asian Ambiguous: `±±` is two cells at `narrow` and four at
    // `wide`, which moves the value's floor and so the width the row sheds at.
    const kv = block({
      kind: "keyValue",
      id: "k",
      rows: [
        { label: "tolerance", value: "±±" },
        { label: "drift", value: "±±" },
      ],
    });
    const WIDE = { ...FULL_CAPS, ambiguousWidth: "wide" as const };
    const r = registry();
    let covered = 0;
    let overListed = 0;
    for (let width = 4; width <= 14; width += 1) {
      const ids = new Map(r.elementsOf(kv, width).map((e) => [e.id, e]));
      const wide = measurable({ capabilities: WIDE }).renderToLines(kv, width).map(plain);
      wide.forEach((row, i) => {
        if (!/^\+[0-9]+$/u.test(lastToken(row))) return;
        const e = ids.get(`shed-${String(i)}`);
        expect(e, `wide@${String(width)} row ${String(i)} draws a mark and has no element`).toBeDefined();
        expect(e?.detail?.kind === "keyValue" ? e.detail.rows.map((x) => x.value) : [], `wide@${String(width)} row ${String(i)}`).toEqual(["±±"]);
        covered += 1;
      });
      // The limit, in its chosen direction: a narrow row that draws the value
      // can still be a target — over-listing, never under-listing.
      const narrow = measurable({ capabilities: FULL_CAPS }).renderToLines(kv, width).map(plain);
      narrow.forEach((row, i) => {
        if (row.includes("±±") && ids.has(`shed-${String(i)}`)) overListed += 1;
      });
    }
    // Read off the frame: marks at 7, 8 and 9 on both rows at `wide`, and the
    // two rows at 8 and 9 that a narrow terminal still draws whole.
    expect(covered, "the wide render sheds, so there are marks to cover").toBe(6);
    expect(overListed, "the narrow render over-lists at 8 and 9, as stated").toBe(4);
  });
});
