// C10 §4b — `from-registry.mjs --check`: the generated themes held to the
// registry, rendering in memory and writing nothing. Mutated against TG1–TG3.
// Re-anchored when C10 I62 made the check a loop over two files, and the loop
// gained its own mutation: checking only the first file.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/theme-generator-check.test.ts";
const GEN = "tools/theme/from-registry.mjs";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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
    file: GEN,
    from: "  console.log(`OK · tokens.generated.ts and four-bit.generated.ts are the registry's projection · ${themes.length} themes · ${source.length + fourBitSource.length} bytes`);",
    to: "  console.log(`OK · both match · ${themes.length} themes · ${source.length + fourBitSource.length} bytes`);",
    why: "the pass line reworded — TG1 reads it",
  },
  mutations: [
    {
      name: "BLIND: the comparison always agrees",
      file: GEN,
      from: "    if (have === want) continue;",
      to: "    continue;",
      expect: "TG2 (C10 §4b)",
    },
    {
      name: "WRITES: check mode writes the file before comparing",
      file: GEN,
      from: "    let have = \"\";\n    try { have = readFileSync(path, \"utf8\"); } catch { have = \"\"; }",
      to: "    writeFileSync(path, want);\n    let have = \"\";\n    try { have = readFileSync(path, \"utf8\"); } catch { have = \"\"; }",
      expect: "TG2 (C10 §4b)",
    },
    {
      name: "OFF-BY-ONE: the line reported is the index, not the number",
      file: GEN,
      from: "differs from the registry's projection at line ${i + 1}`);",
      to: "differs from the registry's projection at line ${i}`);",
      expect: "TG2 (C10 §4b)",
    },
    {
      name: "ONE-FILE: the check renders four-bit.generated.ts and never compares it",
      file: GEN,
      from: "  for (const [path, want] of [[out, source], [fourBitOut, fourBitSource]]) {",
      to: "  for (const [path, want] of [[out, source]]) {",
      expect: "TG3 (C10 §4b, C10 I62)",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
