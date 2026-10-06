// C19 I32, I33, I34 — what a menu row draws, the status row under them, and
// the ghost under an open menu (§029, §097, design check I9).
//
// Read from the blocks the shell pushes, where the declarations are; the frame
// is read in the integration file, where the ink is.
import { describe, expect, it } from "vitest";

import { ghostOf, menuBlocks, menuRowsShown } from "../../src/interaction/completion/index.js";
import type { MenuKey } from "../../src/interaction/completion/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";

const REST: readonly MenuKey[] = [
  { keys: "⏎", does: "run" },
  { keys: "⇥", does: "complete" },
  { keys: "esc", does: "close" },
];

const tableOf = (blocks: readonly Block[]) => {
  const t = blocks.find((b) => b.kind === "table");
  if (t === undefined || t.kind !== "table") throw new Error("the menu is a table");
  return t;
};

describe("C19 I32 — a row marks its match and draws its hint beside the label", () => {
  const CANDIDATES = [
    { value: "/capabilities", detail: "the rendering route" },
    { value: "/clear", detail: "empty the transcript" },
    { value: "/other", display: "elsewhere", detail: "a display that is not the value" },
  ];

  it("T1.73 (C19 I32): the hint column is left-aligned, muted and the flex column, the label is not flex and outranks it, and a label beginning with the prefix carries an accent bold span", () => {
    const t = tableOf(menuBlocks(CANDIDATES, 0, 0, { prefix: "/c" }));
    const [label, hint] = t.columns;
    expect(hint?.align, "the hint sits beside the label, not against the edge").toBe("left");
    expect(hint?.flex, "and it is the column that takes the spare width").toBe(true);
    expect(label?.flex, "the label sits at its floor").not.toBe(true);
    expect(label?.priority ?? 0, "and outranks the hint, so a narrow region drops the hint first").toBeGreaterThan(
      hint?.priority ?? 0,
    );
    for (const r of t.rows) expect(r.cells["detail"]?.tone, "every hint is muted").toBe("muted");

    expect(t.rows[0]?.cells["value"]?.spans, "the match over the typed prefix").toEqual([
      { from: 0, to: 2, bold: true, tone: "accent" },
    ]);
    expect(t.rows[1]?.cells["value"]?.spans).toEqual([{ from: 0, to: 2, bold: true, tone: "accent" }]);
    expect(t.rows[2]?.cells["value"]?.spans, "a display that does not begin with it matched through its value: no mark").toBeUndefined();
  });

  it("T1.73 (C19 I32, ruling 105 a): a toned label keeps its tone and its span is bold alone, and an empty prefix marks nothing", () => {
    const toned = tableOf(menuBlocks([{ value: "--status", tone: "warn" as const }], 0, 0, { prefix: "--s" }));
    expect(toned.rows[0]?.cells["value"]).toEqual({
      text: "--status",
      tone: "warn",
      spans: [{ from: 0, to: 3, bold: true }],
    });
    const none = tableOf(menuBlocks(CANDIDATES, 0, 0, { prefix: "" }));
    expect(none.rows.map((r) => r.cells["value"]?.spans), "no prefix, no span").toEqual([undefined, undefined, undefined]);
  });
});

describe("C19 I33 — the status row", () => {
  const status = (blocks: readonly Block[]) => {
    const last = blocks.at(-1);
    if (last === undefined || last.kind !== "raw") throw new Error("the last block is the status row");
    return last;
  };

  it("T1.74 (C19 I33): the last block is `shown of total` then the keys, toned per part, whether or not anything was cut, and there is no `+ N more`", () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ value: `/c${String(i)}` }));
    const cut = status(menuBlocks(six, 0, 4, { prefix: "/c", keys: REST }));
    expect(cut.text, "six shown of ten, and the keys").toBe("  6 of 10   ⏎ run   ⇥ complete   esc close");
    expect(cut.spans, "count muted, each chord accent, each word muted").toEqual([
      { from: 2, to: 9, tone: "muted" },
      { from: 12, to: 13, tone: "accent" },
      { from: 14, to: 17, tone: "muted" },
      { from: 20, to: 21, tone: "accent" },
      { from: 22, to: 30, tone: "muted" },
      { from: 33, to: 36, tone: "accent" },
      { from: 37, to: 42, tone: "muted" },
    ]);
    expect(JSON.stringify(menuBlocks(six, 0, 4, { keys: REST })), "no residue row").not.toContain("more");

    // **Not for a menu showing all it holds** (§097, C19 T5.3): a row always
    // present spends a candidate at the minimum region to say `3 of 3`.
    const whole = menuBlocks(six, 0, 0, { keys: REST });
    expect(whole.map((b) => b.kind), "the edge and the table, no status row").toEqual(["rule", "table"]);
  });

  it("T1.74 (C19 I33): at a narrow width whole keys shed from the end and the count stays; an empty set draws nothing", () => {
    const some = [{ value: "/a" }, { value: "/b" }];
    const at = (width: number) => status(menuBlocks(some, 0, 1, { keys: REST, width })).text;
    expect(at(41), "all three fit").toBe("  2 of 3   ⏎ run   ⇥ complete   esc close");
    expect(at(30), "the last is shed, whole").toBe("  2 of 3   ⏎ run   ⇥ complete");
    expect(at(16), "then the next").toBe("  2 of 3   ⏎ run");
    expect(at(3), "never the count").toBe("  2 of 3");
    expect(menuBlocks([], 0, 0, { keys: REST }), "nothing to show, nothing drawn").toHaveLength(0);
  });

  it("T1.74 (C19 I33, I23): the chrome is one row when everything is shown and two when something was cut", () => {
    const placed = (height: number, truncated: boolean) =>
      ({ height, truncated }) as unknown as Parameters<typeof menuRowsShown>[0];
    expect(menuRowsShown(placed(6, false))).toBe(5);
    expect(menuRowsShown(placed(6, true))).toBe(4);
  });
});

describe("C19 I34 — the ghost under a menu", () => {
  it("T1.75 (C19 I34): the value past the prefix, and null for a value not beginning with it, an equal value and a chip", () => {
    expect(ghostOf("/c", { value: "/capabilities" })).toBe("apabilities");
    expect(ghostOf("/c", { value: "/c" }), "nothing to add").toBeNull();
    expect(ghostOf("/c", { value: "other" }), "not a continuation").toBeNull();
    expect(ghostOf("@p", { value: "@parse.ts", chip: { kind: "file", name: "parse.ts", content: "" } }), "a chip lands, not text").toBeNull();
    expect(ghostOf("/c", undefined)).toBeNull();
  });
});
