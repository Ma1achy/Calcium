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
  //
  // SS23 and SS40 look like one rule and are not, which is why they are two.
  //
  // Both forbid `.length` on display text. The **remedy differs**, and the
  // remedy is most of what a scan is for: in a block the answer is `cells()`,
  // the display width the measurer uses; in the editor it is a grapheme index,
  // because C17 counts positions a cursor can occupy rather than columns a
  // glyph fills. A shared rule would give one of the two the wrong advice at
  // exactly the moment someone is reaching for the quick fix.
  //
  // A03 declared SS23 as serving `C09 T2.9 · C17 T2.4` while its scope was
  // `src/presentation/blocks/` alone, so the editor's `.length` was unpoliced
  // and recorded as covered — SS26's failure one directory over. The citation
  // graph is what found it; nothing had before.
  { id: "SS23", spec: "C09 T2.9",
    pattern: /\.length\b(?!.*\/\/ *cells-ok)/,
    scope: "src/presentation/blocks/", allow: [],
    why: "display width comes from cells(), never .length" },

  { id: "SS40", spec: "C17 I2 · C17 T2.4",
    pattern: /\.length\b(?!.*\/\/ *graphemes-ok)|\.charAt\s*\(|\.slice\s*\(/,
    scope: "src/interaction/", allow: [],
    why: "the editor indexes by grapheme, never by code unit: `.length` is a unit count and the cursor is a position" },

  // SS3 carried two of the four vacuity failures at once (A03 §2). It was
  // inventoried in A03 from the start and never written here, so it could not
  // fire and appeared in no report; and its scope named `adapters/` while the
  // tree held `adapters.ts`, a file, so `startsWith` would have matched nothing
  // even once it existed. C07 makes the directory real and this makes the rule
  // real.
  //
  // Clock reads are SS1's across all of `src/`, so this covers what SS1 does
  // not: randomness, the filesystem, and the process. Together they are C07 I1
  // — an adapter is a pure function of a `RawResult` and a context, which is
  // what lets the presentation layer of every verb be tested in milliseconds
  // with no cluster and no subprocess.
  //
  // It polices the kit-side fallback and any in-tree adapter. An *app's*
  // adapters live outside this repo, where T2.1's determinism check is what
  // holds the same line — the scan cannot follow them and does not pretend to.
  { id: "SS3", spec: "C07 I1 · C07 T2.2",
    pattern: /\bMath\.random\b|\bprocess\.\w|require\(\s*["']fs["']|from\s+["']node:(?:fs|os|child_process)["']/,
    scope: "src/data/adapters/", allow: [],
    why: "adapters are pure: a fixture in, a document out, and nothing ambient in between" },

  // A03 inventories SS2 as scoped to "C08". Written here it covers **all of
  // `src/`**, and the widening is deliberate rather than incidental.
  //
  // C08 is the component with the *reason* — a fixture world that is randomised
  // is a fixture world whose golden tests are flaky (C08 §3) — but no file under
  // `src/` has business calling `Math.random`, and a rule scoped to
  // `src/data/fixtures/` stops seeing the day someone reaches for a jittered
  // retry in C23 or a sampled id in C13. That is SS26's failure with a longer
  // fuse: narrower reads as tighter and is looser, because it stops seeing new
  // files.
  //
  // Clock reads are SS1's, which already spans `src/` for the same reason. This
  // is the other half of C08 I4 — the ban is on *ambient* sources, not on
  // randomness: `createRng` is the injected one, and it takes its seed.
  { id: "SS2", spec: "C08 I4 · C08 T2.3",
    pattern: /\bMath\.random\b|\bcrypto\.randomUUID\b|\brandomBytes\s*\(/,
    scope: "src/", allow: [],
    why: "no ambient randomness; C08 ships a seeded generator and every draw comes from it" },

  // The scope is real as of C06: `src/data/process/` is a directory now, holding
  // C21's interface. This rule is the one A03 §2 names as never having been
  // evaluated — it scoped to a directory while the tree had `process.ts`, a
  // file, so `startsWith` never matched and it reported compliance for as long
  // as anyone cared to look.
  { id: "SS26", spec: "C21 T2.2",
    pattern: /process\.stdout\.write/,
    scope: "src/data/process/", allow: [],
    why: "child output is piped; it never reaches the real terminal" },

  // C06's central discipline, made mechanical. The two named things are the two
  // that get added by someone being helpful: an exit-code comparison on the way
  // to a status, and an `ErrorLike` built because the information was right
  // there. Both compile, both pass review, and both put C07's judgement in a
  // component that must not have one — after which a document's status depends
  // on which of two files ran.
  //
  // Deliberately not scanning for `status`: C06 legitimately has none, but the
  // word appears in prose and in C23's vocabulary, and a rule that fires on a
  // comment gets deleted rather than obeyed.
  { id: "SS25", spec: "C06 I2 · C06 T2.3",
    pattern: /\bErrorLike\b|\bexitCode\s*[=!]==?\s*-?\d|\bexit(?:Code)?\s*[=!]==?\s*-?\d/,
    scope: "src/data/transport/", allow: [],
    why: "C06 reports and C07 interprets — no exit-code mapping, no envelope synthesis" },

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

  // SS36's shape applied to glyphs, and the rule its own inventory row caught:
  // SS39 was written into A03 and the commitment-14b check failed on that
  // commit, which is exactly the point of it.
  //
  // The type closes `Glyph` inside the tree; this closes the cast. A `Notice`
  // built with `as` takes a character without complaint, the same way a `Style`
  // with `colour: "#7faecf"` would have without SS36 — and this failure is the
  // quieter of the two. A wrong colour is visible to whoever wrote it; a glyph
  // with no ASCII fallback is visible only under `LANG=C`, only to the users
  // least able to say what they are looking at.
  //
  // The pattern matches a glyph position whose literal is *not* a token, so
  // `glyph: "error"` passes and `glyph: "✗"` does not. Scoped to `src/`: the
  // one file that holds the characters writes them as table rows rather than in
  // a glyph position, so it needs no exemption — and an exemption nobody needs
  // is a door left open.
  { id: "SS39", spec: "C04 I6 · C09 §4",
    pattern: /\bglyph\s*:\s*["'`](?!(?:ok|warn|error|info|pending|working|running|queued|cancelled|expand|collapse|live|bullet)["'`])/,
    scope: "src/", allow: [],
    why: "a block names a glyph slot; C09 §4 owns both renderings and the 1:1 width rule" },

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
        // Comments are prose about the rule, not violations of it. A line
        // comment was already skipped; a block comment's continuation was not,
        // so documenting `frames[tick % frames.length]` in a doc comment fired
        // SS23 — the rule reporting a sentence that explains it.
        //
        // Only the comment *forms* are skipped, never a line with code on it:
        // `const w = s.length; // why` still fires, which is the case that
        // matters.
        const start = line.trimStart();
        if (start.startsWith("//") || start.startsWith("*") || start.startsWith("/*")) return;
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
