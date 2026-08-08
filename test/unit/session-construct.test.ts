// C22 §3 — the ten construction steps, asserted on the event log.
//
// **The order is the subject, so the assertions are about the sequence.** Per
// step checks — "the lifecycle was constructed", "the registries were sealed" —
// pass under any permutation of the thing three invariants are about, which is
// A03 §2's ordered-structure class. The log is compared against `STEPS`, and
// the pairwise checks below name which invariant each pair carries.
//
// Silence is the failure mode that makes this necessary: cleanup wired after
// the handlers that would call it still runs on every explicit exit path and
// stops running on signal paths only (I1).
import { describe, expect, it } from "vitest";

import { resolveConfig, type Ambient } from "../../src/shell/config.js";
import { constructGraph, STEPS, type FrameQueries } from "../../src/shell/construct.js";
import type { FileSystem, Pipeline, PipelineDeps, TuiConfig } from "../../src/shell/types.js";
import type { Manifest } from "../../src/data/manifest/types.js";
import { defaultTheme } from "../../src/presentation/theme/index.js";
import { fakeStdin, fakeStdout } from "../support/fake-terminal.js";
// The shared `ManifestDocument` — what an author writes. Construction parses it
// (C22 I23). This file deliberately imports no manifest internals: every
// construction harness used to reach through the package boundary for
// `parseManifest`, which is why both arms of `config.manifest` could be broken
// with the suite green.
import { MANIFEST } from "../support/session.js";
import { contextAt } from "../../src/interaction/completion/index.js";
import { noticeDoc } from "../../src/shell/documents.js";
import { block } from "../../src/data/viewmodel/index.js";
import { doc } from "../support/blocks.js";

import { producerContext } from "../support/producer-context.js";
function fakeFs(): FileSystem {
  const files = new Map<string, string>();
  return {
    readFile: (p) => Promise.resolve(files.get(p) ?? ""),
    writeFile: (p, d) => {
      files.set(p, d);
      return Promise.resolve();
    },
    appendFile: (p, d) => {
      files.set(p, (files.get(p) ?? "") + d);
      return Promise.resolve();
    },
    appendFileSync: (p, d) => void files.set(p, (files.get(p) ?? "") + d),
    mkdir: () => Promise.resolve(),
    // A real answer, not an empty list: C19's path and executable sources take
    // this, and a fake returning nothing makes a completion assertion pass for
    // the wrong reason (`test/support/README.md`).
    readDir: () =>
      Promise.resolve([
        { name: "src", directory: true },
        { name: "notes.md", directory: false },
      ]),
  };
}

const FRAME: FrameQueries = {
  copyMode: () => false,
  exitCopyMode: () => undefined,
  entryAtRow: () => null,
  region: () => ({ top: 1, height: 20 }),
  overlayRegion: () => ({ width: 80, height: 24 }),
  promptAnchor: () => ({ row: 21, rows: 1 }),
  mouseEnabled: () => false,
  raiseExitConfirm: () => undefined,
};

function ambient(platform: NodeJS.Platform = "linux"): Ambient {
  return {
    clock: () => 1_700_000_000_000,
    cwd: "/work",
    fs: fakeFs(),
    schedule: () => ({ [Symbol.dispose]: () => undefined }),
    platform,
  };
}

async function build(
  overrides: Partial<TuiConfig> = {},
  columns = 100,
  platform: NodeJS.Platform = "linux",
) {
  const stdout = fakeStdout({ columns, rows: 30 });
  const config = resolveConfig(
    {
      name: "prism",
      binary: "prism",
      manifest: MANIFEST,
      theme: defaultTheme,
      stateDir: "/state",
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: fakeStdin(),
      ...overrides,
    },
    ambient(platform),
  );

  const graph = await constructGraph(config, {
    stop: () => Promise.resolve(0),
    render: () => undefined,
    repaint: () => undefined,
    frame: FRAME,
    onFatal: (err) => {
      throw err;
    },
  });
  return { graph, stdout };
}

