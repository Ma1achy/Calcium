// C21 tier 6 — fail-on-revert. Each test names the change that makes it fail,
// not just the assertion.
//
// The form matters: "removing the idempotency guard → T3.14 fails" tells the
// next person what they broke. An assertion alone tells them a number.
//
// Where the revert is a one-character edit in `src/`, the test states which
// character and which tests go red — verified by making the edit, not by
// reasoning about it. Where the revert is expressible as a value, it is
// fabricated here and shown to fail.
import { describe, expect, it } from "vitest";
import { createUtf8Decoder } from "../../src/data/process/decode.js";
import { createBoundedStream } from "../../src/data/process/stream.js";
import { createProcessRunner } from "../../src/data/process/runner.js";
import { checkModuleGraph } from "../../tools/enforce/module-graph.mjs";
import { checkSourceScans, SCANS } from "../../tools/enforce/source-scans.mjs";
import { collect, groupMembers, scripts } from "../support/process.js";

const opts = { cwd: (): string => process.cwd() };

function runner(over: { isRaw?: boolean } = {}) {
  return createProcessRunner({
    env: process.env,
    stdin: over.isRaw === undefined ? {} : { isRaw: over.isRaw },
  });
}

describe("C21 fail-on-revert", () => {
  it("T6.1 (I2): spawning without `detached` → the child shares our group, and T3.1, T3.15 and T3.16 fail", async () => {
    // The revert is one character in the runner — `kill(-pid)` to `kill(pid)` —
    // and it was made, run, and reverted: those three went red. The pipeline
    // orphans `cat`, the grandchild outlives its parent, and `killAll` leaves
    // five groups running.
    //
    // What is assertable from here is the precondition the whole claim rests on:
    // a spawned child *leads its own group*. Without `detached` its pgid is
    // ours, `kill(-pid)` would signal the test runner, and group signalling
    // could not work whatever the signalling code said.
    const child = runner().spawn(scripts.ignoring([]), opts);
    const pid = child.pid!;

    // Its own group holds it; ours does not. Without `detached` both would be
    // the test runner's group, `kill(-pid)` would signal *us*, and no amount of
    // correct signalling code could make a pipeline die whole.
    expect(await groupMembers(pid)).toContain(pid);
    expect(await groupMembers(process.pid)).not.toContain(pid);

    child.signal("SIGKILL");
    await child.exited;
  });

  it("T6.2 (I1): merging the two spawn methods behind a flag → T2.5 fails at compile time", async () => {
    // T2.5's three `@ts-expect-error` lines stop being errors the moment
    // `SpawnOptions` grows a `shell` field or `spawn` accepts a string, and
    // `npm run check` type-checks `test/` — so the build fails rather than a run.
    //
    // The behavioural half, here: the same string means two different things
    // through the two methods, which is what a boolean would make invisible at
    // the call site.
    const r = runner();

    const shelled = r.spawnShell("echo a | tr a b", opts);
    expect(await collect(shelled.stdout)).toBe("b\n");

    const literal = r.spawn(["printf", "%s", "a | tr a b"], opts);
    expect(await collect(literal.stdout)).toBe("a | tr a b");
  });

  it("T6.3 (I4): decoding per chunk rather than streaming → T2.1 and C06's T4.3 fail with mojibake", () => {
    // The revert, fabricated: a decoder that finishes every chunk instead of
    // holding the incomplete tail. Both halves run over the same bytes, so the
    // difference is the whole of the claim.
    const bytes = Buffer.from("日本語🚀", "utf8");
    const perChunk = (chunk: Uint8Array): string => new TextDecoder("utf-8").decode(chunk);

    let broken = "";
    let streamed = "";
    const decoder = createUtf8Decoder();
    for (let at = 0; at < bytes.length; at += 3) {
      const slice = bytes.subarray(at, Math.min(at + 3, bytes.length));
      broken += perChunk(slice);
      streamed += decoder.push(slice);
    }
    streamed += decoder.flush();

    expect(streamed).toBe("日本語🚀");
    expect(broken).toContain("�");
  });

  it("T6.4 (I3): inheriting stdout for a normal spawn → T2.2 fails and child output corrupts the frame", () => {
    // SS26 is the mechanical half. It scans `src/data/process/` for a write to
    // the real stdout, and it is shown to fire in `enforce-rules.test.ts`.
    expect(SCANS.map((s) => s.id)).toContain("SS26");
    expect(checkSourceScans(["src/data/process/runner.ts"]).filter((v) => v.rule === "SS26")).toEqual([]);
  });

  it("T6.5 (I5): buffering without a bound → T3.3 exhausts memory; pausing instead of draining → T3.4 blocks the child", () => {
    // Both halves, at the stream. An unbounded stream delivers everything it is
    // given and never marks overflow, which is exactly what T3.3 would stop
    // catching.
    const bounded = createBoundedStream(8);
    bounded.push(Buffer.from("0123456789"));
    expect(bounded.overflowed).toBe(true);

    const unbounded = createBoundedStream(Number.MAX_SAFE_INTEGER);
    unbounded.push(Buffer.from("0123456789"));
    expect(unbounded.overflowed).toBe(false);
  });

  it("T6.6 (I6): dropping the raw-mode guard → T3.8 fails, and a handed-off child gets a terminal it cannot use", async () => {
    await expect(runner({ isRaw: true }).handoff(["true"], opts)).rejects.toThrow(/lifecycle\.suspend/);
    // And the guard is not simply always-on, which would pass the line above
    // while making handoff useless.
    await expect(runner({ isRaw: false }).handoff(["true"], opts)).resolves.toEqual({
      code: 0,
      signal: null,
    });
  });

  it("T6.7 (I8, I11): adding an escalation timer to C21, including a grace period inside killAll → T2.4 and T3.15 fail", () => {
    // SS27 is the mechanical half and it bans two things: a timer, and a
    // `SIGTERM` literal. The second is the one that catches a ladder migrating
    // out of C06 — C21 names only `SIGKILL`, in `killAll`.
    expect(SCANS.map((s) => s.id)).toContain("SS27");

    const fabricated = checkSourceScans(["src/data/process/runner.ts"], () =>
      "setTimeout(() => handle.signal('SIGKILL'), 2000);",
    ).filter((v) => v.rule === "SS27");
    expect(fabricated).toHaveLength(1);
  });

  it("T6.8 (I9): throwing on a signal to an exited child → T3.6 fails on a race that happens routinely", async () => {
    const child = runner().spawn(["true"], opts);
    await child.exited;

    expect(() => child.signal("SIGTERM")).not.toThrow();
    expect(child.signal("SIGTERM")).toBe(false);
  });

  it("T6.9 (I10): capturing cwd at construction → T1.7 fails", async () => {
    let cwd = "/usr";
    const r = runner();
    const live = { cwd: (): string => cwd };

    expect(await collect(r.spawn(scripts.pwd(), live).stdout)).toBe("/usr");
    cwd = "/tmp";
    // A captured value would still say /usr, and every verb after a `cd` would
    // run in the directory the session started in.
    expect(await collect(r.spawn(scripts.pwd(), live).stdout)).toBe("/tmp");
  });

  it("T6.10 (I11): skipping killAll at exit → T5.5 leaves orphans", async () => {
    // C21's half of it: `killAll` empties `live` and kills what it holds. That
    // a session *calls* it is C22's, and C21 T5.5 is the row that says so (C22 is built; this said *waits on C22* until 2026-09-03).
    const r = runner();
    r.spawn(scripts.ignoring([]), opts);
    r.spawn(scripts.ignoring([]), opts);
    expect(r.live).toHaveLength(2);

    await r.killAll();
    expect(r.live).toHaveLength(0);
  });

  it("T6.11 (I13): a spawn-failure path that leaves exited pending → T2.6 fails and a verb hangs forever", async () => {
    const child = runner().spawn(["definitely-not-a-binary-xyzzy"], opts);

    // The failure mode is a hang, so the assertion is that this resolves at all.
    // A pending `exited` here is a verb that never returns and a UI that never
    // says why.
    expect(await child.exited).toEqual({ code: null, signal: null });
    expect(child.pid).toBeNull();
  });

  it("T6.12 (I14): reading process.env or process.stdin directly → T2.7 fails", () => {
    expect(SCANS.map((s) => s.id)).toContain("SS41");

    const fabricated = checkSourceScans(["src/data/process/runner.ts"], () =>
      "if (process.stdin.isRaw) throw new Error('suspend first');",
    ).filter((v) => v.rule === "SS41");
    expect(fabricated).toHaveLength(1);

    // And the consequence, stated: with the real stdin, T3.8 could only be
    // asserted by a test putting its own terminal into raw mode.
    expect(checkSourceScans(["src/data/process/runner.ts"]).filter((v) => v.rule === "SS41")).toEqual([]);
  });

  it("T6.13 (I12): importing anything from terminal/ → T2.3 fails and L0's halves stop being independent", () => {
    const fabricated = checkModuleGraph(["src/data/process/runner.ts"], () =>
      'import type { TerminalLifecycle } from "../../terminal/lifecycle.js";',
    ).filter((v) => v.rule === "MG19");

    // Type-only, deliberately: the independence claim is about knowledge, not
    // about emitted code, and a type import erasing at build is precisely what
    // would make this pass while being the dependency the rule exists to stop.
    expect(fabricated).toHaveLength(1);
  });

  it("T6.14: ending the streams on `exit` rather than on `close` → short commands lose their output under load", async () => {
    // Not in the spec's list, and it belongs there: this is the defect tier 3
    // found. Node's `exit` can fire before the stdio `data` events are
    // delivered, so ending the streams there drops output that is still in
    // flight — empty stdout from a child that ran perfectly, only under load.
    const r = runner();
    const children = Array.from({ length: 50 }, (_unused, n) =>
      r.spawn(["echo", `line-${n}`], opts),
    );

    const outputs = await Promise.all(children.map((c) => collect(c.stdout)));
    expect(outputs).toEqual(children.map((_unused, n) => `line-${n}\n`));
  });
});
