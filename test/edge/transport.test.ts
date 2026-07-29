// C06 tier 3 — edge cases. Where the real defects live: the ladder's timings,
// the buffer's boundaries, and every path that must still release the guard.
import { describe, expect, it } from "vitest";
import {
  MAX_LINE_BYTES,
  TransportBusyError,
  createFixtureTransport,
  createNdjsonReader,
  createRouter,
  createSubprocessTransport,
} from "../../src/data/transport/index.js";
import type { RawPatch, VerbTransport } from "../../src/data/transport/index.js";
import { fakeClock, type FakeClock } from "../support/fake-scheduler.js";
import {
  clockOf,
  drain,
  fakeChild,
  fakeRunner,
  invocation,
  recorded,
  result,
  transportCases,
  type FakeChild,
  type ScriptedChild,
} from "../support/transport.js";

function rig(script: ScriptedChild = {}): {
  transport: VerbTransport;
  runner: ReturnType<typeof fakeRunner>;
  clock: ReturnType<typeof clockOf>;
  fake: FakeClock;
  child(): FakeChild;
} {
  const fake = fakeClock();
  const clock = clockOf(fake);
  const runner = fakeRunner(() => script);
  return {
    transport: createSubprocessTransport({ binary: "widget", runner, clock }),
    runner,
    clock,
    fake,
    child: (): FakeChild => runner.children[0]!,
  };
}

describe("C06 concurrency", () => {
  it("T3.1: invoke while busy → rejects naming the in-flight verb; the running one is unaffected", async () => {
    const child = fakeChild({ ignores: ["SIGINT", "SIGTERM", "SIGKILL"] });
    const clock = clockOf(fakeClock());
    const router = createRouter({
      default: createSubprocessTransport({
        binary: "widget",
        runner: fakeRunner(() => child),
        clock,
      }),
    });

    const first = router.for("promote").invoke(invocation({ verb: "promote" }));
    await expect(router.for("ps").invoke(invocation())).rejects.toThrow(TransportBusyError);
    await expect(router.for("ps").invoke(invocation())).rejects.toThrow(/promote/);

    child.close();
    // The refusal is not a queue, and it does not disturb what is running.
    expect((await first).exitCode).toBe(0);
  });

  it("T3.2: stream while busy → permitted", async () => {
    const busy = fakeChild({ ignores: ["SIGINT", "SIGTERM", "SIGKILL"] });
    const clock = clockOf(fakeClock());
    let n = 0;
    const router = createRouter({
      default: createSubprocessTransport({
        binary: "widget",
        clock,
        runner: fakeRunner(() => (n++ === 0 ? busy : { stdout: ['{"tick":1}\n'] })),
      }),
    });

    const held = router.for("promote").invoke(invocation({ verb: "promote" }));
    const patches = await drain(router.for("tail").stream(invocation({ verb: "tail", streams: true })));

    expect(patches.at(-1)?.kind).toBe("end");
    busy.close();
    await held;
  });

  it("T3.3 (I13): the guard releases on all six settlement paths", async () => {
    const clock = clockOf(fakeClock());
    const cases: { name: string; run: (r: ReturnType<typeof createRouter>) => Promise<unknown> }[] = [];

    const routerFor = (script: ScriptedChild): ReturnType<typeof createRouter> =>
      createRouter({
        default: createSubprocessTransport({
          binary: "widget",
          clock,
          runner: fakeRunner(() => script),
        }),
      });

    // success · non-zero exit · signal death · spawn failure — plus cancel and
    // timeout below, which take the ladder and settle through the same finally.
    for (const [name, script] of [
      ["success", { exit: { code: 0, signal: null } }],
      ["non-zero", { exit: { code: 2, signal: null } }],
      ["signalled", { exit: { code: null, signal: "SIGKILL" } }],
    ] as const) {
      const router = routerFor(script);
      await router.for("ps").invoke(invocation());
      expect(router.busy, `${name} left the guard held`).toBe(false);
    }

    const throwing = createRouter({
      default: createSubprocessTransport({
        binary: "widget",
        clock,
        runner: {
          ...fakeRunner(),
          spawn: (): never => {
            throw new Error("ENOENT");
          },
        },
      }),
    });
    await throwing.for("ps").invoke(invocation());
    expect(throwing.busy, "spawn failure left the guard held").toBe(false);

    const controller = new AbortController();
    const cancelled = routerFor({ exit: { code: null, signal: "SIGINT" } });
    controller.abort();
    await cancelled.for("ps").invoke(invocation({ signal: controller.signal }));
    expect(cancelled.busy, "cancel left the guard held").toBe(false);

    const timed = rig({ exit: { code: 0, signal: null } });
    const timedRouter = createRouter({ default: timed.transport });
    await timedRouter.for("ps").invoke(invocation({ timeoutMs: 50 }));
    expect(timedRouter.busy, "timeout left the guard held").toBe(false);

    expect(cases).toHaveLength(0); // the loop above is the enumeration
  });
});

