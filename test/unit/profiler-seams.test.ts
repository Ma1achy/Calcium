// C28's seams in their owners' specs — spec-first rows.
//
// The profiler is decoration at seams other components own (A02 §2 Seam 6), so
// the invariants it adds are *theirs*: C22's injection and refusal, C03's
// coalescing count, C14's cache reasons, C24's public surface. SP9 requires each
// to be named by a test row, and these are the rows.
//
// **Hand-written, unlike `profiler.test.ts`'s six.** Those are generated from
// C28 §10 so the spec and the suite cannot drift by transcription; these come
// from four different specs' own test sections and have no single source to
// generate from. A generator over four documents would be the second reader of
// a corpus that A03 keeps finding disagreements in.
//
// Every row carries the explicit no-blocker marker: TD3 forbids a
// COMPONENT_SOURCES entry naming a path that does not exist, because a missing
// path reads as "not implemented" forever and silently exempts every deferral
// pointing at it. C28 gains its entry with src/shell/profiling/recorder.ts.
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

import { formatFrameCost } from "../../src/shell/chrome.js";

import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";
import { checkSourceScans } from "../../tools/enforce/source-scans.mjs";

import { HeightCache, createViewport } from "../../src/viewport/viewport/index.js";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { RenderCache } from "../../src/shell/render-cache.js";
import { RenderScratchStore } from "../../src/shell/render-scratch.js";
import { NO_PROBE, type Probe } from "../../src/data/viewmodel/index.js";
import { createProfiler } from "../../src/shell/profiling/recorder.js";
import { createInspector, createResourceProbe, type CaptureIo } from "../../src/shell/profiling/node.js";
import type { Profiler, ProfileReport } from "../../src/shell/profiling/types.js";
import { resolveConfig } from "../../src/shell/config.js";
import { defaultTheme } from "../../src/presentation/theme/index.js";
import type { TuiConfig } from "../../src/shell/types.js";
import { MANIFEST, buildGraph, buildSession, fakeAmbient, fakeClock, fakeFs } from "../support/session.js";
import { harness } from "../support/fake-scheduler.js";
import { W, measureSequence, rowsDoc, wrappingDoc } from "../support/viewport.js";

