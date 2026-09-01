// C09 §2a — the window seam, and the height property that carries `skipRows`.
//
// **This file exists because the property was vacuous without it.** The check
// was added to `measurement-conformance.ts`, `builders.test.ts` and
// `table.test.ts` ran it, and a fabricated violation — a window one row short —
// changed nothing: no corpus in either file holds a `logs` block, which is
// currently the only kind that declares a window. An invariant is vacuous until
// its subject exists, and a check that cannot find what it was asked about
// passes exactly like one that is satisfied (A03 §2, SS26).
import { describe, expect, it } from "vitest";

import { checkMeasurement, formatReport } from "../../src/testing/measurement-conformance.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { measurable, visible } from "../support/render.js";
import type { Block, TableRow } from "../../src/data/viewmodel/index.js";

const logs = (n: number): Block =>
  ({
    kind: "logs",
    id: `l${String(n)}`,
    lines: Array.from({ length: n }, (_, i) => ({
      ts: `12:00:${String(i).padStart(2, "0")}`,
      level: i % 3 === 0 ? "error" : "info",
      message: `line ${String(i)} of ${String(n)}`,
    })),
  }) as Block;

/**
 * **Long keys above short ones, and both under `KEY_COLUMN_CAP`** — or the cap
 * masks the drift and the fixture cannot fail. Written first with 31-cell keys
 * against a cap of 20, where every window answers 20 whatever the pin does.
 */
const keyValue = (n: number): Block =>
  ({
    kind: "keyValue",
    id: `kv${String(n)}`,
    rows: [
      // **One label past `KEY_COLUMN_CAP` and the rest under it.** With every
      // label under the cap, a window that pinned an *uncapped* width would
      // answer the same number and the mutation for it is a no-op — the fixture
      // agreeing with a broken implementation and a working one alike.
      { label: "a-key-longer-than-the-twenty-cell-cap", value: "vcap" },
      ...Array.from({ length: Math.min(n, 6) }, (_, i) => ({
        label: `configuration${String(i)}`,
        value: `v${String(i)}`,
      })),
      ...Array.from({ length: Math.max(0, n - 6) }, (_, i) => ({
        label: `k${String(i)}`,
        value: `v${String(i)}`,
      })),
    ],
  }) as Block;

/**
 * **The corpus was `logs` alone, and the header above said so as a fact about
 * the tree**: *the only kind that declares a window*. `patch` has declared one
 * since C25 §3c and `keyValue` does now, so the sentence was true when written
 * and stopped being true without anything noticing — which is the shape a
 * negative claim fails in. The generic I26 property reached neither.
 */
/**
 * A table whose **units are not rows** (C11 §5a).
 *
 * Four things vary independently and the interesting cells are where two of them
 * meet, so the fixture set below crosses them rather than sampling: a header or
 * none, an expanded row whose detail is taller than one row, an action bar
 * costing two, and a sort whose column re-classifies under a slice.
 *
 * **`detail` is two blocks, not one.** A one-row detail makes the overhang case
 * unreachable — the unit is two rows and a range ending inside it is the range
 * ending on a boundary — and every window would balance whether or not
 * `dropRows` existed.
 */
const table = (
  opts: Readonly<{
    rows: number;
    header?: boolean;
    expand?: readonly number[];
    actions?: boolean;
    sorted?: boolean;
  }>,
): Block => {
  const expand = new Set(opts.expand ?? []);
  const rows: TableRow[] = Array.from({ length: opts.rows }, (_, i) => ({
    id: `r${String(i)}`,
    // **The third value is text and the rest are numbers** (F429). A slice that
    // drops it re-classifies the column, so the fixture can fail; a column of
    // uniform numbers cannot tell a re-sort from a no-op.
    cells: { name: { text: `row-${String(i)}` }, v: { text: i === 2 ? "abc" : String((i * 7) % 23) } },
    ...(expand.has(i)
      ? {
          expanded: true,
          detail: [
            {
              kind: "keyValue",
              id: `d${String(i)}`,
              rows: [
                { label: "detail", value: `of row ${String(i)}` },
                { label: "second", value: "so the unit is three rows" },
              ],
            },
          ],
        }
      : {}),
    ...(opts.actions === true && i === 1
      ? { actions: [{ kind: "exec" as const, label: "⏎ open", command: "open" }] }
      : {}),
  })) as TableRow[];

  return {
    kind: "table",
    id: `t${String(opts.rows)}${opts.header === false ? "n" : "h"}${String(expand.size)}${opts.actions === true ? "a" : ""}${opts.sorted === true ? "s" : ""}`,
    columns: [
      { key: "name", label: "Name", align: "left", priority: 1, minWidth: 8, sortable: true },
      { key: "v", label: "V", align: "right", priority: 2, minWidth: 4, sortable: true },
    ],
    rows,
    ...(opts.header === false ? { showHeader: false } : {}),
    ...(opts.sorted === true ? { sort: { key: "v", direction: "asc" as const } } : {}),
  } as Block;
};

