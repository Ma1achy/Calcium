// C19 tier 2 — contract. §8a's traces and §8b's table, replayed row for row.
//
// Two artefacts because C19 has two kinds of rule interaction. A sequence trace
// finds the ones mediated by an event; a classification table finds the ones
// that hold at rest. C19 shipped with only the first, and the second found four
// defects on its first run.
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

describe("C19 §8b — the classification table", () => {
  // The structural half of the walk, which C19 shipped without. §8a is a
  // sequence trace and finds interactions mediated by an *event*; these rules
  // hold at rest, with no event between them, so no number of keystroke rows
  // reaches them. Four of the ten were defects when this first ran.
  //
  // The whole context is asserted per row, not the field the row is about.
  const ROWS: readonly Readonly<{
    why: string;
    line: string;
    slot: string;
    prefix: string;
    tool: string | null;
    arg: string | null;
  }>[] = [
    { why: "quoting x the flag-value sub-token",
      line: '/ps --status="ru\u2038"', slot: "flagValue", prefix: "ru", tool: "ps", arg: null },
    { why: "operators x tool resolution — no flag after a pipe ever completed",
      line: "ls | /ps --st\u2038", slot: "flagName", prefix: "--st", tool: "ps", arg: null },
    { why: "multi-word verbs x positional index — `scale` is the verb, not an argument",
      line: "/serving scale \u2038", slot: "positional", prefix: "", tool: "serving scale", arg: "service" },
    { why: "space-form flag values x positional index — `canary` belongs to `--to`",
      line: "/serving scale --to canary \u2038", slot: "positional", prefix: "", tool: "serving scale", arg: "service" },
    { why: "bool flags x row 4's skip — the negative control, nothing is swallowed",
      line: "/serving scale --side-by-side \u2038", slot: "positional", prefix: "", tool: "serving scale", arg: "service" },
    { why: "the positional index advancing normally",
      line: "/serving scale web \u2038", slot: "positional", prefix: "", tool: "serving scale", arg: "replicas" },
    { why: "quoting x command position — agrees with C18's verbOf, which also ignores `quoted`",
      line: '"/ps"\u2038', slot: "verb", prefix: "/ps", tool: null, arg: null },
    { why: "unbalanced quotes x everything — one character from row 1",
      line: '/ps --status="ru\u2038', slot: "none", prefix: "", tool: null, arg: null },
    { why: "a path-typed arg x the positional rule",
      line: "/tail \u2038", slot: "path", prefix: "", tool: "tail", arg: null },
    { why: "no resolved tool x arguments",
      line: "git commit \u2038", slot: "path", prefix: "", tool: null, arg: null },
  ];

  it("T2.10 (§8b): every row, whole result", () => {
    for (const row of ROWS) {
      const ctx = at(row.line);
      expect(
        {
          slot: ctx.slot.kind,
          prefix: ctx.prefix,
          tool: ctx.tool?.name ?? null,
          arg: ctx.slot.kind === "positional" ? ctx.slot.arg.name : null,
        },
        `${row.line} — ${row.why}`,
      ).toEqual({ slot: row.slot, prefix: row.prefix, tool: row.tool, arg: row.arg });
    }
  });
});

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

  it("T3.9b (§7): the spinner reads the earliest call still in flight", async () => {
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

    // A single overwritten `pendingSince` resets here and hides the spinner for
    // another 500ms from a user who has waited six-tenths of a second and pressed
    // Tab again *because* nothing happened. The question is how long anything has
    // been outstanding, not how long this request has.
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
    // One action for the **bare** `→`, not two: a second row would be the
    // KeymapError above. Modifiers are part of a slot's identity, which is why
    // `⌃→` sits beside it as `wordRight` without colliding (C16 §6, C16 I21) — and
    // this filter ignored them until that binding existed, so it counted two
    // and failed on a table that is correct.
    expect(
      defaultKeymap.filter(
        (b) =>
          b.target === "prompt" &&
          b.key.name === "right" &&
          b.key.ctrl !== true &&
          b.key.meta !== true &&
          b.key.shift !== true,
      ),
    ).toHaveLength(1);
  });
});
