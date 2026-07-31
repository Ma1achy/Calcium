// C22 tier 1 — §5's session state, and I11's one writer per field.
//
// **All nine fields, including the two with no writer.** `cluster` and
// `version` were absent from §5's table for the life of the spec, which left
// I11 with nothing to say about two of the nine — and a field with no row reads
// exactly like a field nobody writes. The assertion for those two is the
// absence of a write, which is the half a seven-row table could not state.
import { describe, expect, it } from "vitest";

import { createSessionStore, type SessionSeed } from "../../src/shell/state.js";
import type { SessionSnapshot } from "../../src/shell/types.js";

const SEED: SessionSeed = Object.freeze({
  cwd: "/work",
  env: Object.freeze({ TERM: "xterm-256color" }),
  cluster: "fmx-prod",
  version: "1.0.0",
});

const FIELDS: readonly (keyof SessionSnapshot)[] = [
  "cwd",
  "env",
  "lastUuid",
  "identity",
  "cluster",
  "health",
  "version",
  "retained",
  "stopping",
];

describe("C22 §5 — session state", () => {
  it("T1.11a: the snapshot is nine fields, and the count is the assertion", () => {
    // Commitment 8 says nine. A test over "the documented fields" derived from
    // the object would agree with itself whatever the object held.
    const { snapshot } = createSessionStore(SEED);
    expect(Object.keys(snapshot).sort()).toEqual([...FIELDS].sort());
  });

  it("T1.11b (I11): each mutable field is written only through its own writer", () => {
    const store = createSessionStore(SEED);

    store.execution.setCwd("/elsewhere");
    store.execution.setEnv("FOO", "bar");
    store.execution.setLastUuid("uuid-1");
    store.execution.setRetained("/ps");
    store.refresh.setIdentity({ user: "m", email: "m@x", groups: [], expiresAt: null });
    store.refresh.setHealth("degraded");
    store.beginStopping();

    expect(store.snapshot).toEqual({
      cwd: "/elsewhere",
      env: { TERM: "xterm-256color", FOO: "bar" },
      lastUuid: "uuid-1",
      identity: { user: "m", email: "m@x", groups: [], expiresAt: null },
      cluster: "fmx-prod",
      health: "degraded",
      version: "1.0.0",
      retained: "/ps",
      stopping: true,
    });
  });

  it("T1.11c (I11): cluster and version have no writer at all", () => {
    // **The two fields the table did not name.** Asserted structurally rather
    // than by spying: there is no method that sets either, so the property is
    // that the surface offers none — a reader looking to change one finds
    // nothing to call rather than a comment asking them not to.
    const store = createSessionStore(SEED);
    const writers = { ...store.execution, ...store.refresh };

    expect(Object.keys(writers).sort()).toEqual([
      "setCwd",
      "setEnv",
      "setHealth",
      "setIdentity",
      "setLastUuid",
      "setRetained",
    ]);

    // And the behavioural half: exercising every writer there is leaves both
    // untouched. The structural assertion alone would pass on a store that set
    // `cluster` inside `setHealth`.
    store.execution.setCwd("/x");
    store.execution.setEnv("A", "1");
    store.execution.setLastUuid("u");
    store.execution.setRetained("/r");
    store.refresh.setIdentity(null);
    store.refresh.setHealth("offline");
    store.beginStopping();

    expect([store.snapshot.cluster, store.snapshot.version]).toEqual(["fmx-prod", "1.0.0"]);
  });

  it("T1.11d: a captured snapshot never changes under its holder", () => {
    // Chrome reads the snapshot once per frame and must render one coherent
    // state — C01 I12's rule, one layer up. A mutated-in-place store would let
    // a header and a footer built from the same capture disagree.
    const store = createSessionStore(SEED);
    const before = store.snapshot;
    store.refresh.setHealth("offline");

    expect(before.health).toBe("live");
    expect(store.snapshot.health).toBe("offline");
  });

  it("T1.11e (I11): every snapshot is frozen, not only the first", () => {
    // **The mutation pass found this gap rather than review.** T1.11d covers
    // the *copy* — a fresh object per write — and passes with `Object.freeze`
    // removed from the writer, because a copy alone already protects a captured
    // reference. So the freeze had nothing to be wrong about: A03 §2's vacuity
    // class, in a guard rather than a rule.
    //
    // What the freeze buys is the other direction. C23 holds the snapshot and
    // must not be able to write `cwd` around `execution.setCwd` — one writer
    // per field is a claim about the type at compile time and about this at
    // run time.
    const store = createSessionStore(SEED);
    expect(Object.isFrozen(store.snapshot), "the initial snapshot").toBe(true);

    store.refresh.setHealth("offline");
    expect(Object.isFrozen(store.snapshot), "and every one after a write").toBe(true);
  });

  it("T1.12 (I12): cwd reaches C21 as a function, and a cd moves the next read", () => {
    // The value/function distinction is the whole of I12: a captured value is
    // correct at capture and wrong for every verb after the first `cd`.
    const store = createSessionStore(SEED);
    const cwd = store.cwd;

    expect(cwd()).toBe("/work");
    store.execution.setCwd("/moved");
    expect(cwd(), "the same function, read again after the cd").toBe("/moved");
  });

  it("T1.13: env merges rather than replaces", () => {
    const store = createSessionStore(SEED);
    store.execution.setEnv("A", "1");
    store.execution.setEnv("B", "2");

    expect(store.snapshot.env).toEqual({ TERM: "xterm-256color", A: "1", B: "2" });
  });
});
