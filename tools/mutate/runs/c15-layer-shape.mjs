// C15 I30–I33 — the layer's shape, its pointer, a displaced panel and the
// generation, mutated (review batch 3, M7 item 5, M8 items 2, 6 and 7).
//
// **Each of these reads as a working stack when broken.** A refused
// combination that is accepted places like any other layer; a `displaced`
// reason read as `explicit` leaves a question answered and a prompt with no
// menu, which is what a reader who closed the menu would see anyway; a counter
// that moves too often moves in every row that only asks whether it moved. So
// each mutation names the row that sees the difference.
//
// The control is T6.28: C15 I28's reason reverted to `explicit`, which is the tree
// before C15 I32, and the owner drops the menu instead of holding it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/overlay.test.ts test/integration/overlay-displaced.test.ts " +
  "test/integration/completion-as-you-type.test.ts test/integration/confirm.test.ts";
const MANAGER = "src/viewport/overlay/manager.ts";
const TYPES = "src/viewport/overlay/types.ts";
const KEYS = "src/shell/keys.ts";

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
    file: MANAGER,
    from: '        if (open.kind === "panel") this.dismiss(open.id, "displaced");\n',
    to: '        if (open.kind === "panel") this.dismiss(open.id);\n',
    why: "T6.28 — C15 I28's reason back to `explicit`: the owner reads a reader's close and the menu does not come back",
  },
  mutations: [
    {
      // T6.27 (C15 I30) — the peek's row dropped from the table: any field
      // combination is a peek.
      name: "the peek's row admits every combination",
      file: MANAGER,
      from: '  peek: Object.freeze(["false/focus"]),\n',
      to: '  peek: Object.freeze(["false/focus", "true/focus", "false/escape", "false/answer"]),\n',
      expect: "T1.35",
    },
    {
      // C15 I30 — the overlay row admits the non-blocking question.
      name: "an overlay closed by its answer may be non-blocking",
      file: MANAGER,
      from: '  overlay: Object.freeze(["true/answer", "true/escape", "false/escape"]),\n',
      to: '  overlay: Object.freeze(["true/answer", "true/escape", "false/escape", "false/answer"]),\n',
      expect: "T1.35",
    },
    {
      // T6.29 (C15 I33) — the generation moved on a peek.
      name: "a peek's push moves the generation",
      file: MANAGER,
      from: '    if (layer.kind !== "peek") this.#generation += 1;\n    this.#emit({ kind: "push"',
      to: '    this.#generation += 1;\n    this.#emit({ kind: "push"',
      expect: "T1.37",
    },
    {
      // C15 I33 — a removal does not move it.
      name: "pop() leaves the generation where it was",
      file: MANAGER,
      from: '    this.#remove(top.id);\n    this.#generation += 1;\n',
      to: '    this.#remove(top.id);\n',
      expect: "T1.37",
    },
    {
      // C15 I31 — one predicate again: the pointer asks what the keys ask.
      name: "takesPointer is takesInput",
      file: TYPES,
      from: '  return gesture === "wheel" || takesInput(p);\n',
      to: "  return takesInput(p);\n",
      expect: "T1.36",
    },
    {
      // C15 I32 — the draft is not checked: a list built for another line is shown.
      name: "the restore ignores the draft",
      file: KEYS,
      from: "    if (deps.editor.text !== was.draft) {\n",
      to: "    if (false) {\n",
      expect: "T4.14",
    },
    {
      // C15 I32 — the selection is not held.
      name: "the menu comes back with no selection",
      file: KEYS,
      from: "      showMenu(was.menu.candidates, was.menu.at, was.menu.builtFor);\n",
      to: "      showMenu(was.menu.candidates, null, was.menu.builtFor);\n",
      expect: "T4.14",
    },
    {
      // C15 I32 — the search is not restored.
      name: "a displaced search is not brought back",
      file: KEYS,
      from: "      if (change.id === SEARCH_ID) held.searching = true;\n",
      to: "",
      expect: "T4.15",
    },
    {
      // C15 I32 — restored while the question is still up: the check for a
      // remaining blocking layer dropped.
      name: "restored under a blocking layer",
      file: KEYS,
      from: "    if (deps.overlays.stack.some((l) => l.blocking)) return;\n",
      to: "",
      expect: "T4.14",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
