import { readFileSync } from "node:fs";
const src = readFileSync("/workspace/tools/mutate/runs/c12-shared-geometry.mjs", "utf8");
const files = {};
for (const m of src.matchAll(/^const (\w+) = "([^"]+)";/gmu)) files[m[1]] = m[2];
for (const m of src.matchAll(/file:\s*(\w+),\s*\n\s*from:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'),/gu)) {
  const f = files[m[1]];
  if (f === undefined) continue;
  const txt = readFileSync(`/workspace/${f}`, "utf8");
  const needle = JSON.parse(m[2].startsWith("'") ? '"' + m[2].slice(1, -1).replace(/"/gu, '\\"') + '"' : m[2]);
  if (!txt.includes(needle)) console.log("MISSING in", f, "->", needle.slice(0, 100));
}
