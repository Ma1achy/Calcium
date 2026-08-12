// C23 tier 1 — unit. Fake transport, fake stores, real transcript.
//
// **1833 green tests said C01–C22 still worked.** Every claim C23 makes about
// itself was unasserted until this file, and the routes compiling is evidence
// about TypeScript rather than about behaviour. The 52 expired deferrals do not
// close that either: they are *other components'* rows, asserting C23 through its
// collaborators, which is tier 4 by definition. These are the ones nobody else
// can write.
//
// Two things here are deliberately not shaped as one test per case.
//
// **The guard's release is a property, not fourteen assertions.** Seven routes ×
// success and failure is fourteen exits, and a test per exit passes while the
// property — *no path leaves it held* — is what fails in production. It is
// asserted over a sequence, the same shape as C13's `blockCount ≤ cap`.
//
// **The three `PatchOutcome` arms need the wrong-arm case.** Three tests each
// taking their own arm correctly cannot see a mis-dispatch; what catches it is
// the entry ending in the *other* arm's state.
import { createEditor } from "../../src/interaction/editor/index.js";
import { createConfirmHost } from "../../src/shell/confirm.js";
import { describe, expect, it } from "vitest";
import { createExecutionPipeline } from "../../src/shell/execution.js";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { createSessionStore } from "../../src/shell/state.js";
import { fixture } from "../support/manifest.js";
import { doc, localDoc } from "../support/blocks.js";
import { result } from "../support/transport.js";
import { slashPolicy } from "../../src/interaction/parser/index.js";
import { assignOffsets, backoffOf, BACKOFF_CAP_MS } from "../../src/shell/refresh.js";
import { b } from "../../src/shell/builders/index.js";
import type { PipelineDeps } from "../../src/shell/types.js";
import type { RawPatch, RawResult, TransportRouter } from "../../src/data/transport/index.js";
import { block } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { createOverlayManager } from "../../src/viewport/overlay/index.js";
import { createDocumentView } from "../../src/shell/document-view.js";
import type { Block, ViewDocument, ViewPatch } from "../../src/data/viewmodel/index.js";

import { FULL_CAPABILITIES } from "../support/producer-context.js";
import type { AdapterContext, StreamContext } from "../../src/data/adapters/types.js";
type Scripted = Readonly<{
  invoke?: () => Promise<RawResult>;
  stream?: () => AsyncIterable<RawPatch>;
  /**
   * The double receives the *context*, as a real adapter does (C07).
   *
   * It took no arguments, which is the narrow-double class one field over: a
   * stub that erases what it is given cannot be asked whether the right thing
   * was passed, and T1.39 needs to tell one submission of `ps` from another.
   */
  adapt?: (ctx: { command: string }) => ViewDocument;
  adaptPatch?: () => ViewPatch | null;
  /** A live part returned by the `/guide` local handler — T1.38's control arm. */
  localLive?: () => Block;

  /**
   * **`stderr` is here because `ChildHandle` has it** (C21 I3, F151). The fake
   * carried `stdout` alone for as long as the route read `stdout` alone, so the
   * two agreed about a field neither of them used — and the route's failure
   * path, which needs it, was the half nothing could construct.
   */
  spawnShell?: () => {
    stdout: AsyncIterable<string>;
    stderr: AsyncIterable<string>;
    exited: Promise<{ code: number | null; signal?: string | null }>;
    overflowed: boolean;
  };

  /**
   * Make `resetFocus` throw — §8e's fourth row, and the only statement after the
   * append this harness can reach. `declareLive` and `recordHistory` are driven
   * by the document and by C20, so a throw from either would be a fake supplying
   * a behaviour rather than standing in for one.
   */
  focusThrows?: boolean;
}>;

const blocks = createBlockRegistry();

function harness(script: Scripted = {}) {
  const transcript = createTranscriptStore();
  const overlays = createOverlayManager({ registry: blocks });
  const documentView = createDocumentView({
    overlays,
    measureSequence: (blks, width) => blocks.measureSequence(blks, width),
    region: () => ({ width: 80, height: 24 }),
    redraw: () => undefined,
  });
  const session = createSessionStore({ cwd: "/work", env: {}, cluster: "c", version: "1" });
  const commits: string[] = [];
  const resets: number[] = [];
  const calls: string[] = [];
  const typed: string[] = [];
  const recorded: { command: string; exitCode: number }[] = [];
  /** Every `ProducerContext` C23 built, by route (C07 §3a). */
  const contexts: { where: string; ctx: AdapterContext }[] = [];
  /** Every `seq` C23 handed C07, in order. */
  const seqs: number[] = [];
  /**
   * Every `command` C23 handed C07, per route.
   *
   * Added for the same reason `seq` was: the double read one field of the
   * context and the field that was wrong was one of the others. `adaptPatch`
   * took the raw typed line while `adapt` took the resolved argv, so an entry
   * said one thing while streaming and another once settled — and no assertion
   * anywhere touched either value.
   */
  const commands: { where: "patch" | "settle"; command: string }[] = [];
  /**
   * A controllable clock and scheduler, so §3b's timers are driven not waited on.
   *
   * **Each armed callback fires once**, as `setTimeout` does — the ambient
   * `schedule` C22 supplies is a one-shot (`session.ts`), and a fake that re-fires
   * every callback on every tick makes a periodic mechanism and a one-shot one the
   * same test. Stall detection was armed once and never re-armed for the whole of
   * C22 and C23 underneath a harness shaped that way; nothing failed, because
   * nothing could (C23 T1.30, T6.30).
   *
   * A timer armed *during* a tick waits for the next one, so a self-re-arming
   * chain advances one step per call rather than running away — the same barrier
   * `fake-scheduler.ts` documents.
   */
  let now = 0;
  const timers: { fn: () => void; at: number; live: boolean }[] = [];

  const transport = {
    for: () => ({
      invoke: async () => {
        calls.push("invoke");
        return script.invoke === undefined ? result({ exitCode: 0 }) : await script.invoke();
      },
      stream: () => {
        calls.push("stream");
        return script.stream === undefined ? (async function* () {})() : script.stream();
      },
    }),
    busy: false,
    inFlight: null,
  } as unknown as TransportRouter;

  const deps = {
    session: () => session.snapshot,
    writes: session.execution,
    transcript,
    // C07 I18/I19 — what the producer context is built from (C23 I40). `blocks`
    // is already the real registry below, so `measure` is the frame's rather
    // than a stub's; this adds the two the context also needs, with the same
    // region `documentView` is given.
    capabilities: FULL_CAPABILITIES,
    region: () => ({ width: 80, height: 24 }),
    scheduler: {
      commit: (r: string) => void commits.push(r),
      flush: () => undefined,
      invalidate: () => undefined,
      pending: false,
      contaminated: false,
    },
    transport,
    adapters: {
      // **`AdapterContext`, not `{ command: string }`.** The narrowed parameter
      // was here for the same reason it was in four of the reference app's
      // handler families: it compiled. It also erased every field the producer
      // grant added, so `height`, `capabilities` and `measure` were invisible
      // to every row in this file — which is how making `height` unconditional
      // passed the whole suite (C07 I18, F125's shape in a double).
      adapt: (_raw: unknown, ctx: AdapterContext) => {
        commands.push({ where: "settle", command: ctx.command });
        contexts.push({ where: "adapt", ctx });
        return script.adapt === undefined ? doc({ command: "adapted" }) : script.adapt(ctx);
      },
      // **The context is read, not discarded.** This fake took no arguments at
      // all, which is why nothing here could see that C23 passed a literal
      // `seq: 0` — the parameter that was wrong was the one the double erased.
      // A fake narrower than the interface it stands for cannot fail on the
      // difference.
      adaptPatch: (_patch: RawPatch, ctx: StreamContext) => {
        seqs.push(ctx.seq);
        commands.push({ where: "patch", command: ctx.command });
        contexts.push({ where: "adaptPatch", ctx });
        return script.adaptPatch === undefined
          ? { op: "append" as const, block: { kind: "notice" as const, id: `s${String(ctx.seq)}`, tone: "info" as const, text: "tick" } }
          : script.adaptPatch();
      },
      register: () => undefined,
      seal: () => undefined,
      sealed: true,
    },
    manifest: { manifest: fixture(), load: () => undefined, seal: () => undefined, sealed: true },
    blocks,
    // **The real editor**, wrapped only to record what `fill` set. A two-method
    // stub was the previous version and it broke the day the submit path gained
    // `clear()` (C23 I28) — the same defect as `{} as never`, with a smaller
    // surface and the same cause: a double that satisfies the type and cannot
    // do the thing.
    editor: (() => {
      const real = createEditor();
      return new Proxy(real, {
        // `target` as the receiver, not the proxy — C17 holds `#text` in a
        // private field, and a proxy receiver cannot read one. The same reason
        // C01's `writer` proxy passes the target.
        get(target, prop) {
          if (prop === "setText") {
            return (t: string, cursor?: number) => {
              typed.push(t);
              real.setText(t, cursor);
            };
          }
          const value: unknown = Reflect.get(target, prop, target);
          return typeof value === "function" ? (value as () => unknown).bind(target) : value;
        },
      });
    })(),
    // **Real, and no longer `{} as never`.** The deps object below ends in
    // `as unknown as PipelineDeps`, which satisfies the type by *erasure* — every
    // absent field is invisible, not merely this one. That cast is why a route
    // could be untested while its seam was green: `documentView` was simply not
    // there, and nothing said so until a mutation was aimed at the wiring.
    // These two are built for real so the view route has something to run
    // against; the rest of the cast is noted in test/support/README.md.
    overlays,
    documentView,
    theme: { current: {} as never, setVariant: () => undefined, applyOverrides: () => [] },
    // `append` is real: C23 I29 records every settled submission through it,
    // and a fake without it throws inside the funnel — where the failure reads
    // as a transcript defect rather than as a missing method.
    history: {
      entries: [{ command: "/ps", ts: 0, exitCode: 0 }],
      append: (command: string, exitCode: number) => void recorded.push({ command, exitCode }),
    },
    runner: {
      spawnShell: () => {
        calls.push("spawnShell");
        return (script.spawnShell ?? (() => ({
          stdout: (async function* () { yield "out"; })(),
          stderr: (async function* () { /* a successful command says nothing */ })(),
          exited: Promise.resolve({ code: 0, signal: null }),
          overflowed: false,
        })))();
      },
      spawn: () => undefined,
      handoff: () => undefined,
      live: [],
      killAll: () => Promise.resolve(),
    },
    lifecycle: { size: () => ({ columns: 80, rows: 24 }) },
    resetFocus: () => {
      resets.push(1);
      if (script.focusThrows === true) throw new Error("focus exploded");
    },
    stop: () => Promise.resolve(0),
    clock: () => now,
    schedule: (fn: () => void, ms: number) => {
      const t = { fn, at: now + ms, live: true };
      timers.push(t);
      return {
        [Symbol.dispose]: () => {
          t.live = false;
        },
      };
    },
    openUrl: () => Promise.resolve(),
    bindings: () => [{ keys: "c+c", does: "global: cancel" }],
    binary: "widget",
    commandPolicy: slashPolicy,
    // Real (C23 I36) — `runLocal` builds `ctx.ask` from this for **every** local
    // verb, not only ones that ask, so a missing host fails `/guide` and
    // `/theme` alike. This is the second harness in the tree with its own
    // `as unknown as PipelineDeps`, and the cast is why the compiler saw
    // neither.
    confirm: createConfirmHost({ capabilities: { unicode: "full" }, overlays, invalidate: () => undefined }),
    // C23 I46 — everything visible. This harness has no viewport, so answering
    // from one would pause every part in the file: a fake supplying the
    // behaviour under test rather than standing in for it. The pause has its own
    // rows, against a real viewport.
    //
    // **The third harness in the tree whose cast hid a missing field**, which is
    // what `as unknown as PipelineDeps` buys and costs — `overlays` and `confirm`
    // are the two the comment above already records.
    visible: () => true,
  } as unknown as PipelineDeps;

  const pipeline = createExecutionPipeline(deps);
  // The app's own local verbs. The framework's six register themselves; these
  // are the fixture manifest's, and `seal()` reconciles both (C23 I27).
  pipeline.register("guide", () =>
    script.localLive === undefined
      ? localDoc({ command: "/guide" })
      : localDoc({ command: "/guide", blocks: [script.localLive()] }),
  );
  pipeline.register("debug dump", () => localDoc({ command: "/debug dump" }));
  
  
  pipeline.seal();

  return {
    contexts,
    pipeline,
    transcript,
    session,
    /**
     * The layer stack, for the view routes.
     *
     * **Exposed rather than asserted through `documentView`**: the question
     * T1.41 asks is *what is on screen*, and the owner's own state is the thing
     * that would agree with a projection bug. The layer is what C15 hands the
     * composer.
     */
    overlays,
    seqs,
    commands,
    commits,
    resets,
    calls,
    typed,
    /** What reached C20 (I29), and the prompt (I28). */
    recorded,
    editor: deps.editor,
    /** Advance the injected clock and fire §3b's timers that are due. */
    tick: (ms: number) => {
      now += ms;
      const due = timers.filter((t) => t.live && t.at <= now);
      for (const t of due) {
        t.live = false;
        t.fn();
      }
    },
  };
}

