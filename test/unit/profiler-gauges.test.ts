// C28 I45 — a block kind's own data as a measured input.
//
// **The gauge names what the render walks in full, before the clamp.** `measure`
// returns rows, rows are clamped to the viewport, and every downstream figure is
// therefore a constant in the one variable a caller controls. A `rule` with a
// four-thousand-character label and a `rule` with a two-character one measure 1
// apiece, cost different amounts, and are one row in `nodes`.
//
// The coverage row is the one that found something. It is written as a
// comparison of two sets — the kinds from `DEFAULT_DEFINITIONS`, the gauge names
// from the source — rather than as a list, because **a hand-written list of
// kinds is written by the same reading that missed one**: `image` was called
// covered twice by scans keyed on the file and on a gauge's prefix, and its
// gauge is of the decoder's cache (F906).
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { b } from "../../src/shell/builders/index.js";
import { createProfiler } from "../../src/shell/profiling/recorder.js";
import { DEFAULT_DEFINITIONS } from "../../src/presentation/blocks/index.js";
import { fullRegistry } from "../../src/testing/expect-document.js";
import { instrumentRegistry } from "../../src/shell/profiling/registry-probe.js";
import type { ProbeableRegistry } from "../../src/shell/profiling/registry-probe.js";
import type { BlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import { rgbPng64 } from "../support/png.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import type { ProfileReport } from "../../src/shell/profiling/types.js";

/**
 * One document rendered through the real registry with a real probe.
 *
 * `spans` rather than `counters` only because `report()` is read whole; the
 * gauges themselves are recorded wherever counting is on (C28 I44).
 */
/**
 * One document rendered the way `construct.ts` renders one.
 *
 * **The registry is instrumented as well as the context given a probe**, and the
 * first draft did only the second. `RenderContext.probe` reaches `render`; a
 * definition's `measure` takes its probe from the registry's own slot, which is
 * L4's seam and not L1's. So the draft recorded every render-path gauge and no
 * measure-path one — and `image` decodes in `measure`, so the row read two cache
 * hits, no miss, and no `decode.entries` at all. Nothing about the figures said
 * so: they were all correct, and the one that was missing looks the same as a
 * gauge nobody wrote.
 */
function gaugesOf(doc: readonly Block[], width = 80): ProfileReport["gauges"] {
  const prof = createProfiler({ tier: "spans" }, { elapsed: () => 0, node: "v22.0.0", cpus: 4 });
  const registry = fullRegistry();
  instrumentRegistry(registry as unknown as ProbeableRegistry, prof);
  renderSequenceToLines(registry as BlockRegistry, doc, width, {
    theme: DARK_THEME,
    capabilities: FULL_CAPS,
    probe: prof.asProbe(),
  });
  return prof.report().gauges;
}

/** Every `.ts` under a directory, read whole. */
function sourceUnder(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) sourceUnder(p, out);
    else if (p.endsWith(".ts")) out.push(readFileSync(p, "utf8"));
  }
  return out;
}

