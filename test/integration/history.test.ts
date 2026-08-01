// C20 tier 4 — integration. Against the real C15, the real C09 measurer and the
// real C18 parser, with no fakes in the path.
//
// Two of these could not be written at the unit tier at all. The confirm's
// undismissability is a property of C15's stack and C16's one `escape` row
// together — a store asserting `dismissable: false` on a layer it built is
// asserting its own literal. And whether the search overlay narrows without a
// re-push is a claim about the manager, not about the blocks.
import { describe, expect, it } from "vitest";

import { parse } from "../../src/interaction/parser/index.js";
import { fixture } from "../support/manifest.js";
import { createOverlayManager } from "../../src/viewport/overlay/index.js";
import { CONFIRM_ID, LIST_ID, SEARCH_ID } from "../../src/interaction/history/index.js";
import { registry } from "../support/overlay.js";
import { openWith, seedFiles, entry } from "../support/history.js";

const REGION = { width: 80, height: 24 };
const ANCHOR = { row: 20, rows: 1 };

const three = seedFiles([
  entry("/ps --status=running", 1_000),
  entry("/logs digit-42", 2_000),
  entry("/ps 7f3a2c14-9b4e-4d2a-a3f9-b21a8e0d5c12", 3_000),
]);

describe("T4.3 (with C15) — the search overlay", () => {
  it("pushes once and narrows through `update`, keeping its place under a later layer", async () => {
    const { store } = await openWith(three);
    const overlays = createOverlayManager({ registry });

    store.searchOpen("");
    const handle = overlays.push(store.searchLayer(ANCHOR));
    expect(overlays.top?.id).toBe(SEARCH_ID);

    // Something stacks on top — a confirm, say — and the search must keep its
    // position under it. A pop-and-re-push would put it above.
    overlays.push({
      id: "later",
      kind: "overlay",
      placement: { kind: "centred" },
      content: [{ kind: "raw", id: "later-row", text: "later" }],
      dismissable: true,
    });

    // **The caret is at the end of the query, and it moves with it** (C15 I19).
    // The search has a cursor because text is entered into it, which is the
    // half of the field the completion menu answers the other way. Asserted
    // before and after narrowing, because a cursor stated once and never
    // updated passes every assertion about the layer's content.
    const opened = store.searchLayer(ANCHOR);
    expect(opened.cursor, "at the end of an empty query").toEqual({
      row: 0,
      col: "(reverse-i-search) `".length,
    });

    store.searchType("logs");
    const narrowed = store.searchLayer(ANCHOR);
    expect(narrowed.cursor?.col, "and four cells further on after four keystrokes").toBe(
      (opened.cursor?.col ?? 0) + 4,
    );
    expect(
      overlays.update(SEARCH_ID, {
        content: narrowed.content,
        ...(narrowed.cursor !== undefined && { cursor: narrowed.cursor }),
      }),
    ).toBe(true);

    expect(overlays.stack.map((l) => l.id)).toEqual([SEARCH_ID, "later"]);
    const placed = overlays.layout(REGION);
    const line = placed.find((p) => p.layer.id === SEARCH_ID);
    expect(line?.layer.content).toEqual([
      { kind: "raw", id: `${SEARCH_ID}-line`, text: "(reverse-i-search) `logs': /logs digit-42" },
    ]);
    expect(line?.cursor, "and placement carries it through unchanged").toEqual(narrowed.cursor);
    // Anchored above the prompt, and measured by C09 rather than asserted.
    expect(line?.height).toBe(1);
    expect(line?.top).toBeLessThan(ANCHOR.row);

    handle[Symbol.dispose]();
  });

  it("a multi-line match stays one row, so the box does not grow while you type", async () => {
    const { store } = await openWith(seedFiles([entry("/deploy \\\n  --now", 1_000)]));
    const overlays = createOverlayManager({ registry });

    store.searchOpen("");
    store.searchType("deploy");
    overlays.push(store.searchLayer(ANCHOR));

    const placed = overlays.layout(REGION);
    expect(placed[0]?.height).toBe(1);
    expect(placed[0]?.layer.content[0]).toMatchObject({ text: expect.stringContaining("\\\\n") });
  });
});

