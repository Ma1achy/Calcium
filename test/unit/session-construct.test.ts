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
import type { FileSystem, Pipeline, TuiConfig } from "../../src/shell/types.js";
import { defaultTheme } from "../../src/presentation/theme/index.js";
import { fakeStdout } from "../support/fake-terminal.js";
import { block } from "../../src/data/viewmodel/index.js";
import { doc } from "../support/blocks.js";

const MANIFEST = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [],
} as unknown as TuiConfig["manifest"];

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
    exists: (p) => Promise.resolve(files.has(p)),
  };
}

const FRAME: FrameQueries = {
  copyMode: () => false,
  exitCopyMode: () => undefined,
  entryAtRow: () => null,
  region: () => ({ top: 1, height: 20 }),
  overlayRegion: () => ({ width: 80, height: 24 }),
  mouseEnabled: () => false,
  raiseExitConfirm: () => undefined,
};

function ambient(): Ambient {
  return { clock: () => 1_700_000_000_000, cwd: "/work", fs: fakeFs() };
}

async function build(overrides: Partial<TuiConfig> = {}, columns = 100) {
  const stdout = fakeStdout({ columns, rows: 30 });
  const config = resolveConfig(
    {
      name: "prism",
      binary: "prism",
      manifest: MANIFEST,
      theme: defaultTheme,
      stateDir: "/state",
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: { isRaw: false } as unknown as NodeJS.ReadStream,
      ...overrides,
    },
    ambient(),
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
        get sealed() {
          return sealed;
        },
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
        stdin: { isRaw: false } as unknown as NodeJS.ReadStream,
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
});
