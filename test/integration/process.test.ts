// C21 tier 4 — integration. The runner under its actual consumer.
//
// **This tier is the point of the branch.** `fakeRunner` has stood in for C21
// since C06 was written, and C08's recording composes over
// `createSubprocessTransport` — so a divergence between the fake and the real
// thing has been invisible until now. What moves here is a finding about the
// interface, not a licence to widen it.
//
// T4.2 — the escalation ladder issuing real signals — lives in
// `test/integration/transport.test.ts` as C06's own T4.1, because it is C06's
// ladder being asserted and the deferral that expired was C06's. Not duplicated
// here.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { pipelineHarness, settled } from "../support/execution.js";
import { createProcessRunner } from "../../src/data/process/runner.js";
import { createSubprocessTransport } from "../../src/data/transport/index.js";
import { fakeClock } from "../support/fake-scheduler.js";
import { asScriptFile, collect, scripts } from "../support/process.js";
import { clockOf, drain, invocation } from "../support/transport.js";

function realTransport(over: { cwd?: () => string } = {}) {
  return createSubprocessTransport({
    binary: "node",
    clock: clockOf(fakeClock()),
    runner: createProcessRunner({ env: process.env, stdin: {} }),
    ...(over.cwd === undefined ? {} : { cwd: over.cwd }),
  });
}

/** The argv C06 will spawn, minus the binary it prepends. */
function program(argv: readonly string[]): readonly string[] {
  const [, ...rest] = asScriptFile(argv);
  return rest;
}