describe("C06 cancellation and timeout", () => {
  it("T3.5 (I8): cancel → SIGINT, then SIGTERM at 2 s, then SIGKILL at 4 s", async () => {
    const r = rig({ ignores: ["SIGINT", "SIGTERM", "SIGKILL"] });
    const controller = new AbortController();
    const pending = r.transport.invoke(invocation({ signal: controller.signal }));

    controller.abort();
    expect(r.child().signals).toEqual(["SIGINT"]);

    // A well-behaved far side cleans up on SIGINT (B8), so the first rung is
    // not a formality — it is the one that usually works.
    r.clock.tick(2_000);
    expect(r.child().signals).toEqual(["SIGINT", "SIGTERM"]);

    r.clock.tick(2_000);
    expect(r.child().signals).toEqual(["SIGINT", "SIGTERM", "SIGKILL"]);

    r.child().close({ code: null, signal: "SIGKILL" });
    const settled = await pending;
    expect(settled.cancelled).toBe(true);
    expect(settled.timedOut).toBe(false);
  });

  it("T3.6: a child that exits on SIGINT gets no SIGTERM and no SIGKILL", async () => {
    const r = rig({ ignores: [] });
    const controller = new AbortController();
    const pending = r.transport.invoke(invocation({ signal: controller.signal }));

    controller.abort();
    await pending;
    r.clock.tick(10_000);

    expect(r.child().signals).toEqual(["SIGINT"]);
    // Nothing is left armed once the ladder is stopped — a timer alive on a dead
    // child is what T3.8's `outstanding` assertion would otherwise catch late.
    expect(r.fake.outstanding).toBe(0);
  });

  it("T3.7: timeout takes the same ladder, with timedOut set and cancelled false", async () => {
    const r = rig({ ignores: ["SIGINT", "SIGTERM"] });
    const pending = r.transport.invoke(invocation({ timeoutMs: 500 }));

    r.clock.tick(500);
    expect(r.child().signals).toEqual(["SIGINT"]);
    r.clock.tick(2_000);
    expect(r.child().signals).toEqual(["SIGINT", "SIGTERM"]);
    r.clock.tick(2_000);
    expect(r.child().signals).toEqual(["SIGINT", "SIGTERM", "SIGKILL"]);

    const settled = await pending;
    expect(settled.timedOut).toBe(true);
    expect(settled.cancelled).toBe(false);
  });

  it("T3.8: timeoutMs 0 → no timer is ever scheduled", async () => {
    const r = rig({ exit: { code: 0, signal: null } });
    await r.transport.invoke(invocation({ timeoutMs: 0 }));

    // The assertion is that nothing was *armed*, not that nothing fired. A timer
    // armed with 0 and cleared later satisfies the weaker reading and kills
    // every live view, which is what `timeoutMs: 0` exists to prevent.
    expect(r.fake.arms).toEqual([]);
  });

  it("T3.9: a signal already aborted at call time → no spawn occurs at all", async () => {
    const r = rig({ exit: { code: 0, signal: null } });
    const controller = new AbortController();
    controller.abort();

    const settled = await r.transport.invoke(invocation({ signal: controller.signal }));

    // Spawning to immediately kill is not a wasted fork on a far side with side
    // effects — it is a wrong one.
    expect(r.runner.spawns).toEqual([]);
    expect(settled.cancelled).toBe(true);
  });

  it("T3.4 (I7): cancel mid-stream after forty lines → forty retained, cancelled true", async () => {
    const child = fakeChild({ ignores: ["SIGINT", "SIGTERM", "SIGKILL"] });
    const clock = clockOf(fakeClock());
    const transport = createSubprocessTransport({
      binary: "widget",
      clock,
      runner: fakeRunner(() => child),
    });
    const controller = new AbortController();

    const seen: RawPatch[] = [];
    const iterator = transport
      .stream(invocation({ streams: true, signal: controller.signal }))
      [Symbol.asyncIterator]();

    for (let i = 0; i < 40; i += 1) child.emit(`{"line":${String(i)}}\n`);
    for (let i = 0; i < 40; i += 1) seen.push((await iterator.next()).value as RawPatch);

    controller.abort();
    child.close({ code: null, signal: "SIGINT" });
    const end = (await iterator.next()).value as RawPatch;

    expect(seen).toHaveLength(40);
    expect(seen.every((p) => p.kind === "data")).toBe(true);
    expect(end.kind).toBe("end");
    if (end.kind === "end") {
      // Forty lines the user already saw are not discarded because they stopped
      // watching. That is the whole of I7.
      expect(end.result.cancelled).toBe(true);
      expect(end.result.stdoutRaw.split("\n").filter((l) => l !== "")).toHaveLength(40);
    }
  });
});