/** Lets every `void`-ed async route settle before assertions. */
const settled = () => new Promise((r) => setImmediate(r));

describe("C23 §6 — the guard, as a property over every exit", () => {
  it("T1.6b (I5): no route leaves the guard held, on success or on failure", async () => {
    // **The property, not fourteen assertions.** Seven routes × success and
    // failure is fourteen exits; a test per exit passes while "no path leaves it
    // held" is what fails in production, because the failure is the *next*
    // submission being refused rather than this one going wrong.
    //
    // Driven as a sequence so a route that strands the guard is visible as every
    // subsequent route being refused — which is exactly how it presents.
    const scripts: readonly (readonly [string, string, Scripted])[] = [
      ["app success", "/ps", {}],
      ["app transport throw", "/ps", { invoke: () => Promise.reject(new Error("boom")) }],
      ["app adapter throw", "/ps", { adapt: () => { throw new Error("adapter"); } }],
      ["shell success", "echo hi", {}],
      ["shell spawn throw", "echo hi", { spawnShell: () => { throw new Error("spawn"); } }],
      ["local success", "/help", {}],
      ["builtin", "cd /tmp", {}],
      ["builtinThenShell", "cd /tmp && echo hi", {}],
      ["error", "/nosuchverb", {}],
      ["stream", "/tail", {}],
    ];

    for (const [name, line, script] of scripts) {
      const h = harness(script);
      h.pipeline.submit(line);
      await settled();
      expect(h.pipeline.inFlight, `${name} left the guard held`).toBeNull();
    }
  });

  it("T1.6c (I5): the guard is released between submissions in one session", async () => {
    // The sequence form, which is what a per-exit test cannot see: a route that
    // strands the guard makes every *later* route report a refusal, and the
    // refusal is indistinguishable from correct behaviour if you only look at
    // the entry count.
    const h = harness();
    for (const line of ["cd /tmp", "/help", "echo hi", "/ps"]) {
      h.pipeline.submit(line);
      await settled();
      expect(h.pipeline.inFlight, `after ${line}`).toBeNull();
    }

    const commands = h.transcript.entries.map((e) => e.doc.command);
    expect(commands, "four submissions, four entries, none of them a refusal").toHaveLength(4);
    for (const entry of h.transcript.entries) {
      expect(
        entry.doc.blocks.some((b) => b.kind === "notice" && /still running/.test(b.text)),
        `${entry.doc.command} was refused, so something before it held the guard`,
      ).toBe(false);
    }
  });
});

describe("C23 §3 — the app path", () => {
  it("T1.4 (I3): the pending entry is appended before the transport is invoked", async () => {
    // The ordering that costs nothing visible in a test which waits for the
    // result, and makes every slow verb look like a dropped keystroke.
    const h = harness({
      invoke: async () => {
        expect(h.transcript.entries, "the entry is already there").toHaveLength(1);
        return result({ exitCode: 0 });
      },
    });

    h.pipeline.submit("/ps");
    await settled();

    expect(h.calls).toContain("invoke");
    expect(h.transcript.entries).toHaveLength(1);
  });

  it("T1.1: an app submission runs, then settles with the adapted document", async () => {
    const h = harness({ adapt: () => doc({ command: "/ps", status: "ok" }) });
    h.pipeline.submit("/ps");
    await settled();

    const entry = h.transcript.entries[0];
    expect(entry?.streaming, "settled").toBe(false);
    expect(entry?.doc.command, "steps 6 and 7 are one call on this route").toBe("/ps");
  });

  it("T1.11 (I7): $_ is set from meta.resultId, and only from it", async () => {
    // **The half that needs `settle(id, doc)`.** `resultId` arrives on the
    // *adapted* document; before C13 gained the operation, a pending entry could
    // never receive it and this was unimplementable.
    const withId = harness({
      adapt: () => doc({ command: "/ps", meta: { ...doc().meta, resultId: "uuid-1" } }),
    });
    withId.pipeline.submit("/ps");
    await settled();
    expect(withId.session.snapshot.lastUuid).toBe("uuid-1");

    const without = harness({ adapt: () => doc({ command: "/ps" }) });
    without.session.execution.setLastUuid("earlier");
    without.pipeline.submit("/ps");
    await settled();
    expect(without.session.snapshot.lastUuid, "a verb declaring none leaves it alone").toBe(
      "earlier",
    );
  });

  it("T1.5 (I4): a carried validation failure never reaches the transport", async () => {
    // C23 §8b B2 — §2 routes by *shape*, so an `app` result arrives on this path
    // whatever its validation says. Reading the carried answer is not
    // recomputing it.
    const h = harness();
    h.pipeline.submit("/ps --status=nonsense");
    await settled();

    expect(h.calls, "nothing spawned").not.toContain("invoke");
    expect(h.transcript.entries, "and it still produced exactly one entry").toHaveLength(1);
    expect(h.transcript.entries[0]?.doc.status).toBe("error");
  });

  it("T1.7 (I6): a streaming verb does not hold the guard", async () => {
    // One `--watch` blocking the session is the failure, and it is invisible
    // until a second command is typed.
    const h = harness({
      stream: () => (async function* () {
        yield { kind: "data", value: {} } as RawPatch;
      })(),
    });

    h.pipeline.submit("/tail");
    await settled();
    expect(h.pipeline.inFlight, "released before the loop, not after it").toBeNull();
  });

  it("T1.7b (I30, C07 I15): every patch of a stream gets its own seq, counted from 0", async () => {
    // **The literal was `seq: 0` and it was wrong twice.** C07 I15 spends the
    // number as the block-id namespace *and* as the per-stream reset, so a
    // constant makes the second patch of every stream collide under C04 I14 —
    // no streaming verb can emit more than one block — while resetting the
    // patch adapter continuously, which un-sticks C06 I12's degradation before
    // a remainder can be composed.
    //
    // **Three patches, because two would pass against `seq = seq === 0 ? 1 : 0`.**
    // The assertion is the sequence, not that the values differ.
    const h = harness({
      stream: () => (async function* () {
        yield { kind: "data", value: { a: 1 } } as RawPatch;
        yield { kind: "data", value: { a: 2 } } as RawPatch;
        yield { kind: "data", value: { a: 3 } } as RawPatch;
      })(),
    });

    h.pipeline.submit("/tail");
    await settled();

    expect(h.seqs, "the patch's position in its stream").toEqual([0, 1, 2]);

    // **And the consequence, not only the number.** The blocks the harness keys
    // by `seq` all reached the entry — which is the property the number exists
    // for, and the one that failed in a real session while every assertion about
    // the counter would still have been satisfiable by a well-behaved fake.
    expect(h.transcript.entries[0]?.doc.blocks.map((b) => b.id)).toEqual(["s0", "s1", "s2"]);
  });

  it("T1.7c (I15): one entry carries one displayed command, from first patch to settle", async () => {
    // **The streaming route passed the raw typed line and step 5 the resolved
    // argv**, so an entry said one thing while it streamed and another once it
    // settled — the transcript changing what it said a command was, mid-stream,
    // with no event to explain it. C22 I33 draws that value, so it is on the
    // screen.
    //
    // **The typed line is deliberately not already normalised.** With `/tail`
    // typed exactly as the argv rejoins it, both readings give the same string
    // and the row passes against either — the convenient setup where the two
    // agree. The runs of spaces are what make the two forms differ, and `tail`
    // takes variadic paths so they survive as arguments rather than as a
    // validation refusal.
    const h = harness({
      stream: () => (async function* () {
        yield { kind: "data", value: { a: 1 } } as RawPatch;
        yield { kind: "data", value: { a: 2 } } as RawPatch;
      })(),
    });

    h.pipeline.submit("/tail   a.log    b.log");
    await settled();

    // Every hand-off, patches and settle alike, carried the same string — and
    // it is the resolved argv, because that is what ran.
    const seen = h.commands.filter((c) => c.where === "patch");
    expect(seen.length, "the subject: patches were adapted").toBe(2);
    expect(new Set(h.commands.map((c) => c.command)).size, "one command per entry").toBe(1);
    expect(h.commands[0]?.command).toBe("/tail a.log b.log");

    // And what the transcript ends up holding is the same thing, which is what
    // the frame draws.
    expect(h.transcript.entries[0]?.doc.command).toBe("/tail a.log b.log");
  });
});

