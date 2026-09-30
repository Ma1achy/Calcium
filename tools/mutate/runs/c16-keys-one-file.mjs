// C16 §6a clause 5 — one docs/KEYS.md, one writer, the registry's table then the
// live ladder. Mutated against KT1 and KT1a: the path resolved against the
// builder's own directory again, either half dropped, and the halves swapped.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/keymap-table.test.ts";
const BUILDER = "docs/design/language/build-calcium.mjs";
const TABLE = "tools/keymap-table.mjs";

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
    file: BUILDER,
    from: "\\n# Calcium keys\\n\\nRevision ${registry.meta.revision}",
    to: "\\n# Calcium keymap\\n\\nRevision ${registry.meta.revision}",
    why: "the registry half's heading renamed — the file on disk no longer equals the render",
  },
  mutations: [
    {
      name: "OWN-DIR: the builder resolves the keymap path against its own directory again",
      file: BUILDER,
      from: "export const keysOutputPath = resolve(repoRoot, JSON.parse(",
      to: "export const keysOutputPath = resolve(here, JSON.parse(",
      expect: "KT1a (C16 §6a clause 5)",
    },
    {
      name: "LADDER-ONLY: the document drops the registry's table",
      file: TABLE,
      from: "  return `${renderKeysMarkdown(JSON.parse(readFileSync(registryPath, \"utf8\")))}\\n${liveTable()}`;",
      to: "  return liveTable();",
      expect: "KT1 (C16 §6a clause 5)",
    },
    {
      name: "TABLE-ONLY: the document drops the live ladder",
      file: TABLE,
      from: "  return `${renderKeysMarkdown(JSON.parse(readFileSync(registryPath, \"utf8\")))}\\n${liveTable()}`;",
      to: "  return `${renderKeysMarkdown(JSON.parse(readFileSync(registryPath, \"utf8\")))}`;",
      expect: "KT1 (C16 §6a clause 5)",
    },
    {
      name: "SWAPPED: the ladder first, the registry's table after",
      file: TABLE,
      from: "  return `${renderKeysMarkdown(JSON.parse(readFileSync(registryPath, \"utf8\")))}\\n${liveTable()}`;",
      to: "  return `${liveTable()}\\n${renderKeysMarkdown(JSON.parse(readFileSync(registryPath, \"utf8\")))}`;",
      expect: "KT1 (C16 §6a clause 5)",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