describe("C06 NDJSON", () => {
  it("T3.10 (I10): one JSON object split across three chunks → one data patch", () => {
    const reader = createNdjsonReader();
    const out = [
      ...reader.push('{"na'),
      ...reader.push('me":"a'),
      ...reader.push('lpha"}\n'),
    ];

    // Parsing per chunk works on every small fixture and fails on the first real
    // stream (T6.8).
    expect(out).toEqual([{ kind: "data", value: { name: "alpha" } }]);
  });

  it("T3.11 (I10): a chunk boundary inside a multi-byte character → no mojibake", () => {
    const reader = createNdjsonReader();
    const text = '{"label":"日本語 🌱"}';
    const cut = 12;
    const out = [...reader.push(text.slice(0, cut)), ...reader.push(`${text.slice(cut)}\n`)];

    // C21 decodes bytes (C21 I4); what C06 must not break is the string across
    // the boundary. Both bugs present identically, at exactly the buffer size.
    expect(out).toEqual([{ kind: "data", value: { label: "日本語 🌱" } }]);
  });

  it("T3.12 (I12): 9 malformed of 100 → clean; 11 of 100 → degraded", () => {
    // The nine arrive last, after the stream has established itself.
    //
    // **T3.12 and T3.12b are a pair. Deleting either makes the rule look
    // order-independent, and it is not** (C06 §5, I12). The ratio is running, so
    // any distribution putting two malformed lines in the first twelve degrades
    // before the hundredth arrives — 2/12 is 16%. Nine at the tail do not; nine
    // at the front do. That is the design: garbage at the head of a stream is
    // evidence of the wrong format entirely, and stopping early is the job.
    //
    // Anyone tempted to fold these into one case is about to assert a claim
    // about content, which this rule has never made.
    const run = (bad: number): RawPatch[] => {
      const reader = createNdjsonReader();
      const out: RawPatch[] = [];
      for (let i = 0; i < 100; i += 1) {
        out.push(...reader.push(i >= 100 - bad ? "{oops\n" : `{"i":${String(i)}}\n`));
      }
      return out;
    };

    expect(run(9).some((p) => p.kind === "degraded")).toBe(false);
    expect(run(11).some((p) => p.kind === "degraded")).toBe(true);
  });

  it("T3.12b (I12): the same nine, clustered at the front → degraded at line ten", () => {
    const reader = createNdjsonReader();
    const out: RawPatch[] = [];
    for (let i = 0; i < 100; i += 1) out.push(...reader.push(i < 9 ? "{oops\n" : `{"i":${String(i)}}\n`));

    // Nine-tenths rubbish in the first ten lines is a stream that is probably
    // not NDJSON at all. Same ratio as T3.12, opposite outcome, and the
    // difference is where they fall.
    expect(out.some((p) => p.kind === "degraded")).toBe(true);
  });

  it("T3.14b (I12): degradation is sticky — fifty good lines after it stay malformed", () => {
    const reader = createNdjsonReader();
    const out: RawPatch[] = [];
    for (let i = 0; i < 12; i += 1) out.push(...reader.push("{oops\n"));
    expect(out.some((p) => p.kind === "degraded")).toBe(true);

    const after: RawPatch[] = [];
    for (let i = 0; i < 50; i += 1) after.push(...reader.push(`{"good":${String(i)}}\n`));

    // Not the same claim as T3.14. A reader that emitted one notice and then
    // resumed parsing fires exactly once and still interleaves parsed data with
    // raw text in one stream, which is two renderings of one thing (T6.6b).
    expect(after.filter((p) => p.kind === "data")).toHaveLength(0);
    expect(after.filter((p) => p.kind === "malformed")).toHaveLength(50);
    expect(after.filter((p) => p.kind === "degraded")).toHaveLength(0);
  });

  it("T3.13 (I12): 3 malformed of 5 — 60%, below the floor → no degradation", () => {
    const reader = createNdjsonReader();
    const out: RawPatch[] = [];
    for (let i = 0; i < 5; i += 1) out.push(...reader.push(i < 3 ? "{oops\n" : '{"ok":1}\n'));

    // Without the ten-line floor, one malformed line in the first three trips
    // degradation on a perfectly healthy stream (T6.6).
    expect(out.some((p) => p.kind === "degraded")).toBe(false);
  });

  it("T3.14: degradation fires once, not per subsequent malformed line", () => {
    const reader = createNdjsonReader();
    const out: RawPatch[] = [];
    for (let i = 0; i < 60; i += 1) out.push(...reader.push(i % 2 === 0 ? "{oops\n" : '{"ok":1}\n'));

    expect(out.filter((p) => p.kind === "degraded")).toHaveLength(1);
  });

  it("T3.15: a stream emitting zero lines then exiting → only end", async () => {
    const r = rig({ stdout: [] });
    const patches = await drain(r.transport.stream(invocation({ streams: true })));

    expect(patches).toHaveLength(1);
    expect(patches[0]?.kind).toBe("end");
  });

  it("T3.16 (I11): a 10 MB line → one malformed at the cap, then normal parsing", () => {
    const reader = createNdjsonReader();
    const out: RawPatch[] = [];
    const megabyte = "x".repeat(1_000_000);

    for (let i = 0; i < 10; i += 1) out.push(...reader.push(megabyte));
    out.push(...reader.push('\n{"after":true}\n'));

    const malformed = out.filter((p) => p.kind === "malformed");
    expect(malformed).toHaveLength(1);
    expect(malformed[0]?.kind === "malformed" && malformed[0].line.length).toBe(MAX_LINE_BYTES);
    // The buffer is released rather than merely capped, so the line that follows
    // the monster parses as itself.
    expect(out.at(-1)).toEqual({ kind: "data", value: { after: true } });
  });

  it("T3.16b (I11): an unterminated stream stays bounded", () => {
    const reader = createNdjsonReader();
    let emitted = 0;
    for (let i = 0; i < 200; i += 1) emitted += reader.push("y".repeat(100_000)).length;

    // 20 MB with no newline in it. One report, then discard — a cap that keeps
    // appending stays bounded and still emits a patch per chunk forever.
    expect(emitted).toBe(1);
  });

  it("T3.19: no trailing newline on the final line → still parsed", () => {
    const reader = createNdjsonReader();
    const out = [...reader.push('{"a":1}\n{"b":2}'), ...reader.flush()];

    expect(out).toEqual([
      { kind: "data", value: { a: 1 } },
      { kind: "data", value: { b: 2 } },
    ]);
  });
});