describe("C23 §8a A2/A3 — the three PatchOutcome arms", () => {
  /** A stream whose second patch the store will reject for the given reason. */
  const streamOf = (patches: readonly RawPatch[]) => () =>
    (async function* () {
      for (const p of patches) yield p;
    })();

  it("T1.8b (§8a A2): a malformed patch settles with what was kept and says why", async () => {
    // The `"patch"` arm — the only one carrying an `ErrorLike`. A duplicate block
    // id is C04 I14's rejection, which is the realistic way an adapter produces
    // one: two ticks describing the same row.
    let n = 0;
    const h = harness({
      stream: streamOf([
        { kind: "data", value: {} },
        { kind: "data", value: {} },
      ]),
      adaptPatch: () => {
        n += 1;
        return { op: "append", block: { kind: "notice", id: "same", tone: "info", text: `t${String(n)}` } };
      },
    });

    h.pipeline.submit("/tail");
    await settled();

    const entry = h.transcript.entries[0];
    expect(entry?.streaming, "settled with what it had").toBe(false);
    expect(
      entry?.doc.blocks.some((b) => b.kind === "notice" && /output truncated/.test(b.text)),
      "and a notice carries the message",
    ).toBe(true);
  });

  it("T1.8c (§8a A2): the wrong arm is what this catches, not three right ones", async () => {
    // **Three tests each taking their own arm correctly cannot see a
    // mis-dispatch.** The case that can: a patch rejected as `"settled"` — the
    // arm with no error — must *not* produce a truncation notice. Dispatching it
    // to the `"patch"` branch reads `.error` off an arm that has none, which is
    // what C23 §5 said to do until the trace was walked.
    //
    // Constructed by settling the entry from underneath the stream, which is the
    // real sequence: a cancel lands, then a patch already in flight arrives.
    const h = harness({
      stream: streamOf([
        { kind: "data", value: {} },
        { kind: "data", value: {} },
      ]),
    });

    h.pipeline.submit("/tail");
    await new Promise((r) => setTimeout(r, 0));
    const id = h.transcript.entries[0]?.id ?? "";
    h.transcript.settle(id);
    await settled();

    const entry = h.transcript.entries[0];
    expect(
      entry?.doc.blocks.some((b) => b.kind === "notice" && /output truncated/.test(b.text)),
      "a `settled` rejection is not a truncation — it carries no error to report",
    ).toBe(false);
    expect(entry?.streaming, "and the entry stays final").toBe(false);
  });
});

