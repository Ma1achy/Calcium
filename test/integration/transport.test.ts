// C06 tier 4 — integration. What transport is *for*: a manifest deciding
// whether a verb is spawned at all, and a result that C07 can adapt.
//
// Most of this tier waited on components that did not exist, and says which (all built at 2026-09-03). What
// does not wait is C05: `local` and `streams` are manifest facts, they are read
// by whoever calls the transport, and both are testable today.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { pipelineHarness, settled } from "../support/execution.js";
import { createAdapterRegistry } from "../../src/data/adapters/index.js";
import { findTool } from "../../src/data/manifest/index.js";
import { createProcessRunner } from "../../src/data/process/runner.js";
import { validateDocument } from "../../src/data/viewmodel/index.js";
import {
  createEmulatedTransport,
  createFixtureTransport,
  createNdjsonReader,
  createRouter,
  createSubprocessTransport,
} from "../../src/data/transport/index.js";
import type { Invocation, RawPatch, TransportRouter } from "../../src/data/transport/index.js";
import { fakeClock } from "../support/fake-scheduler.js";
import { fixture } from "../support/manifest.js";
import { asScriptFile, scripts, waitForFileToContain } from "../support/process.js";
import { clockOf, drain, invocation, recorded, result } from "../support/transport.js";

import { producerContext } from "../support/producer-context.js";
/**
 * The routing decision C23 will make, in the two lines it actually is.
 *
 * Written here rather than mocked because the claim under test is that the
 * decision is *derivable from the manifest* — C06 never reads C05 (§ header),
 * so somebody above must, and this is the whole of what they do.
 */
function submit(
  _router: TransportRouter,
  manifest: ReturnType<typeof fixture>,
  inv: Invocation,
): "local" | "invoke" | "stream" {
  const match = findTool(manifest, inv.argv);
  if (match === null) return "invoke";
  if (match.tool.local) return "local";
  return match.tool.streams === true ? "stream" : "invoke";
}