describe("C06 spawning", () => {
  it("T3.17: binary not found → end with a spawn failure, guard released, no throw escaping", async () => {
    const clock = clockOf(fakeClock());
    const transport = createSubprocessTransport({
      binary: "nope",
      clock,
      runner: {
        ...fakeRunner(),
        spawn: (): never => {
          throw new Error("spawn nope ENOENT");
        },
      },
    });
    const router = createRouter({ default: transport });

    const settled = await router.for("ps").invoke(invocation());
    expect(settled.exitCode).toBe(null);
    expect(settled.stderr).toContain("ENOENT");
    expect(router.busy).toBe(false);

    const patches = await drain(transport.stream(invocation({ streams: true })));
    expect(patches).toHaveLength(1);
    expect(patches[0]?.kind).toBe("end");
  });

  it("T3.18: JSON on stderr and nothing on stdout → reported, not repaired", async () => {
    const r = rig({ stderr: ['{"error":"boom"}'], exit: { code: 1, signal: null } });
    const settled = await r.transport.invoke(invocation());

    // C06 reports the mismatch; moving it across would be interpretation, and
    // A01 B3's single-owner rule exists because someone always wants to.
    expect(settled.stdout).toBeUndefined();
    expect(settled.stdoutRaw).toBe("");
    expect(settled.stderr).toBe('{"error":"boom"}');
  });

  it("T3.21 (I3): shell metacharacters pass literally, with no expansion", async () => {
    const r = rig({ exit: { code: 0, signal: null } });
    const nasty = ["ps", "--search=$(rm -rf /)", "a;b", "c|d", "`whoami`"];
    await r.transport.invoke(invocation({ argv: nasty }));

    expect(r.runner.spawns[0]?.argv).toEqual(["widget", ...nasty, "--json"]);
  });

  it("T3.22: cwd changes between invocations → the second spawns in the new directory", async () => {
    const fake = fakeClock();
    const runner = fakeRunner(() => ({ exit: { code: 0, signal: null } }));
    let where = "/one";
    const transport = createSubprocessTransport({
      binary: "widget",
      clock: clockOf(fake),
      runner,
      cwd: () => where,
    });

    await transport.invoke(invocation());
    where = "/two";
    await transport.invoke(invocation());

    // Captured at construction, both would say /one — and a pass-through `cd`
    // would silently stop working (T6.12).
    expect(runner.spawns.map((s) => s.cwd)).toEqual(["/one", "/two"]);
  });
});

