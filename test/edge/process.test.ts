// C21 tier 3 — edge cases. Real processes, real signals, real process groups.
//
// **T3.1 is the headline and the first test of its kind in this tree.** Nothing
// here had spawned a process with a pipeline behind it before C21; the PTY
// harness runs a fixture. A pipeline that dies whole is the claim the component
// is for, and it is the one that cannot be checked by reading the code — the
// difference between `kill(pid)` and `kill(-pid)` is one character and every
// single-process test passes either way.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { createProcessRunner } from "../../src/data/process/runner.js";
import { createBoundedStream } from "../../src/data/process/stream.js";
import { collect, groupMembers, openDescriptorCount, scripts, waitForGroupEmpty } from "../support/process.js";

const here = (): string => process.cwd();
const opts = { cwd: here };

function runner(over: { env?: NodeJS.ProcessEnv; isRaw?: boolean; debug?: (l: string) => void } = {}) {
  return createProcessRunner({
    env: over.env ?? process.env,
    stdin: over.isRaw === undefined ? {} : { isRaw: over.isRaw },
    ...(over.debug === undefined ? {} : { debug: over.debug }),
  });
}

/** The first chunk a child writes — proof it is running, with no timer involved. */
async function firstChunk(source: AsyncIterable<string>): Promise<string> {
  for await (const chunk of source) return chunk;
  return "";
}

describe("C21 process groups", () => {
  it("T3.1 (I2): a signalled pipeline dies whole — nothing is left orphaned", async () => {
    // `sleep 30 | cat` is a shell with two children. Signal the shell alone and
    // `cat` keeps the pipe: the user pressed Ctrl-C, the command appears not to
    // stop, and the orphan outlives the session. The group is what makes
    // cancellation work rather than appear to.
    const child = runner().spawnShell("sleep 30 | cat", opts);
    const pgid = child.pid!;

    // The group is populated before the signal — otherwise "empty afterwards"
    // is a claim about a group that never held anything.
    const before = await groupMembers(pgid);
    expect(before.length, `the pipeline's group held ${before.length} processes`).toBeGreaterThanOrEqual(2);

    expect(child.signal("SIGTERM")).toBe(true);
    await child.exited;
    await waitForGroupEmpty(pgid);

    expect(await groupMembers(pgid)).toEqual([]);
  });

  it("T3.16: group signalling reaches a grandchild the handle knows nothing about", async () => {
    const child = runner().spawn(scripts.grandchild(), opts);
    const pgid = child.pid!;
    const grandchildPid = Number((await firstChunk(child.stdout)).trim());

    expect(grandchildPid).toBeGreaterThan(0);
    expect(await groupMembers(pgid)).toContain(grandchildPid);

    child.signal("SIGKILL");
    await child.exited;
    await waitForGroupEmpty(pgid);

    // The pid nothing above C21 ever saw. A leader-only signal leaves it running
    // and nothing in the session has a handle to it.
    expect(await groupMembers(pgid)).not.toContain(grandchildPid);
  });

  it("T3.2: a child ignoring SIGTERM survives it, and SIGKILL ends it", async () => {
    const child = runner().spawn(scripts.ignoring(["SIGTERM"]), opts);
    const chunks = child.stdout[Symbol.asyncIterator]();
    await chunks.next(); // "ready"

    expect(child.signal("SIGTERM")).toBe(true);
    // The child announcing the catch is the only honest evidence of survival:
    // `running` is our own bookkeeping, and a line written after delivery cannot
    // come from a dead process.
    expect((await chunks.next()).value).toContain("caught:SIGTERM");
    expect(child.running).toBe(true);

    expect(child.signal("SIGKILL")).toBe(true);
    expect(await child.exited).toEqual({ code: null, signal: "SIGKILL" });
    // C21 delivered both and sequenced neither. The ladder is C06's (I8).
  });

  it("T3.6 (I9): signalling an exited child is false, never a throw", async () => {
    const child = runner().spawn(["true"], opts);
    await child.exited;

    expect(() => child.signal("SIGTERM")).not.toThrow();
    expect(child.signal("SIGTERM")).toBe(false);
    // The race is routine rather than exceptional: a child may exit between the
    // decision to cancel and the delivery, and a throw there would surface as a
    // crash on a path the user takes deliberately.
  });

  it("T3.15 (I11): killAll SIGKILLs every group, empties live, and schedules no timer", async () => {
    const r = runner();
    const children = [
      r.spawnShell("sleep 30 | cat", opts),
      r.spawn(scripts.ignoring(["SIGTERM"]), opts),
      r.spawn(scripts.ignoring([]), opts),
      r.spawn(scripts.ignoring([]), opts),
      r.spawn(scripts.ignoring([]), opts),
    ];
    const groups = children.map((c) => c.pid!);
    await Promise.all(children.slice(1).map((c) => firstChunk(c.stdout)));

    expect(r.live).toHaveLength(5);

    // Spied rather than counted through fake timers: `vi.getTimerCount()` needs
    // `vi.useFakeTimers()`, and enabling it around five real children to observe
    // that no timer was armed perturbs more than it measures.
    //
    // The assertion is that none was *scheduled*, not that none fired. A grace
    // period armed and cleared satisfies the weaker reading and is exactly the
    // thing SS27 exists to keep out: a timing policy here is C06's ladder living
    // in two places, and which one runs would depend on the call path.
    const armedTimeout = vi.spyOn(globalThis, "setTimeout");
    const armedInterval = vi.spyOn(globalThis, "setInterval");

    try {
      await r.killAll();

      expect(armedTimeout).not.toHaveBeenCalled();
      expect(armedInterval).not.toHaveBeenCalled();
    } finally {
      armedTimeout.mockRestore();
      armedInterval.mockRestore();
    }

    expect(r.live).toHaveLength(0);

    for (const pgid of groups) {
      await waitForGroupEmpty(pgid);
      expect(await groupMembers(pgid)).toEqual([]);
    }

    // Including the child that ignores SIGTERM: killAll does not ask.
    expect((await children[1]!.exited).signal).toBe("SIGKILL");
  });

  it("T3.14: 200 concurrent spawns are all tracked, all reaped, and leak no descriptors", async () => {
    const r = runner();
    const before = openDescriptorCount();

    const children = Array.from({ length: 200 }, () => r.spawn(["true"], opts));
    expect(r.live.length).toBeGreaterThan(0);

    await Promise.all(children.map((c) => c.exited));
    await Promise.all(children.map((c) => collect(c.stdout)));

    expect(r.live).toHaveLength(0);
    // A handle that stays in `live` after exit is a leak of its own: `killAll`
    // would signal a pid the OS has since reused.
    expect(openDescriptorCount()).toBeLessThanOrEqual(before + 4);
  });
});

