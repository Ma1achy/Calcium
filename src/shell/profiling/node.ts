/**
 * The one file under `src/` that reads the process (C28 I21).
 *
 * SS-P bans `process.memoryUsage`, `process.cpuUsage`, `process.resourceUsage`,
 * `getActiveResourcesInfo`, `monitorEventLoopDelay`, `eventLoopUtilization`,
 * `PerformanceObserver`, `node:v8` and `node:inspector` everywhere else. It is
 * injected rather than ambient for SS3's stated reason — *nothing ambient in
 * between* — and because a fake probe is what makes a memory assertion
 * deterministic in a unit test.
 *
 * **The clock is injected here too, and that is SS1 rather than tidiness.**
 * This file used to read `performance.now()` for the sample's `at`, which SS1
 * refuses outside `session.ts` and which `make enforce` was failing on. Taking
 * `elapsed` closes it without widening the allow list — and the allow list not
 * growing is the claim `config.ts:133` makes about a two-file version being
 * "the smaller diff and the worse one".
 *
 * **The loop-delay p50 is not a reading, and this is where that is known.**
 * Measured 2026-09-06: idle reads p50 2.00 ms at `resolution: 1`, 13.00 at
 * `10`, 21.00 at `20` — the figure tracks the sampler's interval, not the loop.
 * The `max` responds exactly: against a deliberate 60 ms block it read 61.15 ms.
 * So the resolution travels with the figure (C28 I13) and no consumer presents
 * the p50 as a delay.
 *
 * **What a sample costs, measured, because a sampler is on the hot path of
 * nothing but pays every tick** (2026-09-06, Node v22.23.2):
 *
 * | read | µs |
 * |---|---|
 * | `loop.max` + two percentiles | **53.16** |
 * | `process.memoryUsage()` | 4.39 |
 * | `v8.getHeapSpaceStatistics()` | 3.58 |
 * | `process.resourceUsage()` | 1.02 |
 * | `v8.getHeapStatistics()` | 0.93 |
 * | `process.cpuUsage(base)` | 0.78 |
 * | `performance.getEntries().length` | 0.33 |
 * | `process.getActiveResourcesInfo()` | 0.30 |
 * | `performance.eventLoopUtilization()` | 0.20 |
 *
 * The percentiles dominate at twelve times the next read, which is why the
 * default interval is a second and not a frame. Heap *space* statistics are
 * left out of the sample deliberately: 3.58 µs is affordable but eight spaces
 * of five fields each, sixty-four times over, is a lot of ring for a figure
 * only a heap investigation wants — `heapSpaces()` returns it on demand.
 *
 * **`performance.mark` and `performance.measure` are absent here too**, and
 * that is the second arm of SS-P rather than an oversight: F853 measured that
 * Node's user-timing buffer never releases entries, so a profiler built on the
 * User Timing API becomes the defect it exists to find. This file *reads* the
 * buffer's length as a canary and never writes to it.
 */
import { PerformanceObserver, monitorEventLoopDelay, performance } from "node:perf_hooks";
import { getHeapSpaceStatistics, getHeapStatistics } from "node:v8";

import type { GcKind, ResourceProbe, ResourceSample } from "./types.js";

/** V8's numbers are the API and the names are ours (C28 I16). */
const GC_KINDS: Readonly<Record<number, GcKind>> = Object.freeze({
  1: "minor",
  4: "major",
  8: "incremental",
  16: "weakcb",
});

const RESOLUTION_MS = 10;

/** One heap space, as V8 reports it. Read on demand, never per sample. */
export type HeapSpace = Readonly<{
  name: string; size: number; used: number; available: number; physical: number;
}>;

/**
 * V8's spaces, named and sized. The `ResourceProbe` member calls this; it is a
 * separate function so the read has no dependency on a live probe.
 */
export function heapSpaces(): readonly HeapSpace[] {
  return Object.freeze(
    getHeapSpaceStatistics().map((s) =>
      Object.freeze({
        name: s.space_name,
        size: s.space_size,
        used: s.space_used_size,
        available: s.space_available_size,
        physical: s.physical_space_size,
      }),
    ),
  );
}

/**
 * `elapsed` is the session's monotonic clock, so a sample's `at` is on the same
 * axis as every span. A probe with a clock of its own would put the two on
 * different origins, and nothing downstream could put a GC pause beside the
 * frame it landed in.
 */
export function createResourceProbe(elapsed: () => number): ResourceProbe {
  const loop = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
  loop.enable();

  const gc: Record<GcKind, number> = { minor: 0, major: 0, incremental: 0, weakcb: 0 };
  let gcPauseMs = 0;

  const observer = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      const kind = GC_KINDS[(e as { detail?: { kind?: number } }).detail?.kind ?? 0];
      if (kind !== undefined) gc[kind] += 1;
      gcPauseMs += e.duration;
    }
  });
  observer.observe({ entryTypes: ["gc"] });

  const base = process.cpuUsage();
  // The ELU baseline, so the reported figure is utilisation over the profiled
  // window rather than over the process's whole life — which on a shell that
  // has been open for an hour is a number about the hour.
  const eluBase = performance.eventLoopUtilization();
  const usageBase = process.resourceUsage();
  let disposed = false;

  return {
    sample(suspended: boolean): ResourceSample {
      const mem = process.memoryUsage();
      const cpu = process.cpuUsage(base);
      const usage = process.resourceUsage();
      const heap = getHeapStatistics();

      // Counted by type rather than listed: the list is the same three strings
      // every tick, and the shape that finds a leak is "PipeWrap went from 2 to
      // 900", which a count gives and an array of 900 strings gives worse.
      const handles: Record<string, number> = {};
      for (const h of process.getActiveResourcesInfo()) handles[h] = (handles[h] ?? 0) + 1;

      return Object.freeze({
        at: elapsed(),
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
        arrayBuffers: mem.arrayBuffers,
        heapLimit: heap.heap_size_limit,
        cpuUser: cpu.user / 1000,
        cpuSystem: cpu.system / 1000,
        loopUtilisation: performance.eventLoopUtilization(eluBase).utilization,
        loopDelayMax: loop.max / 1e6,
        loopDelayP50: loop.percentile(50) / 1e6,
        loopDelayP99: loop.percentile(99) / 1e6,
        loopDelayResolutionMs: RESOLUTION_MS,
        gc: Object.freeze({ ...gc }),
        gcPauseMs,
        majorPageFaults: usage.majorPageFault - usageBase.majorPageFault,
        involuntaryContextSwitches:
          usage.involuntaryContextSwitches - usageBase.involuntaryContextSwitches,
        handles: Object.freeze(handles),
        // Read here and never per frame (C28 I19): the read costs 3 µs at zero
        // entries and 449 µs at 10 000, so the canary gets more expensive
        // exactly as its subject gets worse.
        timingEntries: performance.getEntries().length,
        suspended,
      });
    },
    spaces(): readonly HeapSpace[] {
      return heapSpaces();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      loop.disable();
      observer.disconnect();
    },
  };
}
