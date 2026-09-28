/**
 * C23 I84 — `expand` resolves row, then a block's fold, then nothing (ruling 42,
 * review batch 3 M9 item 1).
 *
 * **Through a real transcript store and the real registry**, because the claim
 * is about the entry: the patch grows *in the entry it already sits in*, and a
 * row that asserted the dispatcher's argument rather than the held document
 * would pass for an arm that appended a copy (C25 §3b's hole, one layer down).
 */
import { describe, expect, it } from "vitest";

import { block, descendants, type Block, type Hunk, type Patch, type ViewDocument } from "../../src/data/viewmodel/index.js";
import { createActionDispatcher } from "../../src/shell/actions.js";
import { createTranscriptStore, type TranscriptStore } from "../../src/viewport/transcript/index.js";
import { patchDefinition } from "../../src/presentation/patch/definition.js";
import { rows as toRows } from "../../src/presentation/blocks/paint.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import { doc, tableOf } from "../support/blocks.js";
import { registry as makeRegistry } from "../support/render.js";

/**
 * **An app's own kind, with its own fold** — the case that says the dispatcher
 * names no kind. A stand-in, named for what it is rather than for anything in
 * the tree (`test/support/README.md`).
 */
type Folding = Readonly<{ kind: "folding"; id: string; open?: boolean }>;
const foldingDefinition = {
  kind: "folding",
  measure: (b: Folding) => (b.open === true ? 3 : 1),
  render: (b: Folding) => toRows(b.open === true ? ["open", "a", "b"] : ["shut"]),
  fold: (b: Folding) => ({ ...b, open: b.open !== true }),
} as unknown as BlockDefinition<never>;

const registry = makeRegistry([patchDefinition as unknown as BlockDefinition<never>, foldingDefinition]);

const four = (at: number): Hunk => ({
  header: `@@ -${String(at)},3 +${String(at)},3 @@`,
  lines: [
    { kind: "context", text: `line ${String(at)}`, oldNo: at, newNo: at },
    { kind: "remove", text: `old ${String(at + 1)}`, oldNo: at + 1 },
    { kind: "add", text: `new ${String(at + 1)}`, newNo: at + 1 },
  ],
});
const cappedPatch = (cap?: number): Patch =>
  block({
    kind: "patch",
    id: "diff",
    path: "src/a.ts",
    language: "typescript",
    hunks: [four(1), four(9), four(20), four(40)],
    ...(cap === undefined ? {} : { cap }),
  } as Patch);

const dispatcherFor = (store: TranscriptStore, said: string[]) =>
  createActionDispatcher({
    transcript: store,
    editor: { setText: () => undefined },
    scheduler: { commit: () => undefined },
    openUrl: async () => undefined,
    submit: () => undefined,
    refuse: (_from, text) => said.push(text),
    notify: (text) => said.push(text),
    fold: (b) => registry.fold(b),
  });

const find = (d: ViewDocument | undefined, id: string): Block | undefined =>
  [...(d?.blocks ?? [])].flatMap((x) => [x, ...descendants(x)]).find((x) => x.id === id);

const expand = (target: string) => ({ kind: "expand" as const, label: "expand", target });

