// C09 I123 — the registry's glyphs and the tree's agree record by record.
// Mutated on landing (review batch 2, M4 item 7).
//
// **Each mutation is a disagreement SS65 passed.** Swapping two records' marks,
// an ASCII half moving, a renderer reading the wrong slot, and a domain added
// without a word: every one leaves each character somewhere in `glyphs.ts`, which
// is all SS65 asks.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/glyph-registry.test.ts";
const GLYPHS = "src/presentation/blocks/glyphs.ts";
const CONTROLS = "src/presentation/blocks/kinds/controls.ts";
const CONFIG = "src/shell/config.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: CONFIG,
    from: 'Object.freeze(["❯ ", "$ "]);',
    to: 'Object.freeze(["❯ ", "> "]);',
    why: "the ASCII prompt back on focus's `>`, as shipped — T2.189 reads the reader record's ASCII half",
  },
  mutations: [
    {
      name: "question and current swap marks — every character still in glyphs.ts, which is all SS65 asked",
      file: GLYPHS,
      from: '    question: ["\\u27e9", "?"],\n    current: ["\\u203a", "*"],',
      to: '    question: ["\\u203a", "?"],\n    current: ["\\u27e9", "*"],',
      expect: "T2.189",
    },
    {
      name: "the unchosen choice's ASCII half back to the plot's `o`",
      file: GLYPHS,
      from: '  choiceOpen: "@",',
      to: '  choiceOpen: "o",',
      expect: "T2.189",
    },
    {
      name: "the choice renderer reads the plot's hollow, as shipped — the slot right and the reader wrong",
      file: CONTROLS,
      from: "(chosen ? g.filled : g.choiceOpen)",
      to: "(chosen ? g.filled : g.hollow)",
      expect: "T2.189",
    },
    {
      name: "a domain added to a home without a word in EXTRA_DOMAINS",
      file: GLYPHS,
      from: '  choiceOpen: ["row-lead"],',
      to: '  choiceOpen: ["row-lead", "inline"],',
      expect: "T2.189",
    },
    {
      name: "the branch's ASCII half back to one character — the reservation disagrees with the record's 2",
      file: GLYPHS,
      from: '    continuation: ["⎿", "`-"],',
      to: '    continuation: ["⎿", "`"],',
      expect: "T2.189",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
