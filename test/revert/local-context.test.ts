// C23 tier 6 — fail-on-revert. The obligation on a local handler's context.
//
// **This file's assertions are compile-time and that is the point.** C23 I39 is
// a rule about a *declaration*, and no value a test can construct distinguishes
// a handler that named `LocalContext` from one that named `{ command: string }`
// — both receive the same object and both run. The thing that must not compile
// is the registration.
//
// Removing `ExactLocalHandlers` from `createTui`'s parameter (`shell/types.ts`)
// makes every `@ts-expect-error` below unused, and an unused directive is an
// error under this tree's `tsc` — so `make check` fails and the file stops
// building. That is the revert this row names.
import { describe, expect, it } from "vitest";
import { createTui } from "../../src/shell/session.js";
import type { LocalContext, LocalHandler } from "../../src/shell/local/registry.js";
import type { LocalDocument } from "../../src/data/viewmodel/index.js";
import type { TuiConfig } from "../../src/shell/types.js";

const doc: LocalDocument = Object.freeze({
  schema: "tui.view/1" as const,
  command: "/probe",
  status: "ok" as const,
  blocks: [],
});

/**
 * A config with everything required, so the only thing under test is the
 * handler's declaration. It is never started — `createTui` runs step 1 and
 * nothing else (C22 I7a), so this constructs and returns.
 */
const base: TuiConfig = Object.freeze({
  name: "probe",
  binary: "probe",
  manifest: { schema: "tui.manifest/1", tools: [] } as unknown as TuiConfig["manifest"],
  theme: {} as TuiConfig["theme"],
});

describe("C23 I39 (F125): a handler that declines to name its context does not compile", () => {
  it("T6.1: the accepted arms — named, typed, and no context at all", () => {
    const named = (_argv: readonly string[], _ctx: LocalContext) => doc;
    const typed: LocalHandler = (_argv, _ctx) => doc;
    // **Nothing declared, nothing to miss.** A handler taking only `argv` cannot
    // be surprised by a field, so refusing it would be the rule firing on
    // correct code. The first version of `ExactLocalHandlers` did exactly that —
    // `infer C` on a one-parameter function yields `unknown` — and the probe is
    // what caught it, not review.
    const noCtx = (_argv: readonly string[]) => doc;

    expect(() => createTui({ ...base, localHandlers: { a: named, b: typed, c: noCtx } })).not.toThrow();
  });

  it("T6.2 (C23 I39): a hand-declared narrower context is refused at the boundary", () => {
    // The measured shape: four of the reference app's eight handler families
    // wrote this, structural typing agreed, and a field added to `LocalContext`
    // would have reached the other four only.
    const narrow = (_argv: readonly string[], _ctx: { command: string }) => doc;

    // @ts-expect-error — C23 I39. Drop `ExactLocalHandlers` from `createTui` and
    // this compiles, the directive is unused, and the file fails to build.
    createTui({ ...base, localHandlers: { a: narrow } });
    expect(typeof narrow).toBe("function");
  });

  it("T6.3: a *wider* declaration is refused by assignability, and the check does not add that", () => {
    // **Not a revert row, and it started as one.** Removing `ExactLocalHandlers`
    // from `createTui` kills T6.2 and both of T6.4 and leaves this passing —
    // measured — because a parameter type wider than what is passed is already
    // not assignable. Contravariance does the whole of it.
    //
    // So the row was governed by one rule and restated it. It stays as a control
    // rather than a promise: what the obligation adds is the *narrower* and the
    // *optional* arms, and a reader who assumed it added this one would be
    // assuming a mechanism that is not there.
    const wide = (_argv: readonly string[], _ctx: LocalContext & { cluster: string }) => doc;

    // @ts-expect-error — assignability, not C23 I39.
    createTui({ ...base, localHandlers: { a: wide } });
    expect(typeof wide).toBe("function");
  });

  it("T6.4 (C23 I39): an *optional* context is refused whatever its type", () => {
    // **The arm that closes the direct-call hole.** `ctx?: …` declares a handler
    // that may run with no context, which is exactly what the reference app's
    // greeting did — invoking a handler outside the shell with an object literal
    // that has no `ask`. Refusing the declaration is what makes the call site a
    // compile error, with no rule walking call sites.
    //
    // It slipped through the first draft silently, because an optional parameter
    // does not match a required two-tuple and fell to the accepting arm.
    const optNarrow = (_argv: readonly string[], _ctx?: { command: string }) => doc;
    const optFull = (_argv: readonly string[], _ctx?: LocalContext) => doc;

    // @ts-expect-error — C23 I39.
    createTui({ ...base, localHandlers: { a: optNarrow } });
    // @ts-expect-error — C23 I39, and correct even though the *type* is right:
    // optional-at-all is the declaration under test.
    createTui({ ...base, localHandlers: { a: optFull } });
    expect(typeof optNarrow).toBe("function");
  });
});