/**
 * One `notice` of 90 cells — one row at 100 columns, three at 40.
 *
 * **`notice`, not `raw`, and the mutation pass is what forced the distinction.**
 * `raw` is pre-formatted: its measurer counts lines and ignores width entirely
 * (C09 `simple.ts`), so a `raw` fixture measures the same at every width and a
 * viewport handed the wrong one agrees with a viewport handed the right one.
 * The fixture has to respond to the thing under test before it is asserted
 * against — `test/support/README.md` carries that rule.
 */
const wideDoc = (id: string) =>
  doc({
    command: id,
    blocks: [block({ kind: "notice", id, tone: "info", text: "x ".repeat(45).trim() })],
  });

const before = (log: readonly string[], a: string, b: string): boolean =>
  log.indexOf(a) !== -1 && log.indexOf(a) < log.indexOf(b);

describe("C22 §3 — construction order", () => {
  it("T1.1: every step runs once, in the order §3 declares", () => {
    // Against `STEPS`, not against a copy written here: a test carrying its own
    // list agrees with itself under any permutation of the list.
    return build().then(({ graph }) => {
      expect(graph.log).toEqual([...STEPS]);
      expect(new Set(graph.log).size).toBe(graph.log.length);
    });
  });

  it("T1.2 (I1): the stores and the runner precede the lifecycle", async () => {
    // The pair whose violation is silent. `beforeRelease` closes over the
    // history store and the runner, and C01's signal handlers exit after
    // releasing — so cleanup wired late works on `/exit` and stops working on
    // SIGTERM, with nothing failing in between.
    const { graph } = await build();
    expect(before(graph.log, "stores", "lifecycle"), "stores → lifecycle").toBe(true);
    expect(before(graph.log, "runner", "lifecycle"), "runner → lifecycle").toBe(true);
  });

  it("T1.3 (I2): the lifecycle precedes the scheduler, and nothing is acquired", async () => {
    // C01 registers its handlers at construction, which is what closes its
    // crash window — so the assertion is that construction completes with the
    // lifecycle built and `acquired` still false.
    const { graph, stdout } = await build();
    expect(before(graph.log, "lifecycle", "scheduler")).toBe(true);
    expect(graph.lifecycle.acquired, "construction acquires nothing").toBe(false);
    expect(stdout.output, "and emits no sequence").toBe("");
  });

  it("T1.4 (I3): the three registries with a seal are sealed, and C19 has none", async () => {
    // A count is the wrong assertion when one member of the set does not belong
    // to it. C19's engine has no `seal`: `register` returns a `Disposable`
    // because a dynamic source is meant to come and go (C19 §2).
    const { graph } = await build();

    expect([graph.blocks.sealed, graph.adapters.sealed, graph.manifest.sealed]).toEqual([
      true,
      true,
      true,
    ]);
    expect("seal" in graph.completion, "C19 has no seal to close").toBe(false);
    expect(before(graph.log, "seal", "register")).toBe(true);
  });

  it("T1.4b (commitment 3a): registration is its own step, after the pipeline", async () => {
    // **§3a's finding, as a test.** The submit handler closes over the pipeline
    // and the pipeline closes over the router, so registration cannot sit with
    // the router's construction — one of the two would have to exist before it
    // does.
    let sawRouter = false;
    const pipeline = (deps: { resetFocus: () => void }): Pipeline => {
      // The pipeline reaches the router at construction, which is half the cycle.
      deps.resetFocus();
      sawRouter = true;
      let sealed = false;
      return {
        submit: () => undefined,
        seal: () => void (sealed = true),
        // C16's new low rung reads these (C23 §8a, the subscription rung).
        liveStreams: 0,
        cancelNewestStream: () => false,
        get sealed() {
          return sealed;
        },
        // C16 rungs 1 and 2 read these (C23 §8a A1).
        inFlight: null,
        cancel: () => undefined,
        register: () => undefined,
        onAction: () => undefined,
        identityNotice: () => undefined,
      releaseView: () => undefined,
      visibilityChanged: () => undefined,
    producerContext: () => producerContext(),
    greeting: () => undefined,
      dispose: () => undefined,
      };
    };

    const { graph } = await build({ pipeline });

    expect(sawRouter, "the pipeline reached a constructed router").toBe(true);
    expect(before(graph.log, "router", "pipeline"), "9 → 10").toBe(true);
    expect(before(graph.log, "pipeline", "register"), "10 → 11").toBe(true);
    expect(graph.pipeline?.sealed, "I3's fourth seal, at step 10").toBe(true);
  });

  it("T1.4c: capabilities precede the registries, which precede the stores", async () => {
    // A block definition may vary by capability (A02 §3), and a record built
    // after the registries gives a table in ASCII beside a sparkline that is
    // not — the inconsistency C02 exists to prevent.
    const { graph } = await build();
    expect(before(graph.log, "capabilities", "registries")).toBe(true);
    expect(before(graph.log, "registries", "stores")).toBe(true);
  });

  it("T1.4d (I49): a config override reaches the capability record", async () => {
    // **The parameter existed and had no producer.** C02 I4 makes a valid
    // override win unconditionally, T1.9/T3.4/T3.5 test the rules and T5.5
    // asserts one on the wire — all of it satisfied while `construct.ts` passed
    // one argument and the only other caller was a test fixture.
    //
    // The environment says four-bit; the override says one. The detected value
    // is asserted alongside it, so the row cannot pass against a build that
    // ignores the environment as well.
    const detected = await build({ env: { TERM: "xterm" } });
    expect(detected.graph.capabilities.colourDepth).toBe(4);

    const forced = await build({ env: { TERM: "xterm" }, capabilities: { colourDepth: 1 } });
    expect(forced.graph.capabilities.colourDepth).toBe(1);
  });

  it("T1.4d (I49): altScreen is overridable, which is the case that makes it usable", async () => {
    // C02 I4 names `altScreen` specifically, and it is the field with
    // consequences: it is the sole hard refusal (C02 I7), and the only rule
    // producing `colourDepth: 1` — the `dumb` gate — clears it. So a
    // one-bit terminal is unreachable unless both can be said at once, which is
    // the whole reason the degradation showcase found this.
    const dumb = await build({ env: { TERM: "dumb" } });
    expect(dumb.graph.capabilities.altScreen).toBe(false);

    const forced = await build({
      env: { TERM: "dumb" },
      capabilities: { colourDepth: 1, altScreen: true },
    });
    expect(forced.graph.capabilities).toMatchObject({ colourDepth: 1, altScreen: true });
  });

  it("T1.4d (I49): a bad override is rejected, and the detected value stands", async () => {
    // C02 validates; C22's duty is only that they arrive. Asserted here because
    // a producer that filtered on the way past would be a second validator, and
    // two validators is how the two disagree.
    const { graph } = await build({
      env: { TERM: "xterm-256color" },
      capabilities: { colourDepth: 12 as 1 },
    });
    expect(graph.capabilities.colourDepth).toBe(8);
  });

  it("T1.14 (C01 I13): the viewport is built against the real terminal width", async () => {
    // The pair §3a could not see, because the constraint lives in C01. The
    // viewport takes width and height at step 5; only `lifecycle.ts` may read
    // them; and the lifecycle is step 7 and cannot move, because I1. Resolved
    // by C01 I13 being a rule about a *file*, so the read is a free function.
    //
    // **The mutation pass rewrote this test.** It first asserted
    // `lifecycle.size()`, which reads the terminal directly and is therefore
    // true whatever the viewport was handed — so replacing the read with a
    // hardcoded 80 x 24 survived. The width has to be observed *through* the
    // viewport, and the only way to see it is a document whose height depends
    // on it: same content, two terminals, and the two must disagree.
    // One long line per entry: one row at 100 columns, three at 40. Same
    // content into both, so the only difference is the width each viewport was
    // constructed with.
    const wide = await build();
    const narrow = await build({}, 40);
    for (const g of [wide.graph, narrow.graph]) {
      for (let i = 0; i < 40; i += 1) g.transcript.append(wideDoc(`e${i}`));
      g.viewport.scrollToBottom();
    }

    expect(before(wide.graph.log, "stores", "lifecycle")).toBe(true);
    expect(
      wide.graph.viewport.visible().entries.length,
      "at 100 columns each line is one row, so more entries fit",
    ).toBeGreaterThan(narrow.graph.viewport.visible().entries.length);
  });

  it("T3.15 (I7, §8a): a fault before the lifecycle leaves nothing to clean up", async () => {
    // The named cell of the shutdown trace. The code must know no cleanup is
    // needed **without a flag** — and it does, because there is no lifecycle to
    // release: the variable is undefined precisely because construction did not
    // reach step 7.
    const stdout = fakeStdout();
    const config = resolveConfig(
      {
        name: "prism",
        binary: "prism",
        manifest: MANIFEST,
        theme: defaultTheme,
        stateDir: "/state",
        stdout: stdout as unknown as NodeJS.WriteStream,
        stdin: fakeStdin(),
        blocks: [{ kind: "rule" } as never],
      },
      ambient(),
    );

    await expect(
      constructGraph(config, {
        stop: () => Promise.resolve(0),
        render: () => undefined,
        repaint: () => undefined,
        frame: FRAME,
        onFatal: (err) => {
          throw err;
        },
      }),
    ).rejects.toThrow(/construction failed at step `registries`/);

    expect(stdout.output, "nothing acquired, so nothing to restore").toBe("");
  });

  // --- step 10's handover (§3a step 10, C23 §8a A1) -------------------------
  //
  // **New production code with no consumer until C23**, which is exactly the
  // state in which C22's own cliff found six deferrals expiring against wiring
  // that was not there. The seam is asserted here rather than waiting for the
  // component that will use it.

  /** Captures what step 10 hands over, with a pipeline that does nothing else. */
  async function captureDeps(
    overrides: Partial<TuiConfig> = {},
    platform: NodeJS.Platform = "linux",
  ) {
    let seen: PipelineDeps | null = null;
    await build(
      {
      ...overrides,
        pipeline: (deps) => {
          seen = deps;
          return {
            submit: () => undefined,
            seal: () => undefined,
            sealed: true,
            liveStreams: 0,
            cancelNewestStream: () => false,
            inFlight: null,
            cancel: () => undefined,
            register: () => undefined,
            onAction: () => undefined,
            identityNotice: () => undefined,
      releaseView: () => undefined,
      visibilityChanged: () => undefined,
    producerContext: () => producerContext(),
    greeting: () => undefined,
      dispose: () => undefined,
          };
        },
      },
      100,
      platform,
    );
    expect(seen, "step 10 ran").not.toBeNull();
    return seen as unknown as PipelineDeps;
  }

  it("step 10 hands C23 a live session read, not a snapshot", () => {
    // **The correction, asserted.** It was `session: SessionSnapshot`, evaluated
    // once here, against a store that freezes a *fresh* object per write — so
    // the value could never change and C23 I12's `stopping` was false forever.
    // T3.15 lands with C23; this is the half that can be checked without it.
    return captureDeps().then((deps) => {
      expect(deps.session().cwd).toBe("/work");
      deps.writes.setCwd("/moved");
      expect(deps.session().cwd, "a snapshot would still read /work").toBe("/moved");
    });
  });

  it("step 10 hands over only C23's four writers", () => {
    // Not the whole `SessionStore`: `beginStopping` and the identity loop's
    // `refresh` within the pipeline's reach is the two-writer problem §5 exists
    // to prevent.
    return captureDeps().then((deps) => {
      expect(Object.keys(deps.writes).sort()).toEqual([
        "setCwd",
        "setEnv",
        "setLastUuid",
        "setRetained",
      ]);
      expect("beginStopping" in deps.writes).toBe(false);
      expect("refresh" in deps.writes).toBe(false);
    });
  });

  it("step 10 builds a default transport when the app supplies none", () => {
    // **C22 owed this and never built it**, because nothing consumed it:
    // `resolveConfig` passed `transport` through possibly-undefined and the
    // graph had no field for one. A02 §3 and C22 §2 both say subprocess.
    return captureDeps().then((deps) => {
      expect(deps.transport, "a router, not undefined").not.toBeUndefined();
      expect(typeof deps.transport.for, "and it routes by verb").toBe("function");
      expect(deps.transport.busy).toBe(false);
    });
  });

  it("T1.4d (I22): a config with no `pipeline` still gets one, and it is sealed", async () => {
    // **The default, asserted.** `resolveConfig` passed `pipeline` through
    // undefined and `constructGraph` answered `null`, so a production
    // `createTui` built a shell whose submit handler was `pipeline?.submit(…)`
    // — a no-op. Nothing failed, because only the tests ever supplied one.
    const { graph } = await build();

    expect(graph.pipeline, "a real C23, not null").not.toBeNull();
    expect(typeof graph.pipeline.submit).toBe("function");
    expect(graph.pipeline.sealed, "and step 10's seal ran on it (I3)").toBe(true);

    // The injection point still injects, or the default has replaced the seam
    // rather than filled it (C22 I22).
    const injected = { seal: () => undefined, sealed: true } as unknown as Pipeline;
    const { graph: withOwn } = await build({ pipeline: () => injected });
    expect(withOwn.pipeline).toBe(injected);
  });

  it("T1.4e (I23, I23a): an author's own document constructs, and gains the six", async () => {
    // **Inverted.** This row used to assert the opposite — that a hand-built
    // manifest is *refused*, naming the verbs it lacks. The refusal was right
    // about the danger and left no accepted input: an author cannot produce a
    // `Manifest`, because `appTools` and the framework's six are both derived by
    // `parseManifest`, which is exported from no entry point. Construction now
    // parses whichever arm arrives, so the document below is what an author
    // writes and it works.
    const authored = {
      schema: "tui.manifest/1",
      binary: "prism",
      version: "1.0.0",
      tools: [],
    } as unknown as TuiConfig["manifest"];

    const { graph } = await build({ manifest: authored });
    const names = graph.manifest.manifest?.tools.map((t) => t.name) ?? [];
    expect(names).toEqual(
      expect.arrayContaining(["help", "clear", "theme", "history", "debug", "exit"]),
    );
    // Derived, not supplied: the author wrote none of them.
    expect(graph.manifest.manifest?.appTools).toEqual([]);
  });

  it("T1.4l (C22 I23): an already-parsed Manifest fails on the duplicate check", async () => {
    // The refusal that used to live in C22 is C05's now, and this is the row
    // that says it still happens. Handing back the parser's own output means the
    // framework's verbs arrive twice, and I6 refuses duplicate names — loudly,
    // and for free, with no rule added for the case.
    const { graph } = await build();
    const alreadyParsed = graph.manifest.manifest as unknown as TuiConfig["manifest"];

    await expect(build({ manifest: alreadyParsed })).rejects.toThrow(/help/);
  });

  it("T1.4o (C22 I23b): a parsed Manifest does not type-check as config.manifest", async () => {
    // **A type-level row, and it has to be.** The defect this holds is a call
    // that *compiles* — `manifest: parseManifest(doc).value` — so there is no
    // runtime assertion that can see it. T1.4l above proves construction throws,
    // and it needed `as unknown as` to make the call at all, which is exactly
    // how a runtime row hides a type that permits the mistake.
    //
    // `@ts-expect-error` inverts the usual direction: `tsc` fails if the line
    // below ever stops being an error. So the day `ManifestDocument` loses its
    // `appTools?: never` and goes back to a bare `Omit`, `npm run check` breaks
    // on an unused directive — the only mechanism that fails when a *type* gets
    // weaker.
    //
    // It merged once already: tier 5's session harness made this call, forty-four
    // rows failed, and `make all` was reported green off a piped exit code.
    //
    // **The value is a `Manifest` literal, not `graph.manifest.manifest`**, and
    // the first draft used the latter. That field is `Manifest | null`, so the
    // assignment failed on the `null` and `@ts-expect-error` was satisfied
    // whether or not `appTools` was excluded — the row passed identically
    // against the broken type. Caught by mutating the type and watching nothing
    // happen, which is the only thing that asks a type-level assertion whether
    // it can be violated. The convenient setup was the one where both readings
    // agree.
    const parsed: Manifest = {
      schema: "tui.manifest/1",
      binary: "prism",
      version: "1.0.0",
      tools: [],
      appTools: [],
    };

    // @ts-expect-error a parsed Manifest carries `appTools` and is not a document
    const asConfig: TuiConfig["manifest"] = parsed;
    expect(asConfig).toBeDefined();
  });

  it("an app-supplied transport is passed through untouched", () => {
    const supplied = { for: () => ({}) as never, busy: false, inFlight: null };
    return captureDeps({ transport: supplied }).then((deps) => {
      expect(deps.transport).toBe(supplied);
    });
  });

  it("the default opener spawns and never shells (C23 I17, D18)", async () => {
    // A URL from a far-side envelope is untrusted data. `spawnShell("open " +
    // url)` would be an injection through the one path that otherwise has none,
    // so the URL travels as an argv element where no shell reads it as syntax.
    // The fabricated URL is one that *would* be an injection if it were shelled.
    const deps = await captureDeps();
    const spawned: string[][] = [];
    const shelled: string[] = [];
    const runner = deps.runner as unknown as {
      spawn: (argv: readonly string[], o: unknown) => unknown;
      spawnShell: (c: string, o: unknown) => unknown;
    };
    const realSpawn = runner.spawn.bind(runner);
    runner.spawn = (argv) => {
      spawned.push([...argv]);
      return { running: false } as never;
    };
    runner.spawnShell = (command) => {
      shelled.push(command);
      return { running: false } as never;
    };

    await deps.openUrl(new URL("https://example.com/a;rm%20-rf%20~"));

    expect(shelled, "no path reaches a shell").toEqual([]);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]?.[0], "the OS handler for the platform").toBe("xdg-open");
    expect(spawned[0]?.[1], "the URL is one argument, not a fragment of a command")
      .toBe("https://example.com/a;rm%20-rf%20~");
    void realSpawn;
  });

  it("the opener's command follows the platform", async () => {
    // Three platforms, because a single case passes on whichever one the suite
    // happens to run on and says nothing about the other two. The platform
    // travels through `Ambient`, so this drives the real resolution rather than
    // the table in isolation — an earlier version of this test passed `linux`
    // three times and asserted only the URL, which is a test asserting nothing.
    for (const [platform, command] of [
      ["darwin", "open"],
      ["win32", "start"],
      ["linux", "xdg-open"],
    ] as const) {
      const deps = await captureDeps({}, platform);
      const spawned: string[][] = [];
      (deps.runner as unknown as { spawn: (a: readonly string[]) => unknown }).spawn = (argv) => {
        spawned.push([...argv]);
        return { running: false } as never;
      };

      await deps.openUrl(new URL("https://example.com/"));
      expect(spawned[0]?.[0], platform).toBe(command);
    }
  });

  it("the router reads inFlight as a pull, not a value captured at step 9", async () => {
    // **The 10 → 9 pair, asserted** (§3a). The router is built at step 9 and the
    // pipeline at step 10, so `RouterDeps.inFlight` closes over a binding that
    // does not exist yet — an eighteenth pull among seventeen, and the reason
    // the ordering did not have to change.
    //
    // Captured rather than pulled, this reads `null` forever and Ctrl-C takes a
    // lower rung over a running verb, which is C23 §8a A1 restored by its own
    // fix. So the test moves the value *after* construction and asserts the
    // router sees it.
    let route: "app" | "local" | "shell" | null = null;
    let cancelled = 0;
    const graph = await build({
      pipeline: () => ({
        submit: () => undefined,
        seal: () => undefined,
        sealed: true,
        liveStreams: 0,
        cancelNewestStream: () => false,
        get inFlight() {
          return route;
        },
        cancel: () => void (cancelled += 1),
        register: () => undefined,
        onAction: () => undefined,
        identityNotice: () => undefined,
      releaseView: () => undefined,
      visibilityChanged: () => undefined,
    producerContext: () => producerContext(),
    greeting: () => undefined,
      dispose: () => undefined,
      }),
    });

    const ctrlC = { kind: "key", key: { name: "c", ctrl: true } } as never;

    graph.graph.router.dispatch(ctrlC);
    expect(cancelled, "idle: rung 1 declines").toBe(0);

    route = "app";
    graph.graph.router.dispatch(ctrlC);
    expect(cancelled, "a value captured at step 9 would still read null").toBe(1);
  });
});