describe("C22 — the root's injection, refusal and capture path", () => {
  it("T1.51 (C22 I92): a graph built with profile absent allocates nothing, and the arms are shown to respond", async () => {
    // **Asserted on call counts and a constructor count, never on a timing
    // figure.** "Off is free" measured as a duration is a claim about the
    // machine; measured as *`elapsed` was called zero times* it is a claim
    // about the code, and it is the same claim the invariant makes.
    const Real = globalThis.FinalizationRegistry;
    let made = 0;
    let calls = 0;
    let scheduled = 0;

    // **Through `Ambient`, because that is where the two live.** `elapsed` and
    // `schedule` are not `TuiConfig` fields, so a row passing them in the config
    // overrides hands the graph a function it will never call and then asserts
    // that it was not called. The first draft of this row did exactly that and
    // was green; `tsc` is what said so.
    const clock = fakeClock();
    const ambient = {
      ...fakeAmbient(clock),
      elapsed: (): number => (calls += 1),
      schedule: (fn: () => void, ms: number) => {
        scheduled += 1;
        const t = setTimeout(fn, ms);
        return { [Symbol.dispose]: () => void clearTimeout(t) };
      },
    };

    try {
      globalThis.FinalizationRegistry = function FakeRegistry(this: unknown, cb: never) {
        made += 1;
        return new Real(cb);
      } as unknown as typeof Real;

      made = 0;
      calls = 0;
      const before = scheduled;
      const { graph } = await buildGraph({}, undefined, undefined, ambient);
      expect(graph.probe, "no profile, so nothing to hand down").toBeUndefined();
      expect(calls, "the injected elapsed is never called").toBe(0);
      expect(made, "and no FinalizationRegistry is registered").toBe(0);
      const withoutProfile = scheduled - before;

      // **The control, and it is the whole row.** Every arm above is an absence,
      // and an absence assertion passes on a harness that could never produce
      // the thing — a graph that never has a probe, a fake `elapsed` nothing was
      // ever going to read, a counter patched onto the wrong global. So each is
      // taken again with a profiler built over the same ambient, and must move.
      made = 0;
      calls = 0;
      const during = scheduled;
      // **With a probe, because the sampler is what registers.** A profiler at
      // `spans` with no `ResourceProbe` schedules nothing, so a control without
      // one reads zero and says nothing about the seam.
      const profiler = createProfiler(
        { tier: "spans" },
        {
          elapsed: ambient.elapsed,
          schedule: ambient.schedule,
          probe: createResourceProbe(ambient.elapsed),
        },
      );
      const profilerUnderControl = profiler;
      expect(calls, "the control: a profiler reads the injected elapsed").toBeGreaterThan(0);

      // **The registry is built on the first `track`, not on construction**, so
      // the control has to reach it — and the difference is the invariant one
      // rung down: a profiler raised to `counters` and never asked to track
      // holds none either. A control that stopped at `createProfiler` would
      // read zero here and would have been rewritten as a weaker assertion.
      expect(made, "a profiler that has tracked nothing registers none either").toBe(0);
      profilerUnderControl.track("Control", { held: true });
      expect(made, "the control: tracking one class registers one").toBeGreaterThan(0);
      expect(
        scheduled - during,
        "the control: a sampling profiler registers with the injected schedule",
      ).toBeGreaterThan(0);
      // …and the graph without one added no registration of its own beyond the
      // session's, which is the figure the first arm is measured against.
      expect(withoutProfile, "the unprofiled graph schedules only what it always did").toBeLessThan(
        scheduled - during + withoutProfile,
      );

      const withProfiler = await buildGraph({}, undefined, profiler, ambient);
      expect(withProfiler.graph.probe, "the control: a probe does reach the graph").toBeDefined();
      profiler.dispose();
    } finally {
      globalThis.FinalizationRegistry = Real;
    }
  });

  it("T1.52 (C22 I93): no component below src/shell/ imports the profiler, the two edges above it are named, and the scan is shown to fire", () => {
    // **The second half of the invariant, and the half that can be checked.**
    // The first — every decorated seam hands down a function the root wrapped —
    // is what T1.57 drives with a real graph; asserted here it would pass on the
    // day nothing calls the seam, which is the failure mode the row's own text
    // names. What a corpus scan can say is the structural claim: the import edge
    // does not exist.
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(full);
        else if (full.endsWith(".ts")) files.push(full);
      }
    };
    walk("src");

    const IMPORTS_PROFILING = /from\s+"[^"]*(?:shell\/)?profiling\/[^"]*"/u;

    // **`below src/shell/`, which is the five component layers and not
    // "everywhere else".** Written as *outside `src/shell/`* the scan names two
    // files, and both are correct: `src/index.ts` is C24's published surface,
    // which must name the report's types and the pane and export helpers C24 I31
    // puts on the root, and `src/testing/profile.ts` is the headless harness,
    // which reads a report exactly as a consumer does. Neither is below L4 —
    // they are the surface above it — so the wider reading finds two files that
    // are not the subject and misses nothing that is.
    const LAYERS = ["src/data/", "src/terminal/", "src/presentation/", "src/viewport/", "src/interaction/"];
    const below = (path: string): boolean => LAYERS.some((d) => path.startsWith(d));
    const offenders = (corpus: readonly { path: string; text: string }[]): string[] =>
      corpus.filter((f) => below(f.path) && IMPORTS_PROFILING.test(f.text)).map((f) => f.path);

    const corpus = files.map((path) => ({ path, text: readFileSync(path, "utf8") }));
    // The corpus reaches the layers the rule is about — a scan over nothing
    // agrees with every rule.
    expect(corpus.filter((f) => below(f.path)).length, "the five layers are in the corpus").toBeGreaterThan(100);
    expect(offenders(corpus), "no component below src/shell/ imports the profiler").toEqual([]);

    // **The edges above L4, compared by equality and not by containment.** A
    // subset check lets a new one appear unread, and the new one is always the
    // interesting one: these are the surface and two harness modules, and any
    // other file naming the profiler outside `src/shell/` is a component that
    // learnt about it by a route this row was written to close.
    //
    // `src/testing/replay.ts` is the third and it arrived the way the comment
    // predicted — by a harness needing `parseRecording` and `compareFrames`,
    // which are the replay model rather than the recorder. It is listed rather
    // than excused: `src/testing/` is where a consumer's harness lives, and
    // C22 I93's subject is the layers *below* L4.
    expect(
      corpus.filter((f) => !f.path.startsWith("src/shell/") && IMPORTS_PROFILING.test(f.text)).map((f) => f.path).sort(),
      "the profiler is named above L4 in exactly two places, both by design",
    ).toEqual(["src/index.ts", "src/testing/profile.ts", "src/testing/replay.ts"]);

    // The fabricated violation: one file below L4 given the edge the rule
    // forbids. A rule that cannot name this is a rule that names nothing.
    const fabricated = [
      ...corpus,
      {
        path: "src/presentation/blocks/kinds/plot.ts",
        text: 'import type { Profiler } from "../../../shell/profiling/types.js";\n',
      },
    ];
    expect(offenders(fabricated), "and it fires when the edge appears").toEqual([
      "src/presentation/blocks/kinds/plot.ts",
    ]);
  });

  it("T1.53 (C22 I94): record and replay both set is refused, and the message names both fields", () => {
    const base = {
      name: "prism",
      binary: "prism",
      manifest: MANIFEST,
      theme: defaultTheme,
      stateDir: "/state",
      env: {},
      cwd: "/work",
      clock: () => 0,
      fs: fakeFs(),
      greeting: async () => ({ blocks: [] }),
    } as unknown as TuiConfig;
    const ambient = fakeAmbient();

    // **The message names both**, because a refusal naming one reads as that
    // field being invalid and neither is: the pair is what cannot be held, and
    // a reader told `profile.record is invalid` goes and checks the path.
    let message = "";
    try {
      resolveConfig({ ...base, profile: { record: "/state/r.ndjson", replay: "/state/r.ndjson" } }, ambient);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message, "record is named").toMatch(/profile\.record/u);
    expect(message, "and replay is named beside it").toMatch(/profile\.replay/u);

    // **Both controls, because a gate that refuses everything reads the same.**
    // Neither field takes precedence and each alone is a whole configuration.
    expect(
      () => resolveConfig({ ...base, profile: { record: "/state/r.ndjson" } }, ambient),
      "recording alone",
    ).not.toThrow();
    expect(
      () => resolveConfig({ ...base, profile: { replay: "/state/r.ndjson" } }, ambient),
      "replaying alone",
    ).not.toThrow();
  });

  it("T1.91 (C28 I48, F912): the recording flushes from `process.on(\"exit\")`, and the clock batch is what would be lost", async () => {
    // **The witness NO-EXIT-FLUSH did not have.** F912's whole diagnosis rests
    // on this hook — C01's `signalExit` calls `process.exit` directly, so
    // `Session.#runStop`, where `recording.end()` lives, never runs and the clock
    // reads still in the batch go with it. Its only witness was T5.1, a tier-5
    // row the mutation harness cannot run: tier 5 executes against `dist/`, so a
    // mutation to `src/` is invisible to it without a build per mutation, and
    // the mutation was carried as an absence with a reason rather than a false
    // anchor.
    //
    // This runs at tier 1 by calling the **listener**, never `process.exit` —
    // which would take the runner with it — and by driving the resolved
    // `elapsed`/`clock`, which are the recording's own wrappers. `FLUSH_EVERY`
    // is 512, so ten reads are a batch that has not been written.
    const fs = fakeFs();
    await fs.mkdir("/state");
    const base = {
      name: "prism",
      binary: "prism",
      manifest: MANIFEST,
      theme: defaultTheme,
      stateDir: "/state",
      env: {},
      cwd: "/work",
      clock: () => 0,
      fs,
      greeting: async () => ({ blocks: [] }),
    } as unknown as TuiConfig;
    const ambient = fakeAmbient();

    // **The control, and it is the half the invariant states**: the listener
    // exists only when a recording does. Without it a row asserting *one was
    // added* passes on any process that happens to have an `exit` listener.
    const bare = process.listeners("exit").length;
    resolveConfig({ ...base }, ambient);
    expect(process.listeners("exit").length, "no recording, no listener").toBe(bare);

    const before = process.listeners("exit");
    const resolved = resolveConfig(
      { ...base, profile: { record: "/state/r.ndjson", tier: "spans" } },
      ambient,
    );
    const added = process.listeners("exit").filter((l) => !before.includes(l));
    expect(added, "exactly one listener, added by the recording").toHaveLength(1);

    try {
      const kinds = async (): Promise<readonly string[]> =>
        String(await fs.readFile("/state/r.ndjson"))
          .split("\n")
          .filter((l) => l !== "")
          .map((l) => (JSON.parse(l) as { t: string }).t);

      // The regime is written at construction and nothing else is — asserted, so
      // the batch below is shown to be pending rather than assumed to be.
      expect(await kinds(), "the regime, and only the regime").toEqual(["regime"]);

      for (let i = 0; i < 10; i += 1) {
        resolved.elapsed();
        resolved.clock();
      }
      expect(await kinds(), "ten reads, still unwritten").toEqual(["regime"]);

      // The exit code the runtime would pass; the listener ignores it.
      added[0]!(0);

      const after = await kinds();
      expect(after, "the batch reached the sink").toContain("clock");
      expect(after.at(-1), "and `end` closed the file").toBe("end");
    } finally {
      // The listener outlives this test otherwise, and `resolveConfig` is called
      // with a recording by three other rows in this file.
      process.off("exit", added[0]!);
    }
  });

  it("T1.54 (C22 I95): an unset captureDir resolves under stateDir, and that is the directory the .gitignore of * was written into", async () => {
    // **At a stateDir that is not the default, deliberately.** `DEFAULT_STATE_DIR`
    // is `.calcium` and the recorder's fallback literal is `.calcium/profile`,
    // so at the default every wrong answer is also the right one — which is
    // exactly how F901 survived: two strings agreeing for five characters, with
    // nothing resolving either against the other. `grep -rn stateDir
    // src/shell/profiling/` returns zero lines, and it still does; the
    // resolution belongs to the root, which is the only place that knows both.
    const stateDir = "/state/elsewhere";
    const written = new Map<string, string>();
    const dirs = new Set<string>();
    let seen: ProfileReport | null = null;

    const { tui } = await buildSession({
      stateDir,
      fs: {
        readFile: () =>
          Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
        writeFile: (path: string, data: string) => {
          written.set(path, data);
          return Promise.resolve();
        },
        appendFile: () => Promise.resolve(),
        appendFileSync: () => undefined,
        mkdir: (path: string) => {
          dirs.add(path);
          return Promise.resolve();
        },
        readDir: () => Promise.resolve([]),
      } as never,
      profile: { tier: "spans", onReport: (r) => void (seen = r) },
    });
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
    await tui.stop("exit");

    const report = seen as ProfileReport | null;
    if (report === null) throw new Error("no report arrived");

    // **The two halves, together, as the invariant states them.** Either alone
    // is satisfied by a path that happens to look right: a capture directory
    // under a state directory nobody ignored, or an ignored directory captures
    // never reach.
    expect(dirs.has(stateDir), "the state directory was created").toBe(true);
    expect(written.get(`${stateDir}/.gitignore`), "and it ignores itself (C22 I67)").toBe("*\n");
    expect(
      report.regime.captureDir.startsWith(`${stateDir}/`),
      `captures land under it — ${report.regime.captureDir}`,
    ).toBe(true);

    // The control: the two are not the same string, so the assertion above is
    // about a resolution and not about an identity. A capture directory equal
    // to the state directory would satisfy `startsWith` and put snapshots in
    // among the preferences.
    expect(report.regime.captureDir, "a directory of its own beneath it").not.toBe(stateDir);
  });

  it("T1.55 (C22 I58, C28 I8): the render cache reports the first axis that rejected, in its own order", () => {
    // Five axes here against C14's two, and the order is the invariant: a slot
    // can disagree on several at once and the reason reported is the first
    // checked. `rev` is coarsest and comes first, because an entry whose content
    // changed owed a re-render whatever else moved with it.
    const cache = new RenderCache();
    const lines = ["a"];

    // **Asserted after each probe, not once at the end.** The `theme` and
    // `focus` lookups are symmetric — one axis moved either way — so swapping
    // the two labels leaves every total identical and a single assertion at the
    // end agrees with the swap. Reading the specific key after the specific
    // lookup is what distinguishes them.
    cache.get("e1", 1, 80, "f", "t");
    expect(cache.misses.absent).toBe(1);

    cache.set("e1", 1, 80, "f", "t", lines);
    cache.get("e1", 1, 80, "f", "t");
    expect(cache.hits).toBe(1);

    cache.get("e1", 1, 80, "f", "other");
    expect(cache.misses.theme, "the theme moved and nothing else did").toBe(1);
    expect(cache.misses.focus).toBe(0);

    cache.get("e1", 1, 80, "other", "t");
    expect(cache.misses.focus, "the focus moved and nothing else did").toBe(1);
    expect(cache.misses.theme).toBe(1);

    cache.get("e1", 1, 99, "f", "t");
    expect(cache.misses.width).toBe(1);

    // Every axis at once: the order decides, and `rev` is first.
    cache.get("e1", 2, 99, "other", "other");
    expect(cache.misses).toEqual({
      absent: 1,
      rev: 1,
      width: 1,
      theme: 1,
      focus: 1,
      "nothing-changed": 0,
    });
  });

  it("T1.56 (C22 I58, C28 I8): the render cache's nothing-changed compares the lines, escapes and all", () => {
    // A re-render producing the same bytes is the thing being counted, so the
    // comparison is on the strings rather than on anything normalised: two rows
    // that look identical and differ in an SGR reset are two different writes.
    const cache = new RenderCache();
    cache.set("e1", 1, 80, "f", "t", ["\u001b[31mx\u001b[39m"]);
    cache.get("e1", 2, 80, "f", "t");
    cache.set("e1", 2, 80, "f", "t", ["\u001b[31mx\u001b[39m"]);
    expect(cache.misses["nothing-changed"]).toBe(1);

    const differing = new RenderCache();
    differing.set("e1", 1, 80, "f", "t", ["\u001b[31mx\u001b[39m"]);
    differing.get("e1", 2, 80, "f", "t");
    differing.set("e1", 2, 80, "f", "t", ["x"]);
    expect(
      differing.misses["nothing-changed"],
      "same glyphs, different bytes — a different write",
    ).toBe(0);
  });
});