describe("C21 streams", () => {
  it("T3.3 (I5): 100 MiB from a child marks overflow, the child still exits, and memory stays bounded", async () => {
    const child = runner().spawn(scripts.emitBytes(100 * 1024 * 1024), opts);

    const text = await collect(child.stdout);

    expect(child.overflowed).toBe(true);
    expect(text.length).toBe(8 * 1024 * 1024);
    expect(await child.exited).toEqual({ code: 0, signal: null });
  }, 60_000);

  it("T3.4 (I5): a child writing with nobody reading is drained, never blocked", async () => {
    // No consumer at all. If the runner paused the stream at the bound instead
    // of draining, the child would block on a full pipe and this would time out
    // rather than fail — a child stuck on write never exits and never reports.
    const child = runner().spawn(scripts.emitBytes(32 * 1024 * 1024), opts);

    expect(await child.exited).toEqual({ code: 0, signal: null });
    expect(child.overflowed).toBe(true);
  }, 60_000);

  it("T3.5: a child closing stdout stays alive, and exited waits for it", async () => {
    const r = runner();
    const child = r.spawn(scripts.closeStdoutStayAlive(), opts);

    // The stream ends because the child closed it, not because the child went.
    expect(await collect(child.stdout)).toBe("");
    expect(child.running).toBe(true);

    child.signal("SIGKILL");
    expect(await child.exited).toEqual({ code: null, signal: "SIGKILL" });
  });

  it("T3.7: writes arriving after the stream ended are ignored", () => {
    // At the stream rather than through a child, because the race cannot be
    // provoked reliably from outside — and this is where the guard lives.
    // Without it a late chunk lands behind a `done` already reported, and a
    // consumer sees output from a child that exited.
    const stream = createBoundedStream(1024);
    stream.push(Buffer.from("before"));
    stream.end();
    stream.push(Buffer.from("after"));

    return expect(collect(stream.iterable)).resolves.toBe("before");
  });

  it("T3.5: a child that exits before its output is delivered still yields all of it", async () => {
    // The ordering `close` exists for. Node's `exit` can fire before the stdio
    // `data` events have been delivered, so a runner that ends its streams on
    // exit sets `ended` while output is still in flight and the T3.7 guard drops
    // it. The symptom is empty stdout from a child that ran perfectly, on short
    // commands, and only under enough load to reorder the two — which is why
    // this spawns fifty at once rather than one and hopes.
    const r = runner();
    const children = Array.from({ length: 50 }, (_unused, n) =>
      r.spawn(["echo", `line-${n}`], opts),
    );

    const outputs = await Promise.all(children.map((c) => collect(c.stdout)));

    expect(outputs).toEqual(children.map((_unused, n) => `line-${n}\n`));
  });

  it("T3.17: a null byte passes through without truncating the stream", async () => {
    const child = runner().spawn(scripts.emitHex("61006263"), opts);

    // C-string thinking is the failure here: a decoder or a queue that treats
    // NUL as a terminator drops everything after it, and the output looks like a
    // short read rather than a bug.
    expect(await collect(child.stdout)).toBe("a bc");
  });

  it("T3.3 (I5): the bound is exact, and the dropped tail leaves no replacement mark", async () => {
    // The boundary itself, at a size a test can reason about. The chunk that
    // crosses the line is delivered up to it, so the bound is the number it
    // claims — and the tail is dropped undecoded, so a half-character at the cut
    // does not become a U+FFFD the child never emitted.
    const child = runner().spawn(scripts.emitRepeated("日本語", 1000), {
      ...opts,
      maxBufferBytes: 1000,
    });

    const text = await collect(child.stdout);

    expect(child.overflowed).toBe(true);
    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(1000);
    expect(text).not.toContain("�");
  });
});