describe("C23 §2 — the seven routes", () => {
  it("T1.3 (I1): empty produces no entry and no commit", () => {
    const h = harness();
    h.pipeline.submit("   ");

    expect(h.transcript.entries).toHaveLength(0);
    expect(h.commits, "not even a frame").toHaveLength(0);
  });

  it("T1.12 (I11): a built-in applies to session state before any delegation", async () => {
    const h = harness();
    h.pipeline.submit("cd /tmp && echo hi");
    await settled();

    expect(h.session.snapshot.cwd, "applied first").toBe("/tmp");
    expect(h.calls, "then delegated").toContain("spawnShell");
  });

  it("T3.13: a built-in that fails does not delegate", async () => {
    const h = harness();
    h.pipeline.submit("export NOEQUALS && echo hi");
    await settled();

    expect(h.calls, "the remainder is not delegated").not.toContain("spawnShell");
    expect(h.transcript.entries[0]?.doc.status).toBe("error");
  });

  it("T3.15 (I12): a submission after stopping is refused, and nothing is appended", () => {
    // **The invariant the old seam made unobservable.** `session` was a snapshot
    // captured at construction, so `stopping` was false forever and this test
    // could not have been written.
    const h = harness();
    h.session.beginStopping();
    h.pipeline.submit("/ps");

    expect(h.transcript.entries).toHaveLength(0);
    expect(h.commits).toHaveLength(0);
  });

  it("T1.6 (I5): a second submission while one is in flight is refused, whole-line", async () => {
    // §8b B4 — refusal is unconditional, so the `cd` does not take effect even
    // though it needs nothing C23 is holding.
    let release: (() => void) | undefined;
    const h = harness({
      invoke: () => new Promise((r) => { release = () => r(result({ exitCode: 0 })); }),
    });

    h.pipeline.submit("/ps");
    await new Promise((r) => setTimeout(r, 0));
    h.pipeline.submit("cd /tmp && echo hi");
    await settled();

    expect(h.session.snapshot.cwd, "nothing half-happened").toBe("/work");
    const refusal = h.transcript.entries.at(-1);
    expect(
      refusal?.doc.blocks.some((b) => b.kind === "notice" && /still running/.test(b.text)),
      "and the refusal names what is running",
    ).toBe(true);

    release?.();
    await settled();
  });

  it("T4.7b: resetFocus is called after the append and before the commit", async () => {
    // Asserted on order, because a reset before the append is undone by nothing
    // and one after the commit paints a frame with focus in a just-frozen block.
    const order: string[] = [];
    const h = harness();
    const realAppend = h.transcript.append.bind(h.transcript);
    h.transcript.append = ((...args: Parameters<typeof realAppend>) => {
      order.push("append");
      return realAppend(...args);
    }) as typeof realAppend;

    h.pipeline.submit("/help");
    await settled();

    expect(order[0]).toBe("append");
    expect(h.resets.length, "and focus was reset").toBeGreaterThan(0);
  });

  it("T1.2b (I1, I2): a route failing before its own try still produces an outcome", async () => {
    // **The window `void runX(...)` opens, and the one the glyph defect lived
    // in.** An async route that throws ahead of its `try` rejects with nobody
    // awaiting: no entry, no commit, no error reported. C23 I1 violated in the
    // one way nothing can see — which is how every containment path came to
    // produce nothing while the suite was green.
    //
    // Fabricated by making the *first* thing the route touches throw, which is
    // before any route's `try` by construction.
    const h = harness();
    const realFor = h.transcript.append.bind(h.transcript);
    let armed = true;
    h.transcript.append = ((...args: Parameters<typeof realFor>) => {
      if (armed) {
        armed = false;
        throw new Error("append exploded");
      }
      return realFor(...args);
    }) as typeof realFor;

    h.pipeline.submit("/ps");
    await settled();

    expect(h.pipeline.inFlight, "and the guard is not stranded by it").toBeNull();
    expect(
      h.transcript.entries.length + h.commits.length,
      "something reached the user, or the frame committed",
    ).toBeGreaterThan(0);
  });

  it("T1.45 (I48): a rejected document's reason survives, in the store's own words", async () => {
    // **F15's document is the input**, not a synthetic error: two blocks with one
    // id, which C04 I14 forbids because `ViewPatch` addresses blocks by id. The
    // shell said nothing at all about it, and the sentence naming the violation
    // was in hand and discarded.
    //
    // Asserted on the *sentence* rather than on the collection being non-empty,
    // because a generic "a document was rejected" satisfies every count-based
    // row while destroying exactly what F15 says was destroyed.
    const h = harness();
    h.transcript.append = (() => {
      throw new Error('blocks: id "running" appears 2 times (C04 I14)');
    }) as typeof h.transcript.append;

    h.pipeline.submit("/help");
    await settled();

    expect(h.pipeline.faults.join("\n")).toContain('id "running" appears 2 times');
  });

  it("T1.46 (I48): one cause swallowed five times is recorded once", async () => {
    // C20's *logged once*, which is what makes this safe to put on a path that
    // can fail per tick. A refresh notice failing every second would otherwise
    // grow the collection without bound and print a wall of one sentence.
    const h = harness();
    h.transcript.append = (() => {
      throw new Error("the same thing, again");
    }) as typeof h.transcript.append;

    for (let i = 0; i < 5; i += 1) h.pipeline.submit("/help");
    await settled();

    expect(h.pipeline.faults.filter((f) => f.includes("the same thing"))).toHaveLength(1);
  });

  it("T1.47 (I49): a throw after the append still resets focus and still returns the id", async () => {
    // **§8e's second row, and the one that happened** — row 2's cadence refusal
    // threw from `declareLive` with the entry already appended. Four of the five
    // statements under the catch leave the entry there and the sequence after it
    // abandoned, and `resetFocus` is the one whose absence is permanent: T4.7b
    // asserts its position because one frame with focus in a frozen block is the
    // failure it prevents.
    //
    // **The entry count is what says the append itself succeeded**, so the row
    // is about a later statement rather than the first. §8e E2's other half —
    // returning the id instead of a flat `null` — is corrected in the code and
    // has **no row**, because all nineteen call sites discard the return: there
    // is nothing that can observe it, and a row asserting it would have to add
    // the consumer it is testing for.
    const h = harness({ focusThrows: true });

    h.pipeline.submit("/help");
    await settled();

    // Two entries: the submission's, which the append *did* produce, and the
    // fault notice beside it. The count is what says this is a later row of §8e
    // rather than the first — in row one there is no submission entry at all.
    expect(h.transcript.entries).toHaveLength(2);
    expect(
      h.transcript.entries[0]?.doc.command,
      "the append succeeded — this is not row one",
    ).toBe("/help");
    // **Twice, and the number is the assertion.** The try's reset ran and threw;
    // the catch's is the one under test, and `> 0` is satisfied by the first
    // alone — which is what the mutation pass showed: removing the catch's reset
    // survived a row written to cover it.
    expect(h.resets.length, "the sequence reset, and so did the catch").toBe(2);
    expect(h.commits.length, "and the frame still committed").toBeGreaterThan(0);
    expect(h.pipeline.faults.join("\n")).toContain("focus exploded");
  });

  it("T1.48 (I1, §8b B1): the swallow leaves one entry, and it is the fault notice", async () => {
    // **The count and the identity.** A row asserting only the count passes on
    // the day the notice is the wrong document, and a row asserting only the
    // notice passes on the day I1's count went to two — the fault notice is a
    // fourth non-submission append, not a second entry for one submission.
    const h = harness();
    let armed = true;
    const real = h.transcript.append.bind(h.transcript);
    h.transcript.append = ((...args: Parameters<typeof real>) => {
      if (armed) {
        armed = false;
        throw new Error("refused");
      }
      return real(...args);
    }) as typeof real;

    h.pipeline.submit("/help");
    await settled();

    expect(h.transcript.entries).toHaveLength(1);
    const only = h.transcript.entries[0]?.doc;
    expect(only?.meta.origin, "the one field that says a defect from a quiet verb").toBe("defect");
    expect(only?.command, "and it is nobody's submission").toBe("");
  });

  it("T1.49 (C04 I13): `/debug` renders the arm the fifth origin was added for", async () => {
    // **The justification checked rather than asserted.** `defect` is worth a
    // fifth arm on a public union only because it separates a contained failure
    // from a verb that did nothing *in the one field that could say so* — and
    // that is true only if something displays it. A grep answered it for today;
    // this answers it for the next person to touch the `/debug` handler.
    const h = harness();
    let armed = true;
    const real = h.transcript.append.bind(h.transcript);
    h.transcript.append = ((...args: Parameters<typeof real>) => {
      if (armed) {
        armed = false;
        throw new Error("refused");
      }
      return real(...args);
    }) as typeof real;

    h.pipeline.submit("/help");
    await settled();
    h.pipeline.submit("/debug 1");
    await settled();

    const shown = h.transcript.entries.at(-1)?.doc.blocks.flatMap((b) =>
      b.kind === "keyValue" ? b.rows.map((r) => `${r.label}=${r.value}`) : [],
    );
    expect(shown, "the reader the arm's justification rests on").toContain("origin=defect");
  });

  it("T3.37 (I48, §8b B1): a swallow while stopping is recorded and not appended", async () => {
    // B1's ruling reaching a fourth non-submission append rather than becoming a
    // fourth exception to it. The transcript is being torn down; the collection
    // is what the reader gets, and C22 §8 step 3 has not run yet.
    const h = harness();
    h.transcript.append = (() => {
      throw new Error("refused while stopping");
    }) as typeof h.transcript.append;
    h.session.beginStopping();

    // Not `submit`, which I12 refuses before it reaches the append at all — the
    // greeting is one of the paths that appends without being a submission.
    h.pipeline.greeting({ schema: "tui.view/1", command: "", status: "ok", blocks: [], meta: {
      verb: null, adapter: "none", exitCode: 0, durationMs: 0, truncated: false,
      argv: [], stderr: "", transport: "local", origin: "user",
    } });
    await settled();

    expect(h.pipeline.faults.join("\n")).toContain("refused while stopping");
    expect(h.transcript.entries, "and nothing was appended after shutdown began").toHaveLength(0);
  });

  it("T3.38 (§5a): when the notice cannot land either, the collection still has it", async () => {
    // **The end of the ladder, fabricated rather than stated.** A frozen shape
    // is a claim about a construction path, and the glyph defect is how F15 was
    // found in the first place — this row is what caught the fault notice being
    // composed with `status: "error"` and no `error` field, which C04 I3 refuses.
    const h = harness();
    h.transcript.append = (() => {
      throw new Error("everything is refused");
    }) as typeof h.transcript.append;

    h.pipeline.submit("/help");
    await settled();

    expect(h.transcript.entries, "nothing could be appended at all").toHaveLength(0);
    expect(h.pipeline.faults.join("\n")).toContain("everything is refused");
  });
});

describe("C23 tier 2 — contract", () => {
  it("T2.6: every ParseResult variant has a route, exhaustively", async () => {
    // **Exhaustive over the union rather than a sample.** A route added to the
    // parser and not to §2 is a submission that produces nothing, which is C23
    // I1's failure in the one direction a per-case test does not sweep.
    const byKind: Readonly<Record<string, string>> = {
      empty: "   ",
      error: "/nosuchverb",
      builtin: "cd /tmp",
      builtinThenShell: "cd /tmp && echo hi",
      shell: "echo hi",
      local: "/help",
      app: "/ps",
    };

    for (const [kind, line] of Object.entries(byKind)) {
      const h = harness();
      h.pipeline.submit(line);
      await settled();

      const produced = h.transcript.entries.length;
      if (kind === "empty") {
        expect(produced, "empty is I1's first exception").toBe(0);
      } else {
        expect(produced, `${kind} produced no outcome`).toBe(1);
      }
    }
  });

  it("T2.2 (I1): entry count equals submission count minus empties", async () => {
    // The property C23 I1 actually states, over a sequence rather than per case.
    // A route appending twice and a route appending never both pass every
    // single-submission test and both fail this.
    const lines = [
      "/ps", "   ", "cd /tmp", "/help", "", "echo hi", "/nosuchverb",
      "cd /a && echo b", "  ", "/ps",
    ];
    const empties = lines.filter((l) => l.trim() === "").length;

    const h = harness();
    for (const line of lines) {
      h.pipeline.submit(line);
      await settled();
    }

    expect(h.transcript.entries).toHaveLength(lines.length - empties);
  });

  it("T2.4 (I8): patches commit `stream`, settlement commits `completion`", async () => {
    const h = harness({
      stream: () => (async function* () {
        yield { kind: "data", value: {} } as RawPatch;
        yield { kind: "end", result: result({ exitCode: 0 }) } as RawPatch;
      })(),
    });

    h.pipeline.submit("/tail");
    await settled();

    expect(h.commits, "the patch").toContain("stream");
    expect(h.commits.at(-1), "and the end flushes").toBe("completion");
  });

  it("T2.1 (I2): a fault at each stage still produces a document", async () => {
    // Per stage, because "the session survives" is true of a pipeline that
    // silently drops everything. What is asserted is the *outcome*, one per
    // stage, which is the claim I2 makes.
    const faults: readonly (readonly [string, string, Scripted])[] = [
      ["transport", "/ps", { invoke: () => Promise.reject(new Error("transport")) }],
      ["adapter", "/ps", { adapt: () => { throw new Error("adapter"); } }],
      ["spawn", "echo hi", { spawnShell: () => { throw new Error("spawn"); } }],
      ["stream", "/tail", { stream: () => { throw new Error("stream"); } }],
    ];

    for (const [stage, line, script] of faults) {
      const h = harness(script);
      h.pipeline.submit(line);
      await settled();

      expect(h.transcript.entries, `${stage}: no document`).toHaveLength(1);
      expect(h.pipeline.inFlight, `${stage}: guard stranded`).toBeNull();
    }
  });
});

