// C22 §6m — the linear rendering's events and bodies (§107, ruling 29).
//
// **The expected lines are literals, worked by hand from §6m.2's table** before
// the assertion: a line reads as the node's fields in ruling 29's order, and a
// property like "contains the command" is satisfied by a line in any order.
import { describe, expect, it } from "vitest";

import { block } from "../../src/data/viewmodel/index.js";
import type { Block, ViewDocument } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import {
  blockLines,
  linearEvents,
  linearState,
  type BodyDeps,
  type LinearEntry,
} from "../../src/shell/linear.js";
import { ONE_PER_KIND } from "../support/blocks.js";

// **The registry a session builds** — `defaults` alone registers none of C11's,
// C12's or C25's kinds, and each would degrade to `raw` and read its JSON: the
// instrument that first misled §6m.1.
const registry = createBlockRegistry({ defaults: true });
for (const d of [tableDefinition, plotDefinition, patchDefinition]) registry.register(d as never);
const deps: BodyDeps = {
  width: 80,
  elementsOf: (b, w) => registry.elementsOf(b, w),
  copyOf: (b) => registry.copyOf(b),
};

const META = {
  verb: "pytest",
  adapter: "passthrough",
  exitCode: 0,
  durationMs: 0,
  truncated: false,
  argv: [] as string[],
  stderr: "",
  transport: "subprocess" as "subprocess" | "local",
  origin: "user" as const,
};

const head = (state: string): Block =>
  block({ kind: "notice", id: "head", tone: "info", glyph: "running", state, text: "pytest tests/unit" } as never);

const docOf = (blocks: readonly Block[], over: Partial<ViewDocument> = {}, meta: Partial<typeof META> = {}): ViewDocument =>
  ({ schema: "tui.view/1", command: "pytest tests/unit", status: "ok", blocks, meta: { ...META, ...meta }, ...over }) as ViewDocument;

