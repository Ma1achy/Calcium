// C24 T2.11 (I17) — `b.seq` and the preference-versus-explicit distinction.
//
// **This file was written before the implementation it guards, and against a
// deliberately naive `seq`.** The reason is T6.13: a `seq` that clears index 0
// *unconditionally* passes every test anyone would naturally write, because the
// common case is a first block that wanted no gap anyway. The property lives
// only where an **explicit** `gapBefore: true` sits on the first block — the one
// position where the builder's default and the caller's instruction can
// disagree. So the boundary case is not an extra row here; it is the only row
// that tests the rule.
//
// Proven the way `fix-the-fake-then-watch-it-fail` requires: the naive `seq`
// passed "clears a defaulted gap" and "leaves index 1 alone", and failed
// "an explicit gap on the first block survives". A test that had not been shown
// to fail against the defect it names is a test about something else.
import { describe, expect, it } from "vitest";
import { block, validateBlock } from "../../src/data/viewmodel/index.js";
import type { Block, BlockKind } from "../../src/data/viewmodel/index.js";
import { b } from "../../src/shell/builders/index.js";
import { liveDeclarations } from "../../src/shell/builders/live.js";
import type { LiveSpec } from "../../src/shell/builders/types.js";
import { defaulted, seq, wasDefaulted } from "../../src/shell/builders/seq.js";
import { checkMeasurement, formatMeasurementReport } from "../../src/testing/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import { DARK_THEME, FULL_CAPS, measurable, visible } from "../support/render.js";

/** Every kind the builders produce, so nothing renders as `raw` by accident. */
const kit = (): ReturnType<typeof measurable> =>
  measurable({
    definitions: [
      tableDefinition,
      plotDefinition as unknown as BlockDefinition<never>,
      patchDefinition as unknown as BlockDefinition<never>,
    ],
  });

/** A block whose gap is the builder's preference — what a gapping builder returns. */
const preferred = (id: string): Block =>
  defaulted(block({ kind: "raw", id, text: id, gapBefore: true }));

/** A block whose gap the caller asked for. Never marked. */
const asked = (id: string, gapBefore: boolean): Block =>
  block({ kind: "raw", id, text: id, gapBefore });

/** A block with no gap at all — what a non-gapping builder returns. */
const plain = (id: string): Block => defaulted(block({ kind: "raw", id, text: id }));

describe("C24 §4a — b.seq", () => {
  it("T2.11 (I17): clears a defaulted gap on the first block and on no other", () => {
    const out = seq([preferred("a"), preferred("b"), preferred("c")]);

    expect(out[0]?.gapBefore).toBeUndefined();
    expect(out[1]?.gapBefore).toBe(true);
    expect(out[2]?.gapBefore).toBe(true);
  });

  // The half that can be wrong. Everything above passes for a `seq` that
  // clears index 0 without consulting the marker at all.
  it("T2.11 (I17): an EXPLICIT gapBefore: true on the first block survives", () => {
    const out = seq([asked("a", true), preferred("b")]);

    expect(out[0]?.gapBefore).toBe(true);
    expect(out[1]?.gapBefore).toBe(true);
  });

  it("T2.11 (I17): an explicit gapBefore: false on the first block is left alone", () => {
    const out = seq([asked("a", false), preferred("b")]);

    expect(out[0]?.gapBefore).toBe(false);
  });

  it("T2.11: a first block with no gap is returned unchanged, identically", () => {
    const head = plain("a");
    const out = seq([head, preferred("b")]);

    // Identity, not equality: nothing was rebuilt, so nothing could have been
    // rebuilt wrongly.
    expect(out[0]).toBe(head);
  });

  it("T2.11: the marker distinguishes a preference from an instruction", () => {
    expect(wasDefaulted(preferred("a"))).toBe(true);
    expect(wasDefaulted(asked("a", true))).toBe(false);
    expect(wasDefaulted(asked("a", false))).toBe(false);
  });

  it("T2.11: the cleared block is still frozen, and the input is not mutated", () => {
    const head = preferred("a");
    const out = seq([head, preferred("b")]);

    expect(Object.isFrozen(out[0])).toBe(true);
    expect(head.gapBefore).toBe(true); // the original is untouched
    expect(out[0]).not.toBe(head);
  });

  it("T2.11: an empty sequence is an empty sequence", () => {
    expect(seq([])).toEqual([]);
  });
});

// --- the nineteen ----------------------------------------------------------

/**
 * Every block-returning builder, its expected `gapBefore` default, and a call
 * that produces a valid block.
 *
 * **The enumeration is the mechanism** (T2.9, T6.12). §4's prose listed fifteen
 * builders and two of them — `b.keyValue` and `b.diff` — did not exist: the
 * `comparison` rename reached §3, the renderer and the goldens, and not that
 * paragraph. A prose list paired with a table that fails when a builder has no
 * row is what makes that a failing test rather than a sentence nobody re-reads.
 */
