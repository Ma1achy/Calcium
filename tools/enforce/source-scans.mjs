// A03 §4 — SS1..SS32. Forbidden patterns, scoped by directory.
import { readFileSync } from "node:fs";

/** allow: paths (or prefixes) exempt from the rule. */
export const SCANS = [
  // --- ambient reads -------------------------------------------------------
  { id: "SS1",  spec: "C22 T2.4",
    pattern: /\b(?:Date\.now|new Date|performance\.now|process\.hrtime)\b/,
    scope: "src/", allow: ["src/shell/session.ts"],
    why: "no ambient clock; C22 injects `() => number`" },

  { id: "SS10", spec: "C02 T2.5",
    pattern: /process\.env\s*[.\[]\s*['"]?(TERM|COLORTERM|TERM_PROGRAM|LANG|LC_ALL|LC_CTYPE|TMUX)/,
    scope: "src/", allow: ["src/terminal/capabilities.ts"],
    why: "only C02 reads terminal environment variables" },

  { id: "SS11", spec: "C09 T2.7 · C10 T2.6",
    pattern: /process\.env/,
    scope: "src/presentation/", allow: [],
    why: "renderers receive capabilities through ctx, never the environment" },

  // --- forbidden literals --------------------------------------------------
  { id: "SS14", spec: "C01 I1 · C01 T2.5",
    pattern: /\\x1b|\\u001b|\u001b/,
    scope: "src/", allow: ["src/terminal/escapes.ts"],
    why: "escape literals live in one module" },

  { id: "SS16", spec: "C04 T2.7",
    pattern: /#[0-9a-fA-F]{3,8}\b|\\x1b\[[0-9;]*m/,
    scope: "src/data/viewmodel/", allow: [],
    why: "a block names a palette slot; it never embeds a value" },

  { id: "SS17", spec: "C09 T2.8",
    pattern: /#[0-9a-fA-F]{3,8}\b/,
    scope: "src/presentation/blocks/", allow: [],
    why: "renderers resolve tones; they do not carry colours" },

  // --- structural ----------------------------------------------------------
  { id: "SS23", spec: "C09 T2.9 · C17 T2.4",
    pattern: /\.length\b(?!.*\/\/ *cells-ok)/,
    scope: "src/presentation/blocks/", allow: [],
    why: "display width comes from cells(), never .length" },

  { id: "SS26", spec: "C21 T2.2",
    pattern: /process\.stdout\.write/,
    scope: "src/data/process/", allow: [],
    why: "child output is piped; it never reaches the real terminal" },

  { id: "SS28", spec: "C16 T2.6 · C17 T2.6 · C18 T2.4 · C19 T2.5 · C20 T2.6",
    pattern: /\b(?:commit|flush|invalidate)\s*\(/,
    scope: "src/interaction/", allow: [],
    why: "L4 orchestrates; interaction never commits a frame" },
];

export function checkSourceScans(files) {
  const violations = [];
  for (const scan of SCANS) {
    for (const file of files) {
      const f = file.replaceAll("\\", "/");
      if (!f.startsWith(scan.scope)) continue;
      if (scan.allow.some((a) => f === a || f.startsWith(a))) continue;
      const src = readFileSync(file, "utf8");
      src.split("\n").forEach((line, i) => {
        if (line.trimStart().startsWith("//")) return;
        if (scan.pattern.test(line)) {
          violations.push({
            rule: scan.id, file: `${file}:${i + 1}`,
            message: `${scan.why} — found: ${line.trim().slice(0, 70)}`,
            spec: scan.spec,
          });
        }
      });
    }
  }
  return violations;
}
