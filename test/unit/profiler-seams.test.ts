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
import { describe, expect, it } from "vitest";

import { HeightCache } from "../../src/viewport/viewport/index.js";
import { RenderCache } from "../../src/shell/render-cache.js";
import { createProfiler } from "../../src/shell/profiling/recorder.js";
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

describe("C24 — the public surface", () => {
  it.todo("T1.9 (C24 I31): every runtime value exported from @fmx/calcium/profiling is Tier's members and nothing callable; importing the module constructs no recorder, registers no timer and touches no process figure — asserted on the module's own exports rather than on a written list, because a list is satisfied by the list — not deferred on a component: lands with the headless face");
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
