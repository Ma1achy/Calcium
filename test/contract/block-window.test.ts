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
import { measurable, visible } from "../support/render.js";
import type { Block } from "../../src/data/viewmodel/index.js";

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
const CORPUS: readonly Block[] = [
  logs(1),
  logs(2),
  logs(7),
  logs(40),
  keyValue(1),
  keyValue(7),
  keyValue(36),
];

describe("C09 §2a — a block reduced to a valid smaller block", () => {
  it("T2.14 (I26): measure(window) − skipRows === to − from, over every window", () => {
    // `checkMeasurement` walks every start and every length inside each block,
    // so the interesting cells — a boundary landing inside something the kind
    // cannot divide — are covered rather than sampled.
    const r = measurable();
    const report = checkMeasurement(r, CORPUS);
    expect(report.failures, formatReport(report)).toEqual([]);

    // **The subject, before the claim.** `formatReport` says "✓ N measurements"
    // for an empty corpus exactly as it does for a clean one, and the window
    // check was landed vacuous once already.
    expect(report.checked, "windows were actually walked").toBeGreaterThan(20);
    expect(report.kindsCovered, "and the kind that declares one is covered").toContain("logs");
    expect(report.kindsCovered, "and the kind that pins a width").toContain("keyValue");
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
