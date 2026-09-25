// C23 §3a — the expand action reaching a tree's node (C04 §3ap E1).
//
// Through the dispatcher and a real transcript store, so the walk that finds
// the node, the patch that flips it and the rows the entry then draws are one
// path — the three halves C23 I31 and C04 I129 each state alone.
import { describe, expect, it } from "vitest";

import { block } from "../../src/data/viewmodel/index.js";
import { createActionDispatcher } from "../../src/shell/actions.js";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { doc } from "../support/blocks.js";
import type { Block } from "../../src/data/viewmodel/index.js";

const registry = createBlockRegistry({ defaults: true });

describe("C23 §3a — expand on a tree", () => {
  it("T4.72 (C23 I31, C04 I129): a node two levels down, inside a panel", () => {
    const tree = block({
      kind: "tree",
      id: "t",
      nodes: [
        {
          id: "src",
          label: "src",
          expanded: true,
          children: [
            {
              id: "interaction",
              label: "interaction",
              expanded: true,
              children: [{ id: "parser", label: "parser", children: [{ id: "decode", label: "decode.ts" }, { id: "lex", label: "lex.ts" }] }],
            },
          ],
        },
      ],
    });
    const store = createTranscriptStore();
    const id = store.append(doc({ blocks: [block({ kind: "panel", id: "p", title: "files", children: [tree] })] }));
    expect(store.entries, "the fixture appended").toHaveLength(1);

    const said: string[] = [];
    const dispatch = createActionDispatcher({
      transcript: store,
      editor: { setText: () => undefined },
      scheduler: { commit: () => undefined },
      openUrl: async () => undefined,
      submit: () => undefined,
      refuse: (_from, text) => said.push(text),
      notify: (text) => said.push(text),
    });
    const rows = (): number => registry.measure(store.entries[0]?.doc.blocks[0] as Block, 40);

    const before = rows();
    dispatch({ kind: "expand", label: "expand", target: "parser" }, id);
    expect(said, "nothing refused").toEqual([]);
    expect(rows(), "the entry grows by parser's two children").toBe(before + 2);

    dispatch({ kind: "expand", label: "collapse", target: "parser" }, id);
    expect(rows(), "and shrinks back").toBe(before);

    // The control: a target no node or row carries is said, and patches nothing.
    dispatch({ kind: "expand", label: "expand", target: "nosuch" }, id);
    expect(said.join("\n")).toMatch(/nothing to expand/u);
    expect(rows()).toBe(before);
  });
});