const BUILDERS: readonly Readonly<{
  name: string;
  gaps: boolean;
  kind: BlockKind;
  make: (opts?: { id?: string; gapBefore?: boolean }) => Block;
}>[] = [
  { name: "rule", gaps: true, kind: "rule", make: (o) => b.rule("containers", undefined, o) },
  { name: "notice", gaps: false, kind: "notice", make: (o) => b.notice("info", "nine running", undefined, o) },
  { name: "kv", gaps: true, kind: "keyValue", make: (o) => b.kv({ image: "nginx" }, o) },
  {
    name: "table", gaps: true, kind: "table",
    make: (o) => b.table({ ...o, columns: [b.col("name")], rows: [b.row("r1", { name: "web" })] }),
  },
  { name: "steps", gaps: true, kind: "steps", make: (o) => b.steps([{ label: "pull" }], o) },
  { name: "logs", gaps: false, kind: "logs", make: (o) => b.logs([{ ts: "00:00:00", level: "info", message: "up" }], o) },
  { name: "events", gaps: false, kind: "events", make: (o) => b.events([{ ts: "00:00:00", type: "start", message: "up" }], o) },
  { name: "plot", gaps: true, kind: "plot", make: (o) => b.plot({ ...o, series: [{ values: [1, 2, 3] }], height: 4 }) },
  { name: "spark", gaps: false, kind: "plot", make: (o) => b.spark([1, 2, 3], o) },
  { name: "progress", gaps: false, kind: "progress", make: (o) => b.progress({ ...o, label: "pull", current: 3, total: 9 }) },
  { name: "code", gaps: true, kind: "code", make: (o) => b.code("json", '{"a":1}', o) },
  { name: "comparison", gaps: true, kind: "comparison", make: (o) => b.comparison([{ field: "cpu", a: "1", b: "2" }], o) },
  {
    name: "patch", gaps: true, kind: "patch",
    make: (o) => b.patch({ ...o, path: "a.ts", language: "ts", hunks: [{ header: "@@", lines: [{ kind: "context", text: "x" }] }] }),
  },
  { name: "pills", gaps: false, kind: "pills", make: (o) => b.pills([{ label: "running" }], o) },
  { name: "tip", gaps: true, kind: "tip", make: (o) => b.tip("press ? for help", undefined, o) },
  { name: "panel", gaps: true, kind: "panel", make: (o) => b.panel("details", [b.raw("x")], o) },
  { name: "group", gaps: false, kind: "group", make: (o) => b.group("column", [b.raw("x")], o) },
  // **`gaps: false`, like its container siblings.** A scroll is a bounded region
  // inside a composition rather than a section heading, and `finish(..., false)`
  // is what the builder passes.
  { name: "scroll", gaps: false, kind: "scroll", make: (o) => b.scroll(2, [b.raw("x")], o) },
  {
    name: "image",
    gaps: false,
    kind: "image",
    make: (o) =>
      b.image({
        height: 2,
        alt: "a red square",
        data:
          "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEU" +
          "lEQVQImWO4o6GBFTEMLQkAe3tLAeVPQpUAAAAASUVORK5CYII=",
        ...o,
      }),
  },
  {
    // **Returns a `mosaic`, and that is the point** — a composition rather than
    // a kind (C04 §3h). The enumeration is over builders, so it gets a row
    // whatever it returns.
    name: "samples",
    gaps: false,
    kind: "mosaic",
    make: (o) =>
      b.samples({
        columns: 2,
        cellRows: 2,
        items: [
          {
            alt: "a red square",
            label: "red 1.00",
            data:
              "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEU" +
              "lEQVQImWO4o6GBFTEMLQkAe3tLAeVPQpUAAAAASUVORK5CYII=",
          },
        ],
        ...o,
      }),
  },
  {
    name: "mosaic",
    gaps: false,
    kind: "mosaic",
    make: (o) => b.mosaic({ height: 2, areas: "AB", children: [b.raw("a"), b.raw("b")], ...o }),
  },
  { name: "raw", gaps: false, kind: "raw", make: (o) => b.raw("plain text", o) },
  { name: "spinner", gaps: false, kind: "steps", make: (o) => b.spinner("pulling", o) },
  // **`status` gains a row because T2.9 derives from `b`'s own surface** (C24
  // I30). The count was a proxy once and went stale — `b.scroll` shipped with no
  // row — so the enumeration is compared against `Object.keys(b)` by equality and
  // a builder added without a row fails here. It did.
  {
    name: "status",
    gaps: false,
    kind: "status",
    make: (o) => b.status({ message: "the far side is gone" }, null, 1, o),
  },
];

