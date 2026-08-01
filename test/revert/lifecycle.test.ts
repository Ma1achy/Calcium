// C01 tier 6 — fail-on-revert. Each test names the *change* that makes it fail,
// not merely the assertion it makes.
import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { checkModuleGraph } from "../../tools/enforce/module-graph.mjs";
import { SCANS } from "../../tools/enforce/source-scans.mjs";
import { createTerminalLifecycle, type TerminalLifecycle } from "../../src/terminal/lifecycle.js";
import { capabilities, fakeDebug, fakeStdin, fakeStdout } from "../support/fake-terminal.js";

const live: TerminalLifecycle[] = [];

function build(over: Partial<Parameters<typeof createTerminalLifecycle>[0]> = {}): TerminalLifecycle {
  const l = createTerminalLifecycle({
    stdout: fakeStdout(),
    stdin: fakeStdin(),
    capabilities: capabilities(),
    onFatal: ((err: unknown) => {
      throw err;
    }) as (err: unknown) => never,
    ...over,
  });
  live.push(l);
  return l;
}

afterEach(() => {
  for (const l of live.splice(0)) {
    try {
      l.release();
    } catch {
      // Already released.
    }
  }
  vi.restoreAllMocks();
});

function srcFiles(dir = "src", out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) srcFiles(path, out);
    else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(path);
  }
  return out;
}