describe("C22 §6m — linear events", () => {
  it("T1.74 (C22 I120, C22 I121, C22 I124): §6m.2's table, row by row, through the event function alone", () => {
    const entries = new Map<string, LinearEntry>();
    const state = linearState();
    const events = (change: Parameters<typeof linearEvents>[0]) =>
      linearEvents(change, (id) => entries.get(id), state, deps);

    // Row 1 — a streaming append is the start, and only the start.
    entries.set("e7", { id: "e7", seq: 7, streaming: true, doc: docOf([head("running")]) });
    expect(events({ kind: "append", id: "e7" })).toEqual([
      { lines: ["entry 7 of 7: pytest tests/unit — running"], level: "polite" },
    ]);
    // Row 3 — a patch while streaming writes nothing: the batch closes at settle.
    expect(events({ kind: "patch", id: "e7" })).toEqual([]);

    // Row 6 — settle: the head's word, the exit, the duration, then the body.
    const failure = block({ kind: "notice", id: "why", tone: "error", glyph: "error", text: "4 failed" } as never);
    entries.set("e7", {
      id: "e7",
      seq: 7,
      streaming: false,
      doc: docOf([head("failed"), failure], { status: "error" }, { exitCode: 1, durationMs: 4200 }),
    });
    expect(events({ kind: "settle", id: "e7" })).toEqual([
      { lines: ["entry 7: pytest tests/unit — failed, exit 1, 4s", "alert: 4 failed"], level: "assertive" },
    ]);
    // §6m.3 row 9 — the same entry settling twice says it once.
    expect(events({ kind: "settle", id: "e7" }), "a second settle").toEqual([]);

    // Row 4 — **a block appended after settle is written**: C22 I118's refusal.
    const refusal = block({ kind: "notice", id: "refused", tone: "warn", glyph: "warn", text: "A field is one line." } as never);
    entries.set("e7", { ...entries.get("e7")!, doc: docOf([head("failed"), failure, refusal], { status: "error" }) });
    expect(events({ kind: "patch", id: "e7" })).toEqual([
      { lines: ["entry 7:", "note: A field is one line."], level: "assertive" },
    ]);
    // Row 5 — and a block replaced is not: the rewrite §107 forbids.
    const again = block({ kind: "notice", id: "refused", tone: "warn", glyph: "warn", text: "Something else." } as never);
    entries.set("e7", { ...entries.get("e7")!, doc: docOf([head("failed"), failure, again], { status: "error" }) });
    expect(events({ kind: "patch", id: "e7" }), "a replace").toEqual([]);

    // Row 2 — a settled append is its start and completion as one event. A
    // local verb, under a second: no duration.
    entries.set("e8", {
      id: "e8",
      seq: 8,
      streaming: false,
      doc: docOf([head("succeeded"), block({ kind: "tip", id: "t", text: "Press ? for keys." } as never)], { command: "/help" }, {
        transport: "local",
        durationMs: 300,
      }),
    });
    expect(events({ kind: "append", id: "e8" })).toEqual([
      { lines: ["entry 8 of 8: /help", "entry 8: /help — succeeded", "note: Press ? for keys."], level: "polite" },
    ]);

    // Rows 7 and 8 — evict writes nothing; clear says so.
    expect(events({ kind: "evict", ids: ["e1", "e2"] })).toEqual([]);
    expect(events({ kind: "clear" })).toEqual([{ lines: ["transcript cleared"], level: "polite" }]);

    // §6m.3 row 4 — **the number is the `seq`**, so eviction cannot renumber:
    // entry 12 starts after 1–3 are gone and still reads 12, of 12.
    entries.set("e12", { id: "e12", seq: 12, streaming: true, doc: docOf([head("running")], { command: "make" }) });
    expect(events({ kind: "append", id: "e12" })[0]?.lines).toEqual(["entry 12 of 12: make — running"]);
    // §6m.3 row 2 — gone before it settled: nothing can be said about it.
    entries.delete("e12");
    expect(events({ kind: "settle", id: "e12" })).toEqual([]);
  });

  it("T1.75 (C22 I121): every kind of ONE_PER_KIND through the body function", () => {
    const read = Object.fromEntries(Object.entries(ONE_PER_KIND).map(([k, b]) => [k, blockLines(b as Block, deps)]));
    // Worked by hand, the ones the rulings are about.
    expect(read.notice, "a notice's text once, not as name and again as source").toEqual(["note: Nothing to do."]);
    expect(read.table, "the header before the rows").toEqual(["table", "Name  State", "api  running", "worker  idle"]);
    expect(read.choice, "the block's copy, without the radio glyph").toEqual(["radiogroup: scale", "[ ] linear  [x] log  [ ] log2"]);
    expect(read.plot, "a figure reads its name and nothing else").toEqual(["figure"]);
    expect(read.image).toEqual(["figure: an eight by eight red square"]);
    expect(read.progress, "the value text, since progress has no copy source").toEqual(["progressbar: Uploading — 3 of 10"]);
    expect(read.patch?.slice(0, 2)).toEqual(["document: src/server.ts", "--- a/src/server.ts"]);
    expect(read.tree?.slice(0, 3), "the block's copy keeps the depth").toEqual(["tree", "src", "  interaction"]);
    // A container reads its children in order.
    expect(read.panel).toEqual(["group: Summary", "document", "two lines", "of text"]);

    // Every kind has a head line, and no line carries SGR, a control character
    // or one of the glyphs the rich frame draws.
    for (const [kind, lines] of Object.entries(read)) {
      expect(lines.length, `${kind} has a head`).toBeGreaterThan(0);
      for (const line of lines) {
        expect(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(line), `${kind}: ${JSON.stringify(line)}`).toBe(false);
        expect(/[●○◌◐⊘✗✓›▸⏺]/u.test(line), `${kind}: ${JSON.stringify(line)}`).toBe(false);
      }
    }
  });
});
