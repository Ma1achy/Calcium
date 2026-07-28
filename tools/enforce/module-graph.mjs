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
 * MG20 — each mode export of `escapes.ts` belongs to exactly one component.
 *
 * SS15 says where the digits may live; this says who may mean them. Asserted per
 * sequence rather than per file, so C03's transactional exception for `2026`
 * stays exactly one sequence wide rather than becoming "C03 may use escapes".
 *
 * An export with no importer is fine: `SCROLL_REGION` has no consumer until
 * M-T6, and requiring one would force a dead export CLAUDE.md forbids.
 */
const MODE_OWNERS = {
  ALT_SCREEN:     "src/terminal/lifecycle.ts",
  CURSOR:         "src/terminal/lifecycle.ts",
  BRACKET_PASTE:  "src/terminal/lifecycle.ts",
  MOUSE:          "src/terminal/lifecycle.ts",
  SCROLL_REGION:  "src/terminal/frame-scheduler.ts",
  SYNC_UPDATE:    "src/terminal/frame-scheduler.ts",
};

const ESCAPES = "src/terminal/escapes.ts";
const NAMED = /^\s*import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gm;

function checkModeOwnership(files, readFile) {
  const violations = [];
  for (const file of files) {
    const f = file.replaceAll("\\", "/");
    if (f === ESCAPES) continue;
    const src = readFile(file);

    NAMED.lastIndex = 0;
    let m;
    while ((m = NAMED.exec(src))) {
      if (resolve(f, m[2]) !== ESCAPES) continue;
      for (const raw of m[1].split(",")) {
        const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0];
        const owner = MODE_OWNERS[name];
        if (owner === undefined || owner === f) continue;
        violations.push({
          rule: "MG20", file: f,
          message: `imports ${name} from escapes.ts, but ${owner} owns that mode`,
          spec: "C01 I1 · C01 T2.8",
        });
      }
    }
  }
  return violations;
}

/**
 * `readFile` is injected so the rule can be tested against fabricated modules at
 * layer paths that do not exist on disk — the same reason C02 takes its `env`.
 */
export function checkModuleGraph(files, readFile = (f) => readFileSync(f, "utf8")) {
  const violations = checkModeOwnership(files, readFile);
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