describe("C24 §4 — the twenty-three builders", () => {
  it("T2.9: the enumeration covers every block-returning builder, and twenty-three is the count", () => {
    // The count is asserted so that adding a builder without a row fails here
    // rather than silently going untested — which is exactly how §4's paragraph
    // came to name two builders that did not exist.
    // **The count was the proxy and it went stale.** `b.scroll` shipped with
    // C04 §3c and this table did not gain a row — a builder with no row, which
    // is the exact thing the paragraph above says this assertion prevents. A
    // literal count cannot notice a builder that was never added: 19 entries
    // are 19 entries whatever `b` holds.
    //
    // **Derived from `b`'s own surface now**, with the non-block members named
    // rather than filtered by a predicate: a predicate over return types is a
    // second definition of *block-returning* and would drift from this one.
    const NOT_BLOCKS: Record<string, string> = {
      col: "a ColumnDef, for b.table",
      row: "a TableRow, for b.table",
      seq: "a sequence helper — it composes blocks and returns no block",
      markdown: "a sequence helper — one source is a run of blocks (roadmap 11)",
      id: "cell shorthand", ok: "cell shorthand", warn: "cell shorthand",
      error: "cell shorthand", dim: "cell shorthand", meta: "cell shorthand",
      fill: "an Action", exec: "an Action", open: "an Action",
      live: "returns a Panel, and its own fixture is `liveParts` — C24 §7",
      figure: "returns a FigureBuilder chain, not a Block — .build() produces the Block",
    };
    const blockBuilders = Object.keys(b).filter((k) => !Object.hasOwn(NOT_BLOCKS, k));

    expect([...BUILDERS].map((x) => x.name).sort(), "every block builder has a row").toEqual(
      blockBuilders.sort(),
    );
    expect(BUILDERS.filter((x) => x.gaps).length + BUILDERS.filter((x) => !x.gaps).length).toBe(
      BUILDERS.length,
    );
  });

  it("T2.9 (I15): every builder sets its own gapBefore default", () => {
    for (const { name, gaps, make } of BUILDERS) {
      expect(make().gapBefore ?? false, `${name} default`).toBe(gaps);
    }
  });

  it("T2.9 (I15): an explicit gapBefore of either polarity overrides the default", () => {
    for (const { name, make } of BUILDERS) {
      expect(make({ gapBefore: true }).gapBefore, `${name} explicit true`).toBe(true);
      expect(make({ gapBefore: false }).gapBefore ?? false, `${name} explicit false`).toBe(false);
      // And an explicit value is never a preference, whichever way it went.
      expect(wasDefaulted(make({ gapBefore: true })), `${name} marked`).toBe(false);
      expect(wasDefaulted(make({ gapBefore: false })), `${name} marked`).toBe(false);
    }
  });

  it("T2.9 (I15): b.steps gaps and b.spinner does not, though both return Steps", () => {
    // The row that shows the default belongs to the builder, not the kind. A
    // default keyed on `block.kind` could not express it.
    const steps = BUILDERS.find((x) => x.name === "steps");
    const spinner = BUILDERS.find((x) => x.name === "spinner");
    expect(steps?.kind).toBe(spinner?.kind);
    expect(steps?.gaps).toBe(true);
    expect(spinner?.gaps).toBe(false);
  });

  it("T1.1: every builder produces a block that passes validateBlock", () => {
    for (const { name, make } of BUILDERS) {
      const validity = validateBlock(make());
      expect(validity.ok, `${name}: ${JSON.stringify(validity)}`).toBe(true);
    }
  });

  it("T2.4 (I3): every builder returns a frozen block, never a description", () => {
    for (const { name, make } of BUILDERS) {
      expect(Object.isFrozen(make()), name).toBe(true);
    }
  });

  it("T1.2 (I4): an omitted id is generated and unique; a supplied one is preserved", () => {
    const ids = BUILDERS.map((x) => x.make().id);
    expect(new Set(ids).size, "generated ids collide").toBe(ids.length);

    for (const { name, make } of BUILDERS) {
      expect(make({ id: "chosen" }).id, name).toBe("chosen");
    }
  });

  it("T2.8: every block kind in C04's union has a builder", () => {
    const kinds: readonly BlockKind[] = [
      "rule", "notice", "keyValue", "table", "steps", "logs", "events", "plot",
      "progress", "code", "comparison", "patch", "pills", "tip", "panel",
      "group", "raw",
    ];

    // **Built, not declared.** This read `BUILDERS.map((x) => x.kind)` first,
    // which compares one hand-written list against another and never calls a
    // builder — so a `b.kv` emitting a `comparison` block left the assertion
    // green. A03 §2's vacuity class, arriving as a coverage test.
    const covered = new Set(BUILDERS.map((x) => x.make().kind));
    expect([...kinds].filter((k) => !covered.has(k))).toEqual([]);

    // And the table's own claim about each builder is checked against reality,
    // so the two cannot drift apart silently.
    for (const { name, kind, make } of BUILDERS) {
      expect(make().kind, `${name} declares ${kind}`).toBe(kind);
    }
  });
});

