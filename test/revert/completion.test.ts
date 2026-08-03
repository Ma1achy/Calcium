// C19 tier 6 — fail-on-revert. Each test names the change that makes it fail,
// not just the assertion.
//
// These are the mutations run against every module on landing. Four of C16's
// defects came out of a pass like this and none was visible from a green run —
// two of them in tests that had just passed sixteen and ten assertions.
import { describe, expect, it } from "vitest";

import { SCANS } from "../../tools/enforce/source-scans.mjs";
import {
  contextAt,
  createEngine,
  flagValueSource,
  menuBlocks,
} from "../../src/interaction/completion/index.js";
import { at, deferredSource, fakeClock, instantSource } from "../support/completion.js";

const FLAG_SLOT = "/ps --status=‸";

describe("T6.1b (I1, I15): `cancel()` advancing instead of invalidating", () => {
  it("a result arriving after Esc lands on a prompt the user dismissed", async () => {
    // The mutation: replace `active = null` with `active = ++seq`, or compare a
    // result against the newest sequence rather than against `active`. Both
    // pass T1.11 — a *superseded* result is still stale under either reading —
    // and both fail here, because after a cancel nothing advanced past the
    // request and it is its own latest.
    const clock = fakeClock();
    const engine = createEngine({ now: clock.now });
    const d = deferredSource();
    engine.register(d.source);

    const flight = engine.request(at(FLAG_SLOT), 4);
    await Promise.resolve();
    engine.cancel();
    d.resolve([{ value: "running" }]);

    expect((await flight).superseded).toBe(true);
    expect(engine.active).toBeNull();
  });
});

describe("T6.13 (I15, §7): the spinner stamp tagged with the sequence", () => {
  it("an already-waiting user gets another 500 ms of nothing", async () => {
    // The mutation: take the stamp when `request` is called rather than when the
    // source call begins, so a second `Tab` resets it. Everything else passes.
    const clock = fakeClock();
    const engine = createEngine({ now: clock.now });
    const d = deferredSource();
    engine.register(d.source);

    void engine.request(at(FLAG_SLOT), 4);
    await Promise.resolve();
    clock.advance(400);
    void engine.request(at(FLAG_SLOT), 5);
    await Promise.resolve();
    clock.advance(200);

    expect(engine.spinning).toBe(true);
  });
});

describe("T6.14 (I16): appending the delimiter after a common prefix too", () => {
  it("the second `Tab` never reaches the menu", async () => {
    // The mutation: drop the `whole` argument from `accept` and always append.
    // The token is then closed, so the next press is in the following slot and
    // the ambiguous case — the only reachable form of `j22` R17 — is gone.
    const { accept } = await import("../../src/interaction/completion/index.js");
    const ctx = at("/ps --st‸");
    expect(accept(ctx, { value: "--stat", delimiter: " " }, false).text).toBe("--stat");
    expect(accept(ctx, { value: "--stat", delimiter: " " }, true).text).toBe("--stat ");
  });
});

describe("T6.6b (I5): flattening the context back to `readonly string[]`", () => {
  it("command position becomes unanswerable and the executable slot is lost", () => {
    // The mutation: `tokens: readonly string[]`. The operator disappears, the
    // word sits at index 2, and "the first token" says positional.
    const ctx = contextAt("ls | gre", 8, null);
    expect(ctx.tokens[1]?.kind).toBe("operator");
    expect(ctx.slot.kind).toBe("executable");
  });

  it("`replace` becomes underivable", () => {
    // The same mutation from the other end: without `start` there is no range
    // to replace, and acceptance has to guess at one.
    const ctx = contextAt("/ps --st", 8, null);
    expect(ctx.replace.start).toBe(ctx.tokens[1]?.start);
  });
});

describe("T6.4 (I4): hardcoding a verb, flag or enum list", () => {
  it("SS22 exists, is scoped to `completion/`, and fires on both shapes", () => {
    // The rule itself is the test: a literal list in `completion/` is how the
    // manifest stops being the source of truth, and it is *correct* on the day
    // it is written — nothing else in the suite would notice.
    const ss22 = SCANS.find((s) => s.id === "SS22");
    expect(ss22).toBeDefined();
    if (ss22 === undefined) throw new Error("unreachable");
    expect(ss22.scope).toBe("src/interaction/completion/");

    // Both shapes, demonstrated rather than asserted — a rule that has never
    // been seen to fire is a rule that might not.
    expect(ss22.pattern.test('const FLAG = "--status";')).toBe(true);
    expect(ss22.pattern.test('const S = ["running", "failed", "queued"];')).toBe(true);

    // And the two things it must *not* catch, or it gets widened until it is
    // ignored: the `--` prefix test is about syntax, and a single-slot list is
    // a source declaring which slot it serves.
    expect(ss22.pattern.test('if (prefix.startsWith("--")) {')).toBe(false);
    expect(ss22.pattern.test('slots: ["flagValue"],')).toBe(false);
  });
});

describe("T6.5 (I6): letting a source failure abort the request", () => {
  it("one bad source takes the other two with it", async () => {
    // The mutation: `Promise.all` without the per-source catch.
    const clock = fakeClock();
    const engine = createEngine({ now: clock.now, onSourceError: () => {} });
    engine.register(instantSource("a", ["flagValue"], [{ value: "running" }]));
    engine.register({
      id: "bad",
      slots: ["flagValue"],
      dynamic: true,
      complete: () => Promise.reject(new Error("down")),
    });

    const result = await engine.request(at(FLAG_SLOT), 1);
    expect(result.candidates.map((c) => c.value)).toEqual(["running"]);
  });
});

describe("T6.3 (I2): awaiting a request on the input path", () => {
  it("`ghost` is synchronous and cannot be made to wait", () => {
    // The mutation: make `ghost` async, or have it consult dynamic sources.
    // Both stall typing under a slow source, and neither changes any candidate.
    const clock = fakeClock();
    const engine = createEngine({ now: clock.now });
    engine.register(flagValueSource());
    engine.register(deferredSource({ id: "never" }).source);

    const got: unknown = engine.ghost(at("/ps --status=ru‸"));
    expect(got).not.toBeInstanceOf(Promise);
    expect(got).toBe("nning");
  });
});

describe("T6.8 (I8): drawing the menu instead of going through C15", () => {
  it("the menu is blocks, and holds no escape sequence or geometry", () => {
    // The mutation: render rows to strings here. It compiles, it looks right in
    // one terminal, and it stops flipping above the prompt.
    const blocks = menuBlocks([{ value: "running", detail: "3 up" }], 0, 2);
    const serialised = JSON.stringify(blocks);
    expect(serialised).not.toContain("\\u001b");
    expect(blocks.every((b) => typeof b === "object" && "kind" in b)).toBe(true);
    // The indicator is C19's, because only C19 knows the remainder.
    expect(serialised).toContain("2 more");
  });
});