describe("C03 — the reason the frame was drawn for", () => {
  it("T1.24 (C03 I16): five coalesced commits render once, for the strictest reason and not the first or the last", () => {
    // **The state is constructed, not stumbled on.** *Strictest*, *first* and
    // *last* are three different answers only when arrival order and strictness
    // order disagree; a sequence that arrives in strictness order is satisfied
    // by all three readings and finds nothing. Among coalesced reasons
    // strictness is the shorter window — `resize` 16, `stream` 33,
    // `spinner` 100 — so the sequence below puts the strictest third of five.
    const { scheduler, render, repaint, clock } = harness();

    scheduler.commit("spinner"); // first — the weakest
    scheduler.commit("stream");
    scheduler.commit("resize"); // strictest, and neither end
    scheduler.commit("spinner");
    scheduler.commit("stream"); // last

    expect(render, "nothing renders while the window is open").not.toHaveBeenCalled();
    clock.advance(16);

    // Five commits, one frame — which is the coalescing half of the invariant.
    expect(render.mock.calls.length + repaint.mock.calls.length, "five commits, one frame").toBe(1);
    // `resize` contaminates (C03 I7), so the one frame is the repaint arm. The
    // reason is what this row is about and the arm is where it is delivered.
    const [reason] = (repaint.mock.calls[0] ?? render.mock.calls[0]) as [unknown];
    expect(reason, "the strictest, not the first").not.toBe("spinner");
    expect(reason, "the strictest, not the last").not.toBe("stream");
    expect(reason, "the strictest").toBe("resize");
  });

  it("T1.25 (C03 I16): a contaminated frame gives repaint the reason, and it is the reason render would have had", () => {
    // **Two runs of the same sequence, one contaminated and one not.** The
    // invariant is that the arm does not change the answer, and a row asserting
    // only the contaminated arm cannot say that: it would pass on an
    // implementation that computed the reason twice, differently.
    const contaminatedRun = harness();
    contaminatedRun.scheduler.commit("spinner");
    contaminatedRun.scheduler.commit("stream");
    contaminatedRun.scheduler.invalidate(); // contamination without a resize commit
    contaminatedRun.clock.advance(33);

    const cleanRun = harness();
    cleanRun.scheduler.commit("spinner");
    cleanRun.scheduler.commit("stream");
    cleanRun.clock.advance(33);

    expect(contaminatedRun.repaint, "contaminated: the repaint arm").toHaveBeenCalledTimes(1);
    expect(contaminatedRun.render, "and not the render arm").not.toHaveBeenCalled();
    expect(cleanRun.render, "clean: the render arm").toHaveBeenCalledTimes(1);

    expect(
      contaminatedRun.repaint.mock.calls[0],
      "and the reason is the same one render was given",
    ).toEqual(cleanRun.render.mock.calls[0]);
    expect(cleanRun.render.mock.calls[0]?.[0], "which is the stricter of the two").toBe("stream");
  });

  it("T6.17 (C03 I16): dropping the argument collapses the profiler's frames-by-reason to one bucket", () => {
    // **Fail-on-revert, and the change it names is at the call site rather than
    // in the scheduler.** `render(reason)` hands the reason across; nothing
    // prevents a caller writing `() => this.#render()` and ignoring it. The
    // scheduler stays green — every one of its own rows asserts what it *passed*
    // — and what catches it is the counter one layer up disagreeing with itself:
    // a session drawing for four different reasons reporting one.
    let t = 0;
    const p = createProfiler({ tier: "spans" }, { elapsed: () => (t += 1) });
    const reasons = ["input", "stream", "resize", "spinner"] as const;

    // The wiring as it is: the reason C03 chose reaches `beginFrame`.
    for (const reason of reasons) {
      p.beginFrame(reason);
      p.endFrame("frame");
    }
    const wired = Object.keys(p.report().byReason).sort();
    expect(wired, "four reasons, four buckets").toEqual(["input", "resize", "spinner", "stream"]);

    // The reverted wiring: a caller that ignores the argument and always passes
    // its own default. Every frame is still counted and the totals still add up,
    // which is why no count-based assertion sees it.
    const q = createProfiler({ tier: "spans" }, { elapsed: () => (t += 1) });
    for (const _ of reasons) {
      q.beginFrame("input");
      q.endFrame("frame");
    }
    const dropped = q.report();
    expect(Object.keys(dropped.byReason), "the reverted wiring: one bucket").toEqual(["input"]);
    expect(dropped.frames, "with the same number of frames in it").toBe(p.report().frames);
    p.dispose();
    q.dispose();
  });
});

