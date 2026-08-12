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
import { measurable } from "../support/render.js";
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

const CORPUS: readonly Block[] = [logs(1), logs(2), logs(7), logs(40)];

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
