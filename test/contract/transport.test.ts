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
import {
  createEmulatedTransport as publicEmulated,
  createFixtureTransport as publicFixture,
  createRouter as publicRouter,
  createTransport as publicFactory,
} from "../../src/index.js";
import type {
  Fixture as PublicFixture,
  FixtureHandler as PublicHandler,
  RawPatch as PublicRawPatch,
  RawResult as PublicRawResult,
  TransportDeps as PublicDeps,
} from "../../src/index.js";
import type { RawPatch, RawResult } from "../../src/data/transport/index.js";
import { fakeClock } from "../support/fake-scheduler.js";
import {
  PARITY_EXEMPT,
  clockOf,
  compareResults,
  drain,
  endResultOf,
  fakeRunner,
  invocation,
  rawResultKeys,
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

  describe("T2.1 (I24): parity compares the complete RawResult", () => {
    // The gap that let a real divergence through. The suite compared `stdout`,
    // `exitCode` and the shape of the patch sequence, `argv` diverged, and
    // nothing went red until C08 recorded and replayed the same invocation.
    //
    // A suite that picks fields is a suite with holes exactly where nobody
    // looked, so the comparison is over the union of both records' keys and the
    // exemptions are a closed, reasoned list.
    const answer = result({
      argv: ["widget", "ps", "--mine", "--json"],
      stdout: { rows: [7] },
      stdoutRaw: '{"rows":[7]}',
    });
    const argv = ["ps", "--mine"];
    const inv = (): ReturnType<typeof invocation> => invocation({ argv, streams: false });

    async function settledEach(): Promise<Map<string, RawResult>> {
      const out = new Map<string, RawResult>();
      for (const c of transportCases()) {
        out.set(c.name, await c.make(answer, undefined, argv).invoke(inv()));
      }
      return out;
    }

    it("every field agrees on the settled path, or is named as exempt", async () => {
      const byName = await settledEach();
      const base = byName.get("subprocess");
      if (base === undefined) throw new Error("the subprocess case is the reference");

      for (const [name, r] of byName) {
        if (name === "subprocess") continue;
        expect(compareResults(base, r), `${name} diverges from subprocess`).toEqual([]);
      }
    });

    it("every field agrees inside the terminal `end` patch too", async () => {
      // The easier half to forget. `data`, `malformed` and `degraded` patches
      // are already compared whole, so the streaming assertions read as covered
      // while carrying the same gap one level down.
      // The stored `end` has to be what a real stream of these patches actually
      // settles to, or the comparison reports a harness mismatch and calls it a
      // divergence. A streaming run reads NDJSON, so there is no single parsed
      // document: `stdout` is undefined and `stdoutRaw` is the lines as they
      // arrived.
      const streamed = result({
        argv: ["widget", "ps", "--mine", "--json"],
        stdout: undefined,
        stdoutRaw: '{"n":1}\n',
      });
      const patches: RawPatch[] = [
        { kind: "data", value: { n: 1 } },
        { kind: "end", result: streamed },
      ];

      const ends = new Map<string, RawResult>();
      for (const c of transportCases()) {
        const seen = await drain(
          c.make(answer, patches, argv).stream(invocation({ argv, streams: true })),
        );
        ends.set(c.name, endResultOf(seen));
      }

      const base = ends.get("subprocess");
      if (base === undefined) throw new Error("the subprocess case is the reference");
      for (const [name, r] of ends) {
        if (name === "subprocess") continue;
        expect(compareResults(base, r), `${name}'s end result diverges`).toEqual([]);
      }
    });

    it("a replayed fixture is never overflowed, and the subprocess transport reports when it was", async () => {
      // `overflowed` is the first field added since field-completeness was
      // built, so it is that mechanism's own test: the day C21 gave the
      // subprocess transport an answer, the other two had to have one.
      //
      // Asserted rather than left to default. An absent field and a `false` one
      // read identically at a call site and differently in a comparison, and
      // that difference is exactly the hole `argv` fell through.
      const byName = await settledEach();
      for (const [name, r] of byName) {
        expect(r.overflowed, `${name} did not report overflowed`).toBe(false);
      }

      // And the value is carried rather than hardcoded: a child that crossed the
      // bound says so through the transport, or the field is decoration.
      const overflowing = createSubprocessTransport({
        binary: "widget",
        clock: clockOf(fakeClock()),
        runner: fakeRunner(() => ({
          stdout: ["{}"],
          exit: { code: 0, signal: null },
          overflowed: true,
        })),
      });

      expect((await overflowing.invoke(invocation())).overflowed).toBe(true);
    });

    it("the exemption list is closed, and every entry carries a reason", () => {
      // A field is exempt by being named, never by not being looked at. Adding a
      // field to `RawResult` now fails here until someone either makes it agree
      // or writes down why it cannot.
      for (const field of Object.keys(PARITY_EXEMPT)) {
        expect(rawResultKeys(), `${field} is exempt but not a RawResult field`).toContain(field);
        expect(PARITY_EXEMPT[field]?.length ?? 0).toBeGreaterThan(20);
      }
      expect(Object.keys(PARITY_EXEMPT)).toEqual(["durationMs"]);
    });

    it("T6.18: a divergence in any unexempt field fails the comparison", () => {
      // Fabricated, because a comparison nobody has watched fail is one nobody
      // knows the shape of — and this one passed through a real divergence.
      for (const field of rawResultKeys()) {
        if (field in PARITY_EXEMPT) continue;
        const left = result();
        const right = { ...result(), [field]: field === "exitCode" ? 9 : "different" };
        expect(
          compareResults(left, right as RawResult).map((m) => m.field),
          `a divergence in ${field} went unreported`,
        ).toEqual([field]);
      }
    });

    it("T6.18: an omitted field is a divergence, not an absence", () => {
      // The union of both records' keys, not one side's. A transport that
      // dropped a field would otherwise pass.
      const { stderr: _gone, ...missing } = result();
      expect(compareResults(result(), missing as RawResult).map((m) => m.field)).toEqual(["stderr"]);
    });
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
    // `TuiConfig.transport`. Calcium ships no binary, and SS10 already forbids
    // the `process.env` that would be needed to read one.
    expect(offenders).toEqual([]);
  });
});

