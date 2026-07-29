// C06 tier 1 — unit. Argv, reporting, the router's idle transitions.
//
// `ProcessRunner` is faked throughout tiers 1-3 (§9), against C21 §2 rather than
// invented — see `test/support/transport.ts`.
import { describe, expect, it } from "vitest";
import {
  createFixtureTransport,
  createRouter,
  createSubprocessTransport,
  withJson,
} from "../../src/data/transport/index.js";
import {
  clockOf,
  drain,
  fakeChild,
  fakeRunner,
  invocation,
  recorded,
  result,
  transportCases,
  type ScriptedChild,
} from "../support/transport.js";
import { fakeClock } from "../support/fake-scheduler.js";

function subprocess(script: ScriptedChild = {}): {
  transport: ReturnType<typeof createSubprocessTransport>;
  runner: ReturnType<typeof fakeRunner>;
  clock: ReturnType<typeof clockOf>;
} {
  const clock = clockOf(fakeClock());
  const runner = fakeRunner(() => script);
  return {
    transport: createSubprocessTransport({ binary: "widget", runner, clock }),
    runner,
    clock,
  };
}

describe("C06 router", () => {
  it("T1.1: invoke from idle → busy true, inFlight names the verb", async () => {
    const child = fakeChild({ ignores: ["SIGINT", "SIGTERM", "SIGKILL"] });
    const clock = clockOf(fakeClock());
    const transport = createSubprocessTransport({
      binary: "widget",
      runner: fakeRunner(() => child),
      clock,
    });
    const router = createRouter({ default: transport });

    const pending = router.for("ps").invoke(invocation());
    expect(router.busy).toBe(true);
    expect(router.inFlight).toBe("ps");

    child.close();
    await pending;
  });

  it("T1.2: invocation resolves → busy false", async () => {
    const router = createRouter({ default: subprocess({ exit: { code: 0, signal: null } }).transport });
    await router.for("ps").invoke(invocation());

    expect(router.busy).toBe(false);
    expect(router.inFlight).toBe(null);
  });

  it("T1.9: stream from idle → registered without setting busy", async () => {
    const router = createRouter({ default: subprocess({ stdout: ['{"a":1}\n'] }).transport });
    const patches = await drain(router.for("tail").stream(invocation({ verb: "tail", streams: true })));

    // A `--watch` is a subscription, not a command. Holding the guard for one
    // blocks the prompt for as long as the user watches (§6).
    expect(router.busy).toBe(false);
    expect(patches.at(-1)?.kind).toBe("end");
  });

  it("T1.10 (I14): for() returns an override, and the default when unmapped", async () => {
    const fixture = createFixtureTransport([recorded()]);
    const router = createRouter({
      default: subprocess({ stdout: ['{"from":"subprocess"}'] }).transport,
      overrides: { ps: fixture },
    });

    const mapped = await router.for("ps").invoke(invocation());
    const unmapped = await router.for("promote").invoke(invocation({ verb: "promote", argv: ["promote"] }));

    expect(mapped.stdout).toEqual({ rows: [] });
    expect(unmapped.stdout).toEqual({ from: "subprocess" });
  });
});

describe("C06 argv", () => {
  it("T1.3 (I4): --json is appended", () => {
    expect(withJson(["ps", "--mine"])).toEqual(["ps", "--mine", "--json"]);
  });

  it("T1.4 (I4): argv already containing --json → appended once, not twice", () => {
    // A far side that treats a repeated flag as an error fails a command that
    // was correct, for the one user who typed the thing themselves.
    expect(withJson(["ps", "--json"])).toEqual(["ps", "--json"]);
    expect(withJson(["ps", "--json"]).filter((a) => a === "--json")).toHaveLength(1);
  });

  it("T1.3 (I4): the spawned argv carries the binary and the flag", async () => {
    const { transport, runner } = subprocess({ exit: { code: 0, signal: null } });
    await transport.invoke(invocation({ argv: ["ps", "--mine"] }));

    expect(runner.spawns[0]?.argv).toEqual(["widget", "ps", "--mine", "--json"]);
  });

  it("T1.5 (I3): the runner receives an array, and spawnShell is never reached", async () => {
    const { transport, runner } = subprocess({ exit: { code: 0, signal: null } });
    await transport.invoke(invocation());

    expect(Array.isArray(runner.spawns[0]?.argv)).toBe(true);
    // The fake throws from `spawnShell`, so a code path that built a string
    // would fail here rather than silently working.
    expect(runner.spawns).toHaveLength(1);
  });
});

