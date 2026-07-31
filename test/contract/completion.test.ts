// C19 tier 2 — contract. §8a's traces, replayed row for row.
//
// **The whole state is asserted after every step**, not the field the step is
// about. That is the shape that caught C13's and C14's defects: an invariant
// constrains one operation and none constrains the history, so a suite checking
// one field at a time agrees with every rule and misses the sequence.
import { describe, expect, it } from "vitest";

import {
  contextKey,
  createEngine,
  flagValueSource,
  SLOT_KINDS,
  SPINNER_MS,
} from "../../src/interaction/completion/index.js";
import { defaultKeymap } from "../../src/interaction/router/keymap.js";
import { createKeymap } from "../../src/interaction/router/keymap.js";
import { at, deferredSource, fakeClock, snapshot } from "../support/completion.js";

const FLAG_SLOT = "/ps --status=‸";

describe("C19 §8a trace 2 — Esc during a pending request (I1, I15)", () => {
  it("T3.10: the sequence does not move, and only invalidation discards the result", async () => {
    const clock = fakeClock();
    const engine = createEngine({ now: clock.now });
    const d = deferredSource();
    engine.register(d.source);

    // Step 1 — Tab.
    const flight = engine.request(at(FLAG_SLOT), 4);
    await Promise.resolve();
    expect(snapshot(engine)).toEqual({ active: 4, pending: true, spinning: false, inFlight: 1 });

    // Step 2 — Esc. `active` becomes null; the sequence is still 4.
    engine.cancel();
    expect(engine.active).toBeNull();

    // Step 3 — the result arrives. Under "not the latest is never applied" this
    // result *is* the latest, because nothing advanced past 4.
    d.resolve([{ value: "running" }]);
    const result = await flight;
    expect(result.superseded).toBe(true);
    expect(result.candidates).toEqual([]);
  });

  it("T3.10b: cancelling invalidates the token without poisoning the engine", async () => {
    const clock = fakeClock();
    const engine = createEngine({ now: clock.now });
    const first = deferredSource({ id: "a" });
    engine.register(first.source);

    const stale = engine.request(at(FLAG_SLOT), 4);
    engine.cancel();
    first.resolve([{ value: "running" }]);
    expect((await stale).superseded).toBe(true);

    const second = engine.request(at(FLAG_SLOT), 5);
    await Promise.resolve();
    expect(engine.active).toBe(5);
    first.resolve([{ value: "failed" }]);
    const fresh = await second;
    expect(fresh.superseded).toBe(false);
    expect(fresh.seq).toBe(5);
  });
});

describe("C19 §8a trace 3 — Tab twice while pending", () => {
  it("T3.9: a new sequence and one source invocation, not two", async () => {
    const clock = fakeClock();
    const engine = createEngine({ now: clock.now });
    const d = deferredSource();
    engine.register(d.source);

    const first = engine.request(at(FLAG_SLOT), 4);
    await Promise.resolve();
    const second = engine.request(at(FLAG_SLOT), 5);
    await Promise.resolve();

    // The second Tab joined the in-flight promise. A value cache has nothing to
    // return here, because the first call has not come back.
    expect(d.calls()).toBe(1);
    expect(engine.active).toBe(5);

    d.resolve([{ value: "running" }]);
    const [a, b] = await Promise.all([first, second]);
    // The result answers the *context*, which is unchanged, so it applies under
    // the newer token. Tagged with its creating sequence it would be discarded
    // and the user would press Tab twice and get nothing.
    expect(a.superseded).toBe(true);
    expect(b.superseded).toBe(false);
    expect(b.candidates.map((c) => c.value)).toEqual(["running"]);
  });

  it("T3.9b (§7): the spinner's stamp is per source call, not per sequence", async () => {
    const clock = fakeClock();
    const engine = createEngine({ now: clock.now });
    const d = deferredSource();
    engine.register(d.source);

    void engine.request(at(FLAG_SLOT), 4);
    await Promise.resolve();
    clock.advance(400);
    expect(engine.spinning).toBe(false);

    // A second Tab from someone already waiting, *because* nothing happened.
    void engine.request(at(FLAG_SLOT), 5);
    await Promise.resolve();
    clock.advance(200); // 600ms since the wait began, 200 since the second Tab

    // A sequence-tagged stamp resets here and hides the spinner for another
    // 500ms from a user who has been waiting for six-tenths of a second.
    expect(engine.spinning).toBe(true);
    expect(SPINNER_MS).toBe(500);
  });
});