describe("C06 §2 — the constructors are on the runtime entry (C24 §3)", () => {
  it("T2.11: every arm of TransportDeps is constructible from `@fmx/calcium`, and a router from the result", async () => {
    // **This row is the consumer** the export needs (CLAUDE.md: an export nothing
    // consumes is forbidden), and it is written against the entry rather than
    // the barrel because the barrel already had all four. The defect was that a
    // consumer could name `TransportRouter` — `TuiConfig.transport`'s type — and
    // no function on the entry produced one: three arms published in C06 §2,
    // one constructor reachable, and that one the shell's own `subprocess`
    // default. Each arm is built through the factory *and* through its own
    // constructor, and the two answer an invocation identically (C08 I13's
    // substitutability, read from outside the package).
    // Annotated from the entry on purpose: MG29 fired on the functions alone,
    // because `Fixture`, `FixtureHandler` and `TransportDeps` were interior and a
    // consumer writing these three lines could not have named their types.
    const corpus: readonly PublicFixture[] = [recorded()];
    const handler: PublicHandler = (): PublicRawResult =>
      result({ stdoutRaw: '{"rows":[1]}', stdout: { rows: [1] } });
    const runner = fakeRunner(() => ({
      stdout: ['{"rows":[]}\n'],
      exit: { code: 0, signal: null },
    }));
    const clock = clockOf(fakeClock());
    const deps: Readonly<Record<"fixture" | "emulated" | "subprocess", PublicDeps>> = {
      fixture: { mode: "fixture", corpus },
      emulated: { mode: "emulated", handler },
      subprocess: { mode: "subprocess", binary: "widget", runner, clock },
    };

    const viaFactory = {
      fixture: publicFactory(deps.fixture),
      emulated: publicFactory(deps.emulated),
      subprocess: publicFactory(deps.subprocess),
    };
    const direct = {
      fixture: publicFixture(corpus),
      emulated: publicEmulated(handler),
    };

    const inv = invocation({ verb: "ps", argv: ["ps"] });
    expect(await viaFactory.fixture.invoke(inv)).toEqual(await direct.fixture.invoke(inv));
    expect(await viaFactory.emulated.invoke(inv)).toEqual(await direct.emulated.invoke(inv));
    // The three arms are distinguishable by what they answer, so this is three
    // transports and not one constructor reached three ways.
    expect((await viaFactory.fixture.invoke(inv)).stdoutRaw).toBe('{"rows":[]}');
    expect((await viaFactory.emulated.invoke(inv)).stdoutRaw).toBe('{"rows":[1]}');
    const sub = await viaFactory.subprocess.invoke(inv);
    expect(runner.spawns, "the subprocess arm spawned").toHaveLength(1);
    expect(sub.exitCode).toBe(0);

    // The streaming half of the interface answers in the published patch type,
    // ending in one `end` (I9) whose result is the same document.
    const patches: PublicRawPatch[] = await drain(direct.fixture.stream(inv));
    expect(endResultOf(patches).stdoutRaw).toBe('{"rows":[]}');

    // And a router — the value `TuiConfig.transport` takes — from the entry too.
    // `for` returns the transport wrapped in the busy latch (I13), so the
    // routing is read from what each verb answers rather than by identity.
    const router = publicRouter({ default: direct.fixture, overrides: { logs: direct.emulated } });
    expect((await router.for("ps").invoke(inv)).stdoutRaw).toBe('{"rows":[]}');
    expect((await router.for("logs").invoke(invocation({ verb: "logs", argv: ["logs"] }))).stdoutRaw).toBe(
      '{"rows":[1]}',
    );
    expect(
      (await router.for("unmapped").invoke(inv)).stdoutRaw,
      "an unmapped verb gets the default (I14)",
    ).toBe('{"rows":[]}');
    expect(router.busy).toBe(false);
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
