// C04 I64 — the shape `hierarchy` carries, at both gates (F221).
//
// **The field reached the renderer with nothing asked of it**, because C04's
// gate is written member by member and this is not a member — it is a shape. So
// the rows here attack the walk clause by clause and both gates that call it,
// plus the one guard in the renderer that HG5 reads a frame through.
//
// Anchors checked for uniqueness before the pass: `if (root === undefined)
// return emptyRows(block, layout, ctx);` appears **twice** in `definition.ts`,
// which is F219's class exactly — so that row anchors on the function it is in
// rather than on the line it changes.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const TYPES = "src/data/viewmodel/types.ts";
const VAL = "src/data/viewmodel/validate.ts";
const BUILD = "src/shell/builders/index.ts";
const DEF = "src/presentation/plot/definition.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync("npx vitest run test/unit/plot-hierarchy-gate.test.ts 2>&1", {
      cwd: ROOT, encoding: "utf8", timeout: 300_000,
    });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.code === "ETIMEDOUT" ? `${out}\nTIMED OUT` : out;
  }
};

const TREEMAP_GUARD =
  "function treemapRows(block: Plot, width: number, ctx: RenderContext): readonly string[] {\n" +
  "  const root = block.hierarchy;\n" +
  "  const areaRows = plotAreaRows(block);\n" +
  "  const layout: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width };\n" +
  "  if (root === undefined) return emptyRows(block, layout, ctx);";

const results = runPass({
  read,
  write,
  run,
  control: {
    file: TYPES,
    from: '  flame: "magnitude", icicle: "magnitude", treemap: "magnitude",',
    to: "  flame: null, icicle: null, treemap: null,",
    why:
      "the three forms that read a hierarchy marked as reading none: the refusal then fires on " +
      "all forty-four and no row below can tell a scope from a blanket ban",
  },
  mutations: [
    {
      // **The state the field shipped in.** No clause anywhere, and every one of
      // the six measured shapes accepted at the document gate.
      name: "the document gate never opens the field",
      file: VAL,
      from: "    plotHierarchyErrors(b, e, at, form);",
      to: "    void form;",
      expect: "HG1",
    },
    {
      // The author-facing half. `b.plot` is where a caller finds out and the
      // validator is where an untrusted document does.
      name: "the constructor never opens the field",
      file: BUILD,
      from: '    const fault = hierarchyFault(hierarchy, role === "magnitude", "hierarchy");',
      to: "    const fault = null;",
      expect: "HG1",
    },
    {
      // A child that is the number `42` — accepted, and `extentOf` reads
      // `.value` off it as `undefined`.
      name: "a node need not be an object",
      file: VAL,
      from: '  if (!isRecord(node)) return `${path} must be an object with a "label"`;',
      to: "  if (!isRecord(node)) return null;",
      expect: "HG1",
    },
    {
      // The measured silent one: `undefined` written into a frame as a name.
      name: "a node need not have a label",
      file: VAL,
      from: '  if (!isString(node["label"])) return `${path}.label must be a string`;',
      to: "  if (!isString(node[\"label\"])) return null;",
      expect: "HG1",
    },
    {
      // The magnitude clause, which is the whole reason the role is not a
      // boolean: three forms divide space in proportion to this number.
      name: "a magnitude form accepts a node with no value",
      file: VAL,
      from: "    if (typeof v !== \"number\" || !Number.isFinite(v) || v < 0) {",
      to: "    if (false) {",
      expect: "HG1",
    },
    {
      // Half of the same clause: a negative magnitude is clamped by `extentOf`
      // and draws a tile of zero area, which is a datum silently discarded.
      name: "a negative magnitude is accepted",
      file: VAL,
      from: "    if (typeof v !== \"number\" || !Number.isFinite(v) || v < 0) {",
      to: "    if (typeof v !== \"number\" || !Number.isFinite(v)) {",
      expect: "HG1",
    },
    {
      // `children: "nope"` — the shape that reached `[plot failed to render]`.
      name: "children need not be an array",
      file: VAL,
      from: "  if (!isArray(kids)) return `${path}.children must be an array`;",
      to: "  if (!isArray(kids)) return null;",
      expect: "HG1",
    },
    {
      // The bound the walk needs rather than the depth anybody has: without it
      // a cyclic object graph from a builder call exhausts the stack.
      name: "the walk is unbounded",
      file: VAL,
      from: "  if (depth > HIERARCHY_MAX_DEPTH) { // cells-ok — a depth index",
      to: "  if (false) { // cells-ok — a depth index",
      expect: "HG3",
    },
    {
      // F220's class in a second member: accepted on the forty-one forms that
      // do nothing with it.
      name: "a hierarchy is accepted on a form that reads none",
      file: VAL,
      from: "  if (role === null) {",
      to: "  if (false) {",
      expect: "HG2",
    },
    {
      // The path, which is what makes a message about a tree usable at all —
      // one fault two levels down reported as *something is wrong somewhere*.
      name: "the fault names the block rather than the node",
      file: VAL,
      from: "    const fault = hierarchyFault(kid, needsValue, `${path}.children[${String(i)}]`, depth + 1); // cells-ok — a depth index",
      to: "    const fault = hierarchyFault(kid, needsValue, path, depth + 1); // cells-ok — a depth index",
      expect: "HG1",
    },
    {
      // **The row HG5 exists for.** The record is a claim about which renderers
      // read the field, and only a frame can say whether one does — a mutation
      // of the record itself is invisible to HG5 and caught by HG2 instead.
      name: "the treemap stops reading its hierarchy",
      file: DEF,
      from: TREEMAP_GUARD,
      to: TREEMAP_GUARD.replace(
        "  if (root === undefined) return emptyRows(block, layout, ctx);",
        "  if (root !== undefined || root === undefined) return emptyRows(block, layout, ctx);",
      ),
      expect: "HG5",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