describe("C14 — a cache that publishes its size publishes its hit rate", () => {
  it("T1.21 (C14 I27): every reason is asserted by name, because a total is satisfied by redistribution", () => {
    const cache = new HeightCache();

    cache.get("e1", 1, 80); // no slot
    cache.set("e1", 1, 80, 12);
    cache.get("e1", 1, 80); // the hit
    cache.get("e1", 2, 80); // rev moved
    cache.set("e1", 2, 80, 13);
    cache.get("e1", 2, 100); // width moved

    expect(cache.hits).toBe(1);
    // **Each key by name.** A `misses` total of three is produced equally by
    // {absent 3} and by {absent 1, rev 1, width 1}, and the two say opposite
    // things about whether the cache is working — a conservation assertion
    // constrains one number while looking like it constrains three.
    expect(cache.misses).toEqual({ absent: 1, rev: 1, width: 1, "nothing-changed": 0 });

    // **And the cell where the two rules meet**, which every lookup above
    // avoids: each moves one axis, so each tests one rule against itself and
    // agrees. Reversing the comparison order survives all six of them. Here both
    // axes disagree at once and only the order decides the answer.
    cache.get("e1", 3, 120);
    expect(cache.misses.rev, "rev is checked first, so it claims the cell").toBe(2);
    expect(cache.misses.width, "and width does not also count it").toBe(1);
  });

  it("T1.22 (C14 I28): nothing-changed is the recomputed value, not a fourth axis", () => {
    // The axis says what invalidated the slot; this says whether invalidating it
    // bought anything. A `--watch` patching an entry whose height never moves
    // produces a `rev` miss and a full re-measure per patch, and only the two
    // counts together show it.
    const same = new HeightCache();
    same.set("e1", 1, 80, 12);
    same.get("e1", 2, 80); // rev moved
    same.set("e1", 2, 80, 12); // …and the height came back identical
    expect(same.misses.rev).toBe(1);
    expect(same.misses["nothing-changed"], "the re-measure produced the same answer").toBe(1);

    const moved = new HeightCache();
    moved.set("e1", 1, 80, 12);
    moved.get("e1", 2, 80);
    moved.set("e1", 2, 80, 20); // a different height — the work was owed
    expect(moved.misses.rev).toBe(1);
    expect(moved.misses["nothing-changed"], "the height really did change").toBe(0);
  });

  it("T2.15 (C14 I29): the measure seam is told whose blocks these are, and the ids are what is asserted", () => {
    const seen: (string | undefined)[] = [];
    const store = createTranscriptStore({});
    const viewport = createViewport(store, {
      width: W,
      height: 40,
      measureSequence: (blocks, width, entryId) => {
        seen.push(entryId);
        return measureSequence(blocks, width);
      },
    });

    store.append(rowsDoc(3, "a"));
    store.append(rowsDoc(3, "b"));
    viewport.visible();

    // **The ids, not the arity.** A parameter declared and never passed
    // satisfies the type, compiles, and is what a later reader deletes — so a
    // row asserting `measureSequence.length === 3` would be green on exactly the
    // tree this exists to forbid.
    const ids = [...new Set(seen)].sort();
    expect(ids, "each entry's measure names that entry").toStrictEqual([
      store.entries[0]?.id,
      store.entries[1]?.id,
    ].sort());
    expect(seen.includes(undefined), "and none is anonymous").toBe(false);
  });

  it("T6.25 (C14 I29): dropping the id makes every measure anonymous, and the loss reads as chrome", () => {
    // The revert: `(blocks, width) => …`, the shape the seam had before I29.
    // **What makes it dangerous is where the shortfall lands.** C28's `byEntry`
    // falls short of `Σ nodes.self` by whatever belongs to no entry, and a
    // reader is told to expect the chrome there — so an entry short by its
    // height-cache misses is invisible rather than wrong (F892b).
    const seen: (string | undefined)[] = [];
    const store = createTranscriptStore({});
    const viewport = createViewport(store, {
      width: W,
      height: 40,
      measureSequence: (blocks, width) => {
        seen.push(undefined);
        return measureSequence(blocks, width);
      },
    });

    store.append(rowsDoc(3, "a"));
    viewport.visible();

    expect(seen.length, "the seam still runs").toBeGreaterThan(0);
    expect(
      seen.every((id) => id === undefined),
      "and every call is anonymous, which is what T2.15 forbids",
    ).toBe(true);
  });

  it("T6.24 (C14 I28): counting nothing-changed as a fourth axis makes it a number that can never be non-zero", () => {
    // **The revert to guard against is a vacuous counter**, and a vacuous
    // counter reads as a healthy zero for ever. A slot agreeing on `rev` and
    // `width` **is** a hit, so there is no lookup a fourth axis could ever
    // classify — the row constructs the state that would have to produce one and
    // shows it is a hit instead.
    const cache = new HeightCache();
    cache.set("e1", 1, 80, 12);
    cache.get("e1", 1, 80);
    expect(cache.hits).toBe(1);
    expect(
      Object.values(cache.misses).reduce<number>((n, v) => n + v, 0),
      "a slot agreeing on every axis produced no miss of any kind",
    ).toBe(0);
  });

});