describe("C21 handoff", () => {
  it("T3.8 (I6): handoff with raw mode still set throws, naming the missing suspend", async () => {
    // Assertable at all only because `stdin` is injected (I14). Against the real
    // `process.stdin` this test would have to put the runner's own terminal into
    // raw mode and hope to restore it.
    const r = runner({ isRaw: true });

    await expect(r.handoff(["true"], opts)).rejects.toThrow(/suspend/);
    // The message names the missing call, not the state it found: "still in raw
    // mode" sends a reader looking for who set it, and nobody did — someone
    // failed to unset it.
    await expect(r.handoff(["true"], opts)).rejects.toThrow(/lifecycle\.suspend/);
  });

  it("T3.8 (I6): and it does not fire on the correct path", async () => {
    // The other half. A guard that fired always would pass the test above and
    // make handoff unusable, which is the failure the C01 pairing found in T4.1.
    await expect(runner({ isRaw: false }).handoff(["true"], opts)).resolves.toEqual({
      code: 0,
      signal: null,
    });
  });

  it("T3.10: a child exiting immediately during handoff resolves cleanly", async () => {
    await expect(runner().handoff(["true"], opts)).resolves.toEqual({ code: 0, signal: null });
    await expect(runner().handoff(scripts.exit(4), opts)).resolves.toEqual({
      code: 4,
      signal: null,
    });
  });

  it("T3.10 (I13): a handoff that cannot spawn resolves rather than throwing", async () => {
    await expect(runner().handoff(["definitely-not-a-binary-xyzzy"], opts)).resolves.toEqual({
      code: null,
      signal: null,
    });
  });
});

describe("C21 shell resolution", () => {
  it("T3.11: $SHELL unset falls back to /bin/sh", async () => {
    const { SHELL: _dropped, ...withoutShell } = process.env;
    const child = runner({ env: withoutShell }).spawnShell("echo $0", opts);

    expect((await collect(child.stdout)).trim()).toBe("/bin/sh");
  });

  it("T3.11: and an executable $SHELL is the one used", async () => {
    // The positive control. Without it the fallback tests pass against an
    // implementation that ignores `$SHELL` entirely.
    const child = runner({ env: { ...process.env, SHELL: "/usr/bin/bash" } }).spawnShell(
      "echo $0",
      opts,
    );

    expect((await collect(child.stdout)).trim()).toBe("/usr/bin/bash");
  });

  it("T3.12: a $SHELL that does not exist falls back to /bin/sh with a warning", async () => {
    const warnings: string[] = [];
    const child = runner({
      env: { ...process.env, SHELL: "/opt/removed-last-month/fish" },
      debug: (line) => void warnings.push(line),
    }).spawnShell("echo $0", opts);

    const [out, err, exit] = await Promise.all([
      collect(child.stdout),
      collect(child.stderr),
      child.exited,
    ]);

    expect({ out: out.trim(), err, exit }).toEqual({
      out: "/bin/sh",
      err: "",
      exit: { code: 0, signal: null },
    });
    expect(warnings.join("\n")).toContain("/opt/removed-last-month/fish");
    // A warning rather than a failure: `$SHELL` is often a stale path to a shell
    // that was uninstalled, and refusing every system command over it is a worse
    // answer than running the one that is definitely there.
  });
});

describe("C21 failure paths", () => {
  it("T3.13: a deleted cwd fails the spawn with a clear error and the runner survives", async () => {
    const doomed = mkdtempSync(`${tmpdir()}/c21-`);
    rmSync(doomed, { recursive: true });

    const r = runner();
    const child = r.spawn(["true"], { cwd: () => doomed });

    expect(await child.exited).toEqual({ code: null, signal: null });
    expect(await collect(child.stderr)).toMatch(/ENOENT|no such file/i);

    // The session survives it — the next spawn works, which is the part that
    // matters after a mistyped `cd`.
    const next = r.spawn(["echo", "still here"], opts);
    expect(await collect(next.stdout)).toBe("still here\n");
  });
});
