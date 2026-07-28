// A03 §3 — MG1..MG19. Imports go down only; L0's halves never touch.
import { readFileSync } from "node:fs";
import { layerOf } from "./layers.mjs";

const IMPORT = /^\s*(?:import|export)\b([^'"]*?)from\s*['"]([^'"]+)['"]/gm;
const BARE   = /^\s*import\s*['"]([^'"]+)['"]/gm;

/**
 * A statement-level `import type` / `export type` erases at build and creates no
 * runtime edge, so it is not an import for the layer rule's purposes — C01 needs
 * C02's `TerminalCapabilities` type while genuinely not importing C02.
 *
 * An inline `import { type X, y }` is NOT skipped: the statement still emits,
 * and `y` is a real edge.
 */
function isTypeOnly(clause) {
  return /^type\b/.test(clause.trim());
}

function importsOf(file, readFile) {
  const src = readFile(file);
  const out = [];

  IMPORT.lastIndex = 0;
  let m;
  while ((m = IMPORT.exec(src))) {
    if (isTypeOnly(m[1])) continue;
    out.push(m[2]);
  }

  BARE.lastIndex = 0;
  while ((m = BARE.exec(src))) out.push(m[1]);

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

/**
 * `readFile` is injected so the rule can be tested against fabricated modules at
 * layer paths that do not exist on disk — the same reason C02 takes its `env`.
 */
export function checkModuleGraph(files, readFile = (f) => readFileSync(f, "utf8")) {
  const violations = [];
  for (const file of files) {
    const from = layerOf(file);
    if (!from) continue;
    for (const spec of importsOf(file, readFile)) {
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
