// C01 tier 2 — contract. The interface A02 §2 promises, so C03 and the shell
// can be written against it.
import { readdirSync, statSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkModuleGraph } from "../../tools/enforce/module-graph.mjs";
import { checkSourceScans, SCANS } from "../../tools/enforce/source-scans.mjs";
import { createTerminalLifecycle, type TerminalLifecycle } from "../../src/terminal/lifecycle.js";
import { capabilities, fakeStdin, fakeStdout } from "../support/fake-terminal.js";

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
});

function srcFiles(dir = "src", out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) srcFiles(path, out);
    else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(path);
  }
  return out;
}

describe("C01 contract", () => {
  it("T2.1: every member of TerminalLifecycle is present; the flags are getters", () => {
    const lifecycle = build();

    for (const member of ["acquire", "release", "suspend", "resume", "onResize", "onResume"]) {
      expect(typeof (lifecycle as unknown as Record<string, unknown>)[member], member).toBe(
        "function",
      );
    }
    expect(lifecycle.writer).toBeDefined();

    // `readonly` is compile-time only. Assignment must not move internal state,
    // which is what implementing them as getters guarantees.
    expect(() => {
      (lifecycle as unknown as { acquired: boolean }).acquired = true;
    }).toThrow();
    expect(lifecycle.acquired).toBe(false);

    // And no `contaminated` — C03 owns that flag (T6.7).
    expect(Object.hasOwn(lifecycle, "contaminated")).toBe(false);
  });

  it("T2.2: `acquired` and `suspended` track their own operations", () => {
    const lifecycle = build();
    expect([lifecycle.acquired, lifecycle.suspended]).toEqual([false, false]);

    lifecycle.acquire();
    expect([lifecycle.acquired, lifecycle.suspended]).toEqual([true, false]);

    lifecycle.suspend();
    expect([lifecycle.acquired, lifecycle.suspended]).toEqual([false, true]);

    lifecycle.resume();
    expect([lifecycle.acquired, lifecycle.suspended]).toEqual([true, false]);

    lifecycle.release();
    expect([lifecycle.acquired, lifecycle.suspended]).toEqual([false, false]);
  });

  it("T2.3 (I3): the constructor registers all eight trappable events, by name", () => {
    // By name rather than by count: a count passes with two of them missing,
    // which is how this test came to say six after SIGWINCH and SIGCONT joined
    // §5's table.
    const EVENTS = [
      "SIGINT",
      "SIGTERM",
      "SIGHUP",
      "SIGWINCH",
      "SIGTSTP",
      "SIGCONT",
      "uncaughtException",
      "unhandledRejection",
    ] as const;

    const before = new Map(EVENTS.map((e) => [e, process.listenerCount(e)]));
    const lifecycle = build();

    for (const e of EVENTS) {
      expect(process.listenerCount(e) - (before.get(e) ?? 0), e).toBe(1);
    }
    // Registered before anything is acquired, not after.
    expect(lifecycle.acquired).toBe(false);

    lifecycle.release();
    for (const e of EVENTS) {
      expect(process.listenerCount(e), `${e} after release`).toBe(before.get(e));
    }
  });

  it("T2.4 (C11): C01 imports nothing from data/, and nothing upward", () => {
    const violations = checkModuleGraph(srcFiles()).filter((v) =>
      v.file.startsWith("src/terminal/"),
    );
    expect(violations, violations.map((v) => `${v.rule} ${v.file}: ${v.message}`).join("\n")).toEqual(
      [],
    );
  });

  it("T2.5 (I1): SS14 finds no escape literal outside escapes.ts", () => {
    // The scan definition is imported, not restated — a second copy drifts from
    // the one `make enforce` runs, and then this passes while the build fails.
    const violations = checkSourceScans(srcFiles()).filter((v) => v.rule === "SS14");
    expect(violations, violations.map((v) => v.file).join("\n")).toEqual([]);
  });

  it("T2.6 (C13): onFatal is required, and the fatal path invokes it", () => {
    // @ts-expect-error onFatal is required — the only fatal case in the system
    // cannot have undefined handling. tsc --noEmit fails if this stops erroring.
    void (() => createTerminalLifecycle({
      stdout: fakeStdout(),
      stdin: fakeStdin(),
      capabilities: capabilities(),
    }));

    const onFatal = vi.fn((err: unknown) => {
      throw err;
    });
    const lifecycle = build({
      capabilities: capabilities({ altScreen: false }),
      onFatal: onFatal as unknown as (err: unknown) => never,
    });

    expect(() => lifecycle.acquire()).toThrow(/alternate screen/i);
    expect(onFatal).toHaveBeenCalledTimes(1);
  });

  it("T2.7 (C14): onResize and onResume return disposables that stop delivery", () => {
    const lifecycle = build();
    lifecycle.acquire();

    const resized = vi.fn();
    const handle = lifecycle.onResize(resized);
    process.emit("SIGWINCH");
    expect(resized).toHaveBeenCalledTimes(1);

    handle[Symbol.dispose]();
    process.emit("SIGWINCH");
    expect(resized).toHaveBeenCalledTimes(1);

    const resumed = vi.fn();
    const resumeHandle = lifecycle.onResume(resumed);
    resumeHandle[Symbol.dispose]();
    process.emit("SIGCONT");
    expect(resumed).not.toHaveBeenCalled();
  });

  it("T2.8 (I1): mode literals live in escapes.ts; each mode has one owner", () => {
    // 1 — the digits. SS15, scoped to escapes.ts, because I1 *requires* them to
    // be there: a rule saying "only in C01" would fail on the one file that
    // must contain them.
    const ss15 = SCANS.find((s) => s.id === "SS15");
    expect(ss15, "SS15 is gone from A03").toBeDefined();
    expect(ss15!.allow).toEqual(["src/terminal/escapes.ts"]);
    for (const form of ["\\x1b[?1049h", "[?25l", "[?2004h", "[?1002h", "[?1006l", "[?2026h"]) {
      expect(ss15!.pattern.test(form), form).toBe(true);
    }
    expect(checkSourceScans(srcFiles()).filter((v) => v.rule === "SS15")).toEqual([]);

    // 2 — the meaning. MG20, per sequence, so C03's transactional exception for
    // 2026 cannot widen into "C03 may use escapes".
    expect(checkModuleGraph(srcFiles()).filter((v) => v.rule === "MG20")).toEqual([]);

    const offender = 'import { ALT_SCREEN } from "./escapes.js";';
    const violations = checkModuleGraph(["src/terminal/frame-scheduler.ts"], () => offender).filter(
      (v) => v.rule === "MG20",
    );
    expect(violations, "C03 importing C01's mode must fail MG20").toHaveLength(1);
    expect(violations[0]!.message).toContain("lifecycle.ts");
  });

  it("T2.9 (I1): render() is never called with alternateScreen", () => {
    const ss34 = SCANS.find((s) => s.id === "SS34");
    expect(ss34, "SS34 is gone from A03").toBeDefined();
    expect(ss34!.allow).toEqual([]);
    expect(ss34!.pattern.test("render({ alternateScreen: true }, ui)")).toBe(true);

    expect(checkSourceScans(srcFiles()).filter((v) => v.rule === "SS34")).toEqual([]);
  });
});
