// The copy mode's keys (C14 I37, I59, I60; rulings 36, 70, 71).
//
// **⏎ against y, esc's label against esc's press, and the rectangle against
// the block set**: each pair is two statements that are each true alone, and
// each mutation keeps one and breaks the other.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/copy-rect.test.ts test/unit/semantic-selection.test.ts test/unit/router-keymap.test.ts test/integration/copy-keys.test.ts";
const MODEL = "src/shell/semantic-selection.ts";
const SESSION = "src/shell/session.ts";
const KEYMAP = "src/interaction/router/keymap.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // **⏎ and y one key again** — the mode loses its copy that leaves.
    name: "⏎ bound back to copySelectedEntries",
    file: KEYMAP,
    from: '{ target: "semanticSelection", ...fromRegistry("confirm"), action: "copyAndLeaveSemanticSelection" },',
    to: '{ target: "semanticSelection", ...fromRegistry("confirm"), action: "copySelectedEntries" },',
    expect: "T1.47 (C14 I47",
  },
  {
    // **As it shipped (M10.5)**: a `rule` alone says `esc out` over a press that clears.
    name: "the esc label read from size",
    file: SESSION,
    from: "      clears: semantic.hasSelection(mode),",
    to: "      clears: size !== null,",
    expect: "T3.15 (C14 I59",
  },
  {
    name: "a rectangle is not a selection",
    file: MODEL,
    from: "  mode !== null && (mode.rect !== null || mode.blocks.size > 0);",
    to: "  mode !== null && mode.blocks.size > 0;",
    expect: "T1.80 (C14 I55",
  },
  {
    // **Ruling 70's clamp gone** — the rectangle reaches past its block.
    name: "clampColumn ignores the span's columns",
    file: MODEL,
    from: "  if (span.cols === undefined) return column;\n  return Math.min(",
    to: "  if (span.cols !== null) return column;\n  return Math.min(",
    expect: "T1.79 (C14 I60",
  },
  {
    name: "the seed at column 0",
    file: MODEL,
    from: "  const at = Object.freeze({ ...mode.caret, column: span?.cols?.from ?? 0 });",
    to: "  const at = Object.freeze({ ...mode.caret, column: 0 });",
    expect: "T1.79 (C14 I60",
  },
  {
    name: "⌃V off drops the block set",
    file: MODEL,
    from: "  if (mode.rect !== null) return frozen(mode.caret, mode.anchor, mode.blocks, null);",
    to: "  if (mode.rect !== null) return frozen(mode.caret, mode.anchor, new Set<string>(), null);",
    expect: "T1.79 (C14 I60",
  },
  {
    // **`all loaded entries` beside a rectangle** — the footer table's finding.
    name: "selectsAll ignores the rectangle",
    file: MODEL,
    from: "  if (mode === null || mode.rect !== null || spans.length === 0) return false;",
    to: "  if (mode === null || spans.length === 0) return false;",
    expect: "T1.80 (C14 I55",
  },
  {
    // **Every over an empty set is true** — nothing loaded reads as all of it.
    name: "selectsAll without the empty guard",
    file: MODEL,
    from: "  if (mode === null || mode.rect !== null || spans.length === 0) return false;",
    to: "  if (mode === null || mode.rect !== null) return false;",
    expect: "T1.80 (C14 I55",
  },
  {
    // **C14 I37's keyboard half** — the caret walks off the screen.
    name: "the keyboard move reveals nothing",
    file: SESSION,
    from: "    if (caret !== null) graph.revealSemanticCaret(caret, width);",
    to: "    if (caret !== null && width < 0) graph.revealSemanticCaret(caret, width);",
    expect: "T3.14 (C14 I37",
  },
  {
    // **Ruling 71, silent**: the press does nothing and says nothing.
    name: "an empty copy is silent",
    file: SESSION,
    from: '    if (!semantic.hasSelection(mode)) {\n      this.#raiseToast("nothing selected");',
    to: '    if (!semantic.hasSelection(mode)) {\n      void 0;',
    expect: "T3.15 (C14 I59",
  },
  {
    // **Ruling 71, leaving**: ⏎ on nothing ends the mode.
    name: "an empty copy leaves",
    file: SESSION,
    from: '      this.#raiseToast("nothing selected");\n      return;',
    to: '      this.#raiseToast("nothing selected");\n      if (leave) this.#exitSemanticSelection();\n      return;',
    expect: "T4.40 (C14",
  },
  {
    name: "a copy of no text says it copied",
    file: SESSION,
    from: '    if (text === "") {\n      this.#raiseToast("the selection copies no text");\n      return;\n    }',
    to: "",
    expect: "T3.15 (C14 I59",
  },
  {
    // **§6e trace row 14** — the tick extends the block set in the rectangle.
    name: "the autoscroll tick extends blocks in the rectangle",
    file: SESSION,
    from: "      this.#semantic.rect !== null\n        ? semantic.extendRectTo(this.#semantic, Object.freeze({ ...caret, column: this.#dragColumn }))",
    to: "      this.#semantic.rect === undefined\n        ? semantic.extendRectTo(this.#semantic, Object.freeze({ ...caret, column: this.#dragColumn }))",
    expect: "T4.42 (C14",
  },
  {
    name: "the drag's column dropped",
    file: SESSION,
    from: "    this.#dragColumn = column;",
    to: "    this.#dragColumn = 0;",
    expect: "T4.42 (C14",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254): ⌃V bound to nothing,
    // so every rectangle row in the suite starts in block mode.
    file: KEYMAP,
    from: '{ target: "semanticSelection", key: { name: "v", ctrl: true }, action: "toggleSemanticRect" },',
    to: '{ target: "semanticSelection", key: { name: "v", ctrl: true, meta: true }, action: "toggleSemanticRect" },',
    why: "⌃V no longer reaches the rectangle, so T4.41 and T4.42 fail — if this survives, nothing drives the key",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
