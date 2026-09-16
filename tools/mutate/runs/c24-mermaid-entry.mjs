// C24 I36 — the runtime barrel imports nothing from the Mermaid renderer; the
// transform is its own entry, `@fmx/calcium/mermaid`. Mutated (T6.19, F1188).
//
// **The pass rebuilds `dist/` at each step and at its end**: T5.6 reads the
// built package's graph under the import trace, so a mutation of `src/` that
// is not compiled is a mutation of nothing — and a `dist/` left holding the
// last mutation would be measured by every probe afterwards (F608).
//
// **Every contract row on `mermaidCode` stays green under the mutation**, which
// is the point of T6.19: the function did not move, its import line did, and
// only a row about the graph can see an import line.
//
// **The control is the entry exporting nothing.** T5.6's child finds no
// `mermaidCode` on `dist/mermaid.js` and the row cannot pass.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npm run build >/dev/null 2>&1; npx vitest run test/e2e/public-api.test.ts test/contract/mermaid.test.ts";
const ENTRY = "src/mermaid.ts";
const BARREL = "src/index.ts";

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
    file: ENTRY,
    from: 'export { mermaidCode } from "./presentation/mermaid.js";',
    to: "export {};",
    why: "the entry exports nothing: T5.6's child has no mermaidCode to call and the row cannot pass",
  },
  mutations: [
    {
      // **The export back on the barrel.** The renderer's bundle returns to the
      // runtime import's list; every contract row on the function is green.
      name: "MERMAID-ON-BARREL: the runtime barrel re-exports mermaidCode and loads the renderer",
      file: BARREL,
      from: "// `mermaidCode` is `@fmx/calcium/mermaid` and not here (C24 I36): its renderer",
      to: 'export { mermaidCode } from "./presentation/mermaid.js";\n// `mermaidCode` is `@fmx/calcium/mermaid` and not here (C24 I36): its renderer',
      expect: "T5.6",
    },
  ],
});

// The tree is restored; `dist/` must be too, or the last mutation ships to
// every probe that reads it (F608).
execSync("npm run build >/dev/null 2>&1", { cwd: ROOT });

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
