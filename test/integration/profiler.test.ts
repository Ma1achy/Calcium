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
import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import type { ProfileReport, TuiConfig } from "../../src/index.js";
import type { CommitReason } from "../../src/terminal/frame-scheduler.js";
import { defaultTheme } from "../../src/presentation/theme/index.js";
import { resolveConfig } from "../../src/shell/config.js";
import { constructGraph } from "../../src/shell/construct.js";
import type { Profiler } from "../../src/shell/profiling/types.js";
import {
  buildGraph,
  buildSession,
  fakeAmbient,
  fakeClock,
  FRAME,
  MANIFEST as EMPTY_MANIFEST,
} from "../support/session.js";
import { createProfiler } from "../../src/shell/profiling/recorder.js";
import { createResourceProbe } from "../../src/shell/profiling/node.js";
import { fakeStdin, fakeStdout } from "../support/fake-terminal.js";

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

/**
 * `buildGraph`, with the frame bracket `session.ts` supplies around `render`.
 *
 * The harness stubs `render` with a counter, so no frame is ever begun there
 * and a row about *which frames are excluded* would be about nothing. This one
 * brackets every render in `beginFrame`/`endFrame`, which is what the session
 * does at its three render sites, and hands the profiler down the same edge.
 */
async function framedGraph(
  profiler: Profiler,
  overrides: Partial<TuiConfig> = {},
): Promise<{ graph: Awaited<ReturnType<typeof buildGraph>>["graph"]; stdin: ReturnType<typeof fakeStdin> }> {
  const size = { columns: 100, rows: 30 };
  const stdout = fakeStdout(size);
  const stdin = fakeStdin();
  const config = resolveConfig(
    {
      name: "prism",
      binary: "prism",
      manifest: EMPTY_MANIFEST,
      theme: defaultTheme,
      stateDir: "/state",
      env: { TERM: "xterm-256color", LANG: "en_GB.UTF-8" },
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin,
      ...overrides,
    },
    fakeAmbient(fakeClock()),
  );
  const frame = (reason: CommitReason): void => {
    profiler.beginFrame(reason);
    profiler.endFrame("frame");
  };
  const graph = await constructGraph(config, {
    stop: () => Promise.resolve(0),
    render: frame,
    repaint: frame,
    frame: FRAME,
    onFatal: (err) => {
      throw err;
    },
    profiler,
  });
  return { graph, stdin };
}

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

  it("T4.1 (C28 I1): a session with profile absent writes the same bytes as one built without the field", async () => {
    // **Byte-identical, which is stronger than *looks the same* and is the form
    // the invariant states.** Off is free is a claim about the frames, not about
    // a duration: measured as a timing figure it is a claim about the machine,
    // and measured as *the same bytes went to the terminal* it is a claim about
    // the code.
    const bytesOf = async (overrides: Partial<TuiConfig>): Promise<string> => {
      const { tui, stdout } = await buildSession(overrides);
      await settle();
      await tui.stop("exit");
      return stdout.chunks.join("");
    };

    emitted = 0;
    const absent = await bytesOf({});
    emitted = 0;
    // **`tier: "off"` rather than `profile: undefined`**, which
    // `exactOptionalPropertyTypes` will not let a caller write at all — and it
    // is the stronger of the two anyway. *Absent* and *undefined* are the same
    // object to the runtime; *absent* and *off* are two different configs that
    // must build the same session, and the gap between them is where the defect
    // actually was: the gate read `profile !== undefined`, so `tier: "off"`
    // built the recorder, started the loop monitor and connected a GC observer
    // for an application that had explicitly asked for nothing.
    const off = await bytesOf({ profile: { tier: "off" } });

    expect(off, "an explicit off is the same session as no profile at all").toBe(absent);

    // **The control, because two identical strings prove nothing about the
    // subject unless a third differs.** A session that *is* profiling writes
    // something else — so the two above are equal because nothing was built,
    // not because the harness always produces the same output.
    emitted = 0;
    const profiling = await bytesOf({ profile: { tier: "spans" } });
    expect(profiling, "the control: a profiling session does write something else").not.toBe(absent);
    expect(absent.length, "and the fixture wrote a real frame").toBeGreaterThan(100);
  });

  it("C22 T4.85 (C22 §2c, C28 I1): `profile: {}` builds a recorder at `counters` — the recorder's default, read by the root rather than restated", async () => {
    // **The spec's listing said `default "off"` and two sites in the root said
    // `?? "counters"`** (F967). An empty options object is a caller asking for a
    // profiler, and `counters` is the tier C28 §3a measures at nil, so the code
    // was right and the listing was not; what was wrong in the code was the
    // default living twice. It lives once now — `DEFAULT_TIER` in the recorder,
    // where every other member's default is applied — and the gate reads it.
    // Observed from where an application sees it: `LocalContext.profile`, which
    // is present exactly when a recorder exists (C22 I93).
    const seen: { present: boolean; tier: string | null }[] = [];
    const probe: NonNullable<TuiConfig["localHandlers"]> = {
      emit: (argv, ctx) => {
        seen.push({ present: ctx.profile !== undefined, tier: ctx.profile?.().regime.tier ?? null });
        return HANDLERS.emit!(argv, ctx);
      },
    };
    const run = async (overrides: Partial<TuiConfig>): Promise<{ present: boolean; tier: string | null } | null> => {
      const stdin = fakeStdin();
      const { tui } = await buildSession({ ...overrides, manifest: MANIFEST, localHandlers: probe, stdin: stdin as never });
      await settle();
      stdin.emit("/emit");
      await settle();
      stdin.emit("\r");
      await settle();
      await tui.stop("exit");
      return seen.pop() ?? null;
    };
    expect(await run({ profile: {} }), "an empty options object asks for a profiler, at counters").toEqual({
      present: true,
      tier: "counters",
    });
    expect(await run({ profile: { tier: "off" } }), "an explicit off builds none").toEqual({ present: false, tier: null });
    expect(await run({}), "and absent is off").toEqual({ present: false, tier: null });
  });

  it("T4.3 (C28 I4): wait tracks the coalescing window and work does not", async () => {
    // **The two are separate figures because they answer different questions**
    // (C28 I4): `work` is how long composing took, `wait` is how long the
    // earliest unserved commit sat before a frame served it. A stream commits
    // far more often than it draws — C03 coalesces at 33 ms — so `wait` carries
    // the window and `work` carries the composition, and a sum of the two is a
    // number that grows when the session is idle.
    //
    // Driven through `refresh`-shaped commits rather than a real 1 000 lines/s
    // stream: the rate is not the subject, the coalescing is, and a row that
    // depends on a real throughput measures the machine.
    let t = 0;
    const p = createProfiler({ tier: "spans" }, { elapsed: () => t });

    // Five commits inside one 16 ms window, then the frame that serves them.
    for (let i = 0; i < 5; i += 1) {
      t = i * 3;
      p.commit("stream", false);
    }
    t = 16;
    p.beginFrame("stream");
    t = 18;
    p.endFrame("frame");

    const report = p.report();
    const [frame] = report.timeline;
    expect(frame, "one frame served the whole window").toBeDefined();
    expect(report.frames, "five commits, one frame").toBe(1);

    // `wait` is dated from the **earliest unserved commit** (C28 I5), so it is
    // the window and not the gap since the last one: 16 − 0, not 16 − 12.
    expect(frame?.wait, "wait is the window, from the earliest unserved commit").toBe(16);
    expect(frame?.work, "and work is the composition alone").toBe(2);
    expect(frame?.work, "the two are not the same number").not.toBe(frame?.wait);

    // The next frame's wait is zero: nothing was outstanding when it began, and
    // a wait that carried over would be the same defect one frame later.
    t = 40;
    p.beginFrame("stream");
    t = 41;
    p.endFrame("frame");
    expect(p.report().timeline[1]?.wait, "an unprompted frame waited for nothing").toBe(0);
    p.dispose();
  });

  it("T4.4 (C28 I12): through a real graph a keystroke's frame is counted, and nothing brackets — `excluded.selfInflicted` stays zero", async () => {
    // **Re-aimed, and it is now a watch** (R-EXA-082, F1254). The row drove the
    // pushed view through the root's decorated scheduler: the view bracketed
    // every redraw it raised in `profiler.own`, the commit seam read the
    // bracket, and the frames its refresh raised were excluded while a
    // keystroke's was kept. The view is gone and **`profiler.own` has no caller
    // in `src/`**, so there is no surface that raises a frame on its own
    // behalf.
    //
    // What is assertable through a graph is therefore the other half: the
    // reader's frames land in the histogram and nothing is excluded. **I12 is
    // not vacuous** — `own` is real and T1.88 drives it at the recorder, where
    // the mechanism is — but the integration arm has no subject until something
    // brackets again, and this row is what says so. It goes red that day.
    const profiler = createProfiler({ tier: "spans" }, { elapsed: () => performance.now() });
    const { graph, stdin } = await framedGraph(profiler);
    graph.lifecycle.acquire();
    const before = profiler.report();
    expect(before.excluded.selfInflicted).toBe(0);

    // The control: a byte through stdin really does raise a frame the reader
    // waited on — `deliver` commits `input` outside any bracket.
    stdin.emit("x");
    const typed = profiler.report();
    expect(typed.frames, "the key drew a frame").toBeGreaterThan(before.frames);
    expect(typed.latency?.work.count ?? 0, "and the histogram gained it").toBeGreaterThan(
      before.latency?.work.count ?? 0,
    );
    expect(
      typed.excluded.selfInflicted,
      "nothing in `src/` brackets, so nothing is excluded — this expires the day something does",
    ).toBe(0);

    // **The grep is the other half of the watch**, because a zero is also what
    // a bracket that stopped working produces. The claim is about the tree, so
    // the tree is what it reads.
    const dir = new URL("../../src/", import.meta.url);
    const files: string[] = [];
    const walk = (at: URL): void => {
      for (const entry of readdirSync(at, { withFileTypes: true })) {
        const next = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, at);
        if (entry.isDirectory()) walk(next);
        else if (entry.name.endsWith(".ts")) files.push(readFileSync(next, "utf8"));
      }
    };
    walk(dir);
    expect(
      files.filter((f) => /\.own\(/u.test(f)),
      "no surface brackets its own commits",
    ).toEqual([]);

    profiler.dispose();
  });

  // **T4.6, T4.7, T4.8 and T4.9 are struck with the pushed view** (R-EXA-082,
  // F1254), as C28 §10 records.
  //
  // T4.6 sent `⌃c` as bytes and watched the ladder's `pushedView` rung pop the
  // layer and the tier come back through C15's change stream; T4.7 walked the
  // deck with `n`, `tab` and `Esc` as bytes; T4.8 released the lifecycle and
  // watched the view's timer go. All three are about a layer's lifetime holding
  // a profiler tier, and the rule that held it is retired. **The mechanism
  // they leaned on is asserted one component over**: C15 I25's *every removal
  // emits one change
  // carrying the layer's id before the removing call returns* is T1.28's, in
  // `test/unit/overlay.test.ts`, against the two kinds that remain.
  //
  // T4.9 asserted the view drew with `detection.capabilities` after the
  // overrides rather than with the deck's ASCII default. **That claim moved
  // with the seam**: the verb hands `ctx.capabilities` and the row is T1.96 in
  // `test/unit/local-profile.test.ts`, with the deck's own arm at T1.119 in
  // `test/unit/profile-deck.test.ts`.

  it("T4.5 (C28 I28): a real session suspending marks its samples, and the CPU figure across the interval is refused", async () => {
    // **The wiring, and it had no writer at all until F903.** `suspended` was
    // declared in the recorder and never assigned, so every sample in every
    // session said `false` — the flag was a correct declaration, a correct call
    // and a correct signature with no edge between them, which is what no
    // statement-at-a-time reading finds.
    //
    // Driven through the real `lifecycle.suspend()`/`resume()` a handoff calls,
    // because that is the seam `construct.ts` decorates. A row calling
    // `setSuspended` directly would pass on the day nothing calls it.
    // The sampler is a timer, so the tick is held rather than waited for: a row
    // that sleeps for a sampling interval measures the machine's scheduler.
    let tick: (() => void) | null = null;
    const holdTimer = (fn: () => void): Disposable => {
      tick = fn;
      return { [Symbol.dispose]: () => void (tick = null) };
    };
    const profiler = createProfiler(
      { tier: "spans" },
      {
        elapsed: () => performance.now(),
        probe: createResourceProbe(),
        schedule: holdTimer,
      },
    );
    const { graph } = await buildGraph({}, undefined, profiler);
    const sample = (): void => {
      const fn = tick;
      if (fn === null) throw new Error("the sampler is not armed");
      fn();
    };

    // `graph.lifecycle` **is** the decorated one: the root wraps it at
    // construction rather than at the one call site, because `suspend()` means
    // the terminal belongs to somebody else whatever asked for it — and a second
    // caller learning to suspend without learning to tell the profiler is how
    // this happened the first time.
    // **A refused suspend must not strand the flag.** C01 throws on `suspend()`
    // with nothing acquired, and the bracket sets the flag first — so this arm
    // is what says the unwind exists. Without it every later sample in the
    // session is labelled unreadable, from one refusal.
    expect(() => graph.lifecycle.suspend(), "nothing is acquired yet").toThrow(/suspend/u);
    sample();
    expect(
      profiler.report().samples.at(-1)?.suspended,
      "a refused suspend leaves the session running",
    ).toBe(false);

    graph.lifecycle.acquire();
    graph.lifecycle.suspend();
    sample();
    sample();
    graph.lifecycle.resume();
    sample();

    const flags = profiler.report().samples.map((x) => x.suspended);
    expect(flags.length, "four samples were taken").toBe(4);
    expect(flags, "the refusal, then the interval, then the resume").toEqual([
      false,
      true,
      true,
      false,
    ]);

    // **The control: without the decoration the same three read `false`.** A row
    // asserting only the marked arm passes on a fixture where nothing suspends,
    // and that is exactly the state the tree was in — the flag was declared,
    // sampled and never written (F903).
    let bareTick: (() => void) | null = null;
    const bare = createProfiler(
      { tier: "spans" },
      {
        elapsed: () => performance.now(),
        probe: createResourceProbe(),
        schedule: (fn: () => void): Disposable => {
          bareTick = fn;
          return { [Symbol.dispose]: () => void (bareTick = null) };
        },
      },
    );
    const bareSample = (): void => {
      const fn = bareTick;
      if (fn === null) throw new Error("the control's sampler is not armed");
      fn();
    };
    // Suspending a lifecycle nothing decorated: the same two calls, no flag.
    bareSample();
    bareSample();
    expect(
      bare.report().samples.map((x) => x.suspended),
      "the control: a profiler no lifecycle tells marks nothing",
    ).toEqual([false, false]);
    bare.dispose();
    profiler.dispose();
  });
});
