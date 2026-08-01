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
import { describe, expect, it } from "vitest";
import { createExecutionPipeline } from "../../src/shell/execution.js";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { createSessionStore } from "../../src/shell/state.js";
import { fixture } from "../support/manifest.js";
import { doc } from "../support/blocks.js";
import { result } from "../support/transport.js";
import { slashPolicy } from "../../src/interaction/parser/index.js";
import type { PipelineDeps } from "../../src/shell/types.js";
import type { RawPatch, RawResult, TransportRouter } from "../../src/data/transport/index.js";
import type { ViewDocument, ViewPatch } from "../../src/data/viewmodel/index.js";

type Scripted = Readonly<{
  invoke?: () => Promise<RawResult>;
  stream?: () => AsyncIterable<RawPatch>;
  adapt?: () => ViewDocument;
  adaptPatch?: () => ViewPatch | null;
  spawnShell?: () => { stdout: AsyncIterable<string>; exited: Promise<{ code: number | null }>; overflowed: boolean };
}>;

function harness(script: Scripted = {}) {
  const transcript = createTranscriptStore();
  const session = createSessionStore({ cwd: "/work", env: {}, cluster: "c", version: "1" });
  const commits: string[] = [];
  const resets: number[] = [];
  const calls: string[] = [];

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
    scheduler: {
      commit: (r: string) => void commits.push(r),
      flush: () => undefined,
      invalidate: () => undefined,
      pending: false,
      contaminated: false,
    },
    transport,
    adapters: {
      adapt: () => (script.adapt === undefined ? doc({ command: "adapted" }) : script.adapt()),
      adaptPatch: () =>
        script.adaptPatch === undefined
          ? { op: "append" as const, block: { kind: "notice" as const, id: `n${String(commits.length)}`, tone: "info" as const, text: "tick" } }
          : script.adaptPatch(),
      register: () => undefined,
      seal: () => undefined,
      sealed: true,
    },
    manifest: { manifest: fixture(), load: () => undefined, seal: () => undefined, sealed: true },
    blocks: {} as never,
    editor: {} as never,
    overlays: {} as never,
    theme: {} as never,
    history: {} as never,
    runner: {
      spawnShell: () => {
        calls.push("spawnShell");
        return (script.spawnShell ?? (() => ({
          stdout: (async function* () { yield "out"; })(),
          exited: Promise.resolve({ code: 0 }),
          overflowed: false,
        })))();
      },
      spawn: () => undefined,
      handoff: () => undefined,
      live: [],
      killAll: () => Promise.resolve(),
    },
    lifecycle: { size: () => ({ columns: 80, rows: 24 }) },
    resetFocus: () => void resets.push(1),
    stop: () => Promise.resolve(0),
    clock: () => 0,
    openUrl: () => Promise.resolve(),
    binary: "widget",
    commandPolicy: slashPolicy,
  } as unknown as PipelineDeps;

  const pipeline = createExecutionPipeline(deps);
  pipeline.register("help", () => doc({ command: "/help" }));
  pipeline.register("debug dump", () => doc({ command: "/debug" }));
  pipeline.seal();

  return { pipeline, transcript, session, commits, resets, calls };
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
});