describe("C28 I17 — a capture is bounded, and says by how much", () => {
  /** A sink that keeps what it was given, so the cap can be read off it. */
  function fakeIo(): { io: CaptureIo; files: Map<string, string>; closed: number } {
    const files = new Map<string, string>();
    const state = { closed: 0 };
    return {
      files,
      get closed() {
        return state.closed;
      },
      io: {
        open(path: string) {
          files.set(path, "");
          return {
            write: (chunk: string): void => {
              files.set(path, (files.get(path) ?? "") + chunk);
            },
            close: (): void => {
              state.closed += 1;
            },
          };
        },
      },
    };
  }

  const deepProfiler = (io: CaptureIo): Profiler => {
    const clock = fakeClock();
    return createProfiler(
      { tier: "deep", captureDir: "out/test-captures", captureBytes: 64 },
      {
        elapsed: clock.now,
        inspector: createInspector(clock.now, io),
        node: process.version,
        cpus: 1,
      },
    );
  };

  it("T1.15 (C28 I17): the file stops at the cap and the excess is reported separately", async () => {
    // **Asserted separately, because a total is satisfied by redistribution.**
    // `bytes + droppedBytes` is the profile's size however the two are split,
    // and the split is the whole content: 8 MB written of 9 says the cap is
    // about right, and 8 of 61 says it is not.
    const sink = fakeIo();
    const prof = deepProfiler(sink.io);
    const result = await prof.capture("cpu", 1);

    const written = sink.files.get(result.path) ?? "";
    expect(written.length, "the file stops at the cap").toBe(64);
    expect(result.bytes, "and the result agrees with the file").toBe(64);
    expect(result.droppedBytes, "the excess, which the file cannot show").toBeGreaterThan(0);
    expect(result.truncated, "…and the flag a reader holding only the file needs").toBe(true);
    expect(sink.closed, "the sink is closed whether or not the cap was reached").toBe(1);

    // The extension is part of the format: `.cpuprofile` opens in Chrome
    // DevTools and speedscope, and the same bytes named `.json` do not.
    expect(result.path).toMatch(/^out\/test-captures\/cpu-\d+-\d+\.cpuprofile$/u);

    // And the report names it — a file on disk the report does not mention is a
    // file nobody finds.
    const report = prof.report();
    expect(report.captures.map((c) => c.path)).toContain(result.path);
    expect(report.dropped.captureBytes, "counted into the session's drops").toBe(
      result.droppedBytes,
    );
    prof.dispose();
  });

  it("T1.15b (C28 I17): a profile under the cap is written whole and not marked truncated", async () => {
    // **The control the cap row owes.** Every assertion above is satisfied by a
    // capture that always truncates, which is also what a broken writer looks
    // like. The cap here is larger than any profile this can produce.
    const sink = fakeIo();
    const clock = fakeClock();
    const prof = createProfiler(
      { tier: "deep", captureDir: "out/test-captures", captureBytes: 8 * 1024 * 1024 },
      {
        elapsed: clock.now,
        inspector: createInspector(clock.now, sink.io),
        node: process.version,
        cpus: 1,
      },
    );
    const result = await prof.capture("cpu", 1);
    expect(result.truncated, "under the cap").toBe(false);
    expect(result.droppedBytes).toBe(0);
    expect(result.bytes, "and a real profile, not an empty one").toBeGreaterThan(0);
    expect((sink.files.get(result.path) ?? "").length).toBe(result.bytes);
    // The bytes are V8's own `.cpuprofile` shape, which is what makes the file
    // openable without anything written to render it.
    const parsed = JSON.parse(sink.files.get(result.path) ?? "{}") as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(
      ["endTime", "nodes", "samples", "startTime", "timeDeltas"],
    );
    prof.dispose();
  });

  it("T1.15d (C28 I17): a chunk arriving entirely past the cap is counted, not discarded", async () => {
    // **The streamed kind, where the excess is the whole file rather than a
    // tail.** `cpu` and `alloc` serialise to one string and write it; `heap`
    // comes off `getHeapSnapshot()`, and the cap has to hold against whatever
    // that yields.
    //
    // The row was first written to reach `capped`'s no-room branch, on the
    // reading that a snapshot arrives in many chunks. Measured, it arrives in
    // **one** — 5 193 967 bytes — so that branch was unreachable for every kind
    // and has been removed as redundant with the overrun arm beside it (F878).
    // What survives here is the assertion that was always true: the file stops
    // at the cap and the rest is counted rather than lost.
    const sink = fakeIo();
    const prof = deepProfiler(sink.io);
    const result = await prof.capture("heap");

    // A near-empty heap measures about 5.19 MB, so a 64-byte cap keeps 64 bytes
    // and refuses the rest. The two figures are asserted apart because their sum
    // is the snapshot's size however the split falls — 64 of five million says
    // the cap held, and five million of five million says it did not.
    expect(result.bytes, "the cap holds").toBe(64);
    expect(result.droppedBytes, "and the whole snapshot past it is counted").toBeGreaterThan(
      1_000_000,
    );
    expect(result.truncated).toBe(true);
    expect((sink.files.get(result.path) ?? "").length, "the file is the cap, not the snapshot").toBe(
      64,
    );
    prof.dispose();
  });

  it("T3.4 (C28 I17): a capture below tier deep throws and names the tier", async () => {
    // **The refusal names the tier because the alternative is a 0-byte file.**
    // A capture that quietly returns nothing at `counters` produces a reader
    // concluding the process has no heap — the failure being refused is a wrong
    // answer, not a missing one.
    const sink = fakeIo();
    const clock = fakeClock();
    for (const tier of ["off", "counters", "spans", "alloc"] as const) {
      const prof = createProfiler(
        { tier },
        {
          elapsed: clock.now,
          inspector: createInspector(clock.now, sink.io),
          node: process.version,
          cpus: 1,
        },
      );
      await expect(prof.capture("heap"), `at tier ${tier}`).rejects.toThrow(
        new RegExp(`needs tier "deep".*"${tier}"`, "u"),
      );
      prof.dispose();
    }
    expect(sink.files.size, "and nothing was opened on any of the four").toBe(0);
  });

  it("T3.5 (C28 I17): a capture after dispose is refused rather than writing into a closed session", async () => {
    const sink = fakeIo();
    const prof = deepProfiler(sink.io);
    prof.dispose();
    await expect(prof.capture("cpu", 1)).rejects.toThrow(/after dispose/u);
    expect(sink.files.size).toBe(0);
  });

  it("T1.15c (C28 I17): the real writer produces a file that parses, and the sampler reaches a function with no seam", async () => {
    // **Every row above uses a fake sink, and a fake sink cannot be wrong about
    // the filesystem.** What is asserted here is the boundary `session.ts`
    // builds — a held descriptor, `writeSync` per chunk, `mkdirSync` for the
    // parent — and the one claim the whole feed exists for: a CPU profile
    // reaches inside a function nothing instrumented.
    //
    // `.calcium/` because that is the real default's parent and the one
    // directory the repository ignores (`.gitignore:11`); C22 I67 puts a
    // `.gitignore` of `*` in a consuming project's `stateDir` for the same
    // reason.
    const dir = `.calcium/profile-test-${String(process.pid)}`;
    const io: CaptureIo = {
      open(path: string) {
        mkdirSync(dirname(path), { recursive: true });
        const fd = openSync(path, "w");
        return {
          write: (chunk: string): void => void writeSync(fd, chunk),
          close: (): void => {
            closeSync(fd);
          },
        };
      },
    };

    const clock = (): number => performance.now();
    const prof = createProfiler(
      { tier: "deep", captureDir: dir, captureBytes: 8 * 1024 * 1024 },
      { elapsed: clock, inspector: createInspector(clock, io), node: process.version, cpus: 1 },
    );

    try {
      // Named, so the assertion below is about *this* function rather than
      // about the profile being non-empty.
      const spin = setInterval(function calciumProbeHotLoop(): void {
        let x = 0;
        for (let i = 0; i < 2e6; i += 1) x += Math.sqrt(i);
        if (x < 0) throw new Error("unreachable");
      }, 5);
      const result = await prof.capture("cpu", 250);
      clearInterval(spin);

      expect(statSync(result.path).size, "the reported bytes are the file's").toBe(result.bytes);

      const profile = JSON.parse(readFileSync(result.path, "utf8")) as {
        nodes: readonly { callFrame: { functionName: string } }[];
        samples: readonly number[];
      };
      expect(profile.samples.length, "the sampler ran").toBeGreaterThan(0);
      expect(
        profile.nodes.some((n) => n.callFrame.functionName === "calciumProbeHotLoop"),
        "the one claim this feed exists for: a function with no span in it, found by name",
      ).toBe(true);
    } finally {
      prof.dispose();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("T3.4b (C28 I17): a deep profiler with no inspector refuses, and says which half is missing", async () => {
    // The tier and the apparatus are separate conditions and the message has to
    // say which failed: `deep` with no inspector is a wiring defect, and a
    // message about the tier would send a reader to the config.
    const clock = fakeClock();
    const prof = createProfiler(
      { tier: "deep" },
      { elapsed: clock.now, node: process.version, cpus: 1 },
    );
    await expect(prof.capture("cpu", 1)).rejects.toThrow(/no inspector/u);
    prof.dispose();
  });
});

describe("C28 — the process is read in one file, and SS58 is what makes that true", () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
      const path = `${dir}/${entry}`;
      if (statSync(path).isDirectory()) walk(path, out);
      else if (/\.tsx?$/u.test(entry) && !/\.d\.ts$/u.test(entry)) out.push(path);
    }
    return out;
  };

  it("T2.4 (C28 I21): SS58 finds no process read outside node.ts, and fires when one appears", () => {
    // **The rule existed as a citation for as long as the component has.**
    // `node.ts`'s opening comment said *SS58 bans these everywhere else*, C28 §1,
    // I21 and T2.4 all named it, and `grep SS58 tools/enforce/` returned nothing.
    // A rule that is only cited forbids nothing while reading exactly like one
    // that is enforced.
    const scans = checkSourceScans(walk("src"));
    expect(
      scans.filter((v) => v.rule === "SS58"),
      "the tree as it stands",
    ).toEqual([]);

    // **The fabricated violation, because a clean corpus is also what a rule
    // that cannot fire looks like.** `readFile` is injected, so this is the rule
    // `make enforce` runs against a file that does not exist rather than a
    // second copy of the pattern — a restated pattern drifts, and then this row
    // passes while the build check fails.
    const fabricated = checkSourceScans(
      ["src/viewport/viewport/viewport.ts"],
      () => "const m = process.memoryUsage();\nimport { getHeapSnapshot } from \"node:v8\";\n",
    ).filter((v) => v.rule === "SS58");
    expect(fabricated.length, "two lines, both forbidden outside node.ts").toBe(2);

    // **And the control the fabrication owes**: the same reads inside the one
    // file that may make them produce nothing, so the exemption is what is being
    // exercised rather than the pattern failing to match.
    expect(
      checkSourceScans(
        ["src/shell/profiling/node.ts"],
        () => "const m = process.memoryUsage();\n",
      ).filter((v) => v.rule === "SS58"),
      "the allow-listed file may read the process",
    ).toEqual([]);

    // **The allow list is one file, not the directory it sits in**, and nothing
    // above can tell the two apart: every input is either outside
    // `src/shell/profiling/` or is `node.ts` itself, so widening the entry to
    // `src/shell/profiling/` changes no verdict here and survived the mutation
    // pass. The recorder is the sibling that must still be caught — it is where
    // a `process.memoryUsage()` would most plausibly be added, because it is the
    // file that assembles the report the figure would go into.
    expect(
      checkSourceScans(
        ["src/shell/profiling/recorder.ts"],
        () => "const m = process.memoryUsage();\n",
      ).filter((v) => v.rule === "SS58").length,
      "a sibling in the same directory is not exempt",
    ).toBe(1);
  });

  it("T2.4b (C28 I19): SS59's allow list is empty, and node.ts is not exempt from it", () => {
    // **The second arm, and its scope is the reason it is a second rule.** The
    // user-timing buffer is unbounded and reading it costs 449 µs at 10 000
    // entries (C28 I19), so `performance.mark` and `performance.measure` are
    // banned across `src/` with **no** allow list — `node.ts` included. Written
    // as one rule with one allow list, SS58 would have exempted the profiler
    // from the leak it exists to find.
    expect(
      checkSourceScans(walk("src")).filter((v) => v.rule === "SS59"),
      "the tree as it stands",
    ).toEqual([]);

    // The fabrication is placed **in `node.ts`**, which is the only placement
    // that distinguishes this rule from SS58: anywhere else, both would fire.
    const inTheExemptFile = checkSourceScans(
      ["src/shell/profiling/node.ts"],
      () => 'performance.mark("x");\n',
    );
    expect(inTheExemptFile.filter((v) => v.rule === "SS59").length).toBe(1);
    expect(
      inTheExemptFile.filter((v) => v.rule === "SS58"),
      "…and SS58 does not fire there, which is what makes the two rules distinct",
    ).toEqual([]);
  });
});