describe("C01 fail-on-revert", () => {
  it("T6.1 (I3): calling acquire() from the constructor → this fails", () => {
    // Asserted on the observable effect, not the source: I3 is a tested
    // property rather than a structural guarantee, because nothing prevents a
    // later change from making that call.
    const stdout = fakeStdout();
    const lifecycle = build({ stdout });

    expect(stdout.chunks, "construction emitted terminal state").toEqual([]);
    expect(lifecycle.acquired).toBe(false);

    // And the handlers exist before anything is acquired, which is the window
    // this closes: a crash between the two leaves nothing to release.
    expect(process.listenerCount("SIGINT")).toBeGreaterThan(0);
  });

  it("T6.2 (I4): writing the stack before release → T3.10's ordering fails", () => {
    const order: string[] = [];
    const stdout = fakeStdout();
    const lifecycle = build({ stdout });
    lifecycle.acquire();

    const acquired = stdout.chunks.length;
    vi.spyOn(process.stderr, "write").mockImplementation(() => {
      order.push(`stderr@${stdout.chunks.length}`);
      return true;
    });
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    process.emit("uncaughtException", new Error("boom"));

    // The count at the moment stderr was written must already include every
    // release byte. Moving the write earlier drops it below.
    expect(order).toHaveLength(1);
    expect(Number(order[0]!.split("@")[1])).toBeGreaterThan(acquired);
  });

  it("T6.3 (I1): an escape literal in another module → SS14 fails, naming the file", () => {
    const ss14 = SCANS.find((s) => s.id === "SS14");
    expect(ss14, "SS14 is gone from A03").toBeDefined();
    // **This asserted a singleton, and it fired on the commit that widened it.**
    // That is the guard working: SS14's allow-list is the one place C01 I1 can be
    // eroded quietly, so it is pinned exactly rather than checked for membership,
    // and a third entry fails here whatever its justification.
    //
    // The second entry is C16's decoder. SS14 guards the **write** path — its
    // sibling citation, C01 T2.5, is an output scan — and nothing may emit an
    // escape sequence except `escapes.ts`, because a terminal left in a mode
    // nobody owns is unrecoverable. Recognising bytes arriving *from* the
    // terminal is the inverse direction: the decoder emits nothing, and C16 I13
    // separately forbids it importing `terminal/`, so without the entry the
    // component cannot be built as specified. The allowance is paired with C16
    // T2.9, which asserts the decoder reaches no stream — because this entry is
    // precisely what would hide it if it ever did.
    expect(ss14!.allow).toEqual([
      "src/terminal/escapes.ts",
      "src/interaction/router/decode.ts",
    ]);
    expect(ss14!.scope).toBe("src/");
    expect(ss14!.pattern.test("const x = \"\\x1b[0m\";")).toBe(true);
  });

  it("T6.4 (I6): a fixed release sequence rather than the inverse of `held` → T1.3 fails", () => {
    const stdout = fakeStdout();
    const lifecycle = build({
      stdout,
      capabilities: capabilities({ mouse: false, bracketedPaste: false }),
    });

    lifecycle.acquire();
    lifecycle.release();

    // A fixed sequence would release capabilities that were never acquired.
    for (const fragment of ["2004", "1002", "1006"]) {
      expect(stdout.output, fragment).not.toContain(fragment);
    }
  });

  it("T6.5 / T6.6 (A02 §1): an edge between L0's halves → the module graph fails", () => {
    const upward = 'import { adapt } from "../data/adapters.js";';
    const fromData = 'import { createTerminalLifecycle } from "../../terminal/lifecycle.js";';

    expect(
      checkModuleGraph(["src/terminal/lifecycle.ts"], () => upward).filter((v) => v.rule === "MG3"),
    ).toHaveLength(1);
    expect(
      checkModuleGraph(["src/data/process/runner.ts"], () => fromData).filter(
        (v) => v.rule === "MG3",
      ),
    ).toHaveLength(1);

    // And the real graph is clean.
    expect(checkModuleGraph(srcFiles()).filter((v) => v.rule === "MG3")).toEqual([]);
  });

  it("T6.7 (C7): a `contaminated` field back on C01 → the conformance test fails", () => {
    const lifecycle = build();
    const members = new Set(Object.keys(lifecycle));

    expect(members.has("contaminated")).toBe(false);
    // resume() does not repaint either: it emits acquisition sequences and
    // nothing else. C03 owns the flag, the L4 shell calls invalidate().
    //
    // **The exhaustive set is the point, and `size` had to be argued past it.**
    // A `has("contaminated")` check alone would let any other member appear
    // unremarked, which is how a lifecycle grows a second responsibility. The
    // set failing on an addition is the mechanism working: `size` is C01 §5's
    // deferred accessor, added on the commit where both of its conditions
    // arrived — a caller that cannot work without it (C22's viewport, at
    // construction step 5) and a rule requiring its use (SS42).
    //
    // **`onInput` is the second addition and was argued the same way.** C22 §4
    // step 8 named "accept input" with no mechanism behind it: nothing in the
    // tree read stdin, so C16's finished decoder was never handed a byte. The
    // delivery is C01's because dropping the listener on `suspend()` is part of
    // the transition — a listener the shell had to remember to remove races the
    // child for the same descriptor (I18).
    expect(members).toEqual(
      new Set([
        "acquire",
        "release",
        "suspend",
        "resume",
        "onResize",
        "onResume",
        "onInput",
        "size",
        "writer",
        "acquired",
        "suspended",
      ]),
    );
  });

  it("T6.8 (I2): removing the idempotency guard → T3.14 fails on the double signal", () => {
    const stdout = fakeStdout();
    const lifecycle = build({ stdout });
    lifecycle.acquire();
    const acquired = stdout.chunks.length;
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    process.emit("SIGTERM");
    process.emit("SIGINT");

    expect(stdout.chunks.slice(acquired).join("").split("1049l").length - 1).toBe(1);
  });

  it("T6.9 (I8): releasing unconditionally → T1.5 and T3.16 fail", () => {
    const stdout = fakeStdout();
    const lifecycle = build({ stdout });
    lifecycle.acquire();
    lifecycle.suspend();
    const suspended = stdout.chunks.length;

    lifecycle.release();

    // The regression this catches corrupts a running child's screen.
    expect(stdout.chunks.length).toBe(suspended);
  });

  it("T6.10 (I12): coalescing SIGWINCH inside C01 → T3.19 fails", () => {
    const lifecycle = build();
    lifecycle.acquire();
    const resized = vi.fn();
    lifecycle.onResize(resized);

    for (let i = 0; i < 3; i += 1) process.emit("SIGWINCH");

    expect(resized).toHaveBeenCalledTimes(3);
  });

  it("T6.11 (I11): making `released` re-acquirable → T3.21 fails", () => {
    const lifecycle = build();
    lifecycle.acquire();
    lifecycle.release();

    // A revived instance holds terminal state with no handler registered to
    // release it — precisely the window I3 exists to close.
    expect(() => lifecycle.acquire()).toThrow(/construct a new instance/);
    expect(process.listenerCount("SIGINT")).toBe(0);
  });

  it("T6.12 (I1): a mode sequence from C03, or 2026 from C01 → T2.8 fails", () => {
    const c03TakesAltScreen = 'import { ALT_SCREEN } from "./escapes.js";';
    const c01TakesSync = 'import { SYNC_UPDATE } from "./escapes.js";';

    expect(
      checkModuleGraph(["src/terminal/frame-scheduler.ts"], () => c03TakesAltScreen).filter(
        (v) => v.rule === "MG20",
      ),
    ).toHaveLength(1);
    expect(
      checkModuleGraph(["src/terminal/lifecycle.ts"], () => c01TakesSync).filter(
        (v) => v.rule === "MG20",
      ),
    ).toHaveLength(1);

    // The transactional exception stays exactly one sequence wide.
    expect(
      checkModuleGraph(["src/terminal/frame-scheduler.ts"], () => c01TakesSync).filter(
        (v) => v.rule === "MG20",
      ),
    ).toEqual([]);
  });

  it("T6.13 (I9): giving Ink process.stdout rather than writer → T1.7 fails", () => {
    const stdout = fakeStdout();
    const debug = fakeDebug();
    const lifecycle = build({ stdout, debug });

    // The renderer's writes must be distinguishable from anything else's. If
    // Ink is handed the raw stream, they stop being — and land in the sink.
    lifecycle.writer.write("frame");
    stdout.write("stray");

    expect(stdout.output).toContain("frame");
    expect(stdout.output).not.toContain("stray");
    expect(debug.lines).toEqual(["stray"]);
  });
});