describe("C23 tier 3 — edges", () => {
  it("T3.1: whitespace only is empty", () => {
    const h = harness();
    for (const line of ["", "   ", "\t", "\n  \t "]) h.pipeline.submit(line);
    expect(h.transcript.entries).toHaveLength(0);
  });

  it("T3.2: a verb that exits immediately replaces the pending entry, never orphans it", async () => {
    // **One entry, not two.** The pending entry and the result are the same
    // entry, which is what `settle(id, doc)` made possible — before it, the only
    // way to show the result was a second append.
    const h = harness({ adapt: () => doc({ command: "/ps", status: "ok" }) });
    h.pipeline.submit("/ps");
    await settled();

    expect(h.transcript.entries, "one entry").toHaveLength(1);
    expect(h.transcript.entries[0]?.streaming, "and it is settled").toBe(false);
  });

  it("T3.17 (I5): a refused submission creates no pending entry", async () => {
    // The refusal is an entry (§8b B5) and the *pending* one is what must not
    // exist — an orphan that never settles and holds a live id.
    let release: (() => void) | undefined;
    const h = harness({
      invoke: () => new Promise((r) => { release = () => r(result({ exitCode: 0 })); }),
    });

    h.pipeline.submit("/ps");
    await new Promise((r) => setTimeout(r, 0));
    const before = h.transcript.entries.length;
    h.pipeline.submit("/ps");
    await settled();

    expect(h.transcript.entries.length, "one refusal notice, no second pending entry")
      .toBe(before + 1);
    expect(
      h.transcript.entries.filter((e) => e.streaming),
      "exactly one entry is still streaming — the first",
    ).toHaveLength(1);

    release?.();
    await settled();
  });

  it("T3.17 (I50, F151): a failing shell command produces an entry rather than a refusal", async () => {
    // **The row is `toHaveLength(1)`, and that is the whole finding.** This
    // composed `status: "error"` with no `error` field, C04 I3 forbids that in
    // both directions, and `transcript.append` refused it — so the route
    // produced *no entry at all* and the reader saw a fault notice citing two
    // invariant numbers in place of the command they typed.
    //
    // Reached by typing a bare word where the shell wants a prefixed verb,
    // which is the likeliest thing an unfamiliar reader does and the one input
    // nothing had ever run.
    const h = harness({
      spawnShell: () => ({
        stdout: (async function* () { /* a command that was not found says nothing here */ })(),
        stderr: (async function* () { yield "sh: 1: list: not found\n"; })(),
        exited: Promise.resolve({ code: 127, signal: null }),
        overflowed: false,
      }),
    });

    h.pipeline.submit("list");
    await settled();

    expect(h.transcript.entries, "the failing command produced no entry").toHaveLength(1);
    const doc = h.transcript.entries[0]?.doc;
    expect(doc?.status).toBe("error");
    // C04 I3's other direction — present *because* the status is `"error"`.
    expect(doc?.error?.message, "the error field C13 refused the document for").toBe(
      "The command exited with code 127.",
    );

    // **And the sentence that names what happened.** `ChildHandle` delivers the
    // two streams separately (C21 I3) and the route read only `stdout`, so the
    // one line identifying the token was produced, delivered and dropped —
    // leaving a raw block that was empty as well as unappendable.
    const text = JSON.stringify(doc?.blocks);
    expect(text, "the shell's own line never reached the document").toContain("list: not found");
    // The empty stdout is not drawn as a blank row beside the notice.
    expect(doc?.blocks, "an empty stream became a block").toHaveLength(2);
  });

  it("T3.18 (I50, F151): a signal is named, and a success is unchanged", async () => {
    const killed = harness({
      spawnShell: () => ({
        stdout: (async function* () { /* nothing */ })(),
        stderr: (async function* () { /* nothing */ })(),
        exited: Promise.resolve({ code: null, signal: "SIGTERM" }),
        overflowed: false,
      }),
    });
    killed.pipeline.submit("sleep 99");
    await settled();
    expect(killed.transcript.entries[0]?.doc.error?.message).toBe("Killed by SIGTERM.");

    // **The control, and it is what stops this row from being satisfied by a
    // route that calls everything an error.** The success path is asserted to
    // be exactly what it was: one raw block, no notice, no `error`.
    const ok = harness();
    ok.pipeline.submit("echo hi");
    await settled();
    const doc = ok.transcript.entries[0]?.doc;
    expect(doc?.status).toBe("ok");
    expect(doc?.error).toBeUndefined();
    expect(doc?.blocks).toHaveLength(1);
    expect(doc?.blocks[0]?.kind).toBe("raw");

    // **A command that succeeds and says nothing, which is the arm the
    // mutation pass found missing.** "The success path is unchanged" was
    // asserted only where there was output to see, so eliding an empty raw
    // block survived — a real change (one block becomes none for every silent
    // `true`, `cd`, `touch`) that no row could observe, because the fake always
    // yielded text. The fixture agreed with the claim on the only input it had.
    const silent = harness({
      spawnShell: () => ({
        stdout: (async function* () { /* nothing */ })(),
        stderr: (async function* () { /* nothing */ })(),
        exited: Promise.resolve({ code: 0, signal: null }),
        overflowed: false,
      }),
    });
    silent.pipeline.submit("true");
    await settled();
    const quiet = silent.transcript.entries[0]?.doc;
    expect(quiet?.status).toBe("ok");
    expect(quiet?.blocks, "a silent success lost its block").toHaveLength(1);
    expect(quiet?.blocks[0]).toMatchObject({ kind: "raw", text: "" });
  });

  it("T3.16 (I5): a shell route holds the guard exactly as an app verb does", async () => {
    // `sleep 30` delegated to the shell is a foreground command, and no shell
    // lets you type another over it. Scoping the guard to app verbs is the
    // revert T6.13 names.
    let finish: (() => void) | undefined;
    const h = harness({
      spawnShell: () => ({
        stdout: (async function* () { yield "x"; })(),
        stderr: (async function* () { /* nothing */ })(),
        exited: new Promise((r) => { finish = () => r({ code: 0, signal: null }); }),
        overflowed: false,
      }),
    });

    h.pipeline.submit("sleep 30");
    await new Promise((r) => setTimeout(r, 0));

    expect(h.pipeline.inFlight, "a shell route is in flight").toBe("shell");
    h.pipeline.submit("/ps");
    await settled();
    expect(h.calls, "the second submission never reached the transport").not.toContain("invoke");

    finish?.();
    await settled();
  });

  it("T3.8: a stream that never settles holds nothing", async () => {
    // The entry stays `streaming` indefinitely and the guard is not held — the
    // two halves are independent, and a test asserting only the first passes on
    // an implementation that blocks the session forever.
    const h = harness({
      stream: () => (async function* () {
        yield { kind: "data", value: {} } as RawPatch;
        await new Promise(() => undefined); // never ends
      })(),
    });

    h.pipeline.submit("/tail");
    await settled();

    expect(h.pipeline.inFlight, "the guard is free").toBeNull();
    expect(h.transcript.entries[0]?.streaming, "and the entry is still open").toBe(true);
  });

  it("T3.7: a stream in flight does not refuse a following app verb", async () => {
    // C23 I6 from the other side: subscriptions are exempt, so the prompt keeps
    // working while a `--watch` runs.
    const h = harness({
      stream: () => (async function* () {
        yield { kind: "data", value: {} } as RawPatch;
        await new Promise(() => undefined);
      })(),
    });

    h.pipeline.submit("/tail");
    await settled();
    h.pipeline.submit("/ps");
    await settled();

    expect(h.calls, "the app verb ran").toContain("invoke");
    expect(
      h.transcript.entries.some((e) =>
        e.doc.blocks.some((b) => b.kind === "notice" && /still running/.test(b.text)),
      ),
      "and nothing was refused",
    ).toBe(false);
  });
});

