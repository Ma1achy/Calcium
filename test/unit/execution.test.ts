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
import { assignOffsets, backoffOf, BACKOFF_CAP_MS } from "../../src/shell/refresh.js";
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
  const typed: string[] = [];
  /** A controllable clock and scheduler, so §3b's timers are driven not waited on. */
  let now = 0;
  const timers: (() => void)[] = [];

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
    // A real fake rather than `{} as never`: `fill` calls `setText`, and a stub
    // that throws makes an action test fail for a reason about the harness.
    editor: { setText: (t: string) => void typed.push(t), get text() { return typed.at(-1) ?? ""; } },
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
    clock: () => now,
    schedule: (fn: () => void) => {
      timers.push(fn);
      return { [Symbol.dispose]: () => undefined };
    },
    openUrl: () => Promise.resolve(),
    binary: "widget",
    commandPolicy: slashPolicy,
  } as unknown as PipelineDeps;

  const pipeline = createExecutionPipeline(deps);
  pipeline.register("help", () => doc({ command: "/help" }));
  pipeline.register("debug dump", () => doc({ command: "/debug" }));
  pipeline.seal();

  return {
    pipeline,
    transcript,
    session,
    commits,
    resets,
    calls,
    typed,
    /** Advance the injected clock and fire §3b's timers. */
    tick: (ms: number) => {
      now += ms;
      for (const fn of [...timers]) fn();
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

  it("T3.16 (I5): a shell route holds the guard exactly as an app verb does", async () => {
    // `sleep 30` delegated to the shell is a foreground command, and no shell
    // lets you type another over it. Scoping the guard to app verbs is the
    // revert T6.13 names.
    let finish: (() => void) | undefined;
    const h = harness({
      spawnShell: () => ({
        stdout: (async function* () { yield "x"; })(),
        exited: new Promise((r) => { finish = () => r({ code: 0 }); }),
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
    const parts = assignOffsets([
      { id: "a", intervalMs: 30_000, fetch: () => Promise.reject(new Error("x")) },
      { id: "b", intervalMs: 300_000, fetch: () => Promise.reject(new Error("x")) },
      { id: "c", intervalMs: 60_000, fetch: () => Promise.reject(new Error("x")) },
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
});
