// A03 §3 — MG1..MG19. Imports go down only; L0's halves never touch.
import { readFileSync } from "node:fs";
import { layerOf } from "./layers.mjs";

const IMPORT = /^\s*(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]/gm;
const BARE   = /^\s*import\s*['"]([^'"]+)['"]/gm;

function importsOf(file) {
  const src = readFileSync(file, "utf8");
  const out = [];
  for (const re of [IMPORT, BARE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) out.push(m[1]);
  }
  return out;
}

function resolve(file, spec) {
  if (!spec.startsWith(".")) return null;          // external, not our concern
  const dir = file.split("/").slice(0, -1).join("/");
  const parts = (dir + "/" + spec).split("/");
  const stack = [];
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") stack.pop();
    else stack.push(p);
  }
  return stack.join("/");
}

export function checkModuleGraph(files) {
  const violations = [];
  for (const file of files) {
    const from = layerOf(file);
    if (!from) continue;
    for (const spec of importsOf(file)) {
      const target = resolve(file, spec);
      if (!target) continue;
      const to = layerOf(target);
      if (!to) continue;

      if (to.rank > from.rank) {
        violations.push({
          rule: "MG1", file,
          message: `imports UPWARD: ${from.label} → ${to.label} (${spec})`,
          spec: "A02 §1",
        });
      }
      if (from.rank === 0 && to.rank === 0 && from.half !== to.half) {
        violations.push({
          rule: "MG3", file,
          message: `crosses L0's halves: ${from.half} → ${to.half} (${spec})`,
          spec: "A02 §1 · C01 T2.4 · C03 T2.6",
        });
      }
    }
  }
  return violations;
}
