/**
 * S12 — every document this app produces, put through B04's compliance sweep.
 *
 * **`degradesTo1Bit` is the one assertion in `@fmx/calcium/testing` that no
 * consumer would write themselves**, which is C24 I13's argument for the module
 * existing, and this file is the first time an application has run it. It makes
 * two mechanical claims:
 *
 * - **geometry is depth-independent** — the same document occupies the same rows
 *   at one bit as at twenty-four, because C14 virtualises by measured height;
 * - **information is not carried by colour alone** (D29) — a renderer may change
 *   how it says something and may not stop saying it.
 *
 * The frames in `DEGRADATION.md` are the demonstration; this is the check. They
 * answer different questions: a frame shows that the plot still reads at one
 * bit, and only the sweep can say that no *element* lost its meaning on the way.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { expectDocument } from "@fmx/calcium/testing";
import type { ViewDocument } from "@fmx/calcium";
import { containerView, createContainerAdapter } from "../src/container.ts";
import { dashboard } from "../src/dashboard.ts";
import { parseNdjson } from "../src/ndjson.ts";
import { createPsAdapter } from "../src/ps.ts";
import { createDriftHandler } from "../src/drift.ts";
import { createEventsHandler } from "../src/events.ts";
import {
  createDiffAdapter,
  createImagesAdapter,
  createPortAdapter,
  createTopAdapter,
} from "../src/verbs.ts";


import { createAdapterRegistry } from "@fmx/calcium";
import type { Adapter, AdapterContext, RawResult } from "@fmx/calcium";
import { completeLocal } from "@fmx/calcium";
import type { LocalDocument } from "@fmx/calcium";

/** A local handler's answer, completed the way `runLocal` completes it (F13). */
async function viaLocal(
  produced: LocalDocument | Promise<LocalDocument>,
  command: string,
  argv: readonly string[],
): Promise<ViewDocument> {
  return completeLocal(await produced, { command, verb: argv[0] ?? null, argv, durationMs: 0 });
}

/**
 * An adapter's answer, completed by the registry — which is what a document is.
 *
 * **`Adapter.adapt` no longer returns a `ViewDocument`** (F58b): it carries the
 * three `meta` keys an adapter owns and the registry fills the seven it does
 * not. Validating an adapter's return directly asserts against a half-built
 * artefact, and every row here is about what this app *produces*, which is the
 * registry's output.
 */
function viaRegistry(adapter: Adapter, raw: RawResult, ctx: AdapterContext): ViewDocument {
  return createAdapterRegistry({ v: adapter }).adapt(raw, ctx);
}

const read = (name: string): string =>
  readFileSync(new URL(`./corpus/${name}`, import.meta.url), "utf8");

const result = (over: Partial<Record<string, unknown>> = {}): never =>
  ({ exitCode: 0, stdoutRaw: "", stderr: "", argv: ["docker", "x"], durationMs: 1, ...over }) as never;

/** One real `docker stats` row, for the alphabet check below. */
const STATS = parseNdjson(read("stats-real.ndjson")).rows[0] as never;

/** A real dashboard snapshot — the second surface the alphabet has to cover. */
const SNAP = {
  containers: parseNdjson(read("ps-real.ndjson")).rows,
  stats: parseNdjson(read("stats-real.ndjson")).rows,
  skipped: 0,
} as never;

const ctx = {
  command: "/x",
  verb: "x",
  transport: "subprocess",
  origin: "user",
  width: 100,
} as never;

/**
 * The subject of the showcase first, then the rest.
 *
 * S12 picks the S3 live view because **the plot and the bars degrade more
 * visibly than a table does** — a table is text in columns at every depth, and
 * a plot is a shape. That makes it the best demonstration and the most likely
 * failure, which is the same reason it is first here.
 */
