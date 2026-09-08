// The twenty-two invariants C04, C25, C26 and C24 had no row for, mutated.
//
// **Every row here was written to *name* an invariant**, which is SP9's subject
// and its own stated blind spot: it checks that an invariant is named, never
// that the row naming it checks it. This pass is the instrument that asks the
// other half, and for these rows it is the only one — a row citing `C04 I21`
// and asserting nothing about deletion is green in every gate the repo has.
//
// **Two mutations are the finding put back rather than invented pressure.**
// `PILLS-WRAP` turns the first-fit packing into the `ceil(totalWidth / w)` wrap
// this spec's §3 table claimed for it (F928), and `HUNK-MARKER` removes the row
// a collapse marker costs, which is the only observable of C25 I11.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/contract/view-model.test.ts test/contract/patch-window.test.ts " +
  "test/contract/patch-view.test.ts test/contract/block-elements.test.ts";
const PATCHOP = "src/data/viewmodel/patch.ts";
const VALIDATE = "src/data/viewmodel/validate.ts";
const SIMPLE = "src/presentation/blocks/kinds/simple.ts";
const HEIGHT = "src/presentation/patch/height.ts";
const WINDOW = "src/presentation/patch/window.ts";
const BLOCKTYPES = "src/presentation/blocks/types.ts";
const CONSTRUCT = "src/shell/construct.ts";
const REGISTRY = "src/presentation/blocks/registry.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: HEIGHT,
    from: "  return 1 + body + (isCollapsed(hunk.collapsedBefore) ? 1 : 0);",
    to: "  return 0;",
    why: "a hunk with no rows fails every patch height row; a run where this survives is not executing the C25 suites at all",
  },
  mutations: [
    {
      // **F928 put back.** The formula this document carried for the kind: a
      // wrap rather than a packing, which splits a chip at the boundary.
      name: "pills wraps by cells instead of packing chips",
      file: SIMPLE,
      from: "    if (used + needed > limit && line.length > 0) { // cells-ok",
      to: "    if (used + w > limit) { // cells-ok",
      expect: "T2.120",
    },
    {
      // A merge that drops what it was not told about — which makes a dropped
      // row and an unmentioned row the same payload.
      name: "a merge keeps only the rows it names",
      file: PATCHOP,
      from: "  const out = existing.map((row) => {",
      to: "  const out = existing.filter((row) => updates.has(row.id)).map((row) => {",
      expect: "T2.121",
    },
    {
      // `replace` carrying view state across — the one change that would make
      // it and `merge` differ only in deletion semantics.
      name: "replace carries the outgoing block's view state",
      file: PATCHOP,
      from: "      const blocks = rewrite(doc.blocks, patch.blockId, () => patch.block);",
      to:
        "      const blocks = rewrite(doc.blocks, patch.blockId, (old) =>\n" +
        "        old.kind === \"table\" && patch.block.kind === \"table\"\n" +
        "          ? { ...patch.block, rows: patch.block.rows.map((r, i) => ({ ...r, ...(old.rows[i]?.expanded === undefined ? {} : { expanded: old.rows[i].expanded }) })) }\n" +
        "          : patch.block);",
      expect: "T2.122",
    },
    {
      // The payload forging view state, which `stripViewState` exists to refuse.
      name: "an incoming merge row may set expanded",
      file: PATCHOP,
      from: "  if (!(\"expanded\" in row)) return row;",
      to: "  return row;\n  if (!(\"expanded\" in row)) return row;",
      expect: "T2.122",
    },
    {
      // A default on the one kind whose height is not derivable.
      name: "form line defaults its height",
      file: VALIDATE,
      from: '      e.push(`${at}: form "${form}" requires a numeric "height" (C04 §3) — there is no default`);',
      to: "      void form;",
      expect: "T2.123",
    },
    {
      // The schema rebuilt on a merge — equal, and no longer the same object,
      // so C13's identity checks re-render a table that did not change.
      name: "a merge rebuilds the column list",
      file: PATCHOP,
      from: "        return withoutFloor({ ...table, rows: mergeRows(table.rows, patch.rows) });",
      to: "        return withoutFloor({ ...table, columns: [...table.columns], rows: mergeRows(table.rows, patch.rows) });",
      expect: "T2.124",
    },
    {
      // A status box that says something failed and not what.
      name: "an empty status message is accepted",
      file: VALIDATE,
      from: '    if (typeof b["message"] !== "string" || b["message"].trim() === "") {',
      to: '    if (typeof b["message"] !== "string") {',
      expect: "T2.126",
    },
    {
      // C25 I11's only observable: the collapse marker's row.
      name: "a collapsed region costs no row",
      file: HEIGHT,
      from: "  return 1 + body + (isCollapsed(hunk.collapsedBefore) ? 1 : 0);",
      to: "  return 1 + body;",
      expect: "T2.8",
    },
    {
      // I19's non-additivity applied to the row model: a run of one remove and
      // two adds becomes three rows, and every cut stops being additive.
      name: "a run's rows are the sum of its sides",
      file: HEIGHT,
      from: "    rows += Math.max(removes, adds);",
      to: "    rows += removes + adds;",
      expect: "T2.11",
    },
    {
      // The arithmetic ceiling — the first one, and the one that put the
      // bottom of the document out of reach.
      name: "the offset ceiling is total minus height",
      file: WINDOW,
      from: "  return starts[lo] ?? 0;",
      to: "  return Math.max(0, rows.length - height);",
      expect: "T2.12",
    },
    {
      // Snapping up rather than down, so a clamped offset is not itself valid.
      name: "clampOffset does not snap",
      file: WINDOW,
      from: "  return Math.min(bottom, snapDown(rows, wanted));",
      to: "  return Math.min(bottom, wanted);",
      expect: "T2.13",
    },
    {
      // A fifth level makes the scope stack five deep, and nothing else in the
      // tree would say so.
      name: "the level vocabulary gains a value",
      file: BLOCKTYPES,
      from: '  level: "block" | "row" | "cell";',
      to: '  level: "block" | "row" | "cell" | "span";',
      expect: "T2.32",
    },
    {
      // The author's floor ignored, which is one of the four view-state fields
      // T2.119 enumerates — and the one whose absence is invisible in a frame
      // that happened to be tall enough anyway.
      name: "minHeight does not floor the measurement",
      file: REGISTRY,
      // The anchor carries the `try {` below it: `floorOf(block)` is read twice
      // in this file — once here in `measure` and once in the Ink element — and
      // an ambiguous anchor is a mutation whose site nobody chose.
      from: "    const floor = floorOf(block);\n    try {",
      to: "    const floor = 0;\n    try {",
      expect: "T2.119",
    },
    {
      // **The watch, proved to expire.** A `maxExpandHeight` landing in `src/`
      // is the day C25 I14, I15 and I16 stop being vacuous, and the row whose
      // whole value is firing then has to be shown firing.
      name: "maxExpandHeight lands in the tree",
      file: HEIGHT,
      from: "export const SPLIT_AT = 100;",
      to: "export const SPLIT_AT = 100;\nexport const maxExpandHeight = 2;",
      expect: "T2.9",
    },
    {
      // The same, for C26's policy vocabulary.
      name: "ArrowPolicy lands in the tree",
      file: BLOCKTYPES,
      from: '  level: "block" | "row" | "cell";',
      to: '  level: "block" | "row" | "cell";\n  arrow?: ArrowPolicy;',
      expect: "T2.35",
    },
    {
      // A second resolver, which is what I8 says does not exist — and which
      // every behavioural row would agree with until the two parted.
      name: "a second element resolver",
      file: CONSTRUCT,
      from: "    return elementsOfEntry(built.blocks, entry.doc.blocks, deps.frame.overlayRegion().width, entry.doc.command);",
      to:
        "    if (entry.doc.blocks.length === 0) {\n" +
        "      return elementsOfEntry(built.blocks, [], deps.frame.overlayRegion().width, entry.doc.command);\n" +
        "    }\n" +
        "    return elementsOfEntry(built.blocks, entry.doc.blocks, deps.frame.overlayRegion().width, entry.doc.command);",
      expect: "T2.33",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
