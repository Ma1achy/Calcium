// C06 tier 2 — contract. The properties C07, C08, C23 and L4 are written
// against: one interface with three implementations, one `end` on every path,
// and a component that reports without interpreting.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkModuleGraph } from "../../tools/enforce/module-graph.mjs";
import { checkSourceScans } from "../../tools/enforce/source-scans.mjs";
import {
  createFixtureTransport,
  createRouter,
  createSubprocessTransport,
} from "../../src/data/transport/index.js";
import type { RawPatch } from "../../src/data/transport/index.js";
import { fakeClock } from "../support/fake-scheduler.js";
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

/**
 * Code, with comment-only lines dropped — the same distinction
 * `checkSourceScans` makes, and for the same reason. Both assertions below fired
 * on their own explanatory prose before this existed, which is a rule reporting
 * the sentence that documents it.
 */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => {
      const start = line.trimStart();
      return !(start.startsWith("//") || start.startsWith("*") || start.startsWith("/*"));
    })
    .join("\n");
}

const SOURCES = (() => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = `${dir}/${name}`;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name)) out.push(p);
    }
  };
  walk("src/data/transport");
  return out;
})();

describe("C06 contract", () => {
  it("T2.1 (I15): the shared suite ran for all three transports", () => {
    // The assertion the tier-1 and tier-3 `describe.each` blocks make is spread
    // across those files; this is the one that fails if someone narrows the
    // list. Three, not two — and that is not a D43 violation:
    //
    //   D43 forbids tests *agreeing with an animated world* — asserting on
    //   values the emulator invents, so that drift in the world silently becomes
    //   the expected result. The shared suite asserts that three transports
    //   behave identically at the interface, over a handler returning a fixed
    //   envelope. Nothing treats the emulator as a source of truth about the far
    //   side, and C08's world never appears.
    //
    // Without this, someone reads `"emulated"` in the each-list, remembers D43,
    // and narrows the suite back to two (T6.15).
    expect(transportCases().map((c) => c.name)).toEqual(["fixture", "emulated", "subprocess"]);
  });

  it("T2.2 (I1, MG6): the module graph shows no C04 import, type-only included", () => {
    expect(checkModuleGraph(SOURCES)).toEqual([]);

    const violations = checkModuleGraph(["src/data/transport/subprocess.ts"], () =>
      'import type { ViewDocument } from "../viewmodel/types.js";',
    );
    // MG6 is the one module-graph rule for which an `import type` is an edge:
    // C06 I1 forbids the *reference*, and a type-only import erases at build,
    // which is exactly what would make it pass while being the dependency the
    // rule exists to catch.
    expect(violations.map((v) => v.rule)).toEqual(["MG6"]);
  });

  it("T2.3 (I2, SS25): no exit-code mapping and no ErrorLike construction in transport/", () => {
    expect(checkSourceScans(SOURCES)).toEqual([]);

    const fabricated = checkSourceScans(
      ["src/data/transport/subprocess.ts"],
      () => "if (exit.exitCode === 2) return invalid;",
    );
    expect(fabricated.map((v) => v.rule)).toEqual(["SS25"]);
  });

  it("T2.4 (I9): exactly one end patch, last, across six terminations", async () => {
    const clock = clockOf(fakeClock());
    const sub = (script: ScriptedChild): ReturnType<typeof createSubprocessTransport> =>
      createSubprocessTransport({ binary: "widget", clock, runner: fakeRunner(() => script) });

    const aborted = new AbortController();
    aborted.abort();

    const matrix: { name: string; patches: Promise<RawPatch[]> }[] = [
      { name: "clean exit", patches: drain(sub({ stdout: ['{"a":1}\n'] }).stream(invocation({ streams: true }))) },
      {
        name: "non-zero exit",
        patches: drain(sub({ stdout: ['{"a":1}\n'], exit: { code: 3, signal: null } }).stream(invocation({ streams: true }))),
      },
      {
        name: "cancel",
        patches: drain(sub({ exit: { code: null, signal: "SIGINT" } }).stream(invocation({ streams: true, signal: aborted.signal }))),
      },
      {
        name: "malformed stream",
        patches: drain(sub({ stdout: ["{oops\n{also oops\n"] }).stream(invocation({ streams: true }))),
      },
      {
        name: "spawn failure",
        patches: drain(
          createSubprocessTransport({
            binary: "nope",
            clock,
            runner: {
              ...fakeRunner(),
              spawn: (): never => {
                throw new Error("ENOENT");
              },
            },
          }).stream(invocation({ streams: true })),
        ),
      },
      {
        name: "fixture with no patches",
        patches: drain(createFixtureTransport([recorded({ result: [] })]).stream(invocation({ streams: true }))),
      },
    ];

    for (const { name, patches } of matrix) {
      const got = await patches;
      expect(got.filter((p) => p.kind === "end"), `${name}: not exactly one end`).toHaveLength(1);
      expect(got.at(-1)?.kind, `${name}: end is not last`).toBe("end");
    }
  });

  it("T2.6 (I13): after a hundred invocations across every settlement path, busy is false", async () => {
    const clock = clockOf(fakeClock());
    const scripts: ScriptedChild[] = [
      { exit: { code: 0, signal: null } },
      { exit: { code: 2, signal: null } },
      { exit: { code: null, signal: "SIGTERM" } },
      { stdout: ["not json"], exit: { code: 0, signal: null } },
    ];

    for (let i = 0; i < 100; i += 1) {
      const router = createRouter({
        default: createSubprocessTransport({
          binary: "widget",
          clock,
          runner: fakeRunner(() => scripts[i % scripts.length]!),
        }),
      });
      await router.for("ps").invoke(invocation());
      expect(router.busy, `invocation ${String(i)} left the guard held`).toBe(false);
    }
  });

  it("T2.7 (I16): the fixture transport reads no clock and replays deterministically", async () => {
    const corpus = [recorded({ result: result({ durationMs: 11 }) })];
    const transport = createFixtureTransport(corpus);

    const first = await transport.invoke(invocation());
    const second = await transport.invoke(invocation());

    // No clock, no randomness, no world — which is what makes it fit to run
    // tests against where the emulator is not (D43).
    expect(first).toEqual(second);
    expect(first.durationMs).toBe(11);

    // Mechanically: no clock reaches this file at all. SS1 already bans the
    // ambient forms tree-wide; what this adds is that the *injected* one is not
    // threaded here either, which is what "holds no world state" rests on.
    expect(code("src/data/transport/fixture.ts")).not.toMatch(/\bclock\b/);
  });

  it("T2.9 (I18): PRISM_TUI_TRANSPORT appears nowhere under src/", () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        const p = `${dir}/${name}`;
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(name)) out.push(p);
      }
      return out;
    };
    const offenders = walk("src").filter((f) => /PRISM_TUI_TRANSPORT/.test(code(f)));

    // The app's entry point reads it and passes a constructed router through
    // `TuiConfig.transport`. `tui-kit` ships no binary, and SS10 already forbids
    // the `process.env` that would be needed to read one.
    expect(offenders).toEqual([]);
  });
});

describe("C06 as C07 will read it", () => {
  it("T2.10: every RawResult field is a fact, and none is a judgement", async () => {
    const clock = clockOf(fakeClock());
    const transport = createSubprocessTransport({
      binary: "widget",
      clock,
      runner: fakeRunner(() => ({ stdout: ["{}"], stderr: ["warn"], exit: { code: 7, signal: null } })),
    });

    const r = await transport.invoke(invocation());

    // C07's whole input, and nothing in it presumes what a 7 means. The moment
    // one of these becomes a status, the mapping exists in two places.
    expect(r.exitCode).toBe(7);
    expect(Object.keys(r)).not.toContain("status");
    expect(Object.keys(r)).not.toContain("error");
    expect(Object.keys(r)).not.toContain("ok");
  });
});