const DOCUMENTS: readonly (readonly [string, () => Promise<ViewDocument> | ViewDocument])[] = [
  ["S3 — the live single-container view", () => viaRegistry(createContainerAdapter(), result({ stdoutRaw: read("stats-real.ndjson") }), ctx)],
  ["S3 — the container reports nothing", () => viaRegistry(createContainerAdapter(), result({ stdoutRaw: "" }), ctx)],
  ["/ps", () => viaRegistry(createPsAdapter(), result({ stdoutRaw: read("ps-real.ndjson") }), ctx)],
  ["/diff", () => viaRegistry(createDiffAdapter(), result({ stdoutRaw: read("diff-real.txt") }), ctx)],
  ["/diff — nothing changed", () => viaRegistry(createDiffAdapter(), result({ stdoutRaw: "" }), ctx)],
  ["/images", () => viaRegistry(createImagesAdapter(), result({ stdoutRaw: read("images-real.ndjson") }), ctx)],
  ["/top", () => viaRegistry(createTopAdapter(), result({ stdoutRaw: read("top-real.txt") }), ctx)],
  ["/port", () => viaRegistry(createPortAdapter(), result({ stdoutRaw: read("port-real.txt") }), ctx)],
  [
    "/events",
    () =>
      viaLocal(
        createEventsHandler(() => Promise.resolve(read("events-real.ndjson")))([], {
          command: "/events",
        }),
        "/events",
        [],
      ),
  ],
  ["/drift — no such container", () => viaLocal(createDriftHandler()(["no-such-xyz"], { command: "/drift no-such-xyz" }), "/drift no-such-xyz", ["no-such-xyz"])],
];

describe("B04: the same information at every depth", () => {
  it.each(DOCUMENTS.map(([name]) => name))("%s", async (name) => {
    const make = DOCUMENTS.find(([n]) => n === name)?.[1];
    const doc = await (make as () => Promise<ViewDocument>)();
    expectDocument(doc).degradesTo1Bit();
  });

  it("F54: at unicode: ascii the app draws no block elements of its own", () => {
    // **The sweep above cannot see this, and that is the point of the row.**
    // `degradesTo1Bit` varies the *colour* axis; `unicode` is the other one, and
    // capability substitution covers the glyphs C09 picks rather than the text
    // an adapter supplies. So the S3 view kept `░░░░░░░░` at `LANG=C` beside a
    // plot that had correctly become `.::-==++**##@@` — every assertion in this
    // file green, and the frame wrong.
    // **Asserted as a codepoint range, not as a list of characters.** A list is
    // a coverage set drawn from the defect already found: `█ ░ —` were the
    // three in the frame, and `·` was the fourth, discovered only because the
    // frame was scanned rather than searched. The range covers the ones nobody
    // has written yet.
    //
    // **Both surfaces, because one of them let a mutation live.** Reverting the
    // separator to a bare `·` failed nothing while this row covered the view
    // alone — the dot is in the dashboard's panel title and summary, and the
    // view has its own. A per-surface check is a per-surface claim.
    const surfaces: readonly (readonly [string, unknown])[] = [
      ["the S3 view", containerView(STATS, 100, false)],
      ["the dashboard", dashboard(SNAP, 100, "29.4.1", false)],
    ];
    for (const [name, blocks] of surfaces) {
      const outside = [...JSON.stringify(blocks)].filter((ch) => (ch.codePointAt(0) ?? 0) > 127);
      expect(outside, `${name} reached an ASCII terminal: ${[...new Set(outside)].join(" ")}`)
        .toEqual([]);
    }

    // And the full alphabet is still the default, or the rows above pass
    // against an app that drew ASCII everywhere.
    expect(JSON.stringify(containerView(STATS, 100, true))).toContain("░");
    expect(JSON.stringify(dashboard(SNAP, 100, "29.4.1", true))).toContain("·");
  });

  it("the sweep can fail, or the rows above prove nothing", () => {
    // **A fixture must be shown to respond to the thing under test.** Every row
    // above would pass against an assertion that returned `this` unconditionally
    // — which is a different defect with the same green suite, and this file
    // exists precisely because that class ships.
    //
    // The offence is D29's: a meaning tone with neither a glyph nor a word.
    const bare: ViewDocument = {
      schema: "tui.view/1",
      command: "/x",
      status: "ok",
      blocks: [{ kind: "notice", id: "bare", tone: "error", text: " " } as never],
      meta: {
        verb: "x", adapter: "x", exitCode: 0, durationMs: 1, truncated: false,
        argv: [], stderr: "", transport: "subprocess", origin: "user",
      },
    };
    expect(() => expectDocument(bare).degradesTo1Bit()).toThrow();
  });
});
