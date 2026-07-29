// A03 §4 — the implemented subset of SS1..SS37. Forbidden patterns, scoped by
// directory. A row here is a rule that can fire; A03 inventories the rest, each
// waiting on the component that creates its scope.
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

  // C10 I13. The rule scopes to the *directory* with one named exception, not
  // to `tokens-*.ts`: a narrowed scope reads as tighter and is looser, because
  // it stops seeing a new token file the day someone adds one — SS26's failure
  // arriving through a different door.
  //
  // The pattern is the ANSI *form*, not a bare integer. `38;5;` and `\e[3Xm`
  // are what an index looks like when someone writes one by hand; a bare `9` in
  // a theme file is a length, a ratio, an array position.
  { id: "SS19", spec: "C10 I13 · C10 T2.5",
    pattern: /\b(?:38|48);5;\d|\bansi(?:16|256)?\s*[:=]\s*\d|\[\d{1,2}m/,
    scope: "src/presentation/theme/", allow: ["src/presentation/theme/four-bit.ts"],
    why: "tokens are 24-bit hex; the curated 4-bit map is the one file that holds indices" },

  // The allow-lists name only what exists. `code.ts` and `patch.ts` arrive with
  // C09 and C25 and will each have to add their own row — which is the friction
  // C10 I16 asks for: `syntax` used casually stops meaning anything, and the
  // list being closed at two is a spec change in four places, not a permission.
  //
  // Until then these rules police a scope whose legitimate members do not exist,
  // so the fabricated-violation test carries the whole weight of showing they
  // can fire. A rule with nothing to be wrong about passes exactly like a
  // satisfied one.
  { id: "SS20", spec: "C10 I16 · C10 T2.8",
    pattern: /["'`]syntax\.\w|palettes\s*\.\s*syntax/,
    scope: "src/", allow: ["src/presentation/theme/"],
    why: "`syntax` is consumed by code and patch rendering only; the list is closed at two" },

  { id: "SS21", spec: "C10 I16 · C10 T2.8",
    pattern: /["'`]spectrum\.\w|palettes\s*\.\s*spectrum/,
    scope: "src/", allow: ["src/presentation/theme/"],
    why: "`spectrum` is decorative and restricted to declared art" },

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
  // A tag that is droppable gets dropped. C10 resolves a colour to a value that
  // names its own depth, so the writer switches on a tag rather than inferring
  // the depth from the format — and the consumer that infers wrong emits
  // truecolour to a sixteen-colour terminal.
  //
  // Types hold that inside the tree. What types do not hold is a cast: a `Style`
  // assembled by hand in a renderer with `colour: "#7faecf"` is one `as` away
  // from compiling. This makes the untagged form unwritable rather than merely
  // discouraged, which is the difference between a rule and a convention.
  { id: "SS36", spec: "C10 I18 · C10 T2.19",
    pattern: /\bcolour\s*:\s*["'`]/,
    scope: "src/", allow: [],
    why: "a resolved colour names its depth; there is no untagged form" },

  // SS36's other half. SS36 makes an untagged colour unwritable inside the
  // tree; this stops the tag being discarded on the way out of it.
  //
  // Ink's colour props take a string and re-derive the depth from its format,
  // so a renderer handing one `"#7faecf"` has asked one question and received
  // two answers — and the one that reaches the terminal is Ink's. The suite
  // suffers worse than the frame: the colour library behind those props sizes
  // its output from its own environment detection, which reports no colour at
  // all under a test runner. Every golden frame would render monochrome and
  // pass while production rendered truecolour.
  //
  // The `=` is what makes this a prop rather than prose: `color={style}` and
  // `color="red"` both match, a comment about colour does not.
  { id: "SS37", spec: "C09 I4 · C09 T2.17",
    pattern: /\b(?:color|backgroundColor)\s*=/,
    scope: "src/presentation/", allow: [],
    why: "renderers emit SGR from terminal/escapes.ts; an Ink colour prop discards the depth tag" },

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