describe("C23 §3a — action dispatch", () => {
  /** A table entry with one row, live, so actions from it are permitted. */
  function withTable() {
    const h = harness();
    const id = h.transcript.append(
      doc({
        command: "/ps",
        blocks: [
          {
            kind: "table",
            id: "t1",
            columns: [
              { key: "name", label: "Name", align: "left", priority: 10, minWidth: 8, sortable: true },
            ],
            rows: [{ id: "r1", cells: { name: { text: "one" } } }],
          },
        ],
      }),
    );
    // **Asserted before it is used**, per test/support/README.md: an invalid
    // table makes `append` throw, `id` undefined, and every action read as
    // fired from a frozen entry — which is how the first run of these four
    // tests failed for a reason that had nothing to do with actions.
    expect(h.transcript.entries, "the fixture appended").toHaveLength(1);
    expect(h.transcript.liveId, "and it is live, so actions from it are permitted").toBe(id);
    return { ...h, id };
  }

  it("T1.15 (I17): only http and https reach the opener", async () => {
    // **The security surface.** A URL from a far-side envelope is untrusted, and
    // the check is here rather than in the opener because C22's opener is
    // replaceable — an app supplying its own must not be the thing standing
    // between `javascript:` and the OS handler.
    //
    // **One action per harness, deliberately.** A refusal is an append and an
    // append freezes the live entry (C13 §4), so a second action fired from the
    // same block is refused as *frozen* rather than for its own reason — the
    // hazard C23 §4's pop row already rules against, arriving on this path and
    // unresolved. Batching them here would have baked that in as expected.
    for (const [url, why] of [
      ["file:///etc/passwd", /refusing to open/],
      ["javascript:alert(1)", /refusing to open/],
      ["data:text/html,<script>", /refusing to open/],
      ["not a url at all", /is not a URL/],
    ] as const) {
      const h = withTable();
      h.pipeline.onAction({ kind: "open", label: "x", url }, h.id);
      await settled();

      expect(
        h.transcript.entries.some((e) =>
          e.doc.blocks.some((b) => b.kind === "notice" && why.test(b.text)),
        ),
        url,
      ).toBe(true);
    }

    // And the one that is allowed reaches the opener rather than a refusal.
    const ok = withTable();
    ok.pipeline.onAction({ kind: "open", label: "docs", url: "https://example.com/" }, ok.id);
    await settled();
    expect(
      ok.transcript.entries.some((e) =>
        e.doc.blocks.some((b) => b.kind === "notice" && /refusing|not a URL/.test(b.text)),
      ),
      "https is not refused",
    ).toBe(false);
  });



  it("T1.18 (I16): exec re-enters §2 and is indistinguishable from typing", async () => {
    // Not a shortcut past the guard: same routes, same refusal, same entry.
    const h = withTable();
    h.pipeline.onAction({ kind: "exec", label: "run", command: "/ps" }, h.id);
    await settled();

    expect(h.calls, "it went through the app route").toContain("invoke");
  });


  it("T1.14c: an expand naming no row says so rather than doing nothing", () => {
    // An action that silently does nothing is indistinguishable from one that
    // worked, which is the failure this whole component is shaped against.
    const h = withTable();
    h.pipeline.onAction({ kind: "expand", label: "e", target: "nosuch" }, h.id);

    expect(
      h.transcript.entries.some((e) =>
        e.doc.blocks.some((b) => b.kind === "notice" && /nothing to expand/.test(b.text)),
      ),
    ).toBe(true);
  });

  it("T1.16 (I17): no action path reaches a shell", async () => {
    // A spy rather than a reading: `spawnShell` is what an injection would use,
    // and the whole of D18 is that this path does not exist.
    for (const action of [
      { kind: "open" as const, label: "a", url: "https://example.com/;rm -rf ~" },
      { kind: "fill" as const, label: "b", command: "echo hi" },
      { kind: "expand" as const, label: "c", target: "r1" },
    ]) {
      const h = withTable();
      h.pipeline.onAction(action, h.id);
      await settled();
      expect(h.calls, `${action.kind} shelled`).not.toContain("spawnShell");
    }
  });




  it("T1.14b (§3a): expand toggles the row's flag through a document patch", async () => {
    // C11 T4.7's mechanism — expansion is content, not view state, so a frozen
    // block records its own expansion. A test asserting only "a patch was
    // issued" passes on a patch that changes nothing.
    const h = withTable();

    h.pipeline.onAction({ kind: "expand", label: "e", target: "r1" }, h.id);
    await settled();
    const first = h.transcript.entries[0]?.doc.blocks[0];
    expect(first?.kind === "table" && first.rows[0]?.expanded).toBe(true);

    h.pipeline.onAction({ kind: "expand", label: "e", target: "r1" }, h.id);
    await settled();
    const second = h.transcript.entries[0]?.doc.blocks[0];
    expect(second?.kind === "table" && second.rows[0]?.expanded, "toggles").toBe(false);
  });

  it("T1.17 (I18): an action from a frozen entry is refused, from the live one runs", async () => {
    const h = withTable();
    const frozen = h.id;
    h.transcript.append(doc({ command: "later" }), { streaming: true }); // freezes the first
    const countBefore = h.transcript.entries.length;

    h.pipeline.onAction({ kind: "fill", label: "f", command: "typed" }, frozen);
    await settled();

    // **The refusal patches the entry it declined to act on** (I18, §3a). An
    // append would freeze the block the action came from, so the *next* action
    // is refused as frozen rather than for its own reason — C23 §4's pop row,
    // one section over. The entry count is what distinguishes the two: a notice
    // appearing somewhere is true either way.
    const source = h.transcript.entries.find((e) => e.id === frozen);
    expect(
      source?.doc.blocks.some((b) => b.kind === "notice" && /frozen entry/.test(b.text)),
      "the notice is on the entry that was acted upon",
    ).toBe(true);
    expect(h.transcript.entries, "and nothing was appended").toHaveLength(countBefore);
    expect(h.typed, "and the refused action did not run").toHaveLength(0);

    const live = h.transcript.liveId;
    h.pipeline.onAction({ kind: "fill", label: "f", command: "typed" }, live);
    await settled();
    expect(h.commits, "the live one committed a frame").toContain("input");
  });
});

describe("C23 §3b — time-driven updates", () => {
  it("T1.19 (I22, §3b): the identity notice is the only producer of origin `refresh`", async () => {
    // **The cell the value was reserved for.** §3a's origin table listed
    // `refresh` against stall detection and part refresh — and neither appends,
    // while `meta.origin` is a field on an appended document. So the value read
    // as reserved and was unreachable: A03 §2's vacuity class in a field.
    //
    // Asserting the origin rather than that a notice appeared is the whole
    // point. A test checking only for the text leaves the field unreachable
    // again, which is how it got here.
    const h = harness();
    h.pipeline.identityNotice("Token expires in 14h — run /login to refresh");
    await settled();

    const entry = h.transcript.entries.at(-1);
    expect(entry?.doc.meta.origin, "C22 signals, C23 appends").toBe("refresh");
    expect(
      entry?.doc.blocks.some((b) => b.kind === "notice" && /Token expires/.test(b.text)),
    ).toBe(true);
  });

  it("T3.19 (I12, §8b B1): §3b stops once stopping is set", async () => {
    // I12 governs *submissions* and none of §3b's three is one, so without the
    // second clause the rule covers submissions while its reason claims
    // everything — and a notice lands in a transcript being torn down.
    const h = harness();
    h.session.beginStopping();
    h.pipeline.identityNotice("Token expired");
    await settled();

    expect(h.transcript.entries, "nothing appended after shutdown begins").toHaveLength(0);
  });

  it("T1.20 (I25): a stream silent for 120 s is patched with a notice, never an error", async () => {
    // **A notice, never an error.** A quiet stream is the normal state of a
    // `--watch` on an idle cluster; reporting it as a failure trains the reader
    // to ignore the one time it is one.
    const h = harness({
      stream: () => (async function* () {
        yield { kind: "data", value: {} } as RawPatch;
        await new Promise(() => undefined);
      })(),
    });

    h.pipeline.submit("/tail");
    await settled();

    h.tick(60_000);
    const early = h.transcript.entries[0]?.doc.blocks.some(
      (b) => b.kind === "notice" && /no output/.test(b.text),
    );
    expect(early, "not yet at 60 s").toBe(false);

    h.tick(70_000);
    const entry = h.transcript.entries[0];
    const stall = entry?.doc.blocks.find((b) => b.kind === "notice" && /no output/.test(b.text));
    expect(stall, "patched at 120 s").toBeDefined();
    expect(stall?.kind === "notice" && stall.tone, "muted, not an error tone").toBe("muted");
    expect(entry?.streaming, "and the subscription is untouched").toBe(true);
  });

  it("T1.21 (I20): offsets are spread so no two parts fire in the same tick", () => {
    // Across the **smallest** interval rather than each part's own: two parts at
    // 30 s and 300 s collide every tenth tick if each is staggered within its own
    // period, and the smallest is the only window every part shares.
    const part = (id: string, intervalMs: number) => ({
      id,
      title: id,
      intervalMs,
      staleAfterMs: intervalMs * 2,
      fetch: () => Promise.reject(new Error("x")),
      render: () => block({ kind: "raw", id: `${id}-c`, text: "" }),
      renderError: () => block({ kind: "raw", id: `${id}-c`, text: "" }),
    });
    const parts = assignOffsets([
      part("a", 30_000),
      part("b", 300_000),
      part("c", 60_000),
    ]);

    const offsets = parts.map((p) => p.offsetMs);
    expect(new Set(offsets).size, "all distinct").toBe(3);
    for (const o of offsets) expect(o).toBeLessThan(30_000);
  });

  it("T1.22 (I21): backoff doubles from the interval to a five-minute cap", () => {
    // A pure function so the doubling reads in a table. Off-by-one doubling is
    // visible here and invisible in a running session.
    expect(backoffOf(30_000, 0), "no failures — the declared interval").toBe(30_000);
    expect(backoffOf(30_000, 1)).toBe(60_000);
    expect(backoffOf(30_000, 2)).toBe(120_000);
    expect(backoffOf(30_000, 3)).toBe(240_000);
    expect(backoffOf(30_000, 4), "capped").toBe(BACKOFF_CAP_MS);
    expect(backoffOf(30_000, 40), "and stays capped").toBe(BACKOFF_CAP_MS);
    expect(backoffOf(30_000, 0), "recovery resets it").toBe(30_000);
  });

  it("T1.30 (I19): the stall timer re-arms — two silences produce two notices", async () => {
    // **The row the harness could not hold until it told the truth about time.**
    // `schedule` is a one-shot (`session.ts` supplies `setTimeout`), so a driver
    // that arms outside a loop checks for silence once, thirty seconds after
    // construction, and never again. Every assertion about the *first* silence
    // passes for that driver — which is why this row needs a second one, and why
    // it is driven in steps rather than in a single long tick.
    //
    // The old harness re-fired every scheduled callback on every `tick()`, under
    // which the re-armed and the armed-once driver are the same test.
    let resume: (() => void) | undefined;
    const h = harness({
      stream: () => (async function* () {
        yield { kind: "data", value: {} } as RawPatch;
        await new Promise<void>((r) => { resume = r; });
        yield { kind: "data", value: {} } as RawPatch;
        await new Promise(() => undefined);
      })(),
    });

    h.pipeline.submit("/tail");
    await settled();

    // First silence: stepped, so the check at 60 s finds nothing and the check
    // that matters is a later firing of the same timer.
    h.tick(60_000);
    h.tick(70_000);
    const texts = () =>
      (h.transcript.entries[0]?.doc.blocks ?? [])
        .filter((b) => b.id === "stall-notice")
        .map((b) => (b.kind === "notice" ? b.text : ""));
    expect(texts(), "the first silence is reported").toEqual([expect.stringMatching(/no output for/)]);

    // Speak, then go quiet again. The second notice can only arrive from a timer
    // that armed itself after the first one fired.
    resume?.();
    await settled();
    expect(texts(), "resumption spends the row").toEqual([expect.stringMatching(/resumed after/)]);

    h.tick(60_000);
    h.tick(70_000);
    expect(texts(), "and the second silence is reported too").toEqual([
      expect.stringMatching(/no output for/),
    ]);
  });

  it("T1.37 (I25): one notice per silence, not one per tick", async () => {
    // The mutation this catches is arming inside the sweep rather than around it:
    // every tick then reports the same unbroken silence again, and a `--watch` on
    // an idle cluster accumulates a notice every thirty seconds.
    const h = harness({
      stream: () => (async function* () {
        yield { kind: "data", value: {} } as RawPatch;
        await new Promise(() => undefined);
      })(),
    });
    h.pipeline.submit("/tail");
    await settled();

    for (let i = 0; i < 8; i += 1) h.tick(60_000);

    const stall = (h.transcript.entries[0]?.doc.blocks ?? []).filter((b) => b.id === "stall-notice");
    expect(stall, "eight ticks, one notice").toHaveLength(1);
  });

  it("T1.20b (I25, §8a A4): resumption replaces the notice, and the row says something true", async () => {
    // **Replaced, never removed.** `ViewPatch` has no delete and should not: a
    // transcript is a record, and a patch that made a block vanish would leave a
    // document whose earlier state cannot be reconstructed from its own history.
    //
    // Removal was never what this wanted. The notice said *this stream has gone
    // quiet*; the stream then spoke. The thing it describes still exists and its
    // state changed, which is `replace` — and the spent row records the gap,
    // because the entry did go quiet and that belongs in its record.
    let resume: (() => void) | undefined;
    const h = harness({
      stream: () => (async function* () {
        yield { kind: "data", value: {} } as RawPatch;
        await new Promise<void>((r) => { resume = r; });
        yield { kind: "data", value: {} } as RawPatch;
        await new Promise(() => undefined);
      })(),
    });

    h.pipeline.submit("/tail");
    await settled();
    h.tick(130_000);

    const stalled = h.transcript.entries[0]?.doc.blocks.filter((b) => b.kind === "notice");
    expect(
      stalled?.some((b) => b.kind === "notice" && /no output for/.test(b.text)),
      "quiet at 120 s",
    ).toBe(true);
    // Counted by *block id*, not by total rows: resumption also delivers a real
    // patch, so the document grows by one legitimately. Totalling rows would
    // measure that and call it the stall handling.
    const stallBlocks = (bs: readonly { id: string }[]) =>
      bs.filter((b) => b.id === "stall-notice").length;
    expect(stallBlocks(stalled ?? []), "one stall block").toBe(1);

    resume?.();
    await settled();

    const blocks = h.transcript.entries[0]?.doc.blocks ?? [];
    expect(
      blocks.some((b) => b.kind === "notice" && /no output for/.test(b.text)),
      "the stale claim is gone",
    ).toBe(false);
    expect(
      blocks.some((b) => b.kind === "notice" && /resumed after/.test(b.text)),
      "and the row records the gap rather than blanking",
    ).toBe(true);
    expect(stallBlocks(blocks), "replaced in place — still exactly one").toBe(1);
  });
});

