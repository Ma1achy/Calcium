// C20 §5 / C22 §6u.4 — the history search is a list with a count (C20 I31, I32; C22 I157, §046).
import { describe, expect, it } from "vitest";

import { SEARCH_ID } from "../../src/interaction/history/index.js";
import { entry, openWith, seedFiles } from "../support/history.js";

const ANCHOR = { row: 20, rows: 1 };
const FILES = seedFiles([entry("/help"), entry("/history"), entry("/ps"), entry("/history --all")]);

/** The edge's words and the table's rows, from the layer's content. */
function read(layer: { content: readonly { kind: string }[] }): { label: string; rows: string[]; current: string | null } {
  const [edge, body] = layer.content as [{ kind: "rule"; label: string }, { kind: "table"; rows: { id: string; cells: { value: { text: string } } }[]; current: string } | undefined];
  return {
    label: edge.label,
    rows: body === undefined ? [] : body.rows.map((r) => r.cells.value.text),
    current: body === undefined ? null : (body.rows.find((r) => r.id === body.current)?.cells.value.text ?? null),
  };
}

describe("C20 I31, I32 — the search layer", () => {
  it("T1.22 (C20 I31): the header counts matches, the list is the hit and its older matches, and there is no cursor", async () => {
    const { store } = await openWith(FILES);
    store.searchOpen("");
    expect(read(store.searchLayer(ANCHOR)), "an empty query: the bare header and no rows").toEqual({
      label: "reverse search",
      rows: [],
      current: null,
    });

    store.searchType("h");
    const first = store.searchLayer(ANCHOR);
    expect(read(first), "three of four entries contain h; the newest is the hit").toEqual({
      label: "reverse search  1 of 3",
      rows: ["/history --all", "/history", "/help"],
      current: "/history --all",
    });
    expect(first.cursor, "the query is the prompt's line, so the layer has no caret").toBeUndefined();

    store.searchOlder();
    expect(read(store.searchLayer(ANCHOR)), "stepping older: rank 2, and only one older match is left").toEqual({
      label: "reverse search  2 of 3",
      rows: ["/history", "/help"],
      current: "/history",
    });

    store.searchType("z");
    expect(read(store.searchLayer(ANCHOR)), "a typo: no match, and the retained hit is kept (C20 I22)").toEqual({
      label: "reverse search  no match",
      rows: ["/history"],
      current: "/history",
    });
    expect(store.searchLayer(ANCHOR).id).toBe(SEARCH_ID);
  });

  it("T1.22 (C20 I31): at the oldest match `⌃r` keeps the count true, and a multi-line match stays one row", async () => {
    const { store } = await openWith(seedFiles([entry("/deploy \\\n  --now"), entry("/ps")]));
    store.searchOpen("");
    store.searchType("e");
    store.searchOlder();
    const layer = read(store.searchLayer(ANCHOR));
    expect(layer.label, "one match, and the failed step does not change what is true").toBe("reverse search  1 of 1");
    expect(layer.rows, "the newline is escaped, so the row is one").toHaveLength(1);
    expect(layer.rows[0], "and it still reads as the command").toContain("/deploy");
    expect(layer.rows[0]).not.toContain("\n");
  });

  it("T1.22 (C20 I31): the list is the hit and two older matches however many there are, and the entries between are not the matches", async () => {
    const { store } = await openWith(
      seedFiles([entry("/h1"), entry("/h2"), entry("/ps"), entry("/h3"), entry("/h4"), entry("/h5"), entry("/ps")]),
    );
    store.searchOpen("");
    store.searchType("h");
    store.searchOlder();
    expect(read(store.searchLayer(ANCHOR)), "rank 2 of 5; the next two older matches skip /ps").toEqual({
      label: "reverse search  2 of 5",
      rows: ["/h4", "/h3", "/h2"],
      current: "/h4",
    });
  });

  it("T1.23 (C20 I31, I32): `matches` are counted over entries as they are now, and `accept` returns the captured command", async () => {
    const { store } = await openWith(FILES);
    store.searchOpen("draft");
    store.searchType("hist");
    store.append("/history --again", 5);
    store.searchType("o");
    expect(store.searchState?.total, "an append during the search is counted at the next keystroke").toBe(3);
    // Narrowing resumes from the retained hit (C20 I22), so the newer append is
    // counted and is not the hit: the walk the reader made is not undone.
    expect(store.searchState?.rank, "the hit is still the one walked to, now second newest").toBe(2);
    expect(store.searchEnd("accept"), "the command as found, never re-read by index (C20 I23)").toBe("/history --all");
    expect(store.searchState, "ended").toBeNull();
  });
});