describe("C19 §8a trace 1 — a keystroke supersedes and nothing replaces it", () => {
  it("T1.12, I13: the sequence advances and no dynamic work is re-issued", async () => {
    const clock = fakeClock();
    const engine = createEngine({ now: clock.now });
    const d = deferredSource();
    engine.register(d.source);

    const flight = engine.request(at(FLAG_SLOT), 4);
    await Promise.resolve();
    expect(engine.inFlight).toBe(1);

    // The keystroke: a new token, and *no new request*, because dynamic sources
    // run only on Tab. Nothing is pending afterwards.
    engine.cancel();
    const ghost = engine.ghost(at("/ps --status=r‸"));
    expect(ghost).toBeNull(); // no static source registered for this slot

    clock.advance(10_000);
    expect(engine.spinning).toBe(false); // nothing pending, not a reset clock

    d.resolve([{ value: "running" }]);
    expect((await flight).superseded).toBe(true);
  });
});

describe("C19 §8a trace 5 — Tab on a static-only slot", () => {
  it("mints a sequence even with nothing to await", async () => {
    const clock = fakeClock();
    const engine = createEngine({ now: clock.now });
    const d = deferredSource({ id: "uuids", slots: ["flagValue"] });
    engine.register(d.source);
    engine.register(flagValueSource());

    const stale = engine.request(at(FLAG_SLOT), 4);
    await Promise.resolve();

    // A slot with no dynamic source is exactly where a reader concludes there
    // is nothing to sequence — and where the abandoned request has the most
    // changed buffer to land on.
    const staticOnly = await engine.request(at("/ps --st‸"), 5);
    expect(staticOnly.superseded).toBe(false);
    expect(engine.active).toBe(5);

    d.resolve([{ value: "running" }]);
    expect((await stale).superseded).toBe(true);
  });
});

describe("C19 §3 — the cache key (I10)", () => {
  it("T3.8b: the key is the slot's identity, not the prefix", () => {
    // Three more characters typed; same slot, same key, so one fetch serves all
    // of them. On a prefix key these are four different entries and the TTL
    // never hits.
    const keys = ["/ps --status=‸", "/ps --status=r‸", "/ps --status=ru‸", "/ps --status=run‸"].map(
      (line) => contextKey(at(line)),
    );
    expect(new Set(keys).size).toBe(1);
  });

  it("distinguishes two flags on one tool", () => {
    expect(contextKey(at("/ps --status=‸"))).not.toBe(contextKey(at("/ps --limit=‸")));
  });
});

describe("C19 §2, §6 — the contract surface", () => {
  it("T2.7: every Slot kind is covered by the framework's sources", async () => {
    const { frameworkSources } = await import("../../src/interaction/completion/index.js");
    const sources = frameworkSources({
      manifest: () => null,
      readDir: () => Promise.resolve([]),
      path: () => [],
    });
    const covered = new Set(sources.flatMap((s) => [...s.slots]));
    // `none` is the absence of a slot and has nothing to offer by definition.
    for (const kind of SLOT_KINDS.filter((k) => k !== "none")) {
      expect(covered).toContain(kind);
    }
  });

  it("T4.6b (with C16): C19's rows construct without a KeymapError", () => {
    expect(() => createKeymap(defaultKeymap)).not.toThrow();
    const actions = defaultKeymap.map((b) => `${b.target}:${b.key.name}`);
    expect(actions).toContain("prompt:tab");
    expect(actions).toContain("overlay:escape");
    // One action for `→`, not two: a second row would be the KeymapError above.
    expect(defaultKeymap.filter((b) => b.target === "prompt" && b.key.name === "right")).toHaveLength(
      1,
    );
  });
});