describe("C06 reporting", () => {
  it("T1.6: exit 0 with valid JSON → parsed, parseError null, raw retained", async () => {
    const { transport } = subprocess({ stdout: ['{"rows":[1,2]}'], exit: { code: 0, signal: null } });
    const r = await transport.invoke(invocation());

    expect(r.stdout).toEqual({ rows: [1, 2] });
    expect(r.parseError).toBe(null);
    expect(r.stdoutRaw).toBe('{"rows":[1,2]}');
    expect(r.exitCode).toBe(0);
  });

  it("T1.7 (I6): unparseable stdout → stdout undefined, parseError set, raw intact", async () => {
    const { transport } = subprocess({ stdout: ["not json at all"], exit: { code: 0, signal: null } });
    const r = await transport.invoke(invocation());

    expect(r.stdout).toBeUndefined();
    expect(r.parseError).not.toBe(null);
    // Retained either way, so C07 can always fall back to a `raw` block.
    expect(r.stdoutRaw).toBe("not json at all");
  });

  it("T1.8 (I5): output on both streams → separate, neither containing the other", async () => {
    const { transport } = subprocess({
      stdout: ['{"ok":true}'],
      stderr: ["warning: slow\n"],
      exit: { code: 0, signal: null },
    });
    const r = await transport.invoke(invocation());

    expect(r.stdoutRaw).toBe('{"ok":true}');
    expect(r.stderr).toBe("warning: slow\n");
    expect(r.stdoutRaw).not.toContain("warning");
    expect(r.stderr).not.toContain("ok");
  });

  it("T1.11 (I2): exit 2 → reported as 2, with no interpretation", async () => {
    const { transport } = subprocess({ stdout: ["{}"], exit: { code: 2, signal: null } });
    const r = await transport.invoke(invocation());

    expect(r.exitCode).toBe(2);
    expect(r.signal).toBe(null);
    // No status, no envelope, no mapping. Everything a `RawResult` carries is a
    // fact; the judgement is C07's (SS25 is the mechanical half of this).
    expect(Object.keys(r).sort()).toEqual(
      [
        "argv", "cancelled", "durationMs", "exitCode", "parseError",
        "signal", "stderr", "stdout", "stdoutRaw", "timedOut",
      ].sort(),
    );
  });

  it("T1.12: killed by signal → exitCode null, signal set", async () => {
    const { transport } = subprocess({ stdout: ["{}"], exit: { code: null, signal: "SIGKILL" } });
    const r = await transport.invoke(invocation());

    expect(r.exitCode).toBe(null);
    expect(r.signal).toBe("SIGKILL");
  });

  it("T1.13: durationMs comes from the injected clock, not an ambient one", async () => {
    const fake = fakeClock();
    const clock = clockOf(fake);
    const child = fakeChild({ ignores: [] });
    const transport = createSubprocessTransport({
      binary: "widget",
      runner: fakeRunner(() => child),
      clock,
    });

    const pending = transport.invoke(invocation());
    clock.tick(150);
    child.close();

    expect((await pending).durationMs).toBe(150);
  });
});

// I15's shared block: every assertion here holds for all three, and a case that
// needs a special case is a finding about the interface (§9 T2.1).
describe.each(transportCases())("C06 shared — $name", ({ make }) => {
  const answer = result({ stdout: { rows: [7] }, stdoutRaw: '{"rows":[7]}' });

  it("T1.6 (I15): a settled invocation reports the payload and the exit code", async () => {
    const r = await make(answer).invoke(invocation());

    expect(r.stdout).toEqual({ rows: [7] });
    expect(r.exitCode).toBe(0);
  });

  it("T1.3 (I4, I15): the reported argv includes `--json`, which the user never typed", async () => {
    const r = await make(answer, undefined, ["ps", "--mine"]).invoke(
      invocation({ argv: ["ps", "--mine"] }),
    );

    expect(r.argv.at(-1)).toBe("--json");
    expect(r.argv).toContain("--mine");
  });

  it("T1.9 (I9, I15): a stream ends with exactly one end patch, last", async () => {
    const patches = await drain(
      make(answer, [{ kind: "data", value: { n: 1 } }, { kind: "end", result: answer }]).stream(
        invocation({ streams: true }),
      ),
    );

    expect(patches.filter((p) => p.kind === "end")).toHaveLength(1);
    expect(patches.at(-1)?.kind).toBe("end");
    expect(patches[0]).toEqual({ kind: "data", value: { n: 1 } });
  });
});
