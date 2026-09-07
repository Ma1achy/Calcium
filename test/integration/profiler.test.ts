// C28 — profiler (docs/components/C28_profiler.md §10), tier 4.
//
// Spec-first rows. C28's spec landed alone, ahead of its code, so every
// invariant it declares is named here and nowhere else yet — SP9 is what makes
// that a requirement rather than a courtesy: an invariant no row names is a
// claim nothing was written against, and it reads exactly like one that is
// satisfied.
//
// Each row carries the explicit no-blocker marker rather than a "waits on C28"
// clause, and that is TD3's ruling rather than an omission: COMPONENT_SOURCES
// may not name a path before the path exists, because a missing path reads as
// "not implemented" forever and silently exempts every deferral pointing at it.
// C28 gains its entry on the commit that makes src/shell/profiling/recorder.ts
// real, and from then on these expire the way every other deferral does.
//
// Generated from the spec's own §10 rows, so the two cannot drift apart by
// transcription; a row edited here and not there is a diff a reader can see.
import { describe, expect, it, vi } from "vitest";

import type { ProfileReport, TuiConfig } from "../../src/index.js";
import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";

const settle = async (turns = 3): Promise<void> => {
  for (let i = 0; i < turns; i += 1) await new Promise((r) => setImmediate(r));
};

const MANIFEST: NonNullable<TuiConfig["manifest"]> = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [{ name: "emit", local: true, summary: "append one transcript entry", args: [], flags: [] }],
};

/**
 * One entry per call, with **the same block ids every time** — F892's shape,
 * and the one every fixture in the tree avoids by suffixing an index.
 */
let emitted = 0;
const HANDLERS: NonNullable<TuiConfig["localHandlers"]> = {
  emit: () => ({
    schema: "tui.view/1",
    command: `emit ${String((emitted += 1))}`,
    status: "ok",
    blocks: [
      { kind: "raw", id: "head", text: `entry ${String(emitted)}` } as never,
      { kind: "raw", id: "body", text: `body of entry ${String(emitted)}` } as never,
    ],
  }),
};

describe("C28 — profiler, tier 4 spec-first rows", () => {
  it("T4.2 (C28 I7, C28 I8, C28 I24, C28 I42): a real session, entries sharing block ids, and the attribution is per entry", async () => {
    // **The wiring, which no recorder-level row can see.** T1.67 calls
    // `entry()` itself and would pass on the day nothing in `src/shell/` opened
    // one; this drives a real session and reads the report the shell produced.
    //
    // **The clock is a counter and this row says so.** It advances per *read*,
    // so every leaf span is 1 whatever it wraps (F887) — right for a row about
    // which ids appear and wrong for any row about duration. Nothing here
    // asserts a millisecond.
    vi.useFakeTimers();
    try {
      emitted = 0;
      let seen: ProfileReport | null = null;
      const stdin = fakeStdin();
      const { tui } = await buildSession({
        manifest: MANIFEST,
        localHandlers: HANDLERS,
        stdin: stdin as never,
        profile: {
          tier: "spans",
          elapsed: (() => {
            let t = 0;
            return () => (t += 1);
          })(),
          onReport: (r) => void (seen = r),
        },
      });
      await vi.advanceTimersByTimeAsync(0);
      await settle();

      for (let i = 0; i < 3; i += 1) {
        stdin.emit("/emit");
        await vi.advanceTimersByTimeAsync(0);
        stdin.emit("\r");
        await vi.advanceTimersByTimeAsync(0);
        await settle();
      }
      await tui.stop("exit");

      const report = seen as ProfileReport | null;
      if (report === null) throw new Error("no report arrived");

      // The fixture responds to the thing under test: three entries went in.
      expect(Object.keys(report.byEntry).length, "one row per entry drawn").toBe(3);

      // **The three share both block ids**, so before C28 I42 this was one `raw#head`
      // row carrying three entries' calls — and the ratio it printed was the
      // layout-thrash signal at a node with nothing to recompute (F892).
      const heads = report.nodes.filter((n) => n.key === "raw#head");
      expect(heads.length, "one row per entry, not one row for the id").toBe(3);
      expect(
        new Set(heads.map((n) => n.entry)).size,
        "and each names a different entry",
      ).toBe(3);

      // **Work-only, both tables** (C28 I24). Asserted as a bound against the
      // frames' own latency rather than against a named row: a wait folded in
      // under some other key is the defect, and a row naming one entry cannot
      // see it.
      const entrySum = Object.values(report.byEntry).reduce((n, h) => n + h.sum, 0);
      const kindSum = Object.values(report.byKind).reduce((n, h) => n + h.sum, 0);
      const nodeSum = report.nodes.reduce((n, r) => n + r.self, 0);
      expect(kindSum, "byKind partitions the whole element population").toBeCloseTo(nodeSum, 6);
      expect(entrySum, "byEntry is a part of it, never more").toBeLessThanOrEqual(nodeSum + 1e-9);
      expect(entrySum, "and a real part, not nothing").toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.todo("T4.1 (C28 I1): a real constructGraph with profile absent → the graph is byte-identical to one built without the field, and no profiler object exists — not deferred on a component: lands with the seams wired through construct.ts");
  it.todo("T4.3 (C28 I4): a stream at 1 000 lines/s → wait tracks C03's 33 ms window and work does not — not deferred on a component: lands with the seams wired through construct.ts");
  it.todo("T4.4 (C28 I12): the profiler view open → its own frames are excluded and excluded.selfInflicted is non-zero — not deferred on a component: lands with the seams wired through construct.ts");
  it.todo("T4.5 (C28 I28): a handoff() interval spanning two sampler ticks → the samples exist, carry the interval's mark, and report no CPU figure across it — not deferred on a component: lands with the seams wired through construct.ts");
});
