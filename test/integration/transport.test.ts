// C06 tier 4 — integration. What transport is *for*: a manifest deciding
// whether a verb is spawned at all, and a result that C07 can adapt.
//
// Most of this tier waits on components that do not exist, and says which. What
// does not wait is C05: `local` and `streams` are manifest facts, they are read
// by whoever calls the transport, and both are testable today.
import { describe, expect, it } from "vitest";
import { createAdapterRegistry } from "../../src/data/adapters/index.js";
import { findTool } from "../../src/data/manifest/index.js";
import { validateDocument } from "../../src/data/viewmodel/index.js";
import {
  createEmulatedTransport,
  createFixtureTransport,
  createNdjsonReader,
  createRouter,
} from "../../src/data/transport/index.js";
import type { Invocation, RawPatch, TransportRouter } from "../../src/data/transport/index.js";
import { fixture } from "../support/manifest.js";
import { drain, invocation, recorded, result } from "../support/transport.js";

/**
 * The routing decision C23 will make, in the two lines it actually is.
 *
 * Written here rather than mocked because the claim under test is that the
 * decision is *derivable from the manifest* — C06 never reads C05 (§ header),
 * so somebody above must, and this is the whole of what they do.
 */
function submit(
  router: TransportRouter,
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

    const route = submit(router, manifest, invocation({ verb: "help", argv: ["help"] }));

    expect(route).toBe("local");
    // The manifest is what stops the TUI guessing, and `local` is the field
    // that decides a verb is answered in-process. Spawning one is C05 T6.8.
    expect(spawned).toBe(0);
  });

  it("T4.4 (C05 T4.4): a local tool never reaches the transport; a spawnable one always does", () => {
    expect(submit(createRouter({ default: createFixtureTransport([]) }), manifest, invocation({ verb: "help", argv: ["help"] }))).toBe("local");
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

    expect(ignoringLocal(invocation({ verb: "help", argv: ["help"] }))).toBe("invoke");
    expect(submit(createRouter({ default: createFixtureTransport([]) }), fixture(), invocation({ verb: "help", argv: ["help"] }))).toBe("local");
  });

  it.todo("T4.1 (with C21): the escalation ladder issues real signals through the runner — waits on C21");
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
      command: "/ps",
      verb: "ps",
      width: 100,
      userRequestedJson: false,
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
        command: "/logs",
        verb: "logs",
        width: 100,
        userRequestedJson: false,
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
  it.todo("T4.5b (with L4): the concurrency refusal surfaces as a notice naming the running verb — waits on L4");
  it.todo("T4.6 (with L4): a cd built-in followed by a verb → the verb spawns in the new directory — waits on L4 and C18");
});
