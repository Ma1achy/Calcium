// C12 I57 §3ah — `tree`, three layouts of one drawing.
//
// **Every anchor here was checked for uniqueness before the pass** (F219), and
// one failed: `const kids = keptKids(nodes, kept, i);` appears five times in
// `tree.ts`, so the row that mutates it anchors on the surrounding lines of the
// placement walk instead.
//
// The rows split into three kinds — the arithmetic the frame is the only witness
// to (the `max`, the parent's centre, the placement's kept set), the ladder that
// is not a ladder (the preference order, the shared tail), and the two gates.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const TREE = "src/presentation/plot/tree.ts";
const DEF = "src/presentation/plot/definition.ts";
const VAL = "src/data/viewmodel/validate.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync("npx vitest run test/unit/plot-tree.test.ts 2>&1", {
      cwd: ROOT, encoding: "utf8", timeout: 300_000,
    });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.code === "ETIMEDOUT" ? `${out}\nTIMED OUT` : out;
  }
};

const PLACE_KIDS =
  "    const own = cells(label, caps.ambiguousWidth);\n" +
  "    const kids = keptKids(nodes, kept, i);";

const results = runPass({
  read,
  write,
  run,
  control: {
    file: TREE,
    from: 'export const TREE_LAYOUTS = ["topDown", "leftRight", "outline"] as const;',
    to: 'export const TREE_LAYOUTS = ["outline", "leftRight", "topDown"] as const;',
    why:
      "the preference order reversed: `auto` takes the outline wherever it fits, so every row " +
      "asserting which drawing was chosen is answering about a different one",
  },
  mutations: [
    {
      // **The interaction a plan formula did not have.** Without the `max` the
      // wide-parent tree is 5 columns rather than 20 and the parent's name is
      // drawn over its siblings — with the leaf positions, the depth and the
      // node total all agreeing.
      name: "a subtree is as wide as its children and never as wide as its own name",
      file: TREE,
      from: "  return Math.max(own, span); // cells-ok — a cell count",
      to: "  return span; // cells-ok — a cell count",
      expect: "TR1",
    },
    {
      // **The off-by-one the plan predicted, from the direction it predicted.**
      // Centring the label in its own block agrees with centring it on its
      // children only where the two parities agree; where they differ the parent
      // sits one column off and every count still agrees.
      name: "a parent is centred on its block rather than on its children",
      file: TREE,
      from: "      labelX = Math.max(x0, mid - Math.floor((own - 1) / 2)); // cells-ok — a column position",
      to: "      labelX = x0 + Math.floor((block - own) / 2); // cells-ok — a column position",
      expect: "TR10",
    },
    {
      // Placement over the whole tree with truncation applied after it: every
      // surviving parent centred over a span that includes the subtree that is
      // gone, sitting over blank cells.
      name: "placement runs before truncation",
      file: TREE,
      from: PLACE_KIDS,
      to: PLACE_KIDS.replace("keptKids(nodes, kept, i)", "nodes[i]!.kids"),
      expect: "TR5",
    },
    {
      // The tail every layout's sequence ends in. Without it a depth cut cannot
      // narrow a broad tree and a leaf cut cannot narrow a deep one — the
      // measured case is a chain one column short, where nothing is dropped and
      // a name is silently clipped instead.
      name: "a layout's drop sequence is its own axis alone",
      file: TREE,
      from: '  for (let k = nodes.length; k >= 0; k -= 1) yield subsetAt(nodes, "outline", k); // cells-ok — a node count',
      to: "  return;",
      expect: "TR1",
    },
    {
      // A bar where nothing branches: a fan of one resolves to `┼` rather than
      // `│`, and the two cases stop differing in the frame.
      name: "a fan of one is drawn as a bar",
      file: TREE,
      from: "      setMask(g, row, c, (c > first ? LINE_LEFT : 0) | (c < last ? LINE_RIGHT : 0));",
      to: "      setMask(g, row, c, LINE_LEFT | LINE_RIGHT);",
      expect: "TR6",
    },
    {
      // C12 I9's grid, and the one layout whose ASCII arm is free because both
      // alphabets have a four-cell form.
      name: "the outline's indent is two cells",
      file: TREE,
      from: "const OUTLINE_INDENT = 4;",
      to: "const OUTLINE_INDENT = 2;",
      expect: "TR7",
    },
    {
      // **The `Math.max` that cost the notice its row.** Restored, the drawing
      // takes the only row there is and `composeRows` drops the notice — a tree
      // that did not fit renders its figure and says nothing about what is
      // missing, which is C12 I8's exact subject.
      name: "the drawing keeps a floor of one row and the notice takes what is left",
      file: TREE,
      from: "  const budget = fits ? areaRows : areaRows - 1; // cells-ok — a row count",
      to: "  const budget = fits ? areaRows : Math.max(1, areaRows - 1); // cells-ok — a row count",
      expect: "TR1",
    },
    {
      // C12 I8 itself: nodes dropped in silence.
      name: "the overflow row is not drawn",
      file: DEF,
      from: "  if (drawn.dropped.length > 0) { // cells-ok — a node count",
      to: "  if (false) { // cells-ok — a node count",
      expect: "TR3",
    },
    {
      // A display width from `.length`, which is right for ASCII and wrong for
      // every wide codepoint — the class SS23 exists for, inside a new module.
      name: "a label's width is its codepoint count",
      file: TREE,
      from: "    out[n.depth] = Math.max(out[n.depth] ?? 0, cells(n.label, caps.ambiguousWidth)); // cells-ok — a cell count",
      to: "    out[n.depth] = Math.max(out[n.depth] ?? 0, n.label.length); // cells-ok — a cell count",
      expect: "TR11",
    },
    {
      // The member's scope: accepted on the forty-four forms that have one
      // layout, which is F220's class in a third member.
      name: "`treeLayout` is accepted on every form",
      file: VAL,
      from: '  if (form !== "tree") {',
      to: "  if (false) {",
      expect: "TR12",
    },
    {
      // A structure form with nothing to draw, accepted and rendered as an
      // empty message — which reads as *no data* where the truth is *no field*.
      name: "a tree with no hierarchy is accepted",
      file: VAL,
      from: '    if (role === "structure") {',
      to: "    if (false) {",
      expect: "TR12",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
