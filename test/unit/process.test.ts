// C21 tier 1 — unit. Real short-lived processes, nothing mocked.
//
// The spec is explicit about this and it is worth restating where someone will
// be tempted: **the value of this component is entirely in its interaction with
// the OS.** A `ProcessRunner` tested against a fake `child_process` asserts that
// the code calls the functions it calls, which is the one thing that was never
// in doubt. Every test here spawns.
//
// The runner takes `env` and `stdin` by injection (I14), so a test that needs a
// particular environment or a raw-mode terminal states it as a value instead of
// mutating the process it runs in.
import { describe, expect, it } from "vitest";
import { createProcessRunner } from "../../src/data/process/runner.js";
import { collect, scripts } from "../support/process.js";

const here = (): string => process.cwd();

/** A runner with nothing unusual about it. Each test overrides what it needs. */
function runner(over: { env?: NodeJS.ProcessEnv; isRaw?: boolean; debug?: (l: string) => void } = {}) {
  return createProcessRunner({
    env: over.env ?? process.env,
    stdin: over.isRaw === undefined ? {} : { isRaw: over.isRaw },
    ...(over.debug === undefined ? {} : { debug: over.debug }),
  });
}

describe("C21 spawning", () => {
  it("T1.1: spawn(['echo','hi']) → stdout yields hi, exit code 0", async () => {
    const child = runner().spawn(["echo", "hi"], { cwd: here });

    expect(await collect(child.stdout)).toBe("hi\n");
    expect(await child.exited).toEqual({ code: 0, signal: null });
  });

  it("T1.2 (I1): shell metacharacters in argv are passed literally — no expansion, no injection", async () => {
    // The security-relevant assertion of the whole component. If any of this
    // reached a shell, `whoami` and `id` would run and the output would be a
    // username rather than the string that was asked for.
    const hostile = "; | $(whoami) `id` && rm -rf / > /dev/null";
    const child = runner().spawn(["printf", "%s", hostile], { cwd: here });

    expect(await collect(child.stdout)).toBe(hostile);
    expect(await child.exited).toEqual({ code: 0, signal: null });
  });

  it("T1.3: exited resolves with the child's code", async () => {
    const child = runner().spawn(scripts.exit(7), { cwd: here });

    expect(await child.exited).toEqual({ code: 7, signal: null });
    expect(child.running).toBe(false);
  });

  it("T1.4: a child exiting on a signal → code null, signal set", async () => {
    const r = runner();
    const child = r.spawn(scripts.ignoring([]), { cwd: here });
    await firstChunk(child.stdout);

    expect(child.signal("SIGKILL")).toBe(true);
    expect(await child.exited).toEqual({ code: null, signal: "SIGKILL" });
  });

  it("T1.5 (I3): stdout and stderr arrive separately, and neither contains the other", async () => {
    const child = runner().spawn(scripts.emitBoth("to-out", "to-err"), { cwd: here });

    const [out, err] = await Promise.all([collect(child.stdout), collect(child.stderr)]);

    expect(out).toBe("to-out");
    expect(err).toBe("to-err");
    expect(out).not.toContain("to-err");
    expect(err).not.toContain("to-out");
  });

  it("T1.6: spawnShell('echo a | tr a b') yields b — the shell handled the pipe", async () => {
    const child = runner().spawnShell("echo a | tr a b", { cwd: here });

    expect(await collect(child.stdout)).toBe("b\n");
    expect(await child.exited).toEqual({ code: 0, signal: null });
  });

  it("T1.7 (I10): cwd is read at spawn, so two spawns land in two directories", async () => {
    // The `cd` built-in moves what `cwd()` returns between calls. Captured at
    // construction, the second child would run where the first did.
    let directory = "/usr";
    const r = runner();
    const opts = { cwd: (): string => directory };

    const first = r.spawn(scripts.pwd(), opts);
    expect(await collect(first.stdout)).toBe("/usr");

    directory = "/tmp";
    const second = r.spawn(scripts.pwd(), opts);
    expect(await collect(second.stdout)).toBe("/tmp");
  });

  it("T1.8 (I2): signal('SIGTERM') is delivered and the child exits", async () => {
    const r = runner();
    const child = r.spawn(scripts.ignoring([]), { cwd: here });
    await firstChunk(child.stdout);

    expect(child.signal("SIGTERM")).toBe(true);
    expect(await child.exited).toEqual({ code: null, signal: "SIGTERM" });
    expect(r.live).toHaveLength(0);
  });

  it("T1.9 (I13): a non-existent binary resolves exited, pid null, no unhandled rejection", async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown): void => void rejections.push(reason);
    process.on("unhandledRejection", onRejection);

    try {
      const child = runner().spawn(["definitely-not-a-binary-xyzzy"], { cwd: here });

      expect(await child.exited).toEqual({ code: null, signal: null });
      expect(child.pid).toBeNull();
      // The message is on stderr, where a caller already looks — so a mistyped
      // binary is reported by the same path as a binary that ran and failed.
      expect(await collect(child.stderr)).toMatch(/ENOENT|not.*found/i);
      await new Promise<void>((resolve) => void setImmediate(resolve));
      expect(rejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onRejection);
    }
  });

  it("T1.10: env overrides reach the child and the rest of the environment is inherited", async () => {
    const r = runner({ env: { ...process.env, BASE_ONLY: "from-runner" } });

    const overridden = r.spawn(scripts.readEnv("PROBE"), {
      cwd: here,
      env: { ...process.env, PROBE: "from-opts" },
    });
    expect(await collect(overridden.stdout)).toBe("from-opts");

    // The overlay is the part that is easy to get wrong: passing `opts.env`
    // through alone replaces the environment wholesale, and the runner's own
    // base disappears along with everything else.
    const inherited = r.spawn(scripts.readEnv("BASE_ONLY"), {
      cwd: here,
      env: { PROBE: "from-opts" },
    });
    expect(await collect(inherited.stdout)).toBe("from-runner");
  });
});

/** Wait for the first chunk a child writes — proof it is running, without a timer. */
async function firstChunk(source: AsyncIterable<string>): Promise<string> {
  for await (const chunk of source) return chunk;
  return "";
}