describe("per-kind input gauges", () => {
  it("T1.77 (C28 I45): every default kind names a gauge, measured against the definitions", () => {
    const kinds = DEFAULT_DEFINITIONS.map((d) => d.kind).sort();
    const source = sourceUnder("src/presentation").join("\n");
    const prefixes = new Set(
      [...source.matchAll(/\bgauge\(\s*"([A-Za-z0-9]+)\./gu)].map((m) => m[1] ?? ""),
    );

    // **The count is asserted as well as the difference.** A scan whose pattern
    // matched nothing finds no disagreement either, and reports a clean sweep —
    // which is the shape F906's second reading had, with `[a-z.]+` unable to
    // match `keyValue`.
    expect(kinds.length, "the fixture is the whole default set").toBeGreaterThanOrEqual(19);
    expect(prefixes.size, "and the scan found gauges to compare them against").toBeGreaterThan(15);
    expect(kinds.filter((k) => !prefixes.has(k)), "every kind gauges its own input").toEqual([]);
  });

  it("T1.78 (C28 I45): the label is gauged before the truncate, not after", () => {
    const label = "x".repeat(4000);
    const g = gaugesOf(
      [
        b.rule(label, undefined, { id: "r" }),
        b.progress({ id: "p", label, current: 1, total: 2 }),
      ],
      80,
    );

    // **Both halves.** The second is the argument: a gauge taken after the clamp
    // reports the width at every label, which is indistinguishable from a kind
    // nobody instrumented.
    expect(g["rule.label"]?.max, "the whole label stripControl walks").toBe(4000);
    expect(g["progress.label"]?.max, "and the same clamp on progress").toBe(4000);
    expect(
      fullRegistry().measure(b.rule(label, undefined, { id: "r" }), 80),
      "while the row count is 1",
    ).toBe(1);
  });

  it("T1.79 (C28 I45): two independent inputs need two gauges", () => {
    const wide = gaugesOf([
      b.notice("info", "z".repeat(220), undefined, {
        id: "n",
        spans: Array.from({ length: 200 }, (_, i) => ({ from: i, to: i + 1, tone: "muted" as const })),
      }),
    ]);
    // 200 rows of content at width 80, wrapped rather than declared — the rows
    // gauge is taken from what `noticeRows` produced, so the fixture has to
    // actually wrap.
    const tall = gaugesOf([b.notice("info", "y".repeat(80 * 200), undefined, { id: "n" })]);

    // **Written as a pair, because a single gauge passes either arm alone.** The
    // rule under test is that a kind with two growable inputs gets two, and only
    // the case where one of them is flat can show it.
    expect(wide["notice.spans"]?.max, "the spans arm").toBe(200);
    expect(tall["notice.spans"]?.max ?? 0, "which the tall document does not have").toBeLessThan(200);
    expect(tall["notice.rows"]?.max ?? 0, "the rows arm").toBeGreaterThan(100);
    expect(wide["notice.rows"]?.max ?? 0, "which the wide document does not have").toBeLessThan(100);
  });

  it("T1.80 (C28 I45): an image gauges its payload and its pixels, and decode.entries is the control", () => {
    // A real 6×4 PNG from the suite's own encoder, so the row measures the
    // decode rather than a base64 string someone typed.
    const png = rgbPng64(6, 4, (x, y) => [x * 40, y * 60, 10]);
    const g = gaugesOf([b.image({ id: "i", data: png, height: 4, alt: "a" })]);

    expect(g["image.bytes"]?.max, "the payload the decode walks").toBe(png.length);
    expect(g["image.pixels"]?.max, "and the source extent the dither walks").toBe(24);
    // **The control**: this is the gauge that was already there, it is the
    // occupancy of a digest-keyed map, and it reads 1 for a file of any size —
    // which is how the kind read as covered (F906).
    expect(g["decode.entries"]?.max, "unmoved by either").toBe(1);
  });
});

// Record and replay. The rows land with the apparatus; this is
// the spec commit's half (A03 §7a, F814). The invariants are named only inside
// the todo titles, so the coverage signal reports them honestly (F907).
describe("record and replay", () => {
  it.todo(
    "T1.81 (C28 I46): one ordered NDJSON over four taps → the input/resize/far subsequence drives and the frame subsequence is compared — not deferred on a component: lands with src/shell/profiling/record.ts",
  );
  it.todo(
    "T1.82 (C28 I46): a replayed stdout answers columns from the recording, updated before each resize is delivered, with the real terminal's width as the control — not deferred on a component: lands with src/shell/profiling/replay.ts",
  );
  it.todo(
    "T1.83 (C28 I47): the detector runs again on replay and its query escapes appear in the replayed writes; a recorded verdict is the fabricated violation — not deferred on a component: lands with src/shell/profiling/replay.ts",
  );
  it.todo(
    "T1.84 (C28 I15): a torn final line parses, is dropped, and the recording reports truncated rather than throwing — not deferred on a component: lands with src/shell/profiling/record.ts",
  );
  it.todo(
    "T1.85 (C28 I14): two replays of one recording give the same footer cost cell, and it is not the flattened <0.1ms a clock pinned to event boundaries produces — not deferred on a component: lands with src/shell/profiling/replay.ts",
  );
});
