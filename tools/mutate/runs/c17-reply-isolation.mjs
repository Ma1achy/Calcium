// C17 I29, C16 I54, C23 I77, C17 I30 — the typed reply's isolation, mutated
// (§052, R-QST-003).
//
// **Every leak the landing closed, put back one at a time.** The rows were
// written after a probe found the reply could not be typed into at all, so no
// row had ever been red on its own assertion — the only red T4.71 showed was a
// harness that awaited its own answer. This run is what shows each row can see
// the thing it names.
//
// Anchors and expectations written with the landing, 2026-09-24.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/draft-hold.test.ts test/integration/typed-reply.test.ts test/unit/router-keymap.test.ts";

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
    file: "src/shell/construct.ts",
    from: '    router.register("overlay", (e) => confirm.composing && promptKeys(e));',
    to: "    void 0;",
    why: "the forward removed — the shipped state before C16 I54, where every letter typed into a reply met the modal reject; T4.80 fails on its first letter",
  },
  mutations: [
    {
      name: "hold records the owner's line as the borrower's first unit, on one shared stack",
      file: "src/interaction/editor/editor.ts",
      from: "    this.#history = new History();\n    this.#text = \"\";",
      to: "    this.#history.edit(this.#snapshot(), \"structural\");\n    this.#text = \"\";",
      expect: "T1.51",
    },
    {
      name: "resume keeps the borrower's stack",
      file: "src/interaction/editor/editor.ts",
      from: "    this.#history = stack;\n    this.restore(held.line);",
      to: "    void stack;\n    this.restore(held.line);",
      expect: "T1.52",
    },
    // ---- C17 I33, I34, §5f — chips across a borrow (T6.23, T6.24) --------------
    {
      name: "T6.23: hold leaves the ordinal counter on the editor",
      file: "src/interaction/editor/editor.ts",
      from: "    this.#ordinal = 0;\n    this.#owners += 1;",
      to: "    this.#owners += 1;",
      expect: "T1.57",
    },
    {
      name: "resume leaves the borrower's ordinal counter in place",
      file: "src/interaction/editor/editor.ts",
      from: "    this.#ordinal = owned.ordinal;\n",
      to: "",
      expect: "T1.57",
    },
    {
      name: "T6.23: yank inserts a foreign chip as it is",
      file: "src/interaction/editor/editor.ts",
      from: "    this.insert(this.#adopt(this.#kill), { atomic: true });",
      to: "    this.insert(this.#kill, { atomic: true });",
      expect: "T1.58",
    },
    {
      name: "resume leaves the borrower as the owner",
      file: "src/interaction/editor/editor.ts",
      from: "    this.#owner = owned.owner;\n",
      to: "",
      expect: "T1.58",
    },
    {
      // **The review's remedy as written** — *hold the chip map and counter* —
      // restarts the sentinel counter at the borrow, so the borrower's first
      // paste rebinds the owner's first sentinel.
      name: "T6.24: hold restarts the sentinel counter",
      file: "src/interaction/editor/editor.ts",
      from: "    this.#ordinal = 0;\n    this.#owners += 1;",
      to: "    this.#ordinal = 0;\n    this.#nextSentinel = 0;\n    this.#owners += 1;",
      expect: "T1.59",
    },
    {
      name: "↑ in a reply walks the prompt's commands",
      file: "src/shell/keys.ts",
      from: "      const entry = (deps.reply() ?? deps.history).previous(deps.editor.text);",
      to: "      const entry = deps.history.previous(deps.editor.text);",
      expect: "T4.71",
    },
    {
      name: "↓ past a reply's floor falls through to the prompt's walk and the live block",
      file: "src/shell/keys.ts",
      from: "        if (entry !== null) deps.editor.setText(entry);\n        return;\n      }\n      const entry = deps.history.next();",
      to: "        if (entry !== null) deps.editor.setText(entry);\n      }\n      const entry = deps.history.next();",
      expect: "T4.71",
    },
    {
      name: "a modified ⏎ answers the reply",
      file: "src/shell/confirm.ts",
      from: '      if (is(QUESTION_KEYS.answer) && (bare || replying === null)) return "resolve";',
      to: '      if (is(QUESTION_KEYS.answer)) return "resolve";',
      expect: "T4.80",
    },
    {
      name: "every prompt action reaches a reply",
      file: "src/shell/construct.ts",
      // Re-anchored for C22 I134: the check reads the effective action, and it
      // is the same check.
      from: "        if (action !== null && !REPLY_ACTIONS.has(action as KeyAction)) return false;\n",
      to: "",
      expect: "T4.71",
    },
    {
      name: "typing into a reply opens the completion menu",
      file: "src/shell/construct.ts",
      from: "        // Not in a reply: a command menu over a sentence (C16 I54).\n        if (!composing) keys.afterEdit();",
      to: "        // Not in a reply: a command menu over a sentence (C16 I54).\n        keys.afterEdit();",
      expect: "T4.80",
    },
    {
      name: "→ in a reply accepts a command ghost",
      file: "src/shell/keys.ts",
      from: "      if (deps.reply() !== null) {\n        deps.editor.move(\"charRight\");\n        return;\n      }\n",
      to: "",
      expect: "T4.80",
    },
    {
      name: "⌥← unbound again",
      file: "src/interaction/router/keymap.ts",
      from: '  { target: "prompt", key: { name: "left", meta: true }, action: "wordLeft" },\n',
      to: "",
      expect: "T1.53",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