const CORPUS: readonly Block[] = [
  logs(1),
  logs(2),
  logs(7),
  logs(40),
  keyValue(1),
  keyValue(7),
  keyValue(36),
  // Each table adds one axis to the one before it, so a failure names which.
  table({ rows: 1 }),
  table({ rows: 4 }),
  table({ rows: 4, header: false }),
  table({ rows: 4, expand: [1] }),
  table({ rows: 5, expand: [0, 3] }),
  table({ rows: 4, actions: true }),
  table({ rows: 5, expand: [2], actions: true }),
  table({ rows: 5, expand: [1, 4], actions: true, sorted: true }),
  table({ rows: 5, header: false, expand: [0], actions: true, sorted: true }),
  // A table with no rows at all: `hasBody` is false, so it is one message row
  // under a header and there is nothing to divide (C11 §5a).
  table({ rows: 0 }),
];

describe("C09 §2a — a block reduced to a valid smaller block", () => {
  it("T2.14 (I26): measure(window) − skipRows === to − from, over every window", () => {
    // `checkMeasurement` walks every start and every length inside each block,
    // so the interesting cells — a boundary landing inside something the kind
    // cannot divide — are covered rather than sampled.
    const r = measurable({ definitions: [tableDefinition] });
    const report = checkMeasurement(r, CORPUS);
    expect(report.failures, formatReport(report)).toEqual([]);

    // **The subject, before the claim.** `formatReport` says "✓ N measurements"
    // for an empty corpus exactly as it does for a clean one, and the window
    // check was landed vacuous once already.
    expect(report.checked, "windows were actually walked").toBeGreaterThan(20);
    expect(report.kindsCovered, "and the kind that declares one is covered").toContain("logs");
    expect(report.kindsCovered, "and the kind that pins a width").toContain("keyValue");
    // **The kind whose units are not rows** (C11 §5a, F428). It is the only one
    // that can overhang the end of a range, so without it in the corpus
    // `dropRows` is a field the property never exercises — the vacuity this file
    // was written about, one field along.
    expect(report.kindsCovered, "and the kind whose units are not rows").toContain("table");

    // **The rows, and the bound that decides how many were read.** `checked`
    // counts (block, width) pairs and says nothing about the row comparison, so
    // a corpus of tall blocks would report identically with every window's
    // content unexamined (C09 §2a).
    expect(report.exactness.read, "windows compared row for row").toBeGreaterThan(200);
  });

  it("T2.20 (I26): the row property has a subject — a window of the right size and the wrong rows", () => {
    // **The fabricated violation for the half the arithmetic cannot see.** T2.15
    // shortens a window and `window-height` fires; this one keeps the count
    // exactly and reverses the content, which is the shape of every real failure
    // at this seam — a different parse (F426), a slice taken in declaration
    // order, a comparator re-derived from the slice (F429). All three balance.
    const r = measurable({ definitions: [tableDefinition] });
    const broken = {
      ...r,
      window: (block: Block, width: number, from: number, to: number) => {
        const out = r.window(block, width, from, to);
        if (out === undefined) return undefined;
        const lines = (out.block as unknown as { lines?: readonly unknown[] }).lines;
        if (lines === undefined) return out;
        return { ...out, block: { ...out.block, lines: [...lines].reverse() } as Block };
      },
    };

    const report = checkMeasurement(broken, [logs(4)]);
    expect(
      report.failures.map((f) => f.check),
      formatReport(report),
    ).toContain("window-rows");
    expect(
      report.failures.map((f) => f.check),
      "and the arithmetic agrees throughout, which is the point",
    ).not.toContain("window-height");
  });

  it("T2.21 (I26a): the seam's `measureChild` decides where a table's units end", () => {
    // **The parameter is used, not merely accepted.** A table row's offset is
    // `header + Σ(1 + detailHeight(row))` and `detailHeight` measures through the
    // child seam, so a window handed a *different* measurer must cut in a
    // different place. Asserting the signature would pass against a window that
    // ignored it — which is how `table` came to be unwindowable for want of a
    // parameter rather than a rule (F428).
    const r = measurable({ definitions: [tableDefinition] });
    const block = table({ rows: 4, expand: [1] }) as Block;

    const real = tableDefinition.window?.(block as never, 60, 0, 3, r.measure);
    const stub = tableDefinition.window?.(block as never, 60, 0, 3, () => 1);

    // Row 1's unit is `1 + detailHeight`, so `[0, 3)` ends inside it either way
    // and the *size* of the overhang is what the child decides: two rows of
    // detail leave 2, one row leaves 1. Asserting only that it overhangs would
    // pass against a window that ignored the seam and guessed a constant.
    expect(real?.dropRows, "two rows of detail hang past `to`").toBe(2);
    expect(stub?.dropRows, "one row of detail hangs one").toBe(1);
  });

  it("T2.16 (C09 I25a): a keyValue's key column is the block's at every window, not the slice's", () => {
    // **The sweep, not one offset** — C25 T3.20's method, one kind over. The
    // drift is a *difference between* two windows, so a row asserting one
    // window's column against a constant passes against a pin that is simply
    // wrong, and a row asserting the top window alone passes against the
    // unpinned behaviour, because the top window is where the long keys are.
    const r = measurable();
    const whole = keyValue(36);
    const total = r.measure(whole, 100);

    const effective: number[] = [];
    for (let from = 0; from < total; from += 1) {
      for (let to = from + 1; to <= total; to += 1) {
        const w = r.registry.windowSequence([whole], 100, from, to);
        const b = w.blocks[0] as { keyWidth?: number; rows: readonly { label: string }[] };
        // **The effective width, not the field.** A window covering the whole
        // block is passed through unsliced and carries no pin — correctly, since
        // deriving from the whole block is what the pin would have said. A row
        // asserting the field reports that as drift.
        // The cap is the renderer's too, so a fallback that omits it is the
        // test disagreeing with the subject rather than the subject drifting.
        effective.push(b.keyWidth ?? Math.min(20, Math.max(...b.rows.map((row) => row.label.length)))); // graphemes-ok
      }
    }
    expect(new Set(effective), "one column across every window").toEqual(new Set([20]));

    // **And the control: the fixture must be able to drift.** A low window holds
    // only short keys, so without the pin it would derive 3 and every value
    // would move eleven columns left as the reader scrolls.
    const low = r.registry.windowSequence([whole], 100, 20, 26);
    const rows = (low.blocks[0] as { rows: readonly { label: string }[] }).rows;
    expect(Math.max(...rows.map((row) => row.label.length)), "unpinned it would derive 3").toBe(3); // graphemes-ok

    // **And the rendered line, because the pin being *set* is not the pin being
    // *used*.** Everything above reads the block; a renderer that derived its
    // own column would satisfy all of it and still shift every value eleven
    // cells left. The observable is where the value starts.
    // **`visible`, because `indexOf` on a styled line is a byte offset and not a
    // column.** The first form of this assertion read the raw line, where the
    // SGR bytes put every index past the threshold whatever the column was — so
    // it passed against a renderer that ignored the pin entirely, and the
    // mutation pass is what said so.
    const line = visible(r.renderToLines(low.blocks[0] as Block, 100)[0] ?? "");
    expect(
      line.indexOf("v13"),
      "the value sits past the block's key column, not the slice's",
    ).toBeGreaterThan(19);
  });

  it("T2.15 (I26): the property has a subject — a wrong window is caught", () => {
    // **The fabricated violation**, because a passing suite is not evidence that
    // a check can fire. This is the mutation the real one survived: a window one
    // row short of what was asked for.
    // Built from the kind's semantics rather than from its definition: a
    // `logs` window is a slice, so a short one is a slice one line shorter.
    // Reaching for `logsDefinition` here got `undefined` — it is not on the
    // barrel — and the check reported `threw` rather than `window-height`,
    // which is a different failure and would have made this row agree for the
    // wrong reason.
    const r = measurable();
    const broken = {
      ...r,
      window: (block: Block, width: number, from: number, to: number) => {
        const out = r.window(block, width, from, to);
        if (out === undefined) return undefined;
        const lines = (out.block as unknown as { lines: readonly unknown[] }).lines;
        return {
          block: { ...out.block, lines: lines.slice(0, Math.max(0, lines.length - 1)) } as Block,
          skipRows: out.skipRows,
          dropRows: out.dropRows,
        };
      },
    };

    const report = checkMeasurement(broken, [logs(7)]);
    expect(
      report.failures.map((f) => f.check),
      formatReport(report),
    ).toContain("window-height");
  });

  it("T2.16 (I27): plot declares no window, and that is how it stays atomic", () => {
    // C12 I1 makes a plot's height a function of the block alone. The assertion
    // is on the **absence of the member**, because that is what the invariant
    // says: a branch returning the block unchanged is something a later edit
    // removes and reads as an oversight either way.
    const r = measurable();
    const plot = { kind: "plot", id: "p", series: [], height: 8 } as unknown as Block;
    expect(r.window(plot, 80, 0, 1), "no window for a plot").toBeUndefined();
  });
});
