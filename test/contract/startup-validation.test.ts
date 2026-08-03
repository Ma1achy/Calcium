// C24 §8 — startup validation, all seven severities in one table.
//
// **Six of the seven throw inside the components that own them**, and that is
// the finding this table makes visible rather than a convenience of writing it
// one place: `validateConfig`, `checkSchema`, `validateTokens` (twice, for
// contrast and for a `meaning` palette without a typographic fallback),
// `KeymapError`, and the block registry's shadow check. §8's severities were
// therefore already correct and already enforced — six times, by six components
// that had never been asked to agree with each other.
//
// The seventh had no home. A *warning* cannot be expressed by anything that
// throws, so nothing expressed it: an adapter registered for a verb the
// manifest does not declare was dead code that nothing mentioned. §8 has said
// it is a warning since it was written.
//
// **And the moment was wrong, which the table also shows.** §8 opened with
// "`createTui` checks the graph before the session opens", and `createTui`
// runs `resolveConfig` and nothing else — every other check fires inside
// `start()`, because step 3 may read a manifest from a path and a constructor
// cannot await. The severities were right and the sentence was not, so the
// sentence moved (I9).
import { describe, expect, it } from "vitest";
import { createTui, defaultTheme } from "../../src/index.js";
import { MANIFEST, buildGraph } from "../support/session.js";
import { parseManifest } from "../../src/data/manifest/index.js";

describe("C24 §8 — the seventh severity", () => {
  it("T3.11 (§8): an adapter for a verb the manifest does not declare warns, and the session opens", async () => {
    const { graph } = await buildGraph({
      adapters: {
        // `ps` is in the fixture manifest; `psss` is the typo §8 describes.
        psss: {
          schema: "tui.view/1",
          adapt: () => {
            throw new Error("never called — the verb does not exist");
          },
        },
      },
    });

    const rows = graph.transcript.entries.flatMap((e) =>
      e.doc.blocks.map((b) => ("text" in b ? b.text : "")),
    );
    const warning = rows.find((t) => t.includes("psss"));

    expect(warning, `no warning names the orphan adapter: ${JSON.stringify(rows)}`).toBeDefined();
    expect(warning).toContain("the manifest does not declare");

    // The half that makes it a warning rather than an error, and the reason §8
    // gives: a manifest legitimately shrinks between versions, and an app that
    // refuses to start when the far side drops a verb is worse than one that
    // says so.
    expect(graph.transcript.entries.length).toBeGreaterThan(0);
  });

  it("T3.11: an adapter whose verb IS declared produces no warning", async () => {
    // The control. Without it the assertion above passes for an implementation
    // that warns about every adapter, which is the same shape of defect as a
    // rule that always fires.
    // The harness manifest declares no app tools at all, which is why this
    // control has to supply one: asserting "no warning" against a manifest that
    // could not have declared anything would pass for an implementation that
    // never warns.
    const parsed = parseManifest({
      schema: "tui.manifest/1",
      binary: "prism",
      version: "1.0.0",
      tools: [{ name: "ps", local: false, summary: "list containers", args: [], flags: [] }],
    });
    if (!parsed.ok) throw new Error(`fixture manifest does not parse: ${JSON.stringify(parsed.error)}`);
    const manifest = parsed.value;
    const declared = "ps";

    const { graph } = await buildGraph({
      manifest,
      adapters: {
        [declared ?? "ps"]: {
          schema: "tui.view/1",
          adapt: () => {
            throw new Error("never called");
          },
        },
      },
    });

    const rows = graph.transcript.entries.flatMap((e) =>
      e.doc.blocks.map((b) => ("text" in b ? b.text : "")),
    );
    expect(rows.find((t) => t.includes("does not declare"))).toBeUndefined();
  });

  it("I9: createTui is eager about the config and about nothing else", async () => {
    // §8's sentence used to say `createTui` checks the graph. It does not, and
    // this is the assertion that keeps the corrected sentence honest: a missing
    // required field throws at the call site, and everything else waits for
    // `start()` — because step 3 may read a manifest from a path.
    expect(() => createTui({} as never)).toThrow();

    // And the converse: the four required fields and nothing else construct
    // without touching a terminal, reading a manifest from disk, or consulting
    // an adapter. `name`, `binary`, `manifest`, `theme` — T4.1's four.
    expect(() =>
      createTui({
        name: "docker",
        binary: "docker",
        manifest: MANIFEST,
        theme: defaultTheme,
      } as never),
    ).not.toThrow();

    // Each of the four, withheld one at a time, throws at the call site and
    // names itself. Asserted per field rather than once: a check that stopped
    // at the first would leave the other three unenforced and this test green.
    for (const field of ["name", "binary", "manifest", "theme"] as const) {
      const config: Record<string, unknown> = {
        name: "docker",
        binary: "docker",
        manifest: MANIFEST,
        theme: defaultTheme,
      };
      delete config[field];
      expect(() => createTui(config as never), field).toThrow(new RegExp(`\`${field}\``));
    }
  });
});