describe("C23 I84 — expand in place, through the registry's fold", () => {
  it("T4.76 (C23 I84, C25 I14, C09 I124, C23 I18, C23 I31): a capped patch in a panel expands in the same entry and folds back to the producer's document; shedding, scroll and app kinds fold through the hook", () => {
    const store = createTranscriptStore();
    const said: string[] = [];
    const dispatch = dispatcherFor(store, said);
    const panel = (patch: Patch): Block => block({ kind: "panel", id: "card", title: "diff", children: [patch] });

    // **A frozen entry**, which C23 I18's exception admits: a `/filediff` is
    // finished by the time anyone reads it, and an entry below it is live.
    const id = store.append(doc({ blocks: [panel(cappedPatch(12))] }));
    store.append(doc({ blocks: [block({ kind: "raw", id: "later", text: "later" })] }));
    expect(store.liveId, "the patch's entry is not the live one").not.toBe(id);
    const before = store.entries.find((e) => e.id === id)?.doc;
    const entries = store.entries.length;
    const height = (): number => registry.measureSequence(store.entries.find((e) => e.id === id)?.doc.blocks ?? [], 80);
    const collapsed = height();

    dispatch(expand("diff"), id);
    expect(said, "nothing refused or notified").toEqual([]);
    expect(store.entries.length, "no entry appended — in place").toBe(entries);
    expect((find(store.entries.find((e) => e.id === id)?.doc, "diff") as Patch).expanded).toBe(true);
    // Four-row hunks under a cap of 12: two admitted, two dropped, one marker.
    expect(height() - collapsed, "the dropped hunks' rows, less the marker").toBe(2 * 4 - 1);

    dispatch({ kind: "expand", label: "collapse", target: "diff" }, id);
    expect(store.entries.find((e) => e.id === id)?.doc.blocks, "the producer's document again").toEqual(before?.blocks);
    expect(height()).toBe(collapsed);

    // **A shedding kind at depth**, a `scroll` with a fold, and an app's kind
    // with its own — the three the dispatcher must reach without naming.
    const kv = block({ kind: "keyValue", id: "kv", rows: [{ label: "endpoint", value: "https://api.internal.example/v2" }] });
    const sc = block({ kind: "scroll", id: "sc", height: 2, collapsed: true, children: [block({ kind: "raw", id: "r", text: "x" })] });
    const app = { kind: "folding", id: "app" } as unknown as Block;
    const id2 = store.append(doc({ blocks: [block({ kind: "group", id: "g", direction: "column", children: [kv, sc] }), app] }));
    dispatch(expand("kv"), id2);
    dispatch(expand("sc"), id2);
    dispatch(expand("app"), id2);
    const held = store.entries.find((e) => e.id === id2)?.doc;
    expect(said).toEqual([]);
    expect((find(held, "kv") as { expanded?: boolean }).expanded, "keyValue folds `expanded`").toBe(true);
    expect((find(held, "sc") as { collapsed?: boolean }).collapsed, "scroll folds `collapsed`").toBe(false);
    expect((find(held, "app") as { open?: boolean }).open, "an app kind folds by its own hook").toBe(true);

    // **A row id equal to a folding block's id takes the row arm** (C04 §3c S5).
    const table = tableOf(2, "tbl");
    const rowId = table.rows[0]!.id;
    const twin = { kind: "folding", id: rowId } as unknown as Block;
    const id3 = store.append(doc({ blocks: [table, twin] }));
    dispatch(expand(rowId), id3);
    const held3 = store.entries.find((e) => e.id === id3)?.doc;
    const tbl = find(held3, "tbl") as { rows: readonly { id: string; expanded?: boolean }[] };
    expect(tbl.rows[0]?.expanded, "the row opened").toBe(true);
    expect((held3?.blocks[1] as { open?: boolean }).open, "the block did not").toBeUndefined();
  });

  it("T4.76 (C23 I84): the controls — a patch with no cap, a scroll with no fold, and an id nothing carries notify and patch nothing", () => {
    const store = createTranscriptStore();
    const said: string[] = [];
    const dispatch = dispatcherFor(store, said);
    const sc = block({ kind: "scroll", id: "sc", height: 2, children: [block({ kind: "raw", id: "r", text: "x" })] });
    const id = store.append(doc({ blocks: [cappedPatch(), sc] }));
    const before = store.entries.find((e) => e.id === id)?.doc;
    for (const target of ["diff", "sc", "nosuch"]) {
      said.length = 0;
      dispatch(expand(target), id);
      expect(said.join("\n"), target).toMatch(/nothing to expand/u);
      expect(store.entries.find((e) => e.id === id)?.doc, `${target}: nothing patched`).toBe(before);
    }
  });
});