describe("C24 — the public surface", () => {
  it("T1.9 (C24 I31): the published profiling face is types, the tier order, and nothing that runs", async () => {
    // **The subpath is asserted first, and it is the half that makes the rest
    // mean anything.** This barrel exported five constructors for as long as it
    // existed and nothing in `src/` or `test/` imported it, so the violation was
    // invisible in both directions: no consumer to be wrong, and no entry in
    // `exports` for the rule to apply to. It became live the moment the subpath
    // was added, which is what an invariant that is vacuous until its subject
    // exists looks like from inside.
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      exports: Record<string, { types?: string; default?: string }>;
    };
    const sub = pkg.exports["./profiling"];
    expect(sub?.default, "@fmx/calcium/profiling resolves to the barrel").toBe(
      "./dist/shell/profiling/index.js",
    );

    // **A fresh execution, so "constructs nothing" is measured rather than
    // inferred.** Vitest caches modules, and a namespace read off a module some
    // earlier test already imported says nothing about what importing it does.
    //
    // **Counted by kind, not in total.** The total moved on its own here — 5
    // before the import and 4 after, a handle the harness released while the
    // module was loading — so an equality on it is a row that fails on activity
    // it is not about. What the invariant names is a timer, and that is what is
    // counted.
    const timers = (): number =>
      process.getActiveResourcesInfo().filter((r) => r === "Timeout" || r === "Immediate").length;

    vi.resetModules();
    const before = timers();
    const ns: Record<string, unknown> = await import("../../src/shell/profiling/index.js");
    const after = timers();

    // The predicate runs over whatever the module exports. A written list would
    // be satisfied by the list — adding `createProfiler` back and adding it to
    // the list keeps such a row green, which is the shape of a test that agrees
    // with every change to its subject.
    const callable = Object.entries(ns).filter(([, v]) => typeof v === "function");
    expect(callable.map(([k]) => k), "nothing published here runs").toEqual([]);

    // **The control**, because an empty namespace passes the line above exactly.
    // The concrete module is the same shape of import and does export callables,
    // so the predicate is shown to be able to find one.
    vi.resetModules();
    const concrete: Record<string, unknown> = await import("../../src/shell/profiling/recorder.js");
    expect(
      Object.entries(concrete).filter(([, v]) => typeof v === "function").length,
      "and the predicate can see a callable when there is one",
    ).toBeGreaterThan(0);

    // No timer, no observer, no handle. The count is the process's own, so the
    // control below is what says the reading can move at all.
    expect(after, "importing it registers no timer").toBe(before);
    const timer = setInterval(() => {}, 60_000);
    expect(timers(), "and the counter responds to one that does").toBe(before + 1);
    clearInterval(timer);

    // What is left is the tier order — names, ordered, and frozen. It is the one
    // operation a report's reader has that a type cannot give them: comparing
    // two tiers. A lookup table starts nothing.
    const ranks = ns.TIER_RANK as Record<string, number>;
    expect(Object.isFrozen(ranks), "the table is frozen").toBe(true);
    expect(Object.keys(ranks), "the five tiers").toEqual(["off", "counters", "spans", "alloc", "deep"]);
    expect(Object.values(ranks), "as a total order from zero").toEqual([0, 1, 2, 3, 4]);
  });

  it("T1.10 (C24 I32): lastFrame is undefined before the first frame, is the previous frame's work after it, and clears with a tier change", () => {
    // **At the recorder, because the four clauses are four states and only one
    // of them is reachable from a session.** A driven session has already
    // composed several frames by the time anything can read a footer, so *the
    // first frame's is undefined* cannot be constructed there — the state is
    // gone before the harness exists. T1.10b drives the wiring; this drives the
    // states.
    let t = 0;
    const p = createProfiler({ tier: "spans" }, { elapsed: () => t });
    expect(p.lastFrame(), "before any frame, there is no previous frame").toBeUndefined();

    t = 0;
    p.beginFrame("input");
    t = 12.4;
    p.endFrame("frame");
    expect(p.lastFrame(), "after one frame, that frame's work").toBe(12.4);

    // **The second frame's figure is the first's, which is the whole invariant.**
    // A member filled with the frame being composed would read 3 here, and 3 is
    // a number this frame cannot have while it is being composed.
    t = 20;
    p.beginFrame("input");
    t = 23;
    p.endFrame("frame");
    expect(p.lastFrame(), "and it is the frame before, not the one just ended, once more").toBe(3);

    // A fallback frame is still the most recent measurement. `report()` filters
    // fallbacks out of `timeline` and `worst` because those are projections over
    // frames that drew (F899); this is not a projection. Holding the last
    // *drawn* frame's figure through a run of fallbacks is F900's stopped clock.
    t = 30;
    p.beginFrame("resize");
    t = 31.5;
    p.endFrame("fallback");
    expect(p.lastFrame(), "a fallback frame cost what it cost").toBe(1.5);

    // The tier change clears it with the ring: a figure from the tier before is
    // one nothing is maintaining any more.
    p.setTier("counters");
    expect(p.lastFrame(), "a tier change clears it").toBeUndefined();
    t = 40;
    p.beginFrame("input");
    t = 45;
    p.endFrame("frame");
    expect(p.lastFrame(), "and below spans no duration is taken at all").toBeUndefined();
    p.dispose();

    // The control at `off`, which is the tier the invariant names first.
    const off = createProfiler({ tier: "off" }, { elapsed: () => t });
    off.beginFrame("input");
    off.endFrame("frame");
    expect(off.lastFrame(), "tier off records nothing to report").toBeUndefined();
    off.dispose();
  });

  it("T1.10b (C24 I32): a real session hands the figure to the chrome, and only at a tier that measures", async () => {
    // **The wiring, which the row above cannot see.** `ComposeDeps.lastFrame` is
    // optional, so a fixture that omits it answers `undefined` at every tier and
    // a row built on one would pass on the day nothing is wired. This drives
    // `createTui` and reads the footer off the screen.
    const footerOf = async (tier: "off" | "counters" | "spans"): Promise<string> => {
      const { tui, screen } = await buildSession({ profile: { tier } });
      for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
      const row = screen().rows.filter((r) => r.includes("/help")).at(-1) ?? "";
      await tui.stop("exit");
      return row;
    };

    // A tier that takes no durations has no figure, so an application that did
    // not ask to be profiled sees no cell — which is also why this moves no
    // golden frame.
    expect(await footerOf("off"), "tier off draws no cost").not.toMatch(/last /u);
    expect(await footerOf("counters"), "counters takes no durations either").not.toMatch(/last /u);

    // At `spans` it is there, it says which frame it describes, and it carries a
    // unit. The figure itself is the machine's and is not asserted.
    // **The cell is padded to a constant width** (F911). `formatFrameCost`
    // produced `last 9.6ms` and `last <0.1ms` — ten cells and eleven — so the
    // footer's right-hand cell moved by a column whenever the cost crossed
    // 10 ms, and every cell after it shifted. The `\s*` here is that padding,
    // and the constant width is what lets a replay mask the cell at all.
    expect(await footerOf("spans"), "at spans the footer carries the previous frame's cost").toMatch(
      /last\s+(?:<0\.1|\d+\.\d)ms/u,
    );
  });

  it("T1.10c (C24 I32): the cost cell is a constant width, whatever the figure", () => {
    // **A measurement drawn at a width that tracks its value moves everything
    // beside it** (F911). `last 9.6ms` and `last <0.1ms` were ten cells and
    // eleven, so the footer's right-hand cell jittered by a column whenever the
    // cost crossed 10 ms — a rendering defect on its own terms, and the reason
    // a replay could not mask the cell: the mask cannot absorb the padding
    // beside it, because that sits after the SGR reset and swallowing an escape
    // would hide a real divergence.
    const widths = new Set(
      [0, 0.04, 0.05, 9.6, 10, 123.4, 999.9].map((ms) => formatFrameCost(ms).length),
    );
    expect([...widths], "every figure draws at one width").toEqual([
      formatFrameCost(0).length,
    ]);
    expect(formatFrameCost(9.6), "and the narrow ones are padded, not trimmed").toContain("last ");
  });

  it("T6.16 (C24 I32): a member filled with the frame being composed reports a number that frame cannot have", () => {
    // **Fail-on-revert, and the change it names is one line.** Setting
    // `lastWork = work` *before* `endFrame` computes the record — or naming the
    // member `frame` and filling it from the frame in flight — makes the figure
    // the current frame's. Every consumer drawing it then reports a number taken
    // before the work it names, and it is a plausible number, which is why no
    // arithmetic check finds it: it is a real duration of a real frame, one
    // frame early.
    //
    // The state that distinguishes the two is a pair of frames with *different*
    // costs. Two frames of equal cost agree under both readings, which is the
    // convenient fixture and the one that finds nothing.
    let t = 0;
    const p = createProfiler({ tier: "spans" }, { elapsed: () => t });
    t = 0;
    p.beginFrame("input");
    t = 10;
    p.endFrame("frame");
    t = 20;
    p.beginFrame("input");
    const duringSecond = p.lastFrame();
    t = 27;
    p.endFrame("frame");

    // Read *while the second frame is open*: the invariant's whole point is that
    // this is answerable at all, and the answer is the first frame's 10.
    expect(duringSecond, "during the second frame, the first frame's cost").toBe(10);
    expect(p.lastFrame(), "and once it closes, the second's").toBe(7);
    expect(duringSecond, "the two are different, so the row can tell them apart").not.toBe(p.lastFrame());
    p.dispose();
  });
});