// --- the round-trip control ------------------------------------------------

describe("C24 T4.2 — build, render, assert the frame", () => {
  // A builder producing the wrong shape passes an assertion written against the
  // wrong shape. Asserting the *block* therefore proves nothing the builder
  // could have got wrong; asserting what it renders to does.
  it("T4.2: every builder's output measures correctly at seven widths", () => {
    const r = kit();
    const report = checkMeasurement(r, BUILDERS.map((x) => x.make()));
    expect(report.failures, formatMeasurementReport(report)).toEqual([]);
    expect(report.checked).toBeGreaterThan(0);
  });

  it("T4.2: every builder's output renders at least one row", () => {
    const r = kit();
    for (const { name, make } of BUILDERS) {
      expect(r.renderToLines(make(), 80).length, `${name} rendered nothing`).toBeGreaterThan(0);
    }
  });
});

describe("C24 T4.2 — the two near-pairs, where only the frame separates them", () => {
  const frame = (blk: Block, width = 40): string =>
    kit().renderToLines(blk, width).map(visible).join("\n");

  it("b.kv renders a key and a value; b.comparison renders two aligned values", () => {
    // **Against the frame the block genuinely is**, not against a substring.
    //
    // The first version of this asserted that the keyValue frame contained
    // "cpu" and "1" and not "2". A `b.kv` mutated to emit a *comparison* block
    // with an empty second column renders `cpu  1` and satisfies all three —
    // the assertion passed the exact defect it was written to catch. Absence of
    // a string is not a structural claim, and the trap here is structural.
    //
    // The hand-authored block is the control: it is what a `keyValue` of this
    // content looks like, written without the builder, so an equal frame means
    // the builder produced that block and not something that resembles it. Ids
    // are never rendered (I4), which is what makes the comparison legitimate.
    const expectedKv = block({
      kind: "keyValue", id: "control-kv", rows: [{ label: "cpu", value: "1" }],
    });
    const expectedCmp = block({
      kind: "comparison", id: "control-cmp", rows: [{ field: "cpu", a: "1", b: "2" }],
    });

    expect(frame(b.kv({ cpu: "1" }, { gapBefore: false }))).toBe(frame(expectedKv));
    expect(
      frame(b.comparison([{ field: "cpu", a: "1", b: "2" }], { gapBefore: false })),
    ).toBe(frame(expectedCmp));

    // And the two are genuinely distinguishable at the frame — a key and a
    // value against two aligned values. If these rendered alike, neither
    // assertion above would mean anything.
    expect(frame(expectedKv)).not.toBe(frame(expectedCmp));
  });

  it("T2.12c (F31, C04 I41): b.plot passes `yFormat`, read off the axis", () => {
    // **The omission's reason met its consumer.** C24 §4 withheld this field
    // because `percent` multiplied by 100 and a far side emitting a percentage
    // emits `100.2` — accurate about the trap, and it treated the trap as
    // grounds for withholding rather than as the thing to fix. Renaming the
    // multiplying arm to `fraction` left nothing to withhold.
    //
    // Read off the **rendered axis** on T2.12b's precedent: asserting the field
    // round-trips is the builder restated, and what the field is for is the
    // label. A builder that dropped it renders `100` where `100%` belongs, and
    // the gutter shifts with it.
    const r = kit();
    // Row 0 is the frame's lid (C12 §3f), so the top label is on row 1.
    const axis = (blk: Block): string =>
      renderSequenceToLines(r.registry, seq([blk]), 40, {
        theme: DARK_THEME,
        capabilities: FULL_CAPS,
      })[1] ?? "";

    const cpu = axis(
      b.plot({
        id: "p",
        series: [{ values: [12, 44, 100] }],
        height: 5,
        axes: true,
        yMin: 0,
        yMax: 100,
        yFormat: "percent",
      }),
    );

    expect(cpu, "the arm reached the renderer").toContain("100%");

    // The control: without it the same block labels a bare number, so the row
    // is about the field travelling rather than about `100` appearing at all.
    const plain = axis(
      b.plot({ id: "p", series: [{ values: [12, 44, 100] }], height: 5, axes: true, yMin: 0, yMax: 100 }),
    );
    expect(plain, "and it is the field that put it there").not.toContain("100%");
  });

  it("T2.12b (F27, C04 I29): b.plot passes the pin, read off the axis and not the field", () => {
    // **The defect this rules out was found in a frame, not in a field.**
    //
    // Absent a pin the range is the data's, so a series that is genuinely flat
    // is drawn against its own noise: a container held at 100% rendered a 0.2%
    // wobble as a full-height mountain range. C12 has honoured `yMin` all along
    // and `b.plot` did not pass it, so the block-level rows could not see this.
    //
    // Asserted on the **rendered y-axis labels**, because `yMin: 0` on the block
    // is the code restated — what changed is the picture, and the picture is the
    // reason the field exists.
    const r = kit();
    // **The y-label gutter, not the whole frame** (C12 I41). This joined the
    // rendered lines and asked whether `0` appeared anywhere in them — a proxy
    // for *the y axis reaches zero* that held only while nothing else in the
    // picture wrote a number. The positional family has an x axis now, whose
    // first label is the sample index `0`, and the control failed on a frame
    // whose y axis was correct. The claim was always about the gutter, so that
    // is what is read: everything left of the axis rule.
    const axis = (blk: Block): string =>
      renderSequenceToLines(r.registry, seq([blk]), 40, {
        theme: DARK_THEME,
        capabilities: FULL_CAPS,
      })
        .map((line) => visible(line))
        // A row has a gutter only if it has an axis edge to the right of one.
        // Splitting every row and keeping the head returns the *whole* x-label
        // row, which carries no box-drawing character at all — so the first
        // form of this narrowing still read the sample indices it was written
        // to stop reading.
        .filter((line) => /[┤│]/u.test(line))
        .map((line) => line.split(/[┤│]/u)[0] ?? "")
        .join("\n");

    const flat = [100.0, 100.2, 100.1, 100.2];
    const unpinned = axis(b.plot({ id: "p", series: [{ values: flat }], height: 5, axes: true }));
    const pinned = axis(
      b.plot({ id: "p", series: [{ values: flat }], height: 5, axes: true, yMin: 0 }),
    );

    // The control: unpinned, the axis never reaches the floor the data implies.
    expect(unpinned, "unpinned, the axis is the data's own range").not.toMatch(/(^|\s)0(\s|$)/u);
    // Pinned, it does — which is the whole of what the reader gains.
    expect(pinned, "pinned, the axis is anchored at zero").toMatch(/(^|\s)0(\s|$)/u);
    expect(pinned, "and the two are different pictures").not.toBe(unpinned);
  });

  it("T2.12c (F27, C04 I29): b.plot passes yMax, and it clamps rather than dropping", () => {
    // The pair lands together (C24 §4), so the second half is asserted rather
    // than assumed. C04 I29: out-of-range values clamp to the edge and are never
    // dropped — a pinned axis exists so two plots can be compared.
    const r = kit();
    const rows = (blk: Block): number =>
      renderSequenceToLines(r.registry, seq([blk]), 40, {
        theme: DARK_THEME,
        capabilities: FULL_CAPS,
      }).length;

    const over = [10, 250, 40];
    const capped = b.plot({ id: "p", series: [{ values: over }], height: 5, axes: true, yMax: 100 });
    expect((capped as { yMax?: number }).yMax, "the field reaches the block").toBe(100);
    // The out-of-range point is still drawn — the plot keeps its height rather
    // than losing the row the dropped value would have occupied.
    expect(rows(capped)).toBe(
      rows(b.plot({ id: "p", series: [{ values: over }], height: 5, axes: true })),
    );
  });

  it("b.steps gaps against what precedes it and b.spinner does not", () => {
    // Both return `Steps`, and they differ *only* on the default. A gap is a
    // blank row, so it is invisible in a single block's output — the separating
    // assertion has to be a sequence.
    const r = kit();
    const rows = (blk: Block): readonly string[] =>
      renderSequenceToLines(r.registry, seq([b.raw("above"), blk]), 40, {
        theme: DARK_THEME,
        capabilities: FULL_CAPS,
      });

    const withSteps = rows(b.steps([{ label: "pull" }]));
    const withSpinner = rows(b.spinner("pulling"));

    expect(withSteps.length - withSpinner.length, "the gap is the whole difference").toBe(1);
    expect(visible(withSteps[1] ?? "x").trim(), "row 1 should be the gap").toBe("");
    expect(visible(withSpinner[1] ?? "").trim(), "a spinner gapped").not.toBe("");
  });
});