describe("T4.4, T3.15 (with C15, I14) — the clear confirm", () => {
  it("`Esc` on it is a no-op, through the real stack rather than by inspection", async () => {
    const { store } = await openWith(three);
    const overlays = createOverlayManager({ registry });

    overlays.push(store.clearConfirmLayer());
    expect(overlays.top?.id).toBe(CONFIRM_ID);

    // What C16's one `overlay:escape → dismiss` row does, which is what makes
    // this a property of the stack and not of the store's own literal.
    expect(overlays.pop()).toBeNull();
    expect(overlays.top?.id).toBe(CONFIRM_ID);
    expect(store.entries).toHaveLength(3);

    // Only the thing that raised it can resolve it.
    overlays.dismiss(CONFIRM_ID);
    expect(overlays.top).toBeNull();
    expect(store.entries).toHaveLength(3);
  });

  it("the confirm names what it is about to destroy", async () => {
    const { store } = await openWith(three);
    expect(store.clearConfirmLayer().content[0]).toMatchObject({
      kind: "notice",
      tone: "warn",
      text: "Clear 3 history entries? (y/N)",
    });
  });
});

describe("T4.7 (with C09, C04) — `/history` as blocks", () => {
  it("rows carry `fill` actions with the real command, and the index is the entry's", async () => {
    const { store } = await openWith(three);
    const blocks = store.listBlocks("ps");
    const table = blocks[0];

    expect(table?.kind).toBe("table");
    if (table?.kind !== "table") return;

    // Filtered to two rows, numbered 0 and 2 — `/history 2` has to mean the
    // same thing whether or not `--search` was passed.
    expect(table.rows.map((r) => r.cells.index?.text)).toEqual(["0", "2"]);
    expect(table.rows[0]?.actions).toEqual([
      { kind: "fill", label: "fill", command: "/ps --status=running" },
    ]);
    // Measurable by the same registry as the transcript, which is what I13's
    // "blocks, not React" buys.
    expect(registry.measureSequence(blocks, 80)).toBeGreaterThan(0);
    expect(table.id).toBe(LIST_ID);
  });

  it("a stamp is formatted without a clock, and a missing one says so", async () => {
    const { store } = await openWith(seedFiles([entry("/ps", 1_700_000_000_000)]));
    const table = store.listBlocks()[0];
    if (table?.kind !== "table") throw new Error("expected a table");

    expect(table.rows[0]?.cells.when?.text).toBe("2023-11-14 22:13");

    const reset = await openWith({ "/state/history": "/ps\n", "/state/history.meta": "" });
    const after = reset.store.listBlocks()[0];
    if (after?.kind !== "table") throw new Error("expected a table");
    expect(after.rows[0]?.cells.when?.text).toBe("—");
  });
});

describe("T4.5 (with C18) — a stored command re-parses to what it was", () => {
  it("through a round trip, including a multi-line command and a quoted argument", async () => {
    const commands = [
      "/ps --family=digit-classifier --status=running",
      '/deploy --note="two words"',
      "/deploy \\\n  --target=prod",
    ];
    const { store, fs } = await openWith();
    for (const command of commands) store.append(command, 0);
    await store.flush();

    const reopened = await openWith({
      "/state/history": fs.files.get("/state/history") ?? "",
      "/state/history.meta": fs.files.get("/state/history.meta") ?? "",
    });

    const ctx = { manifest: fixture(), binary: "widget", lastUuid: null };
    for (const [i, command] of commands.entries()) {
      const stored = reopened.store.entries[i]?.command ?? "";
      expect(stored).toBe(command);
      expect(parse(stored, ctx)).toEqual(parse(command, ctx));
    }
  });
});
