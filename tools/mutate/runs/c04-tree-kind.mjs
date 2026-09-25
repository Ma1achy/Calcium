// C04 I129–I131 — the tree (§3ap, §105): its ladder, its flags, its twisty.
//
// **Every mutation here draws a plausible tree.** A per-row indent cap, an
// aside dropped from one row, a folder with no children drawn as a leaf — each
// is a frame a reader would accept without a second to compare it against,
// which is why the rows assert literal frames rather than properties.
//
// The one the walk found is first: the per-row cap (§3ap L4), which inverts
// depth and reads as *capped more generously*.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const KIND = "src/presentation/blocks/kinds/tree.ts";
const PATCH = "src/data/viewmodel/patch.ts";
const VALIDATE = "src/data/viewmodel/validate.ts";
const ACTIONS = "src/shell/actions.ts";
const SEMANTICS = "src/presentation/blocks/semantics.ts";
const FILES = "test/unit/tree.test.ts test/integration/tree-expand.test.ts test/contract/semantics.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 600_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 600000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change every guided frame can see** (F1254): the step with guides
    // widens by a cell, so §105's figure draws `│   ▿ interaction`.
    file: KIND,
    from: "const GUIDED_STEP = 3;",
    to: "const GUIDED_STEP = 4;",
    why: "every guided row gains a cell per depth, so §105's figure at 40 no longer matches T1.53's literal",
  },
  mutations: [
    {
      // **THE DEFECT the walk found** (§3ap L4, commitment 114). Each row capped
      // by its own name — a deep short name then starts right of its shallow
      // long parent, and the row reads as generous.
      name: "THE DEFECT: the indent is capped per row, by the row's own name",
      file: KIND,
      from: "        const indent = Math.min(rung.step * r.depth, rung.cap);",
      to: "        const indent = rung.cap === Infinity ? rung.step * r.depth : Math.min(rung.step * r.depth, Math.max(0, w - TWISTY_CELLS - measure(stripControl(r.node.label))));",
      expect: "T1.53",
    },
    {
      // L2 — the asides go before the guides: decoration outlives content.
      name: "the asides go first and the guides stay",
      file: KIND,
      from: "  if (fits(BARE_STEP, true)) return { guides: false, step: BARE_STEP, asides: true, cap: Infinity };",
      to: "  if (fits(GUIDED_STEP, false)) return { guides: true, step: GUIDED_STEP, asides: false, cap: Infinity };",
      expect: "T1.53",
    },
    {
      // L3 — one row's aside dropped, the rest kept: a column with a hole.
      name: "an aside goes alone rather than as a group",
      file: KIND,
      from: "        const aside = rung.asides && r.node.aside !== undefined ? stripControl(r.node.aside) : \"\";",
      to: "        const aside = r.node.aside !== undefined && indent + TWISTY_CELLS + measure(stripControl(r.node.label)) + ASIDE_GAP + measure(stripControl(r.node.aside)) <= w ? stripControl(r.node.aside) : \"\";",
      expect: "T1.53",
    },
    {
      // C04 I131 — the twisty takes focus's filled mark, as §105's figure draws it.
      name: "the collapsed twisty is focus's mark",
      file: KIND,
      from: "glyphFor(r.node.expanded === true ? \"collapse\" : \"expand\", caps)",
      to: "glyphFor(r.node.expanded === true ? \"collapse\" : \"focus\", caps)",
      expect: "T1.54",
    },
    {
      // L6 — a folder with nothing in it drawn as a leaf.
      name: "an empty folder has no twisty",
      file: KIND,
      from: "const hasTwisty = (node: TreeNode): boolean => node.children !== undefined;",
      to: "const hasTwisty = (node: TreeNode): boolean => (node.children?.length ?? 0) > 0; // cells-ok",
      expect: "T1.52",
    },
    {
      // L7 — a leaf's `expanded` draws a twisty that does nothing.
      name: "an expanded leaf draws a twisty",
      file: KIND,
      from: "const hasTwisty = (node: TreeNode): boolean => node.children !== undefined;",
      to: "const hasTwisty = (node: TreeNode): boolean => node.children !== undefined || node.expanded === true;",
      expect: "T1.52",
    },
    {
      // C04 I129 — visibility ignores the flags: every node drawn.
      name: "a collapsed node's children are drawn",
      file: KIND,
      from: "    if (node.children !== undefined && node.expanded === true) visibleRows(node.children, depth + 1, out);",
      to: "    if (node.children !== undefined) visibleRows(node.children, depth + 1, out);",
      expect: "T1.53",
    },
    {
      // C04 I129 — uniqueness per level rather than per block.
      name: "node ids are unique per level only",
      file: VALIDATE,
      from: "        walk(children, `${here}.children`);",
      to: "        const outer = new Map(ids); walk(children, `${here}.children`); ids.clear(); for (const [k, v] of outer) ids.set(k, v);",
      expect: "T1.52",
    },
    {
      // C04 I129 — `op: "expand"` reaches the roots only.
      name: "the expand op does not descend",
      file: PATCH,
      from: "              const children = withNodeExpanded(node.children, id, expanded);",
      to: "              const children = null as readonly TreeNode[] | null; void withNodeExpanded;",
      expect: "T1.55",
    },
    {
      // L8 — collapsing a node clears its descendants' flags.
      name: "a collapse forgets the subtree's expansion",
      file: PATCH,
      from: "        ? { ...node, expanded }",
      to: "        ? { ...node, expanded, ...(expanded || node.children === undefined ? {} : { children: node.children.map((c) => ({ ...c, expanded: false })) }) }",
      expect: "T1.52",
    },
    {
      // C23 I31 — the dispatcher still looks for tables alone.
      name: "the expand action does not search trees",
      file: ACTIONS,
      from: "              : b.kind === \"tree\"\n                ? findNode(b.nodes, action.target)\n                : undefined;\n          if (row === undefined) continue;",
      to: "              : undefined;\n          void findNode;\n          if (row === undefined) continue;",
      expect: "T4.72",
    },
    {
      // C09 I118 — a tree's rows read as a table's.
      name: "a tree's rows read row, not treeitem",
      file: SEMANTICS,
      from: "    role: parent === \"tree\" ? \"treeitem\" : e.level === \"cell\" ? \"cell\" : \"row\",",
      to: "    role: parent === (\"never\" as SemanticRole) ? \"treeitem\" : e.level === \"cell\" ? \"cell\" : \"row\",",
      expect: "T2.180",
    },
    {
      // The element's affordance: a folder that cannot be opened by key.
      name: "a node with children declares no activate",
      file: KIND,
      from: "        ...(hasTwisty(r.node)\n          ? {",
      to: "        ...(false\n          ? {",
      expect: "T2.180",
    },
  ],
});

// Printed and exited on, not merely computed (F768).
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