describe("C24 §4 — the rulings that are not mechanical", () => {
  it("T3.9 (C04 I5/I6): b.notice.error supplies a glyph with no glyph given", () => {
    expect(b.notice.error("no such verb").glyph).toBe("error");
    expect(b.notice.warn("degraded").glyph).toBe("warn");
    // And a given glyph is never overridden.
    expect(b.notice("error", "boom", "cancelled").glyph).toBe("cancelled");
    // Tones that do not require one do not get one.
    expect(b.notice.ok("done").glyph).toBeUndefined();
  });

  it("T1.3: a bare string and a toned cell in one row both produce valid cells", () => {
    const r = b.row("r1", { family: "digit-classifier", status: b.warn("degraded") });
    expect(r.cells["family"]).toEqual({ text: "digit-classifier" });
    expect(r.cells["status"]?.tone).toBe("warn");
    // The cell shorthand supplies the glyph C04 I6 requires, or `cell()` throws.
    expect(r.cells["status"]?.glyph).toBe("warn");
  });

  it("T3.8: b.code defaults to wrap: false", () => {
    expect(b.code("json", "{}").wrap).toBe(false);
    expect(b.code("json", "{}", { wrap: true }).wrap).toBe(true);
  });

  it("§4: b.spark carries no height, because a sparkline's height is its form's", () => {
    expect(b.spark([1, 2, 3]).height).toBeUndefined();
    expect(b.spark([1, 2, 3]).form).toBe("sparkline");
  });

  it("§4: b.panel passes footer through to C04's field", () => {
    expect(b.panel("details", [b.raw("x")], { footer: "j/k move" }).footer).toBe("j/k move");
  });

  it("T3.10: panel inside group inside panel is valid and measures", () => {
    const nested = b.panel("outer", [b.group("column", [b.panel("inner", [b.raw("x")])])]);
    expect(validateBlock(nested).ok).toBe(true);
    expect(kit().measure(nested, 60)).toBeGreaterThan(0);
  });

  it("T3.1: b.table with zero columns is valid and renders its empty message", () => {
    const t = b.table({ columns: [], rows: [], emptyMessage: "no containers" });
    expect(validateBlock(t).ok).toBe(true);
    expect(kit().renderToLines(t, 60).map(visible).join("\n")).toContain("no containers");
  });

  /**
   * C24 I18 — the array arm, and the case the record arm cannot state.
   *
   * The assertion is on the **rendered frame**, not on `rows.length`: what is
   * wrong when a record swallows a duplicate is that the screen shows one
   * binding where the container has two, and a length assertion agrees with a
   * builder that concatenated the two values into one row.
   */
  it("T1.3a (I18): b.kv given an array keeps a repeated label, in order", () => {
    const ports = b.kv([
      { label: "80/tcp", value: "0.0.0.0:8080" },
      { label: "80/tcp", value: "[::]:8080" },
      { label: "443/tcp", value: "127.0.0.1:9090" },
    ]);
    expect(validateBlock(ports).ok).toBe(true);

    const lines = kit().renderToLines(ports, 60).map(visible);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("0.0.0.0:8080");
    expect(lines[1]).toContain("[::]:8080");
    expect(lines[2]).toContain("127.0.0.1:9090");
    // Both rows carry the label, so a reader can tell which port each binding
    // belongs to without counting back to the last one that had a name.
    expect(lines.filter((l) => l.includes("80/tcp"))).toHaveLength(2);
  });

  it("T1.3a (I18): the two arms agree on a value and on a tone", () => {
    const fromRecord = b.kv({ state: b.warn("degraded") }, { id: "k" });
    const fromArray = b.kv([{ label: "state", value: b.warn("degraded") }], { id: "k" });
    expect(fromArray).toEqual(fromRecord);
  });

  it("T3.3: b.kv with 200 rows is valid and measures linearly", () => {
    const rows: Record<string, string> = {};
    for (let i = 0; i < 200; i += 1) rows[`key${String(i)}`] = `value${String(i)}`;
    const big = b.kv(rows);
    expect(validateBlock(big).ok).toBe(true);
    expect(kit().measure(big, 80)).toBe(200);
  });
});