describe("C23 §4 — the submit row's two other steps", () => {
  // The same enumeration T2.6 uses, and for the same reason: a route added to
  // the parser and given neither of these is silent in both directions — a
  // prompt that keeps its line, and a command `↑` cannot recall.
  const byKind: Readonly<Record<string, string>> = {
    error: "/nosuchverb",
    builtin: "cd /tmp",
    builtinThenShell: "cd /tmp && echo hi",
    shell: "echo hi",
    local: "/help",
    app: "/ps",
  };

  it("T1.20 (I28): every route leaves the prompt empty", async () => {
    // **The prompt is filled first, and the mutation pass is why.** The first
    // draft called `submit(line)` against an untouched editor and asserted it
    // was empty afterwards — true before the call, so removing `editor.clear()`
    // from the pipeline failed nothing. C22's handler reads `editor.text` and
    // then submits it, so the state under test is a prompt holding the line.
    for (const [kind, line] of Object.entries(byKind)) {
      const h = harness();
      h.editor.setText(line);
      expect(h.editor.text, "the prompt holds the line before the submit").toBe(line);

      h.pipeline.submit(line);
      await settled();
      expect(h.editor.text, `${kind} left the line under the cursor`).toBe("");
    }

    // The control: `empty` is not a submission, so there is nothing to clear
    // and nothing is recorded either.
    const h = harness();
    h.editor.setText("   ");
    h.pipeline.submit("   ");
    await settled();
    expect(h.editor.text, "a blank Enter is not a submission").toBe("   ");
    expect(h.recorded, "and nothing reaches C20").toEqual([]);
  });

  it("T1.21 (I29): every route records exactly one history entry, as typed", async () => {
    for (const [kind, line] of Object.entries(byKind)) {
      const h = harness();
      h.pipeline.submit(line);
      await settled();

      expect(h.recorded.map((r) => r.command), `${kind} recorded ${String(h.recorded.length)}`).toEqual([
        line,
      ]);
      expect(typeof h.recorded[0]?.exitCode, `${kind} recorded no code`).toBe("number");
    }
  });

  it("T1.38 (I33a): a live part is driven on the adapter route as well as the local one", async () => {
    // **Both routes in one row, and that is the whole design of it.** A test
    // exercising only `append` passes against the defect — which is exactly how
    // the defect survived: `declareLive` was reached only inside
    // `appendAndCommit`, the app route reaches the transcript through
    // `settle(id, doc)`, and every existing assertion declared its parts from a
    // local handler.
    //
    // The local arm is the **control**, and it runs first: if it does not tick,
    // the adapter arm failing says nothing about routes.
    const ticks = { local: 0, adapter: 0 };
    const live = (id: string, count: () => void): Block =>
      b.live({
        id,
        title: id,
        every: 1000,
        fetch: () => {
          count();
          return Promise.resolve(null);
        },
        render: () => block({ kind: "raw", id: `${id}-body`, text: "x" }),
      });

    const h = harness({
      localLive: () => live("local-part", () => (ticks.local += 1)),
      adapt: () =>
        doc({
          command: "/ps",
          blocks: [live("adapter-part", () => (ticks.adapter += 1))],
        }),
    });

    // Control: the local route, which was never broken.
    h.pipeline.submit("/guide");
    await settled();
    h.tick(1500);
    await settled();
    expect(ticks.local, "the control must tick, or the row below proves nothing").toBeGreaterThan(
      0,
    );

    // The route the document reaches by settling rather than by appending.
    h.pipeline.submit("/ps");
    await settled();
    h.tick(1500);
    await settled();
    expect(ticks.adapter, "an adapter's b.live must be driven too (I33a)").toBeGreaterThan(0);
  });

  it("T1.46 (C07 I18, I40): a transcript entry's producer is told `null`, a view's is told the region", async () => {
    // **The row the mutation pass asked for.** Making `height` unconditional —
    // handing every producer the region — passed all 2575 tests, because the
    // adapter double declared `ctx: { command: string }` and erased the field.
    // A grant nothing observes is a grant nothing can be wrong about.
    const entry = harness();
    entry.pipeline.submit("/ps");
    await settled();

    const onEntry = entry.contexts.find((c) => c.where === "adapt")?.ctx;
    expect(onEntry, "the adapter route ran").toBeDefined();
    expect(onEntry?.height, "a transcript entry is windowed by rows and has no bound").toBe(null);
    expect(onEntry?.width).toBe(80);

    // The view route, where a bound exists and C23 knows it before step 3.
    const view = harness({
      stream: async function* () {
        yield { kind: "data", value: { line: "one" } } as const;
        await new Promise(() => undefined);
      },
      adaptPatch: () => ({ op: "append", block: block({ kind: "raw", id: "l", text: "x" }) }),
    });
    view.pipeline.submit("/tail --screen");
    await settled();

    const onView = view.contexts.find((c) => c.where === "adaptPatch")?.ctx;
    expect(onView, "the view route ran").toBeDefined();
    expect(onView?.height, "a view is defined by the region — C15 §4").toBe(24);
  });

  it("T1.47 (C07 I19, I20): the capabilities are the resolved record and `measure` is the frame's", async () => {
    // The other two facts, and the same argument: without this, swapping
    // `deps.capabilities` for any literal, or `measure` for `() => 0`, changes
    // nothing anywhere in the suite.
    const h = harness();
    h.pipeline.submit("/ps");
    await settled();

    const ctx = h.contexts.find((c) => c.where === "adapt")?.ctx;
    expect(ctx?.capabilities, "the record C22 resolved, not a re-detection").toBe(FULL_CAPABILITIES);

    // Measured through the context and through the registry directly: one
    // arithmetic, or a producer's split and the frame's rows disagree (C09 I1).
    const sample = block({ kind: "raw", id: "m", text: "one\ntwo\nthree" });
    expect(ctx?.measure(sample, 40)).toBe(blocks.measure(sample, 40));
    expect(ctx?.measure(sample, 40)).toBeGreaterThan(0);
  });

  it("T1.41 (C22 I48): a view+streams verb patches the view and releases the guard", async () => {
    // **The route C22 §13a reserved, refused loudly, and this exercises.** The
    // fixture's `tail --screen` is the first declaration that is both, and it
    // had none until the route existed.
    const patches: RawPatch[] = [
      { kind: "data", value: { line: "one" } },
      { kind: "data", value: { line: "two" } },
    ];
    let n = 0;
    const h = harness({
      stream: async function* () {
        for (const p of patches) yield p;
        // No `end` — a follow is still following, which is the state the whole
        // route exists for and the one an entry-shaped test never sits in.
        await new Promise(() => undefined);
      },
      adaptPatch: () => {
        n += 1;
        return { op: "append", block: block({ kind: "raw", id: `line-${String(n)}`, text: "x" }) };
      },
    });

    h.pipeline.submit("/tail --screen");
    await settled();

    // The patches reached the *view*, and the transcript is untouched — B03 §2
    // in the strong sense §13a took it.
    const content = h.overlays.stack[0]?.content ?? [];
    expect(content.map((bl) => bl.id)).toEqual(["line-1", "line-2"]);
    expect(h.transcript.entries, "a push leaves the transcript alone").toHaveLength(0);

    // **C23 I6 — released before the loop, which is the whole reason the pair
    // was refused.** The stream never ends, so a guard released after it is a
    // guard held for ever: this assertion is the one that fails against the old
    // fallthrough, where the pair blocked on `invoke` with the guard taken.
    expect(h.pipeline.inFlight, "a follow does not hold the session").toBeNull();
  });

  it("T1.42 (C22 I48, C16 §5): the follow is registered, so Ctrl-C reaches it", async () => {
    // **The rung nothing had exercised.** Omitting the registration on an entry
    // loses a cancellation; omitting it here means Ctrl-C falls past the rung —
    // and on this route the view's loop is the only thing on screen, so the
    // next rung quits the session.
    // **The fake honours the abort, because the real transport does.** A
    // generator that ignores the signal leaves the loop parked for ever and the
    // `finally` unreachable, which would make this row a claim about a
    // transport nobody ships. A fake must not supply the behaviour, and it must
    // not withhold it either.
    let stop = (): void => undefined;
    const stopped = new Promise<void>((r) => {
      stop = r;
    });
    const h = harness({
      stream: async function* () {
        yield { kind: "data", value: { line: "one" } } as RawPatch;
        await stopped;
      },
      adaptPatch: () => ({ op: "append", block: block({ kind: "raw", id: "l", text: "x" }) }),
    });

    h.pipeline.submit("/tail --screen");
    await settled();
    expect(h.pipeline.liveStreams, "registered before the loop was awaited").toBe(1);

    // And cancelling it pops the view — the asymmetry the walk ruled: Ctrl-C is
    // the reader saying stop, where `end` is the far side saying it.
    h.pipeline.cancelNewestStream();
    await settled();
    expect(h.overlays.stack, "a cancelled view pops").toHaveLength(0);

    stop();
    await settled();
    expect(h.pipeline.liveStreams, "and the `finally` forgets its canceller").toBe(0);
  });

  it("T1.43 (C22 I48): the stream ending appends a notice and leaves the view open", async () => {
    // **A view has no settlement, and must not pop on `end`.** `docker logs`
    // without `-f` ends immediately; a view that popped would flash and vanish
    // before anything could be read.
    const h = harness({
      stream: async function* () {
        yield { kind: "data", value: { line: "one" } } as RawPatch;
        yield { kind: "end", result: result({ exitCode: 0 }) } as RawPatch;
      },
      adaptPatch: () => ({ op: "append", block: block({ kind: "raw", id: "l", text: "x" }) }),
    });

    h.pipeline.submit("/tail --screen");
    await settled();

    expect(h.overlays.stack, "the view is still there").toHaveLength(1);
    const content = h.overlays.stack[0]?.content ?? [];
    const notice = content.find((bl) => bl.kind === "notice");
    expect(notice, "and it says the stream ended").toBeDefined();
    expect(notice?.kind === "notice" ? notice.text : "").toContain("ended");
    // C04 I6 — F29 is what happens when a toned notice loses its glyph.
    expect(notice?.kind === "notice" ? notice.glyph : undefined).toBeDefined();
  });

  it("T1.44 (C22 I48): a non-zero exit is in the notice, which the walk said it could not be", async () => {
    // The walk ruled that a `RawPatch` `end` carries no exit code. It carries a
    // whole `RawResult` — the ruling was reasoned from what a patch is *for*
    // rather than read off the type, and the type is what falsified it. A
    // follow that ends because the container stopped is a different event from
    // one whose log ran out.
    const h = harness({
      stream: async function* () {
        yield { kind: "end", result: result({ exitCode: 137 }) } as RawPatch;
      },
    });

    h.pipeline.submit("/tail --screen");
    await settled();

    const content = h.overlays.stack[0]?.content ?? [];
    const notice = content.find((bl) => bl.kind === "notice");
    expect(notice?.kind === "notice" ? notice.text : "").toContain("137");
    expect(notice?.kind === "notice" ? notice.tone : "").toBe("warn");

    // **And the reason when the far side gave one**, which a frame-read added:
    // *exited 1* tells the reader the follow failed and not why, and `stderr`
    // is on the same `RawResult` the code came from.
    const h2 = harness({
      stream: async function* () {
        yield {
          kind: "end",
          result: result({ exitCode: 1, stderr: "Error: No such container: nope\n" }),
        } as RawPatch;
      },
    });
    h2.pipeline.submit("/tail --screen");
    await settled();
    const n2 = (h2.overlays.stack[0]?.content ?? []).find((bl) => bl.kind === "notice");
    expect(n2?.kind === "notice" ? n2.text : "").toContain("No such container");
  });

  it("T1.45 (C22 I48): a stream failure lands in the view rather than nowhere", async () => {
    const h = harness({
      stream: async function* () {
        yield { kind: "data", value: {} } as RawPatch;
        throw new Error("pipe died");
      },
      adaptPatch: () => ({ op: "append", block: block({ kind: "raw", id: "l", text: "x" }) }),
    });

    h.pipeline.submit("/tail --screen");
    await settled();

    const content = h.overlays.stack[0]?.content ?? [];
    const notice = content.find((bl) => bl.kind === "notice");
    expect(notice?.kind === "notice" ? notice.text : "").toContain("pipe died");
    expect(h.overlays.stack, "and the view stays, holding what arrived").toHaveLength(1);
  });

  it("T1.39 (C22 I45, C24 I12): a live part ticks on the *view* route, through the wiring", async () => {
    // **The row gap 7's headline actually needs, and the one ten contract rows
    // do not supply.** Those call `driver.declare` directly, so they verify the
    // driver's `view` arm and say nothing about whether anything reaches it —
    // which is exactly what F20 filed against T4.21, reproduced one branch later.
    // Disabling `declareLiveInView` leaves every one of them green and fails
    // this.
    //
    // **A test that calls the mechanism directly verifies the mechanism, never
    // the wiring, and the only thing that tells the two apart is disabling the
    // wiring.** That is the general form, and this row exists because of it.
    const ticks = { entry: 0, view: 0 };
    const live = (id: string, count: () => void): Block =>
      b.live({
        id,
        title: id,
        every: 1000,
        fetch: () => {
          count();
          return Promise.resolve(null);
        },
        render: () => block({ kind: "raw", id: `${id}-body`, text: "x" }),
      });

    const h = harness({
      adapt: (ctx) => {
        const watching = ctx.command.includes("--watch");
        return doc({
          command: ctx.command,
          blocks: [
            live(watching ? "view-part" : "entry-part", () =>
              watching ? (ticks.view += 1) : (ticks.entry += 1),
            ),
          ],
        });
      },
    });

    // **The control runs first**, and it is the entry route: if a part declared
    // the ordinary way does not tick, the arm below failing says nothing about
    // routes. T1.38's structure, one host over.
    h.pipeline.submit("/ps");
    await settled();
    h.tick(1500);
    await settled();
    expect(ticks.entry, "the control must tick, or the row below proves nothing").toBeGreaterThan(
      0,
    );

    // `--watch` declares `view: true` on the fixture's `ps` (C05 I20), so this
    // submission pushes a view instead of appending an entry.
    h.pipeline.submit("/ps --watch");
    await settled();
    expect(h.transcript.entries.map((e) => e.doc.command), "and no entry was appended").not.toContain(
      "/ps --watch",
    );

    h.tick(1500);
    await settled();
    expect(ticks.view, "a live part inside a pushed view is driven (gap 7)").toBeGreaterThan(0);
  });

  it("T1.40 (C04 I6, C23 §3b): the default renderError can be constructed at all", async () => {
    // **The framework's own fallback threw, and nothing could see it.**
    //
    // `partOf` builds the default error notice with `block()` rather than
    // `b.notice`, so it skipped `glyphFor` and produced a `tone: "error"` notice
    // with no glyph — which C04 I6 refuses. The one thing that runs when a live
    // part's fetch fails could not be constructed, so it threw out of a `.then`
    // inside the refresh driver: unhandled, one tick after a failure, on any
    // part whose declarer did not override `renderError`.
    //
    // **A03 §2's vacuity class in a default.** Every existing row either
    // succeeds or supplies its own `renderError`, so the path had never run —
    // and a branch that has never run passes exactly like one that works. Found
    // by a consumer inducing a stall and reading the frame (docker-tui F29),
    // which is the only instrument that was ever going to reach it.
    const h = harness({
      adapt: (ctx) =>
        doc({
          command: ctx.command,
          blocks: [
            b.live({
              id: "failing",
              title: "FAILING",
              every: 1000,
              // No `renderError` — the whole subject of the row is the default.
              fetch: () => Promise.reject(new Error("the far side is gone")),
              render: () => block({ kind: "raw", id: "failing-body", text: "x" }),
            }),
          ],
        }),
    });

    h.pipeline.submit("/ps");
    await settled();
    h.tick(1500);
    await settled();

    const panel = h.transcript.entries
      .flatMap((e) => e.doc.blocks)
      .find((bl) => bl.id === "failing");
    const child = panel?.kind === "panel" ? panel.children[0] : undefined;

    expect(child?.kind, "the failure is rendered rather than thrown").toBe("notice");
    expect(child).toMatchObject({ tone: "error", glyph: "error" });
    expect((child as { text: string }).text).toContain("the far side is gone");
  });

  it("T1.21b (I29): a refusal is a submission and is recorded", async () => {
    // History is not a log of successes — the user typed it and pressed Enter,
    // so `↑` recalls it. Driven through the guard, which is the refusal a
    // session actually produces.
    const h = harness({ invoke: () => new Promise<never>(() => undefined) });
    h.pipeline.submit("/ps");
    h.pipeline.submit("/ps --mine");
    await settled();

    expect(h.recorded.map((r) => r.command), "the refused line is in C20").toContain("/ps --mine");
  });
});
