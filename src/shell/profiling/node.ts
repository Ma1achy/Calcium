/**
 * The one file under `src/` that reads the process (C28 I21).
 *
 * SS58 bans `process.memoryUsage`, `process.cpuUsage`, `process.resourceUsage`,
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
 * that is the second arm of SS58 rather than an oversight: F853 measured that
 * Node's user-timing buffer never releases entries, so a profiler built on the
 * User Timing API becomes the defect it exists to find. This file *reads* the
 * buffer's length as a canary and never writes to it.
 */
import { PerformanceObserver, monitorEventLoopDelay, performance } from "node:perf_hooks";
import { Session as InspectorSession } from "node:inspector";
import { getHeapSnapshot, getHeapSpaceStatistics, getHeapStatistics } from "node:v8";

import type { CaptureKind, CaptureResult, GcKind, ResourceProbe, ResourceSample } from "./types.js";

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

// --- the inspector: CPU profiles, allocation sampling, heap snapshots --------

/**
 * Where a capture's bytes go, injected (C28 I17, I21).
 *
 * **`node:fs` is not named here and that is the same argument as the probe's.**
 * A capture that writes through an injected sink can be asserted on in a unit
 * test — bytes in, bytes dropped, the cap reached — without a temp directory,
 * a cleanup step or a test that fails differently on Windows. C20 set the
 * precedent with `HistoryFs` and its reason was the harder one: a hardcoded
 * state path makes a standalone run write beside a real install, silently.
 */
export type CaptureSink = {
  /** Everything after the cap is counted and not written. */
  write(chunk: string): void;
  close(): void;
};

export type CaptureIo = Readonly<{
  /** Opens a sink at `path`, creating parent directories. */
  open(path: string): CaptureSink;
}>;

/**
 * The `node:inspector` face — the one feed that reaches inside code nobody
 * instrumented.
 *
 * The other two feeds are the registry decoration and `ctx.probe`, and both
 * measure a *unit from outside*: a span says `plot#pl-1` cost 8 ms and cannot
 * say which of `figure.ts`'s 3 747 lines spent it. This one samples the stack,
 * so it reaches the line — and it needs no seam, which is what makes *measure
 * anything* true rather than *measure the seams*.
 *
 * **The output formats are V8's, deliberately.** `Profiler.stop` returns
 * `{ nodes, startTime, endTime, samples, timeDeltas }` — that **is** the
 * `.cpuprofile` format, so a capture opens in Chrome DevTools and speedscope
 * with nothing written to render it. Re-encoding it into a shape of ours would
 * be a second implementation of a format two tools already read.
 *
 * **What each costs, measured in the container on Node v22.23.2, 2026-09-07:**
 *
 * | capture | duration | bytes |
 * |---|---|---|
 * | CPU profile over 5 M `Math.sqrt` calls, 100 µs sampling | 73.6 ms | 1.3 KB |
 * | allocation sampling over 200 000 objects | 218.9 ms | 15.5 KB |
 * | heap snapshot, near-empty process | 138 ms | **5.32 MB** |
 * | heap snapshot, 200 000 objects held | **2 621 ms** | **60.56 MB** |
 *
 * **The last row is why I17 caps.** C28 §3 records the snapshot at *5.4 MB and
 * 314 ms on a near-empty process*, which reproduces — and a near-empty process
 * is the floor, not the case. A session holding a transcript pays **11× the
 * bytes and 19× the pause**, and 2.6 s is a visible stall in a terminal that is
 * meant to be running. So `deep` is a tier a reader opts into and a capture
 * stops at a cap it did not choose silently: `truncated` is on the result
 * because a reader holding only the file cannot see the cap that made it.
 */
export type Inspector = Readonly<{
  capture(
    kind: CaptureKind,
    path: string,
    capBytes: number,
    ms: number,
  ): Promise<CaptureResult>;
  dispose(): void;
}>;

/**
 * A sink wrapper that stops at `capBytes` and counts what it refused.
 *
 * **The excess is counted, which means the source is read to the end.** A
 * capture could stop reading at the cap and report `truncated` alone, and the
 * figure a reader needs is *how much bigger* — 8 MB written of 9 is a different
 * situation from 8 of 61, and only one of them says the cap is wrong. I17 asks
 * for the bytes dropped and T1.15 asserts them separately from the bytes
 * written, because a total is satisfied by redistribution.
 */