describe("C24 §5 — b.live", () => {
  const base = {
    id: "activity",
    title: "activity",
    render: (d: unknown) => b.raw(String(d)),
  };

  it("T1.4 (C23 I34): it returns a panel whose child is the loading render", () => {
    // **The panel is the point, not a wrapper.** `Panel` is the only kind with a
    // `title`, and the title is where staleness and failure are said (C23 I35,
    // A02 §7 rule 1). A part that rendered a bare table would have nowhere to put
    // either, so the guarantees would hold for some consumers and not others.
    const part = b.live({ ...base, every: 5_000, fetch: () => Promise.resolve(1) });
    expect(part.kind).toBe("panel");
    expect(part.title).toBe("activity");
    expect(part.children).toHaveLength(1);
    // **A `status` at `loading`, not a `notice`** (C23 I51). The notice was
    // static and this animates — `elapsedMs` gives the box something to say
    // while it waits, and the spinner says it is still trying.
    //
    // **Height 1, and it took two frame reads** (F234, F235). The panel above
    // already draws the border and holds the title, so 3 spends a row on a
    // second border; and 2 drew `loading` over `⠋ loading` — the same word
    // twice, with every count agreeing. C09 I31's one-row rung gives `loading`
    // the line that moves, because a waiting box has no cause to state.
    expect(part.children[0]?.kind, "the placeholder is there before anything fetches").toBe(
      "status",
    );
    expect(part.children[0], "and it is the waiting state, sized for the panel").toMatchObject({
      state: "loading",
      height: 1,
    });
    expect(validateBlock(part).ok, "and it is a valid block").toBe(true);
  });

  it("T1.6 (C24 I30, §4b, §8d): b.status builds all three states, and derives what it must", () => {
    // **The kind the framework returns from three places and no builder made.**
    // `/faults` in `examples/plots` drew every failure as `b.notice("error", …)`
    // — a red line of text where the framework draws a bordered box with a tag,
    // a spinner and a countdown — and the obvious reading, that the demo was
    // hand-rolling a shipped kind, was wrong. `b` had thirty builders and none
    // was `status`, `block()` is not exported, and both example apps had made the
    // same substitution independently. *An overridable rendering that can only
    // render worse is the contract half-kept.*
    //
    // **The parameters are `renderError`'s own, in its own order**, which is what
    // makes `renderError: b.status` the null override and
    // `b.group("column", [history, b.status(err, retryInMs, attempt)])` the useful
    // one — the shape that keeps the data the default replaces outright.
    const failed = b.status({ message: "the far side is gone" }, null, 1);
    expect(failed.kind).toBe("status");
    // **`null` means no retry is coming**, which C23 §3d rule 3 makes true of
    // every one-shot and every deterministic `render` throw. Mapping it to
    // `retrying` draws a blank row where the spinner goes (F234).
    expect(failed, "no countdown, so no activity line to draw").toMatchObject({
      state: "error",
      height: 1,
      message: "the far side is gone",
    });
    expect("retryInMs" in failed, "and nothing invented for the absent arm").toBe(false);

    const backing = b.status({ message: "ECONNREFUSED" }, 4000, 3);
    expect(backing, "the countdown and the attempt are relayed, not computed").toMatchObject({
      state: "retrying",
      height: 2,
      retryInMs: 4000,
      attempt: 3,
    });

    const waiting = b.status.loading();
    expect(waiting, "the third state has no error to be handed, so its own door").toMatchObject({
      state: "loading",
      height: 1,
    });

    // **What stays the framework's, which is the whole of the scoping** (C24 §4b).
    // MG27 refuses a builder because *the state is observed, never declared*, and
    // that is right about a consumer **claiming** one. A `renderError` override is
    // *handed* the error, the countdown and the attempt, so relaying them is not
    // claiming — and the members that decide geometry are still not parameters.
    for (const bl of [failed, backing, waiting]) {
      expect("elapsedMs" in bl, "the clock is the driver's").toBe(false);
      expect("spinner" in bl, "the frame set is the renderer's, per capability set").toBe(false);
      // **`framed` is the container's answer and this door never gives it**
      // (C09 §3a, F406). It is asserted here rather than in `BUILDER_OMISSIONS`
      // because a builder *in the same file* does set it — `framedStatus`, for
      // the one caller that puts the box inside `b.live`'s panel — so MG27 reads
      // the field as reachable and cannot see which door reaches it. A rule that
      // asks *does the file set this* cannot answer *can a consumer*, and the
      // difference is the whole of the member.
      //
      // What a consumer would be guessing about is furniture it cannot see: a
      // `renderError` override composing its own `group` is not a container that
      // draws a border, so an app answering this would be answering for the
      // panel above it.
      expect("framed" in bl, "the container's answer, never the consumer's").toBe(false);
      expect(validateBlock(bl).ok, "and each is a valid block").toBe(true);
    }
  });

  it("T1.6a (C24 I30, F234, F235): the height is derived, because it is a frame read", () => {
    // **The one member the scoping does not reach, and the reason is measured.**
    // 1 and 2 are not arithmetic: both boxes land inside `b.live`'s own panel, so
    // three rows spend one on a second border inside the first, and two rows drew
    // `loading` over `⠋ loading` — the same word twice, with `measure` saying 2,
    // `render` drawing 2, and no assertion about rows or precedence able to fail.
    //
    // A consumer choosing a height reintroduces exactly that, so `height` is not
    // an argument. Asserted as the **absence of a way to pass one**: the third
    // positional is the attempt, and `BlockOpts` carries `id` and `gapBefore`.
    const opts = { id: "mine", gapBefore: true } as const;
    const withOpts = b.status({ message: "x" }, null, 1, opts);
    expect(withOpts.id, "the id is the consumer's, as on every builder").toBe("mine");
    expect(withOpts.height, "the height is not").toBe(1);
    expect(Object.keys(opts).includes("height"), "BlockOpts has no height to smuggle one in").toBe(
      false,
    );
  });

  it("T1.6b (C24 I30): the framework's default renderError *is* the builder", () => {
    // **The anti-drift half of the ruling, and the reason the literals came out
    // of `execution.ts` and `builders/index.ts`.** This kind was constructed in
    // three places; two of them were a declaration's default, and a copy drifts —
    // the one that drifts being the one with fewer tests. Now the consumer's
    // override and the framework's fallback are the same code, so a change to one
    // is a change to both or a failure here.
    //
    // Asserted by **equality of the built blocks** rather than by reading
    // `execution.ts`, because a source assertion measures the prose.
    const part = b.live({
      ...base,
      every: 1000,
      fetch: () => Promise.reject(new Error("gone")),
      render: () => b.raw("x"),
    });
    const spec = liveDeclarations([part])[0]?.spec;
    expect(spec, "the declaration is readable from the side that made it").toBeDefined();
    // The default is installed by C23 rather than by the builder, so what is
    // checked here is the shape the builder produces for the same arguments —
    // T1.40 and T1.40b drive the real default through the pipeline.
    const err = { message: "gone" };
    expect(b.status(err, 2000, 2)).toMatchObject({
      kind: "status",
      state: "retrying",
      height: 2,
      retryInMs: 2000,
      attempt: 2,
    });
    expect(b.status(err, null, 2)).toMatchObject({ kind: "status", state: "error", height: 1 });
  });

  it("T1.4b: renderLoading replaces the placeholder and nothing else", () => {
    const part = b.live({
      ...base,
      every: 5_000,
      fetch: () => Promise.resolve(1),
      renderLoading: () => b.raw("warming up"),
    });
    expect(part.children[0]).toMatchObject({ kind: "raw", text: "warming up" });
  });

  it("T3.4, T3.5 (C24 I21, F78): `fetch` is required by the type, and `stream` is gone", () => {
    // **The two throws are deleted and the guarantee is stronger, not weaker.**
    // They policed a choice between `fetch` and `stream` where `stream` did
    // nothing: `partOf` read `spec.fetch ?? (() => Promise.resolve(null))` and
    // nothing anywhere read `spec.stream`, so a part declared with it rendered
    // `render(null)` once — a part that streams nothing looking exactly like a
    // part that produced nothing.
    //
    // A required field is a compile error where the pair was a runtime throw,
    // which is the make-it-unbuildable trade this repository has won on five
    // times. Asserted with `@ts-expect-error` rather than a `toThrow`, because
    // there is no longer a runtime moment to catch: an unused directive is
    // TS2578 and the file stops building, so the assertion checks itself.

    // @ts-expect-error — `fetch` is required (C24 I21). Restoring the optional
    // marker makes this line compile and this file stop building.
    const noFetch: LiveSpec = { ...base, every: 1_000 };
    void noFetch;

    // @ts-expect-error — `stream` no longer exists on the type at all.
    const streaming: LiveSpec = { ...base, fetch: () => Promise.resolve(1), stream: 1 };
    void streaming;

    // And the ordinary declaration still builds, so the two rows above are
    // about the narrowing rather than about the type being broken.
    expect(b.live({ ...base, every: 1_000, fetch: () => Promise.resolve(1) }).kind).toBe("panel");
  });

  it("T3.6: staleAfter below every throws, because a builder cannot warn", () => {
    // The row said *warns*. A builder is pure and has no sink — SS33 bans
    // `console.*`, C02's warnings are C22's channel, and a notice in place of the
    // loading render would let a cosmetic mistake change the first frame. A part
    // stale on every tick it ever runs is a broken declaration, like the two
    // above it.
    expect(() =>
      b.live({ ...base, every: 30_000, staleAfter: 10_000, fetch: () => Promise.resolve(1) }),
    ).toThrow(/stale on every tick/u);

    // The control: equal is fine, and so is a one-shot with no interval to
    // compare against. Without these the row passes for a builder that throws
    // on any `staleAfter` at all.
    expect(() =>
      b.live({ ...base, every: 30_000, staleAfter: 30_000, fetch: () => Promise.resolve(1) }),
    ).not.toThrow();
    expect(() =>
      b.live({ ...base, staleAfter: 10_000, fetch: () => Promise.resolve(1) }),
    ).not.toThrow();
  });
});
