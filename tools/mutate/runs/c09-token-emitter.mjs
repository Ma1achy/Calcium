// C09 I71 — the tokeniser's run emitted straight from highlight.js core's
// emitter seam, with lowlight's tree as the reference. Mutated.
//
// **What the goldens cannot see.** Every code frame in the golden tier is a
// byte of this emitter's output, and a wrong slot on a keyword would move
// them — but a boundary moved between two tokens of one slot, or a class
// looked up under the wrong name where the reference maps nothing either,
// paints the same bytes. T1.45's token-for-token comparison against the tree
// is the row that sees those, and T5.6 is the only row that sees the graph.
//
// **The pass rebuilds `dist/` at its end**: the LOWLIGHT-AGAIN mutation is
// compiled into `dist/` for T5.6 to read, and a `dist/` left holding a
// mutation is F608's shape.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npm run build >/dev/null 2>&1; npx vitest run test/unit/blocks.test.ts test/e2e/code-graph.test.ts";
const F = "src/presentation/blocks/kinds/code.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: F,
    from: "      this.tokens.push({ text, slot: frame.slot });",
    to: "      this.tokens.push({ text, slot: null });",
    why: "every token is emitted unslotted — the run's text is whole and no grammar colours anything, which T3.32 reads on all sixteen",
  },
  mutations: [
    {
      // **Text runs merged across a closed scope.** With the outer frame's
      // tail left as text, the run after a scope closes joins the run before it
      // opened — the same bytes, one token fewer.
      name: "MERGE-ACROSS-SCOPES: a closed scope does not end the enclosing text run",
      file: F,
      from: "    outer.tailIsText = false;\n    const head",
      to: "    const head",
      expect: "T1.45",
    },
    {
      // **A sublanguage's unslotted tokens keep null** instead of taking the
      // enclosing scope's slot — the JSON's whitespace under `string`.
      name: "SUB-NULL-KEPT: a sublanguage token with no slot of its own stays null",
      file: F,
      from: "    for (const t of sub.tokens) this.tokens.push(t.slot === null ? { text: t.text, slot: frame.slot } : t);",
      to: "    for (const t of sub.tokens) this.tokens.push(t);",
      expect: "T1.45",
    },
    {
      // **The prefix dropped from the lookup**: every scope maps nothing.
      name: "PREFIX-DROPPED: the scope's class is looked up without hljs-",
      file: F,
      from: "    const mapped = SLOTS[this.prefix + head];",
      to: "    const mapped = SLOTS[head];",
      expect: "T3.32",
    },
    {
      // **The whole dotted name prefixed** rather than its first segment:
      // `title.function` maps nothing where the reference maps `function`.
      name: "WHOLE-NAME-PREFIXED: a dotted scope name is looked up entire",
      file: F,
      from: '    const head = String(name).split(".")[0] as string;',
      to: "    const head = String(name);",
      expect: "T1.45",
    },
    {
      // **The wrapper imported again**, for its side effect alone: the barrel
      // loads every grammar, and T5.6's child lists them.
      name: "LOWLIGHT-AGAIN: the package entry is on the graph",
      file: F,
      from: 'import HighlightJs from "highlight.js/lib/core";',
      to: 'import "lowlight";\nimport HighlightJs from "highlight.js/lib/core";',
      expect: "T5.6",
    },
  ],
});

console.log(report(results));
execSync("npm run build >/dev/null 2>&1", { cwd: ROOT });
process.exit(results.some((r) => !r.killed) ? 1 : 0);