describe("C21 with C06", () => {
  it("T4.1: every RawResult field is populated from a real spawn", async () => {
    const result = await realTransport().invoke(
      invocation({
        argv: program([
          "node",
          "-e",
          `process.stdout.write('{"rows":[1,2]}');process.stderr.write("a warning");process.exit(0)`,
        ]),
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.stdout).toEqual({ rows: [1, 2] });
    expect(result.stdoutRaw).toBe('{"rows":[1,2]}');
    expect(result.stderr).toBe("a warning");
    expect(result.parseError).toBeNull();
    expect(result.cancelled).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.overflowed).toBe(false);
    // `argv` is what was actually spawned, `--json` included (C06 I20).
    expect(result.argv.at(-1)).toBe("--json");
  });

  it("T4.1: a non-zero exit and a signal are reported, not interpreted", async () => {
    const failed = await realTransport().invoke(
      invocation({ argv: program(scripts.exit(2)) }),
    );

    expect(failed.exitCode).toBe(2);
    // No status, no envelope. C06 reports and C07 decides (C06 I2), and the
    // whole of that discipline holds against a real process exactly as it did
    // against the fake.
    expect(failed.stderr).toBe("");
  });

  it("T4.3: NDJSON with multi-byte content split across chunk boundaries parses cleanly", async () => {
    // The decoder's payoff, tested at the consumer. C06 reads NDJSON line by
    // line, so a rune split across a pipe chunk would arrive as two replacement
    // marks inside a JSON string — and the failure appears only with non-ASCII
    // content and only at certain output sizes.
    const patches = await drain(
      realTransport().stream(
        invocation({ argv: program(scripts.ndjson(500, "日本語🚀ünïcode")), streams: true }),
      ),
    );

    const data = patches.filter((p) => p.kind === "data");
    expect(data).toHaveLength(500);
    for (const patch of data) {
      expect((patch as { value: { text: string } }).value.text).toBe("日本語🚀ünïcode");
    }
    expect(patches.at(-1)?.kind).toBe("end");
  });

  it("T4.6: cwd is read per spawn, so a cd between verbs moves where the next one lands", async () => {
    // C18's `cd` built-in is a variable this side of the seam. C06 holds a
    // `() => string` and C21 reads it at spawn; between them, nothing captures.
    const first = mkdtempSync(`${tmpdir()}/c21-cd-a-`);
    const second = mkdtempSync(`${tmpdir()}/c21-cd-b-`);
    let cwd = first;

    const transport = realTransport({ cwd: () => cwd });
    const argv = program(["node", "-e", `process.stdout.write(JSON.stringify(process.cwd()))`]);

    expect((await transport.invoke(invocation({ argv }))).stdout).toBe(first);
    cwd = second;
    expect((await transport.invoke(invocation({ argv }))).stdout).toBe(second);

    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  });

  it("T4.1: a far side that cannot be spawned is a result, not a throw", async () => {
    // The path `fakeRunner` could never exercise: it throws on demand or does
    // not, and the real runner does neither — it resolves `exited` with a null
    // code and puts the message on stderr. C06 handles both, and this is the
    // half that had never run.
    // The *binary* is what has to be missing. `node missing.js` spawns
    // perfectly and exits 1 — a far side that ran and failed, which is a
    // different report and C07 maps it differently.
    const missing = await createSubprocessTransport({
      binary: "definitely-not-a-binary-xyzzy",
      clock: clockOf(fakeClock()),
      runner: createProcessRunner({ env: process.env, stdin: {} }),
    }).invoke(invocation({ argv: ["ps"] }));

    expect(missing.exitCode).toBeNull();
    expect(missing.stderr).not.toBe("");
    expect(missing.stdoutRaw).toBe("");
    expect(missing.parseError).not.toBeNull();
  });

  it("T4.1: a deleted cwd surfaces as a result the session survives", async () => {
    const doomed = mkdtempSync(`${tmpdir()}/c21-gone-`);
    mkdirSync(`${doomed}/inner`);
    rmSync(doomed, { recursive: true });

    const transport = realTransport({ cwd: () => `${doomed}/inner` });
    const result = await transport.invoke(invocation({ argv: program(scripts.emit("hi")) }));

    expect(result.exitCode).toBeNull();
    expect(result.stderr).toMatch(/ENOENT|no such file/i);
  });

  it("T4.1 (I5): an overflowing child reports overflowed through the transport", async () => {
    // C21's bound, C06's field, one real process. The value is carried rather
    // than reconstructed, so `stdoutRaw` being a prefix is something a consumer
    // can know about instead of a silent truncation.
    const result = await createSubprocessTransport({
      binary: "node",
      clock: clockOf(fakeClock()),
      runner: createProcessRunner({ env: process.env, stdin: {} }),
    }).invoke(invocation({ argv: program(scripts.emitBytes(32 * 1024 * 1024)) }));

    expect(result.overflowed).toBe(true);
    expect(result.stdoutRaw.length).toBe(8 * 1024 * 1024);
    expect(result.exitCode).toBe(0);
  }, 60_000);

  it("T4.4 (with C23, C18): a shell result routes to spawnShell and an app result does not", async () => {
    // **C18 classifies, C23 routes** — and the pair is the assertion. A test
    // that only checks the shell half passes on a pipeline that shells
    // *everything*, which is D18's injection path opened for every verb.
    const shell = pipelineHarness();
    shell.pipeline.submit("echo hi");
    await settled();
    expect(shell.calls, "a shell command is delegated").toContain("spawnShell");
    expect(shell.calls, "and never invoked as a verb").not.toContain("invoke");

    const app = pipelineHarness();
    app.pipeline.submit("/ps");
    await settled();
    expect(app.calls, "an app verb goes through the transport").toContain("invoke");
    expect(app.calls, "and never through a shell — D18's whole claim").not.toContain("spawnShell");
  });
  it.todo(
    "T4.5 (with C01, L4): the documented suspend → handoff → resume sequence runs in order, and T3.8's guard never fires on the correct path — waits on L4",
  );
  it.todo("T4.7 (with L4): session exit calls killAll before the terminal is released — waits on L4");
});

describe("C21 against the fake it replaced", () => {
  it("the interface `fakeRunner` was written to is the one the runner implements", async () => {
    // `fakeRunner` has stood in for C21 since C06, and C08's recording composes
    // over the same transport — so a drift between fake and real would have been
    // invisible until now. This asserts the shape at the seam rather than
    // trusting that C06's suite passing means anything about C21.
    const real = createProcessRunner({ env: process.env, stdin: {} });
    const child = real.spawn(scripts.emit("x"), { cwd: () => process.cwd() });

    expect(Object.keys(child).sort()).toEqual(
      ["exited", "overflowed", "pid", "running", "signal", "stderr", "stdout"].sort(),
    );
    expect(typeof child.signal).toBe("function");
    expect(child.exited).toBeInstanceOf(Promise);

    await collect(child.stdout);
    await child.exited;

    // And the one asymmetry, stated: the fake throws on `spawnShell` because C06
    // uses `spawn` and only `spawn`. The real runner implements both, so the
    // fake is narrower than the interface *on purpose* — which is a fact about
    // C06's usage, not a drift.
    expect(typeof real.spawnShell).toBe("function");
  });
});