describe("C22 §2a — the app's local handlers", () => {
  it("T1.4j (C22 I3a): a local verb constructs with a handler and fails without one", async () => {
    // **Both halves, and the failure alone is what shipped.** C23 I27 refuses a
    // manifest verb marked `local` with no handler, correctly — and there was
    // no route for an app to supply one, so a manifest declaring a local verb
    // could not start a session at all. On its own the refusal reads as the
    // check working rather than as a missing half.
    const local = {
      schema: "tui.manifest/1",
      binary: "widget",
      version: "1.0.0",
      tools: [{ name: "guide", local: true, summary: "an app verb", args: [], flags: [] }],
    } as const;
    await expect(build({ manifest: local })).rejects.toThrow(/guide/);

    const { graph } = await build({
      manifest: local,
      localHandlers: {
        // `meta` stripped: a local handler's answer is not a document (F13) —
        // `runLocal` fills all seven fields, so a double supplying `origin` is
        // inventing one the shell holds.
        guide: () => {
          const { meta, ...rest } = noticeDoc("guide", "the app's own verb", "info", {
            origin: "user",
          });
          void meta;
          return Promise.resolve(rest);
        },
      },
    });
    expect(graph.pipeline.sealed, "and the registry still seals").toBe(true);
  });
});

describe("C22 §2b — the completion sources", () => {
  it("T1.4k (C22 I3b): the framework's sources are registered, filesystem ones included", async () => {
    // **Both halves.** §2 called manifest-derived completion a working default
    // and construction registered `config.completionSources` alone, which is
    // empty — so `Tab` produced no candidates in any real session while every
    // C19 tier passed on every source. A test that checked only the verb source
    // would pass against a wiring that forgot the two with a dependency.
    const { graph } = await build();

    // `/hel` rather than an app verb: this harness's manifest carries the
    // framework's six and nothing else, so a probe for `serving` would report
    // an empty result about the *manifest* while looking like a finding about
    // the wiring — which is what it did on the first attempt.
    const verbs = await graph.completion.request(
      contextAt("/hel", 4, graph.manifest.manifest),
      1,
    );
    expect(
      verbs.candidates.map((c) => c.value),
      "the manifest's verbs, through the verb source",
    ).toContain("/help");

    const paths = await graph.completion.request(
      contextAt("cat ./no", 8, graph.manifest.manifest),
      2,
    );
    expect(
      paths.candidates.map((c) => c.value).join(" "),
      "and the injected readDir, through the path source",
    ).toContain("notes.md");
  });
});
