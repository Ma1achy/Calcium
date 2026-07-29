// A03 §4 — SS1..SS35. Forbidden patterns, scoped by directory.
import { readFileSync } from "node:fs";

/** allow: paths (or prefixes) exempt from the rule. */
export const SCANS = [
  // --- ambient reads -------------------------------------------------------
  { id: "SS1",  spec: "C22 T2.4",
    pattern: /\b(?:Date\.now|new Date|performance\.now|process\.hrtime)\b/,
    scope: "src/", allow: ["src/shell/session.ts"],
    why: "no ambient clock; C22 injects `() => number`" },

  // Banning `process.env` outright rather than the seven names: a narrower
  // pattern walks straight past `const { TERM } = process.env` and
  // `process.env[k]`. No file in src/ has business reading the environment —
  // C22 reads config through an injected filesystem — so the broad rule has no
  // false positives and, unlike the narrow one, no false negatives.
  { id: "SS10", spec: "C02 T2.5 · C02 T6.2",
    pattern: /process\.env/,
    scope: "src/", allow: ["src/terminal/capabilities.ts"],
    why: "only C02 reads the environment, and it reads the injected record" },

  { id: "SS11", spec: "C09 T2.7 · C10 T2.6",
    pattern: /process\.env/,
    scope: "src/presentation/", allow: [],
    why: "renderers receive capabilities through ctx, never the environment" },

  // --- forbidden literals --------------------------------------------------
  { id: "SS14", spec: "C01 I1 · C01 T2.5",
    pattern: /\\x1b|\\u001b|\u001b/,
    scope: "src/", allow: ["src/terminal/escapes.ts"],
    why: "escape literals live in one module" },

  // The digits, not the meaning. SS15 says where the literals may live; MG20
  // (module-graph.mjs) says which component may import each one. An earlier
  // version of this rule said "outside C01", which contradicted SS14 and C01 I1
  // — the literals are *required* to be in escapes.ts, so that rule would have
  // failed on the one file that must contain them.
  //
  // The pattern matches the DECSET *form* — `?<mode>h` or `?<mode>l` — not the
  // bare number, deliberately. A03 declares the rule over the numbers, but `25`
  // as a bare integer is a page size, a timeout, a column width; scanning for it
  // would produce noise until someone deleted the rule. The form is what has
  // meaning, and a mode number that is not in it does nothing on its own: it
  // still needs an escape prefix, which SS14 catches.
  { id: "SS15", spec: "C01 I1 · C01 T2.8",
    pattern: /\?(?:1049|25|2004|1002|1006|2026)[hl]/,
    scope: "src/", allow: ["src/terminal/escapes.ts"],
    why: "mode literals live in one module; C01 owns what they mean" },

  { id: "SS34", spec: "C01 I1 · C01 T2.9",
    pattern: /render\s*\(\s*\{[^}]*alternateScreen/,
    scope: "src/", allow: [],
    why: "C01 owns the alternate screen; two owners of one piece of terminal state is the failure this component prevents" },

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

  // Moved here from eslint's `no-console`, and stronger for it: this catches
  // console.error and console.warn, which the lint rule did not, and it cannot
  // fall silent because a parser could not read the file.
  { id: "SS33", spec: "C01 I8 · A04",
    pattern: /\bconsole\.\w+/,
    scope: "src/", allow: [],
    why: "C01 owns stdout; a stray write is captured to the debug log, but it should not exist" },

  { id: "SS28", spec: "C16 T2.6 · C17 T2.6 · C18 T2.4 · C19 T2.5 · C20 T2.6",
    pattern: /\b(?:commit|flush|invalidate)\s*\(/,
    scope: "src/interaction/", allow: [],
    why: "L4 orchestrates; interaction never commits a frame" },

  // C05's first draft declared its own `Result<T, E>` with `errors` plural where
  // C04's has `error` singular. Same name, same half of L0, and both compile —
  // nothing fails until a call site reads `r.error` on the wrong one and gets
  // `undefined`. SS30's shape, applied to a type name.
  //
  // The trailing `[<=]` is what separates a declaration from an import: a
  // multi-line `import { type Result, … }` puts `type Result,` on a line of its
  // own, and the first version of this rule flagged both files that correctly
  // import the one Result there is. A declaration always continues into `<` or
  // `=`; an import member never does.
  { id: "SS35", spec: "C04 §4 · C05 §2",
    pattern: /^\s*(?:export\s+)?type Result\s*[<=]/m,
    scope: "src/", allow: ["src/data/viewmodel/types.ts"],
    why: "one Result in the tree; two shapes under one name in one layer half compile and diverge quietly" },
];

/**
 * `readFile` is injected for the same reason the module graph injects it: a rule
 * is only known to work when it has been shown to fire, and showing that means
 * a fabricated violation at a path that does not exist on disk. A03 commitment
 * 14 requires one per rule — see `test/unit/enforce-rules.test.ts`.
 */
export function checkSourceScans(files, readFile = (f) => readFileSync(f, "utf8")) {
  const violations = [];
  for (const scan of SCANS) {
    for (const file of files) {
      const f = file.replaceAll("\\", "/");
      if (!f.startsWith(scan.scope)) continue;
      if (scan.allow.some((a) => f === a || f.startsWith(a))) continue;
      const src = readFile(file);
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
