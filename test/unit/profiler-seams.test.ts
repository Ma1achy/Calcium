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
import { describe, expect, it, vi } from "vitest";

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

import { HeightCache } from "../../src/viewport/viewport/index.js";
import { RenderCache } from "../../src/shell/render-cache.js";
import { createProfiler } from "../../src/shell/profiling/recorder.js";
import { createInspector, type CaptureIo } from "../../src/shell/profiling/node.js";
import type { Profiler } from "../../src/shell/profiling/types.js";
import { buildGraph, fakeClock } from "../support/session.js";
import { wrappingDoc } from "../support/viewport.js";

describe("C22 — the root's injection, refusal and capture path", () => {
  it.todo("T1.51 (C22 I92): a graph built with profile absent is identical to one built from a config that never had the key — the injected elapsed and probe are never called, schedule gains no registration, and no FinalizationRegistry exists; asserted on the fakes' call counts and not on a timing figure — not deferred on a component: lands with the seams wired through construct.ts");
  it.todo("T1.52 (C22 I93): every decorated seam hands down a function the root wrapped, and src/ holds no import of shell/profiling/ outside src/shell/ — the second half is the source scan, because the first passes on the day nothing calls the seam — not deferred on a component: lands with the seams wired through construct.ts");
  it.todo("T1.53 (C22 I94): record and replay both set is refused at the gate and the message names both fields — a refusal naming one reads as that field being invalid — not deferred on a component: lands with record and replay");
  it.todo("T1.54 (C22 I95): captureDir unset resolves under stateDir, and that is the directory I67 wrote a .gitignore of * into; the two are asserted together because either alone is satisfied by a path that happens to look right — not deferred on a component: lands with the deep tier");

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
  it.todo("T1.24 (C03 I16): five commits of different reasons coalesced into one frame call render once, with the strictest reason and not the first or the last — the three are distinguishable only when arrival order and strictness order disagree, so the row constructs that state rather than the convenient one — not deferred on a component: lands with the seams wired through construct.ts");
  it.todo("T1.25 (C03 I16): a contaminated frame gives repaint the reason too, and it is the same one render would have had — not deferred on a component: lands with the seams wired through construct.ts");
  it.todo("T6.17 (C03 I16): calling render() with no argument fails T1.24 and T1.25, and the profiler's frames-by-reason collapses to one bucket; the structural half is named — nothing prevents a caller ignoring the argument, and what catches that is the L4 counter disagreeing with itself — not deferred on a component: lands with the seams wired through construct.ts");
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

  it.todo("T2.15 (C14 I29): a viewport whose injected measureSequence records its third argument → every call names the entry whose blocks it was given, and a run with two entries records two distinct ids. Asserted on the ids and not on the arity, because a parameter declared and never passed satisfies the type — not deferred on a component: lands with the seam in src/viewport/viewport/");
  it.todo("T6.25 (C14 I29): dropping the entry id from the measureSequence call → T2.15 fails, and byEntry under-reports every entry by whatever the height cache missed — an undercount with no signal, which is worse than the absence it looks like — not deferred on a component: lands with the seam in src/viewport/viewport/");

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

  it.todo("T1.10 (C24 I32): a chrome called at tier off gets lastFrame undefined; at spans the first frame's is undefined and the second's is the first's cost, not the second's — not deferred on a component: lands with the seams wired through construct.ts");
  it.todo("T6.16 (C24 I32): renaming lastFrame to frame, or filling it with the frame being composed, fails T1.10 on the second frame and every consumer drawing it reports a number taken before the work it names — not deferred on a component: lands with the seams wired through construct.ts");
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
