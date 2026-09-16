// C22 I106 — the visibility gate's set of ids is built once per range object
// (F1201).
//
// **Identity and freshness, both asserted**, because the two mutations named in
// T6.121 each break one and pass the other: a set rebuilt on every call has the
// right members and a fresh identity each time; a set never rebuilt has the
// first identity and the wrong members. The range is constructed by hand —
// `VisibleRange` is a frozen record and the class reads only `entries[].id`.
import { describe, expect, it } from "vitest";

import { VisibleIds } from "../../src/shell/visible-ids.js";
import type { VisibleEntry, VisibleRange } from "../../src/viewport/viewport/types.js";

const entry = (id: string): VisibleEntry => ({ id, skipRows: 0, takeRows: 1, live: false });
const range = (...ids: string[]): VisibleRange =>
  Object.freeze({ entries: ids.map(entry), topRow: 0, atTop: true, atBottom: true });

describe("C22 visible ids (F1201)", () => {
  it("T1.61 (I106): one set per range object, by identity, and a fresh one for a fresh range", () => {
    const ids = new VisibleIds();
    const first = range("a", "b", "c");
    const set = ids.of(first);
    expect([...set].sort(), "exactly the range's three ids").toEqual(["a", "b", "c"]);
    expect(set.has("d"), "an id outside the range").toBe(false);

    expect(ids.of(first), "the same range object: the same set, by identity").toBe(set);

    const second = range("d");
    const next = ids.of(second);
    expect(next, "a different range object: a different set").not.toBe(set);
    expect([...next], "built from the second range").toEqual(["d"]);
    expect(next.has("a"), "the first range's member is not answered from the second's set").toBe(false);

    // The gate's shape, as construct.ts writes it: a view host is visible
    // while declared (C23 I33), whatever the range holds.
    const visible = (host: { kind: "view" | "transcript"; id: string }, r: VisibleRange): boolean =>
      host.kind === "view" || ids.of(r).has(host.id);
    expect(visible({ kind: "view", id: "zzz" }, second), "a view host absent from every range").toBe(true);
    expect(visible({ kind: "transcript", id: "zzz" }, second)).toBe(false);
    expect(visible({ kind: "transcript", id: "d" }, second)).toBe(true);
  });
});

describe("C22 I108 — the paced schedule (F1206)", () => {
  it.todo("T1.63 (C22 I108): pacedSchedule dates consecutive windows end to end — not deferred on a component: the code commit replaces this row");
});