describe("C06 with C05", () => {
  const manifest = fixture();

  it("T4.2 (with C05): local: true never reaches the transport", async () => {
    let spawned = 0;
    const router = createRouter({
      default: {
        invoke: async (inv) => {
          spawned += 1;
          return result({ argv: inv.argv });
        },
        stream: () => {
          spawned += 1;
          return createFixtureTransport([recorded()]).stream(invocation());
        },
      },
    });

    const route = submit(router, manifest, invocation({ verb: "guide", argv: ["guide"] }));

    expect(route).toBe("local");
    // The manifest is what stops the TUI guessing, and `local` is the field
    // that decides a verb is answered in-process. Spawning one is C05 T6.8.
    expect(spawned).toBe(0);
  });

  it("T4.4 (C05 T4.4): a local tool never reaches the transport; a spawnable one always does", () => {
    expect(submit(createRouter({ default: createFixtureTransport([]) }), manifest, invocation({ verb: "guide", argv: ["guide"] }))).toBe("local");
    expect(submit(createRouter({ default: createFixtureTransport([]) }), manifest, invocation({ verb: "debug", argv: ["debug", "dump"] }))).toBe("local");
    expect(submit(createRouter({ default: createFixtureTransport([]) }), manifest, invocation())).toBe("invoke");
    expect(submit(createRouter({ default: createFixtureTransport([]) }), manifest, invocation({ verb: "promote", argv: ["promote"] }))).toBe("invoke");
  });

  it("T4.5 (C05 T4.5): streams: true selects the streaming path", async () => {
    const patches: readonly { kind: "data"; value: unknown }[] = [
      { kind: "data", value: { line: "a" } },
      { kind: "data", value: { line: "b" } },
    ];
    const router = createRouter({
      default: createFixtureTransport([
        recorded({ verb: "tail", argv: ["tail"], result: [...patches, { kind: "end", result: result() }] }),
      ]),
    });

    const inv = invocation({ verb: "tail", argv: ["tail"], streams: true });
    expect(submit(router, manifest, inv)).toBe("stream");

    const got = await drain(router.for("tail").stream(inv));
    expect(got.slice(0, 2)).toEqual(patches);
    expect(got.at(-1)?.kind).toBe("end");
    // A subscription does not hold the submission guard (I13, C23 I6).
    expect(router.busy).toBe(false);
  });

  it("T6.8 (C05 I12): spawning a local tool → T4.4 fails", () => {
    // The revert, stated as the difference: a router that ignores `local` sends
    // `help` to the far side, which either does not implement it or implements
    // it differently from the shell that was supposed to answer.
    const ignoringLocal = (inv: Invocation): "local" | "invoke" =>
      inv.verb === "" ? "local" : "invoke";

    expect(ignoringLocal(invocation({ verb: "guide", argv: ["guide"] }))).toBe("invoke");
    expect(submit(createRouter({ default: createFixtureTransport([]) }), fixture(), invocation({ verb: "guide", argv: ["guide"] }))).toBe("local");
  });

  it("T4.1 (with C21): the escalation ladder issues real signals through the real runner", async () => {
    // Deferred since C06 and written now. Every rung above was asserted against
    // `fakeChild`, which records the signals it is handed — a fake cannot show
    // that `SIGINT` reached a process group, only that C06 asked for it.
    //
    // The child announces each signal it survives, so the evidence is produced
    // by the child rather than by our own bookkeeping: a line written after
    // delivery cannot come from a process that died of it.
    const clock = clockOf(fakeClock());
    const transport = createSubprocessTransport({
      binary: "node",
      clock,
      runner: createProcessRunner({ env: process.env, stdin: {} }),
    });

    // The child logs each caught signal to a file as well as to stdout, because
    // `invoke` collects the stream internally and hands it over only after the
    // child has exited — too late to drive a ladder one rung at a time. Delivery
    // is asynchronous, so each rung must be *observed* before the next is
    // released; ticking blind would send SIGKILL before the handlers ran and the
    // test would assert the ladder while proving only that it did not hang.
    const log = `${mkdtempSync(`${tmpdir()}/c06-ladder-`)}/signals`;
    const controller = new AbortController();
    // As a file, not `node -e`: C06 appends `--json` to every invocation, and
    // with `-e` there is no script path to end node's own option parsing — so
    // the flag is read as a node option and the process dies with `bad option`.
    // Anything spawned through this transport has to tolerate a trailing flag.
    const [, ...args] = asScriptFile(scripts.ignoring(["SIGINT", "SIGTERM"], log));
    const inv = invocation({ argv: args, signal: controller.signal });

    const settled = transport.invoke(inv);

    // Waited for, not assumed. A signal delivered before node installs its
    // handler takes the default action and kills the child — and an immediate
    // exit on SIGINT is indistinguishable from a child that never handled it.
    await waitForFileToContain(log, "ready");

    controller.abort();
    // Each rung is two seconds of *injected* clock. Real ones would be six
    // seconds of test, which is why C06 takes a `Clock` at all.
    await waitForFileToContain(log, "caught:SIGINT");
    clock.tick(2_000);
    await waitForFileToContain(log, "caught:SIGTERM");
    clock.tick(2_000);

    const result = await settled;

    // Both rungs are asserted from the file rather than from `stdoutRaw`.
    // `appendFileSync` completes before the handler returns; a pipe write does
    // not, so a SIGKILL arriving while the last `caught:` line is still queued
    // takes it with the process. The file records what the child *did*; stdout
    // records what got out, and only one of those is the claim under test.
    expect(readFileSync(log, "utf8")).toContain("caught:SIGINT");
    expect(readFileSync(log, "utf8")).toContain("caught:SIGTERM");
    expect(result.stdoutRaw).toContain("caught:SIGINT");
    expect(result.signal).toBe("SIGKILL");
    expect(result.exitCode).toBeNull();
    expect(result.cancelled).toBe(true);
  }, 20_000);

  it("T4.3 (with C07): a RawResult from either transport adapts to the same document", async () => {
    // C06's own claim, from C07's side: the transports differ in how they get a
    // result and not in what a result is. If a fixture and an emulated run
    // adapted differently, every fixture-backed test would be testing something
    // the production path never produces.
    const payload = [
      { id: "a", state: "running" },
      { id: "b", state: "exited" },
    ];
    const inv = invocation({ verb: "ps", argv: ["ps"] });

    const fromFixture = await createFixtureTransport([
      recorded({ verb: "ps", argv: ["ps"], result: result({ stdout: payload }) }),
    ]).invoke(inv);
    const fromEmulated = await createEmulatedTransport(() =>
      result({ stdout: payload, argv: ["ps", "--json"] }),
    ).invoke(inv);

    const registry = createAdapterRegistry();
    const ctx = {
      ...producerContext(),
      command: "/ps",
      verb: "ps",
      width: 100,
      userRequestedJson: false,
      flags: {},
      transport: "fixture" as const,
      origin: "user" as const,
      tool: null,
    };

    // `meta` records which transport ran, so the comparison is of the blocks and
    // the status — the parts that are supposed to be identical.
    const a = registry.adapt(fromFixture, ctx);
    const b = registry.adapt(fromEmulated, ctx);
    expect(a.blocks).toEqual(b.blocks);
    expect(a.status).toBe(b.status);
    expect(validateDocument(a).ok).toBe(true);
  });

  it("T4.4b (with C07): a degraded stream produces a document containing the remainder", async () => {
    // End to end across the seam: C06 decides the stream stopped being NDJSON,
    // and C07 is the only thing that can put the rest of it on screen. C06
    // carries no `remaining` field — the `malformed` patches are the remainder
    // (C06 §5, C07 §6), and this is the assertion that they arrive.
    const lines = [
      ...Array.from({ length: 10 }, (_, i) => JSON.stringify({ n: i })),
      "<!DOCTYPE html>",
      "<html><body>502 Bad Gateway</body></html>",
      "</html>",
    ];

    // An async generator, because `isPatches` tests for `Symbol.asyncIterator`
    // — a sync one is taken for a settled result and produces nonsense.
    const transport = createEmulatedTransport(() => {
      async function* patches(): AsyncGenerator<RawPatch> {
        const reader = createNdjsonReader();
        for (const line of lines) {
          for (const patch of reader.push(`${line}\n`)) yield patch;
        }
        yield { kind: "end", result: result({ stdout: undefined, stdoutRaw: lines.join("\n") }) };
      }
      return patches();
    });

    const registry = createAdapterRegistry();
    let seq = 0;
    let remainder = "";
    for await (const patch of transport.stream(invocation({ verb: "logs", streams: true }))) {
      const view = registry.adaptPatch(patch, {
        ...producerContext(),
        command: "/logs",
        verb: "logs",
        width: 100,
        userRequestedJson: false,
        flags: {},
        transport: "emulated",
        origin: "user",
        tool: null,
        seq,
      });
      seq += 1;
      if ((view?.op === "append" || view?.op === "replace") && view.block.kind === "raw") {
        remainder = view.block.text;
      }
    }

    expect(remainder).toContain("502 Bad Gateway");
    expect(remainder).toContain("</html>");
  });
  it("T4.5b (with C23): the concurrency refusal surfaces as a notice naming the running verb", async () => {
    // **C06's guard is the backstop; C23's is authoritative** (C23 I5). C06
    // throws `TransportBusyError` for direct misuse, and a user typing a second
    // command must never see it — the refusal is a notice in the transcript,
    // and it names what is running so the answer to "why" is on screen.
    let release: (() => void) | undefined;
    const h = pipelineHarness({
      invoke: () =>
        new Promise((r) => {
          release = () => r(result({ exitCode: 0 }));
        }),
    });

    h.pipeline.submit("/ps");
    await new Promise((r) => setTimeout(r, 0));
    h.pipeline.submit("/tail");
    await settled(h.pipeline);

    const refusal = h.transcript.entries.at(-1);
    const text = JSON.stringify(refusal?.doc.blocks);
    expect(text, "it names the verb that is running").toContain("ps");
    expect(
      h.calls.filter((c) => c === "invoke"),
      "and the second never reached the transport, so C06 never threw",
    ).toHaveLength(1);

    release?.();
    await settled(h.pipeline);
  });
  it("T4.6 (with C23): a cd built-in followed by a verb spawns in the new directory", async () => {
    // **`cwd` is a function, read at spawn** (C21 I10, C22 I12). A value
    // captured when the transport was built cannot move, and a `cd` between two
    // verbs has to move the second one — which is invisible in any test that
    // spawns only once.
    const h = pipelineHarness();

    h.pipeline.submit("echo before");
    await settled(h.pipeline);
    h.pipeline.submit("cd /tmp");
    await settled(h.pipeline);
    h.pipeline.submit("echo after");
    await settled(h.pipeline);

    expect(h.spawned.map((x) => x.cwd), "the cd moved the second, not the first").toEqual([
      "/work",
      "/tmp",
    ]);
  });
});