describe("C22 — the root hands the probe down, and the seam is not the wiring", () => {
  it("T1.57 (C22 I93, C28 I30): a graph built with a profiler reports the height cache's activity", async () => {
    // **The row every cache row above needs, and none of them is.** Those
    // construct a cache directly and pass or fail on the class; all five stay
    // green on the day `construct.ts` stops handing the probe down. What is
    // asserted here is the wiring: a graph, a real viewport measuring real
    // entries, and the counts arriving in the recorder's report.
    const clock = fakeClock();
    const prof = createProfiler(
      { tier: "spans" },
      { elapsed: clock.now, node: process.version, cpus: 1 },
    );
    const { graph } = await buildGraph({}, { columns: 100, rows: 30 }, prof);

    // Six streaming entries. A tail append is O(1) by design — `#sync`'s fast
    // path measures the new entry and touches no other — so these are six
    // `absent` misses and, deliberately, no hits.
    const ids = Array.from({ length: 6 }, (_, i) =>
      graph.transcript.append(wrappingDoc(`e${i}`), { streaming: true }),
    );

    // **The hit comes from a bare settle**, which is the one C14 documents: it
    // shares `patch`'s arm and re-measures, and `rev` did not move (C13 I13), so
    // the lookup returns the height already held. A row asserting a hit without
    // constructing one would have been asserting the fast path's absence.
    for (const id of ids) graph.transcript.settle(id);

    const report = prof.report();
    expect(
      report.misses.height?.absent,
      "each entry measured once with nothing held",
    ).toBeGreaterThanOrEqual(6);
    expect(
      report.hits.height,
      "and the settle re-measure answered from the slot",
    ).toBeGreaterThanOrEqual(6);

    // The other half of the same claim: the viewport publishes the same figures
    // on its own surface (C14 I27), and the two are written at one site.
    expect(graph.viewport.stats.hits).toBe(report.hits.height);
  });
});