function capped(sink: CaptureSink, capBytes: number): CaptureSink & {
  readonly written: number;
  readonly dropped: number;
} {
  let written = 0;
  let dropped = 0;
  return {
    write(chunk: string): void {
      // `written` grows by `chunk.length` only where it is within `room`, and by
      // `room` otherwise, so it never passes `capBytes` and `room` is never
      // negative.
      const room = capBytes - written;
      if (chunk.length <= room) {
        sink.write(chunk);
        written += chunk.length;
        return;
      }
      // **This is also the no-room case**, and it used to have a branch of its
      // own: `room <= 0` counted the whole chunk and returned. At `room === 0`
      // the two lines below compute exactly that — an empty slice written, and
      // `chunk.length - 0` counted — so the branch was a fast path that saved a
      // zero-length write and duplicated the arithmetic beside it.
      //
      // It was removed because a mutation deleting its counter **survived**, and
      // chasing that turned up why: no capture can reach it. `cpu` and `alloc`
      // are one `JSON.stringify` and one `write`, and `getHeapSnapshot()`
      // measured **one chunk of 5 193 967 bytes** on a near-empty heap — so the
      // sink is written once per capture and a second chunk never arrives. A
      // branch that cannot be reached cannot be wrong, and deleting it is the
      // repair that does not need a test to defend it (F878).
      sink.write(chunk.slice(0, room));
      written += room;
      dropped += chunk.length - room;
    },
    close(): void {
      sink.close();
    },
    get written(): number {
      return written;
    },
    get dropped(): number {
      return dropped;
    },
  };
}

/**
 * Connect to the in-process inspector.
 *
 * One session for the life of the profiler rather than one per capture: a
 * connect costs nothing measurable and `Profiler.enable` is idempotent, but two
 * live sessions posting to the same domain is a shape with no defined answer.
 */
export function createInspector(elapsed: () => number, io: CaptureIo): Inspector {
  const session = new InspectorSession();
  let connected = false;
  let disposed = false;

  const post = async (method: string, params?: object): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      session.post(method, params as never, (err, result) => {
        if (err !== null) reject(err instanceof Error ? err : new Error(String(err)));
        else resolve((result ?? {}) as Record<string, unknown>);
      });
    });

  const connect = (): void => {
    if (connected) return;
    session.connect();
    connected = true;
  };

  /** A JSON profile, written whole and then capped. */
  const writeJson = (path: string, value: unknown, capBytes: number): {
    bytes: number;
    dropped: number;
  } => {
    const sink = capped(io.open(path), capBytes);
    sink.write(JSON.stringify(value));
    sink.close();
    return { bytes: sink.written, dropped: sink.dropped };
  };

  return {
    async capture(
      kind: CaptureKind,
      path: string,
      capBytes: number,
      ms: number,
    ): Promise<CaptureResult> {
      if (disposed) throw new Error("capture after dispose");
      connect();
      const at = elapsed();
      let bytes = 0;
      let dropped = 0;

      if (kind === "cpu") {
        await post("Profiler.enable");
        await post("Profiler.setSamplingInterval", { interval: 100 });
        await post("Profiler.start");
        await new Promise<void>((r) => {
          setTimeout(r, ms);
        });
        const { profile } = await post("Profiler.stop");
        await post("Profiler.disable");
        ({ bytes, dropped } = writeJson(path, profile, capBytes));
      } else if (kind === "alloc") {
        await post("HeapProfiler.enable");
        // 32 KB: V8's own default. A smaller interval samples more allocation
        // sites and costs proportionally more, and nothing here has measured
        // which sites a shell misses at the default — so it is the default
        // rather than a number this file invented.
        //
        // **An idle window produces a valid, empty profile, and that reads as a
        // broken capture.** Measured over a 300 ms window: a workload doing
        // arithmetic and allocating nothing gives **153 bytes with
        // `head.children` empty**; the same window with 20 000 objects per tick
        // gives **43 586 bytes and one child**. Both are correct. Nothing in the
        // file distinguishes them from a session where sampling never started,
        // which is the absence-indistinguishable-from-failure shape — so the
        // figures are here, and a reader holding a small `.heapprofile` can tell
        // which they have.
        await post("HeapProfiler.startSampling", { samplingInterval: 32768 });
        await new Promise<void>((r) => {
          setTimeout(r, ms);
        });
        const { profile } = await post("HeapProfiler.stopSampling");
        await post("HeapProfiler.disable");
        ({ bytes, dropped } = writeJson(path, profile, capBytes));
      } else {
        // Consumed as a stream rather than concatenated, which is what lets the
        // cap refuse without the whole snapshot being held — **when the stream
        // chunks**. Measured on a near-empty heap it does not: one chunk of
        // 5 193 967 bytes, so at this size the string exists whatever this loop
        // does. The 60 MB case (§3b) has not been measured for chunk count, so
        // the loop stays and the claim it used to make does not (F878).
        const sink = capped(io.open(path), capBytes);
        for await (const chunk of getHeapSnapshot()) sink.write(String(chunk));
        sink.close();
        bytes = sink.written;
        dropped = sink.dropped;
      }

      return Object.freeze({
        kind,
        path,
        bytes,
        truncated: dropped > 0,
        droppedBytes: dropped,
        durationMs: elapsed() - at,
        // A capture that returned is not an abandoned one; only `dispose` sets
        // this, and only for a capture it did not wait out (C28 I17).
        abandoned: false,
      });
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (connected) session.disconnect();
    },
  };
}