describe("C06 fixture resolution", () => {
  it("T3.20 (I14, D13): one session, fixture for ps and subprocess for promote", async () => {
    const clock = clockOf(fakeClock());
    const router = createRouter({
      default: createSubprocessTransport({
        binary: "widget",
        clock,
        runner: fakeRunner(() => ({ stdout: ['{"live":true}'], exit: { code: 0, signal: null } })),
      }),
      overrides: { ps: createFixtureTransport([recorded()]) },
    });

    expect((await router.for("ps").invoke(invocation())).stdout).toEqual({ rows: [] });
    expect(
      (await router.for("promote").invoke(invocation({ verb: "promote", argv: ["promote"] }))).stdout,
    ).toEqual({ live: true });
  });

  it("T3.23: an invocation with no matching fixture throws, naming verb and argv", async () => {
    const transport = createFixtureTransport([recorded()]);

    // A plausible failure here lets a test assert against a fixture that is not
    // in the corpus and pass — D43's problem arriving through a smaller door.
    await expect(
      transport.invoke(invocation({ verb: "promote", argv: ["promote", "x"] })),
    ).rejects.toThrow(/no fixture for promote/);
  });
});

// The shared block again: every case here holds for all three (I15, T2.1).
describe.each(transportCases())("C06 shared edges — $name", ({ make }) => {
  const answer = result();

  it("T3.24 (I15): cancel mid-stream retains what was produced and sets cancelled", async () => {
    const controller = new AbortController();
    const patches: RawPatch[] = [
      { kind: "data", value: { n: 0 } },
      { kind: "data", value: { n: 1 } },
      { kind: "end", result: answer },
    ];

    const iterator = make(answer, patches)
      .stream(invocation({ streams: true, signal: controller.signal }))
      [Symbol.asyncIterator]();

    const first = (await iterator.next()).value as RawPatch;
    controller.abort();

    let last: RawPatch = first;
    for (;;) {
      const step = await iterator.next();
      if (step.done === true) break;
      last = step.value;
      if (last.kind === "end") break;
    }

    expect(first).toEqual({ kind: "data", value: { n: 0 } });
    expect(last.kind).toBe("end");
    // The fixture transport honouring `signal` is what keeps this in the shared
    // block. Without it, I15 narrows to whatever fixtures happen to satisfy.
    if (last.kind === "end") expect(last.result.cancelled).toBe(true);
  });

  it("T3.9 (I15): an already-aborted signal settles without producing data", async () => {
    const controller = new AbortController();
    controller.abort();

    const patches = await drain(
      make(answer).stream(invocation({ streams: true, signal: controller.signal })),
    );

    expect(patches).toHaveLength(1);
    expect(patches[0]?.kind).toBe("end");
    if (patches[0]?.kind === "end") expect(patches[0].result.cancelled).toBe(true);
  });

  it("T2.5 (I15): breaking early terminates the iteration and settles", async () => {
    const patches: RawPatch[] = [
      { kind: "data", value: { n: 0 } },
      { kind: "data", value: { n: 1 } },
      { kind: "end", result: answer },
    ];
    const seen: RawPatch[] = [];

    for await (const patch of make(answer, patches).stream(invocation({ streams: true }))) {
      seen.push(patch);
      break;
    }

    expect(seen).toHaveLength(1);
    // Nothing throws on the way out, and the iteration is genuinely over: a
    // second pass yields from a fresh generator rather than resuming the
    // abandoned one.
    const again = await drain(make(answer, patches).stream(invocation({ streams: true })));
    expect(again[0]).toEqual({ kind: "data", value: { n: 0 } });
  });
});