describe("C28 I43 — the leak counters' call sites", () => {
  /** A probe that records what it was asked to watch, and nothing else. */
  const recording = (): { probe: Probe; tracked: { name: string; held: object }[] } => {
    const tracked: { name: string; held: object }[] = [];
    const probe: Probe = {
      ...NO_PROBE,
      track: (name, held) => void tracked.push({ name, held }),
    };
    return { probe, tracked };
  };

  it("T1.75 (C28 I43): each store registers the object whose lifetime is in question", () => {
    // **The wiring, not the mechanism.** Every other I43 row calls `track`
    // itself and would pass on the day nothing in `src/` did.
    const scratch = recording();
    const store = new RenderScratchStore(scratch.probe);
    const carrier = { blocks: [] };
    store.set(carrier, "k", { held: true });

    expect(scratch.tracked.map((t) => t.name), "the carrier, under a name").toStrictEqual([
      "scratch.carrier",
    ]);
    // **The identity, not the count.** Registering the *slot* rather than the
    // key would count the same number of objects and answer a question nobody
    // asked: the slot dies when this store drops it, and the whole premise of a
    // `WeakMap` is what happens to the key.
    expect(scratch.tracked[0]?.held, "and it is the key, not the slot").toBe(carrier);

    const render = recording();
    const cache = new RenderCache(render.probe);
    const lines = ["a", "b"];
    cache.set("e1", 1, 80, "f", "t", lines);

    expect(render.tracked.map((t) => t.name)).toStrictEqual(["render-cache.lines"]);
    expect(render.tracked[0]?.held, "the array, which is the allocation").toBe(lines);
  });
});

describe("C28 I8 — a miss says which axis, and whether it bought anything", () => {
  it("T1.8 (C28 I8): a key differing only in theme reports `theme`, and an identical one that missed reports `nothing-changed`", () => {
    const cache = new RenderCache();
    cache.set("e1", 1, 80, "f", "dark", ["x"]);

    // **One axis moved, and it is not the first one checked.** A cache that
    // reported `rev` for every miss satisfies a hit-rate assertion exactly and
    // says the opposite thing about whether the cache is working: `rev` is a
    // content change and the re-render was owed, while `theme` on a screen
    // where nothing moved is a key churning for nothing.
    cache.get("e1", 1, 80, "f", "light");
    expect(cache.misses.theme, "the axis that actually disagreed").toBe(1);
    expect(cache.misses.rev, "and not the one checked before it").toBe(0);
    expect(cache.misses["nothing-changed"], "no re-render has been offered back yet").toBe(0);

    // **The other half, and it is a value comparison rather than an axis.** The
    // axis says what invalidated the slot; this says whether invalidating it
    // bought anything. A theme switch that produces byte-identical lines is a
    // full re-render for nothing, and only the two counts together show it.
    cache.set("e1", 1, 80, "f", "light", ["x"]);
    expect(cache.misses["nothing-changed"], "the recomputed value equalled the discarded one").toBe(1);
    expect(cache.misses.theme, "and the axis count did not move again").toBe(1);

    // The reverse, which is what makes the first mean anything: a miss whose
    // re-render really did produce something different.
    const moved = new RenderCache();
    moved.set("e2", 1, 80, "f", "dark", ["x"]);
    moved.get("e2", 1, 80, "f", "light");
    moved.set("e2", 1, 80, "f", "light", ["y"]);
    expect(moved.misses.theme).toBe(1);
    expect(moved.misses["nothing-changed"], "the work was owed").toBe(0);
  });
});

describe("C28 I16 — V8's GC numbers translated at the boundary", () => {
  it("T1.11 (C28 I16): a real collection lands in a named bucket, and the map is total over the four", async () => {
    // **Driven by a real collection rather than by reading the table back.** A
    // row that asserted `GC_KINDS[1] === "minor"` would be the constant
    // compared with itself; this asks whether V8's number reaches a name at
    // all, which is the thing that breaks when the detail shape moves.
    setFlagsFromString("--expose-gc");
    const gc = runInNewContext("gc") as () => void;

    const probe = createResourceProbe(() => 0);
    // Make something worth collecting, then drop it: a `gc()` over an idle heap
    // still emits an entry, but a heap with garbage in it is the case the
    // observer is watched for.
    let junk: object[] = [];
    for (let i = 0; i < 50_000; i += 1) junk.push({ i, pad: `${String(i)}` });
    junk = [];
    gc();
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));

    const sample = probe.sample(false);
    const kinds = Object.keys(sample.gc).sort();
    // **Total over the four, and the type is what makes it so.** A `Record<GcKind, …>`
    // means a fifth V8 number is a dropped bucket rather than a compile error,
    // which is why the observer checks `kind !== undefined` before counting —
    // an unknown number must not become an entry under some other name.
    expect(kinds, "every kind is a key, present at zero rather than absent").toStrictEqual([
      "incremental",
      "major",
      "minor",
      "weakcb",
    ]);
    const total = Object.values(sample.gc).reduce((a, b) => a + b, 0);
    expect(total, "and a forced collection reached one of them").toBeGreaterThan(0);
    expect(sample.gcPauseMs, "with a pause beside the count").toBeGreaterThan(0);

    probe.dispose();
  });
});
