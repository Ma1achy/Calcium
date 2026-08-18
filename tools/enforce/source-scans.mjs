// A03 §4 — the implemented subset of SS1..SS37. Forbidden patterns, scoped by
// directory. A row here is a rule that can fire; A03 inventories the rest, each
// waiting on the component that creates its scope.
import { readFileSync } from "node:fs";

/**
 * The encoding vocabularies SS51 forbids reading directly — see that rule.
 *
 * **Exported so it can be checked against its subject rather than remembered.**
 * `enforce-rules.test.ts` asserts this equals the string-valued `RAMP_*` exports
 * in `ramp.ts`, both directions, so a fifth vocabulary fails a test instead of
 * quietly falling outside a closed pattern.
 */
export const RAMP_VOCABULARIES = Object.freeze([
  "RAMP_UNICODE",
  "RAMP_ASCII",
  "RAMP_BRAILLE",
  "RAMP_DENSITY",
]);

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

  // A03 inventories SS4 as scoped to `transcript/` and SS5 to `viewport/`, which
  // as written is SS3's defect twice over: `transcript/` was a *file*
  // (`src/viewport/transcript.ts`) for the whole life of the project, and two
  // rules with the same pattern where one scope contains the other means the
  // narrower one can never fire on anything the wider one misses.
  //
  // **So SS4 takes the directory and SS5 is folded into it**, the SS12-into-SS11
  // precedent, and for the standing reason: a rule covering a directory and
  // naming its exceptions keeps seeing files nobody has written yet, and a rule
  // scoped to one component's subdirectory stops at C14's front door.
  //
  // SS1 already bans the clock across `src/`. This is not redundant with it —
  // SS1 allows `src/shell/session.ts`, and the point of C13 T2.2 and C14 T2.4 is
  // that L2 has no such exception and never acquires one.
  // C14 T2.4's other half. The clock is SS4's; this is `fs` and the clipboard
  // shell-out, which are the two side effects a viewport plausibly reaches for —
  // copy mode has to put text somewhere, and `pbcopy` is one line away. C14 §6
  // injects the writer for exactly that reason: a component that shells out
  // cannot be unit-tested.
  { id: "SS13", spec: "C14 I11 · C14 T2.4",
    pattern: /require\(["']fs["']\)|from\s+["']node:fs["']|\b(?:pbcopy|xclip|wl-copy|clip\.exe)\b/,
    scope: "src/viewport/", allow: [],
    why: "C14 performs no I/O — the clipboard writer is injected, and a viewport that shells out cannot be unit-tested" },

  // **SS9, built on the day C20 landed, and built rather than folded.**
  //
  // It is the last of the four pending rules A03 §2 tracks and the only one that
  // survives the question that retired SS5, SS6, SS7 and SS8: could it fire on
  // anything a broader rule misses? Its clock clause could not — SS1 bans clock
  // reads across all of `src/` — so the clause is gone rather than carried, and
  // C20 T2.4's clock half is SS1's coverage declared. What is left is `fs` and
  // a hardcoded state-directory literal, and SS1 speaks for neither.
  //
  // The literal is the live half. C20 is the first component since C08 to write
  // anything, and a hardcoded state path means a standalone run appends to the
  // developer's own history — which makes a clean clone neither clean nor
  // repeatable, and does it silently, in a file nobody looks at until it is
  // wrong (C20 I12, T6.12).
  { id: "SS9", spec: "C20 I11 · C20 I12 · C20 T2.4",
    // **Any dot-directory path literal, in either form.** This matched
    // `~/.prism` by name and has since survived two renames that would each have
    // retired it in silence: to `~/.calcium`, which no longer contained `prism`,
    // and to `.calcium`, which no longer contains a tilde. **A pattern naming
    // today's default is a rule with an expiry date nobody wrote down** — A03
    // §2's vacuity class arriving through a rename rather than through a bad rule.
    //
    // The shape is a quoted string beginning with an optional `~/` and then a
    // dot-name. Relative imports are the near miss and they do not match: `./x`
    // and `../x` put `/` or `.` where this wants `[a-z]`.
    pattern:
      /require\(["']fs["']\)|from\s+["']node:fs["']|["'`](?:~\/)?\.[a-z][a-z0-9._-]*(?:\/|["'`])/,
    scope: "src/interaction/history/", allow: [],
    why: "the filesystem and the state directory are injected (I11, I12): C20 writes through `HistoryFs`, and any hardcoded dot-directory path makes standalone development write beside a real install" },

  { id: "SS4", spec: "C13 I9 · C13 T2.2 · C14 T2.4",
    pattern: /\b(?:Date\.now|new Date|performance\.now|process\.hrtime|Date)\b/,
    scope: "src/viewport/", allow: [],
    why: "L2 reads no clock at all — `seq` is logical, so golden frames and fixture-backed sessions are reproducible" },

  // --- forbidden literals --------------------------------------------------
  // SS14 guards the **write** path, and its own citation says so: C01 T2.5 is an
  // output scan. Nothing may *emit* an escape sequence except one module, because
  // a terminal left in a mode nobody owns is unrecoverable.
  //
  // Recognition is the inverse direction and was never what it guarded. C16's
  // decoder matches bytes arriving *from* the terminal: it emits nothing, and the
  // sequences it matches are the terminal's input vocabulary rather than this
  // application's output. C16 I13 separately forbids importing `terminal/`, so
  // without this entry the component is unbuildable as specified - two rules each
  // right and impossible together.
  //
  // MG21's precedent runs the other way: `presentation/` may import `escapes.js`
  // for `sgr` and nothing else. Both are narrow legal edges, stated rather than
  // assumed.
  //
  // **The entry names the decoder's file, and it is not a licence to emit.** A
  // second table of the same constants was the alternative and is worse - an
  // input sequence and an output sequence that stop agreeing look correct in both
  // files, which is MG20's drift with nothing to catch it. If `decode.ts` ever
  // writes a query or a mode set, that is the write path and this entry would
  // hide it, so the decoder carries its own test that it reaches no stream
  // (C16 T2.9). One file allowed, one file to check.
  { id: "SS14", spec: "C01 I1 · C01 T2.5",
    pattern: /\\x1b|\\u001b|\u001b/,
    scope: "src/", allow: ["src/terminal/escapes.ts", "src/interaction/router/decode.ts"],
    why: "escape literals live in one module on the write path; recognising arriving bytes is the inverse direction" },

  // A C0 control character written literally into source. An escape, or not at
  // all.
  //
  // Two instances, and they are the two halves a rule wants. `decode.ts` holds a
  // deliberate one inside a control-stripping character class — correct, and
  // unreadable, which is why it is an escape now rather than an allow entry.
  // `keymap.ts` held an accidental one as a *separator*: `slot` joined on NUL and
  // `describe` split on NUL, both agreed, and ten tests passed.
  //
  // That second one is why the pattern is broad rather than aimed. It was found
  // by SS40 firing on the string surgery beside it, and SS40's stated concern is
  // `.length` in the editor. A scan targeted precisely at its own subject would
  // have walked past a NUL masquerading as a space.
  //
  // Tabs and newlines are excluded because they are whitespace people write on
  // purpose; everything else in C0 is invisible in every editor and diff.
  { id: "SS43", spec: "C16 T2.10",
    pattern: /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/,
    scope: "src/", allow: [],
    why: "a control character in source is invisible: write it as an escape, or a separator that reads as a space turns out to be a NUL" },

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
  // The fourth member of the clock / `process.env` / escape-literal family, and the
  // last ambient value that had no owner. The clock enters at C22, `process.env` at
  // C02, escape literals live in `escapes.ts` — and the terminal's dimensions were
  // read wherever anyone wanted them, which today is one place by luck rather than
  // by rule.
  //
  // **The rule is satisfied and the gap it guards is not closed.** C01 I12 gives a
  // coherent snapshot per `SIGWINCH`; nothing gives one per frame, because `writer`
  // is a `Proxy` over the real stdout and its `columns` is read at access time by
  // whoever holds the handle. C01 T5.8 demonstrates it in a PTY: a frame composed at
  // 100 and written at 80 wraps, and a wrap scrolls the alternate screen. What this
  // buys is that a *second* live reader cannot appear quietly beside the one
  // legitimate one; the snapshot belongs to whoever writes the frame path (M-T6).
  //
  // **Keyed on the receiver, and the reason is the other direction of SS20's defect.**
  // A bare `\.columns` matches `block.columns` in `table/` and `plan.columns` in its
  // planner — nine sites that have nothing to do with a terminal — and annotating
  // them would put a claim about terminal width on lines about table columns. So the
  // receiver is named: the stream handles a width can actually come from.
  //
  // The residual gap, stated rather than discovered: a handle stored under a name not
  // in this list — `const out = lifecycle.writer; out.columns` — escapes. `out` is in
  // the list for that reason and the list is not a proof. What closes it is the
  // per-frame snapshot, not a cleverer regex.
  //
  // Its fabricated violation is `stdout.columns` through a held handle, copied from
  // `lifecycle.ts` rather than invented (A03 commitment 14a).
  { id: "SS42", spec: "C01 I13 · C01 T2.10",
    pattern: /\b(?:stdout|stderr|stdin|writer|stream|out|term|tty)\s*\.\s*(?:columns|rows)\b/,
    scope: "src/", allow: ["src/terminal/lifecycle.ts"],
    why: "the terminal's dimensions are read in lifecycle.ts and handed down; width is the axis that wraps" },

  { id: "SS19", spec: "C10 I13 · C10 T2.5",
    pattern: /\b(?:38|48);5;\d|\bansi(?:16|256)?\s*[:=]\s*\d|\[\d{1,2}m/,
    scope: "src/presentation/theme/", allow: ["src/presentation/theme/four-bit.ts"],
    why: "tokens are 24-bit hex; the curated 4-bit map is the one file that holds indices" },

  // **The pattern was correct about a syntax nobody writes**, and that is its own
  // vacuity class (A03 §2). It required a word character after `syntax.`, and
  // `code.ts` — its only consumer for two components, and the file the allow-list
  // exists for — writes ``slot(`syntax.${token.slot}`, …)``. `$` is not `\w`, so
  // the rule never matched the one idiom in use, its allow-list was never
  // exercised, and a third consumer writing that form would have passed silently:
  // the four-place friction C10 I16 asks for, unenforced at the only place it
  // applies.
  //
  // The interpolated form is now the second alternative. And per A03 commitment
  // 14a, its fabricated violation is **copied from `code.ts`** rather than written
  // fresh — a fabrication written to the rule's own assumption reproduces the
  // assumption, which is exactly how this survived.
  //
  // The allow-list names both legitimate members. C10 I16's list is closed at two
  // and this is the enforceable form of it.
  { id: "SS20", spec: "C10 I16 · C10 T2.8",
    pattern: /["'`]syntax\.(?:\w|\$\{)|palettes\s*\.\s*syntax/,
    scope: "src/",
    allow: ["src/presentation/theme/", "src/presentation/blocks/kinds/code.ts", "src/presentation/patch/"],
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
  // **The scope is `src/presentation/`, not `blocks/`.** Its reason — display width
  // comes from `cells()`, the implementation the measurer uses — is a fact about
  // presentation and not about one directory of it. Scoped to `blocks/` it stopped
  // seeing `src/presentation/table/` the day C11 created it, and C11 is the largest
  // consumer of measurement in the tree. Narrower reads as tighter and is looser,
  // because it stops seeing new files: SS2's argument, and SS26's failure with a
  // longer fuse.
  { id: "SS23", spec: "C09 T2.9",
    pattern: /\.length\b(?!.*\/\/ *cells-ok)/,
  //
  // **`theme/` is named as the one exception, rather than the scope being narrowed
  // back.** C10 resolves colours: its `.length` reads are over palette levels,
  // contrast ceilings and error arrays, and none of it is text a terminal draws.
  // Marking sixteen of them `// cells-ok` would put a claim about display width on
  // lines that have nothing to do with display width, which is worse than the
  // exemption — it teaches the annotation to mean "the scan complained". An
  // allow-list of one directory is auditable; a glob that might stop matching is
  // not (SS19's argument, recorded there).
    scope: "src/presentation/", allow: ["src/presentation/theme/"],
    why: "display width comes from cells(), never .length" },

  // SS40 is SS23's split repeated one directory over, and the third instance of
  // A03 §2's directory-scope class.
  //
  // C17 indexes by grapheme because the cursor is a *position*. C16's decoder
  // counts bytes and buffer offsets in a stream, where a code-unit count is the
  // correct measure and a grapheme index would be wrong — `pending.length` is how
  // many characters are left to parse, not how wide anything is.
  //
  // A shared rule would give the decoder the editor's advice at the moment
  // someone reaches for the quick fix, which is exactly what SS23's comment above
  // says about SS40 itself. A directory is a packaging decision, not a semantic
  // one.
  // **The annotation covers all three branches, and it did not.** The lookahead
  // sat on the `.length` alternative alone, so `.charAt(` and `.slice(` had no
  // escape hatch at all — and C17 needs one: slicing a *grapheme array* is the
  // correct operation at the buffer, the kill buffer and the 200-unit undo
  // bound, and index arithmetic over clusters is what this rule is asking for
  // rather than what it forbids. A rule with no way to say "this is the right
  // operation" is a rule people route around by renaming the variable.
  //
  // **`// graphemes-ok` is a claim, not a suppression.** It asserts that the
  // expression operates on a grapheme array or a non-text value, where index
  // arithmetic is correct. It does not mean "the scan complained here". The
  // distinction is the whole value of the annotation: SS23's comment already
  // records why sixteen `cells-ok` marks on colour arithmetic would have taught
  // the mark to mean the wrong thing, and the same failure is one careless
  // review away here. `test/support/README.md` carries it beside the fixture
  // rules, because that is where someone reads about writing an exception.
  { id: "SS40", spec: "C17 I2 · C17 T2.4",
    pattern: /(?:\.length\b|\.charAt\s*\(|\.slice\s*\()(?![^\n]*\/\/ *graphemes-ok)/,
    // **Two directory exceptions, and they are the same exception twice.** The
    // rule is C17's: a cursor is a position and `.length` is a unit count, so
    // the editor indexes by grapheme. C16's decoder and C18's tokeniser are
    // both *lexers over a string*, where the code unit is the addressing
    // scheme rather than a mistake about one — decode counts bytes off the
    // wire, and the parser's spans are code-unit offsets by definition, spliced
    // back into the same string they were measured in.
    //
    // Granted as directories rather than as annotations because the alternative
    // was twenty-seven `// graphemes-ok` marks in one component, and an
    // annotation that dense stops reading as a claim and starts reading as
    // ceremony — which is how it becomes a way to silence the rule. Neither
    // file measures display width, and MG16 now forbids C18 from importing the
    // layer that would let it. C18 T3.23 demonstrates the claim on astral
    // characters rather than asserting it.
    //
    // **C19's entries are files, and the near-miss is worth recording.** C19 §2
    // first claimed `completion/` as a third directory, on the reasoning that it
    // works in the tokeniser's coordinate system — true of `context.ts` and
    // `sources.ts`, which slice C18's code-unit offsets and strip ASCII markers
    // in that same space, and false of `menu.ts`, which measures candidate
    // columns and must use `cells()`. The discriminator is the sentence above:
    // no allowed file measures display width. Granting the directory would have
    // given the one file in the minority the wrong advice at exactly the moment
    // someone reached for a quick fix, which is the defect A03 §2 has now
    // recorded three times.
    //
    // **Per file rather than per directory, and the direction is what makes it
    // safe.** An allow-list denies by default, so a file added to `completion/`
    // later is caught and has to be argued onto this list rather than inheriting
    // an allowance nobody re-examined. That is the opposite of SS26's failure,
    // where a narrow *scope* silently stopped seeing new files.
    scope: "src/interaction/",
    allow: [
      "src/interaction/router/decode.ts",
      "src/interaction/parser/",
      "src/interaction/completion/context.ts",
      "src/interaction/completion/sources.ts",
      // **C20's six, and `layers.ts` is deliberately not among them** — the
      // discriminator is the sentence above, held to for the second time. Two of
      // the six are lexers in C18's coordinate system (`redact.ts` splices the
      // tokeniser's spans back into the string they were measured in;
      // `codec.ts` scans a line for escapes), and four count arrays — entries,
      // rows, splices — where an index is a position in a list and not a claim
      // about text at all. `layers.ts` is the one file that measures display
      // width, and it uses `cells()`; granting the directory would have handed
      // the file in the minority the wrong advice at the moment someone reached
      // for a quick fix.
      "src/interaction/history/codec.ts",
      "src/interaction/history/navigate.ts",
      "src/interaction/history/persist.ts",
      "src/interaction/history/redact.ts",
      "src/interaction/history/search.ts",
      "src/interaction/history/store.ts",
    ],
    why: "the editor indexes by grapheme, never by code unit: `.length` is a unit count and the cursor is a position. `// graphemes-ok` claims the expression operates on a grapheme array or a non-text value, where index arithmetic is correct — it is a claim about the code, not a way to silence the rule. C16's decoder and C18's tokeniser are out of scope: both are lexers where a unit count is the correct measure" },

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
  // C11 owns no state: sort order, expansion and focus all arrive as data (C11
  // I11), and `planColumns` is pure and holds no cache (C11 §2). A module-level
  // `let` in `table/` is how each of those stops being true — a memo keyed on the
  // last width, a remembered sort order, a cached plan — and none of them changes
  // a single frame in the suite, because the answers are correct. What changes is
  // that two tables sharing the module disagree, and only when one of them
  // resizes.
  //
  // **The scope names the directory, and C11 implements into one.** A03 inventoried
  // this as `table/` while the scaffold held `src/presentation/table.ts`, a file,
  // so `startsWith` would have matched nothing and the rule would have reported
  // compliance from the day it was written — SS26, one directory over. The fix was
  // to the layout, not to the rule.
  //
  // Anchored to the start of a line so a `let` inside a function body is what it
  // is: an ordinary local, in a pure function, which is not what this forbids.
  //
  // **`scope` is a list, because this rule has always had three.** A03 declares
  // `table/`, `plot/` and `parser/`; the row named one, so two thirds of the rule
  // could not fire and the row read as though it covered all three. Widening the
  // field rather than adding a second row with the same id closes the class: C18
  // needs the third scope, and a per-scope row is a shape the next reader has to
  // notice rather than a list they add to.
  //
  // **And the list then diverged from A03's row in both directions**: the code
  // grew `patch/` for C25 and the row never heard, while the row named `parser/`
  // and the code never did. 14b's inventory equality compares rule *ids*, so it
  // saw neither. The scope-column equality in `test/unit/enforce-rules.test.ts`
  // is 14b's equality one column over, and it fired on eight other rows.
  { id: "SS24", spec: "C11 I11 · C11 T2.6 · C12 T2.5 · C25 T2.4 · C18 T2.2",
    pattern: /^(?:export\s+)?(?:let|var)\s/m,
    scope: [
      "src/presentation/table/",
      "src/presentation/plot/",
      "src/presentation/patch/",
      "src/interaction/parser/",
    ], allow: [],
    why: "C11, C12 and C25 own no state: a module-level binding is a cache two blocks share and only one of them invalidates" },

  // C18 I11 and C05 I18, as one rule.
  //
  // **Its subject was always "a shared text primitive with one implementation";
  // the row happened to name two.** Widening to three states what it meant —
  // and a second row with an identical family is the shape A03 §2 says a reader
  // has to *notice*, which is what a rule cannot rely on. SS24's `scope` list is
  // the precedent: widen the field.
  //
  // The three:
  //
  //   - **Tokeniser.** C19 completes what C18 will parse. Two tokenisers
  //     disagree at unbalanced quotes and escaped spaces, and the symptom is a
  //     candidate that parses differently once accepted.
  //   - **Quoter.** The same, one step later: a candidate quoted by one and
  //     parsed by the other round-trips to something else.
  //   - **Edit distance.** Two distance-2 cutoffs agree about the distance and
  //     diverge about the tie-break, so they differ exactly where a suggestion
  //     is *wrong* rather than absent — which A01 A.2 says costs more than none.
  //
  // The pattern names the declarations rather than the calls, so importing
  // either owner is fine and writing a second is not.
  { id: "SS30", spec: "C18 I11 · C18 T2.3 · C18 T2.10 · C19 T2.4 · C05 I18 · C05 T2.9",
    pattern:
      /^(?:export\s+)?(?:async\s+)?function\s+(?:tokenis[ez]e?|lex|shellSplit|quoteArg|shellQuote|quote|levenshtein|editDistance|distance)\b/m,
    scope: "src/",
    // **The third entry is a name collision and not a second implementation**,
    // and it is granted rather than tolerated. C09's `code.ts` tokenises *source
    // text into highlight slots* — a different primitive with a different input
    // and a different output, shared with C25 for exactly the reason this rule
    // exists. Widening the pattern to exclude it by name would make the rule
    // depend on a spelling; naming the file says which exception was granted and
    // by whom, and the scope-column equality keeps A03 saying the same thing.
    allow: [
      "src/interaction/parser/tokenise.ts",
      "src/data/manifest/validate.ts",
      "src/presentation/blocks/kinds/code.ts",
    ],
    why: "one tokeniser, one quoter, one distance-2 suggester — a second agrees today and diverges where it is least visible" },

  { id: "SS26", spec: "C21 T2.2",
    pattern: /process\.stdout\.write/,
    scope: "src/data/process/", allow: [],
    why: "child output is piped; it never reaches the real terminal" },

  // C21 I8 and I11, made mechanical. Two things are banned and the asymmetry is the
  // rule rather than an oversight:
  //
  //   - **Timers.** C21 holds no timing policy anywhere. The escalation ladder
  //     and its two-second rungs are C06 §4, which is the component that knows
  //     what a verb is. A grace period inside `killAll` is the specific thing
  //     this catches, and it is the one someone adds while being careful.
  //   - **`SIGTERM` as a literal.** C21 delivers whatever signal the caller
  //     names; the only signal it names itself is `killAll`'s `SIGKILL`. So a
  //     `SIGTERM` literal in `process/` means a ladder has migrated out of C06,
  //     and the policy now exists in two places — after which which one runs
  //     depends on the call path.
  { id: "SS27", spec: "C21 I8 · C21 I11 · C21 T2.4",
    pattern: /\bset(?:Timeout|Interval)\b|\bSIGTERM\b|\bescalat/i,
    scope: "src/data/process/", allow: [],
    why: "C21 delivers signals and holds no timing policy — the ladder is C06's, and a second copy is the one that drifts" },

  // C21 I14. The three ambient reads C21 does not make, because it is given all
  // three (`env`, `stdin`, `debug`).
  //
  // `process.env` is SS10's already and this does not duplicate it: SS10 allows
  // `terminal/capabilities.ts` and would keep allowing it if that file ever moved
  // here. What this adds is `process.stdin`, which nothing else forbids and which
  // is the read that would quietly make I6 untestable again — a probe against the
  // real stdin can only be exercised by a test putting its own terminal into raw
  // mode.
  { id: "SS41", spec: "C21 I14 · C21 T2.7",
    pattern: /process\.(?:env|stdin)\b/,
    scope: "src/data/process/", allow: [],
    why: "C21 reads nothing ambient; the environment and the raw-mode probe are injected, which is what makes I6 assertable" },

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

  // **SS22, the anti-drift check.** Inventoried from the start and unbuildable
  // until `completion/` existed, which is C19's landing — the same "a rule
  // waiting on the component that creates its scope" this file opens with.
  //
  // The whole value of C05 is that a flag added on the far side becomes
  // completable with no TypeScript change (C19 T4.1). A hardcoded enum in
  // completion is how that stops being true, and it looks entirely harmless in
  // review: the list is *correct* on the day it is written.
  //
  // Two shapes, because there are two ways to write one. A `"--flagname"`
  // literal is a flag by itself; three or more lowercase word strings in an
  // array literal is a verb or enum list. `"--"` alone is not matched — the
  // prefix test in `context.ts` is a question about syntax, not a flag name.
  //
  // `types.ts` is allowed by name: `SLOT_KINDS` is C19's own closed union,
  // enumerated so T2.7 can be exhaustive over it, and it is not manifest data.
  // The alternative is a rule that cannot see a list added to any other file.
  { id: "SS22", spec: "C19 I4 · C19 T2.6 · C19 T4.1",
    pattern: /"--[a-z][\w-]*"|\[\s*"[a-z][\w -]*"\s*,\s*"[a-z][\w -]*"\s*,\s*"[a-z][\w -]*"/,
    scope: "src/interaction/completion/", allow: ["src/interaction/completion/types.ts"],
    why: "every candidate is a projection of the manifest (I4): a literal verb, flag or enum list here is how completion drifts from the far side, and it is correct on the day it is written" },

  // **C20 owns a `flush` that has nothing to do with a frame**, and the
  // collision is the rule's evidence rather than its intent: this scan reads a
  // bare identifier, and `flush` is C03's scheduler method *and* the name C20 §4
  // and C22 §8 both give to putting history on disk. Three files are allowed by
  // name — the interface, the writer, and the store that delegates to it.
  //
  // What the allowance costs is visible and small: those three stop being
  // scanned for `commit(` and `invalidate(` too. Two other things already cover
  // that ground for C20 — MG18 forbids any import from `terminal/`, and the
  // component's whole injected surface is `fs`, `clock` and `stateDir`, so a
  // scheduler has no route in. Per file rather than per directory, so a file
  // added to `history/` later is caught and has to be argued onto this list.
  { id: "SS28", spec: "C16 T2.6 · C17 T2.6 · C18 T2.4 · C19 T2.5 · C20 T2.6",
    pattern: /\b(?:commit|flush|invalidate)\s*\(/,
    scope: "src/interaction/",
    allow: [
      "src/interaction/history/types.ts",
      "src/interaction/history/persist.ts",
      "src/interaction/history/store.ts",
    ],
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
  { id: "SS36", spec: "C10 I24 · C10 T2.19",
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
  // **The token list is a second copy of the union, and it stays one deliberately.**
  // Adding `continuation` to `Glyph` made this rule fail, which is how the
  // duplication announced itself — and the obvious fix, deriving the list from
  // `types.ts`, is the wrong one here. The two failure directions are not
  // symmetric: a list that has gone stale rejects a legitimate new token loudly,
  // at the commit that adds it, with the fix one word long. A derivation that
  // mis-parses the union — and it now carries interleaved doc comments — widens
  // the rule silently, which is the failure this scan exists to prevent, arriving
  // through the scan itself. So: literal, and the cost is one word per token.
  //
  // The pattern matches a glyph position whose literal is *not* a token, so
  // `glyph: "error"` passes and `glyph: "✗"` does not. Scoped to `src/`: the
  // one file that holds the characters writes them as table rows rather than in
  // a glyph position, so it needs no exemption — and an exemption nobody needs
  // is a door left open.
  { id: "SS39", spec: "C04 I6 · C09 §4",
    pattern: /\bglyph\s*:\s*["'`](?!(?:ok|warn|error|info|pending|working|running|queued|cancelled|expand|collapse|live|bullet|continuation)["'`])/,
    scope: "src/", allow: [],
    why: "a block names a glyph slot; C09 §4 owns both renderings and the 1:1 width rule" },

  // The third member of the injected-ambient family, after the clock and the
  // environment record. Calcium ships no binary, so a variable named for one
  // consumer has no business inside a framework that claims to serve others —
  // `prism-tui` reads its own and passes the value through `TuiConfig`.
  //
  // **Broad by name rather than by variable.** C06 I18 forbade
  // `PRISM_TUI_TRANSPORT` and C22 I20 added `PRISM_TUI_STATE_DIR`; a rule per
  // variable is a list that grows one incident at a time, and the third one
  // would be added after it shipped. The prefix is the thing that means "the
  // app's", so the prefix is what the rule matches.
  { id: "SS44", spec: "C06 I18 · C22 I20 · C22 T2.9",
    pattern: /PRISM_TUI_[A-Z_]+/,
    scope: "src/", allow: [],
    why: "the app's entry point resolves its own variables; the framework reads none" },

  // C24 I5 — nothing is inferred from a field name.
  //
  // A builder that guessed a tone from a key called `status` would work for
  // four verbs and fail silently on the fifth, which is the failure mode that
  // makes this a rule rather than a convention: the wrong tone renders.
  //
  // **The pattern is a tone or glyph literal used as an object-literal value**,
  // which is the shape of the table T2.7 names — `{ status: "warn" }`, whether
  // it is a standing map or built at a return. The trailing `[,}]` is what
  // keeps a union *type* (`state?: "pending" | "done"`) out of it, so
  // `types.ts` stays in scope rather than being allow-listed out.
  //
  // **What it does not catch**, recorded rather than hidden: the conditional
  // form. `if (key === "status") return "warn"` infers exactly as hard and
  // matches nothing here, because the tone never appears beside a colon. A
  // regex can see a table and cannot see a decision. The by-hand read stays the
  // backstop for that half, and `glyphFor` — which maps tone to glyph, not
  // field name to tone, and is I6's ergonomics rather than inference — is the
  // legitimate neighbour it must keep passing.
  { id: "SS45", spec: "C24 I5 · C24 T2.7",
    pattern: /:\s*"(?:ok|warn|error|info|dim|muted|accent|meta|identifier|pending|running|queued|cancelled|working|live|bullet|expand|collapse)"\s*[,}]/,
    scope: "src/shell/builders/", allow: [],
    why: "a builder inferring a tone or glyph from a field name works for four verbs and fails silently on the fifth (C24 I5)" },

  // --- SS46 — who may append with `origin: "refresh"` -----------------------
  //
  // **C23 §3b claimed one producer and there were four**, and the sentence read
  // as a guarantee while constraining nothing. §3a's row now says what the value
  // means rather than which mechanism sets it — *provenance, not mechanism*: a
  // system notice with no user behind it. The four that qualify are C13's cap
  // marker, C22's two startup warnings, and C23's identity notice.
  //
  // A claim about a set wants a check or it is re-made by the next reader who
  // greps one site. The allow-list is the set, so a fifth append fails here
  // rather than quietly widening what the word means.
  //
  // **Known limit, stated because an unrecorded one reads as strength.** This
  // finds the literal `origin: "refresh"` and nothing computed — a variable
  // holding the string, or a `meta` object spread from elsewhere, passes. It is
  // the same blind spot every textual rule in this suite has, and the reason it
  // is acceptable here is that all four sites are literals and a computed origin
  // would be a change worth noticing on its own.
  // SS48 — one composition, one caller (C22 I54, C24 I25, FINDINGS F126).
  //
  // The composition `session.ts` performs is `render-frame.ts`'s `composeFrame`,
  // and `session.ts` calls it. What this forbids is a second one: any file under
  // `src/shell/` calling `paint(` other than the unit that owns it.
  //
  // **Why a scan rather than a comment.** The render chain gains output
  // diffing, render caching, block windowing and a cap as one change (F90). A
  // consumer reading frames through `expectDocument().lines()` is on the
  // production path across all four **only** while there is one composition, and
  // a copy would diverge on the first of them in silence — no test fails,
  // because both paths are individually correct.
  //
  // **Known limit, stated because an unrecorded one reads as strength.** It
  // finds the textual call. A second composition assembled by calling
  // `renderSequenceToLines` directly, or by aliasing `paint` through a variable,
  // passes — this catches the shape someone would actually write, which is the
  // old `#render()` body pasted somewhere new, and not a determined evasion.
  { id: "SS48", spec: "C22 I54 · C24 I25",
    pattern: /(?<![\w.])paint\s*\(/,
    scope: "src/shell/",
    allow: ["src/shell/render-frame.ts", "src/shell/paint.ts"],
    why: "a second frame composition — `composeFrame` in `render-frame.ts` is the one, and `session.ts` calls it. Two would diverge silently the first time the render chain changes (C22 I54)" },

  { id: "SS46", spec: "C23 §3a · C23 I22",
    pattern: /origin:\s*"refresh"/,
    scope: "src/",
    allow: [
      "src/viewport/transcript/cap.ts",
      "src/shell/construct.ts",
      "src/shell/execution.ts",
      "src/shell/types.ts",
    ],
    why: "`origin: \"refresh\"` is provenance — a system notice with no user behind it (C23 §3a). A fifth site is either a new one of those or the word drifting" },

  // --- SS49 — who may append with `origin: "defect"` ------------------------
  //
  // SS46's argument with a narrower set: **one site, not four.** `defect` is the
  // arm the framework sets about itself (C23 §5a, C04 I13), and the whole reason
  // it is worth a fifth arm on a public union is that it distinguishes a
  // contained failure from a verb that did nothing. A second producer widens it
  // back into a general "something went wrong", which is what `refresh` already
  // drifted into once.
  //
  // **Known limit, stated because an unrecorded one reads as strength.** Like
  // SS46 it finds the literal and not a computed origin, and — unlike SS46 —
  // its allow-list has one entry, so it is also the weakest possible version of
  // itself: it cannot tell a second `contain()` in `execution.ts` from the
  // first. What it catches is the shape someone would write, which is the
  // notice copied into another file.
  { id: "SS49", spec: "C23 §5a · C23 I48 · C04 I13",
    pattern: /origin:\s*"defect"/,
    scope: "src/", allow: ["src/shell/execution.ts"],
    why: "`origin: \"defect\"` is the framework reporting a failure it contained (C23 §5a). A second producer is the word widening into `something went wrong`, which is what `refresh` did before SS46" },

  // SS50 — a measurement that has not said which convention it is under.
  //
  // **The rule came before the sweep, and that ordering is the point.** Forty
  // `cells()` calls default to narrow, and finding them by reading is the
  // seventeen-count sweep's shape: a blind pass over a population nobody can
  // enumerate. With the rule first, the population is a list that reports
  // itself and shrinks visibly — which is also what makes the exemptions below
  // auditable rather than remembered.
  //
  // **The annotation is a claim, not a suppression** (SS40's distinction).
  // `// narrow-ok` asserts that this measurement is right under either
  // convention — because the text is ASCII, or because the two sides of a
  // comparison move together. It does not mean "the scan complained".
  //
  // **The pattern asks whether the line mentions the capability at all**,
  // rather than counting arguments. A first version looked for a comma before
  // the closing paren and fired on `cells(text.replace(sgrPattern(), ""),
  // ambiguous)` — a correctly threaded call, reported because the first `)`
  // belonged to a nested call. A line-based rule cannot parse; what it can do is
  // ask for a word that only appears when the decision has been taken.
  //
  // **Three files are allow-listed and each is the same reason**: C19's menu,
  // C20's history layers and the fallback adapter build display text where no
  // capability is in scope, and giving them one means widening a builder
  // signature in a component this change does not otherwise touch. They measure
  // under the default until those signatures move (roadmap 51). A prefix
  // allow-list is auditable; marking seven lines with an annotation that means
  // "not yet" would teach `// narrow-ok` to mean two things.
  { id: "SS50", spec: "C02 I9 · C02 §3",
    pattern: /\bcells\((?!.*ambiguous)(?!.*\/\/ *narrow-ok)/i,
    scope: "src/",
    allow: [
      "src/interaction/completion/menu.ts",
      "src/interaction/history/layers.ts",
      "src/shell/fallback.ts",
    ],
    why: "a display measurement says which ambiguous-width convention it is under, or says why it does not need to (C02 I9)" },

  // --- SS51 — a vocabulary read directly, going round the axis ---------------
  //
  // **The type stops the mismatch; this stops going round the type.** `ladderFor`
  // is a mapped type over the axis, so `ladderFor("density", caps)` returning a
  // height ladder does not compile — measured, TS2322. What it cannot stop is a
  // renderer never asking: `import { RAMP_BRAILLE }` and indexing it, which is
  // the exact move that produced C12's second defect. The guarantee lives in a
  // function, and a rule that forbids the import is what makes the function the
  // only door.
  //
  // ## The subject is a vocabulary, and two `RAMP_` names are not one
  //
  // Measured across `src/` before the pattern was written, because a broad
  // `\bRAMP_[A-Z_]+\b` reports five lines and none of them is this rule's:
  //
  // | name | what it is | in scope? |
  // |---|---|---|
  // | `RAMP_UNICODE` `RAMP_ASCII` `RAMP_BRAILLE` `RAMP_DENSITY` | glyph sets — a value picks *which* | **yes** |
  // | `RAMP_DOTS` (`raster.ts`) | `{x:1,y:8}`, dots per cell for the ASCII fold | no — a **homonym** |
  // | `RAMP_STEPS` | `8`, the rung count every ladder shares | no — about all of them, not one |
  //
  // `RAMP_DOTS` is F161's shape arriving in a scan's own scope: a name that
  // matches the pattern and shares nothing with the class. Allow-listing
  // `raster.ts` by file to excuse it would put a permanent hole in a *renderer*,
  // which is the one place the rule is for — so the pattern names the four rather
  // than the prefix.
  //
  // ## Which is a closed list, and therefore has an equality arm
  //
  // A named set stops seeing a fifth ramp, and silently. So `RAMP_VOCABULARIES`
  // is exported and `enforce-rules.test.ts` asserts it equals the string-valued
  // `RAMP_*` exports in `ramp.ts` — bidirectional, the shape `MARK_EXEMPTIONS`
  // and `EXPECTED_SURVIVORS` already have. A fifth vocabulary fails a test rather
  // than passing a scan, and the discriminator is honest: a vocabulary is a
  // string of glyphs, `RAMP_STEPS` is a number.
  //
  // ## Blind spots, stated because an unrecorded limit reads as strength
  //
  // - **Lexical.** `ladderFor("height", caps).steps` handed onward, or the eight
  //   glyphs pasted as a literal, both pass. SS47 catches the paste as a *mark*
  //   and says nothing about which axis it encodes.
  // - **`src/` only.** Three test files import the vocabularies to assert on
  //   them, which is the vocabulary being pinned rather than a renderer going
  //   round the door.
  // - **Import-shaped, not use-shaped.** It reports the line that names the
  //   constant. A re-export under another name would pass, and there is none.
  { id: "SS51", spec: "C12 §3c · C12 I21",
    pattern: new RegExp(`\\b(?:${RAMP_VOCABULARIES.join("|")})\\b`),
    scope: "src/", allow: ["src/presentation/plot/ramp.ts"],
    why: "a renderer names the axis it draws and never a vocabulary (C12 I21) — `ladderFor` is the door, and reading a ramp constant is the move that produced the heatmap's density-for-height defect" },

  { id: "SS35", spec: "C04 §4 · C05 §2",
    pattern: /^\s*(?:export\s+)?type Result\s*[<=]/m,
    scope: "src/", allow: ["src/data/viewmodel/types.ts"],
    why: "one Result in the tree; two shapes under one name in one layer half compile and diverge quietly" },
];

/**
 * SS47 — a mark the framework draws and cannot substitute (C09 I22, F122).
 *
 * **Not a line regex, because the subject is a literal's contents.** The other
 * rules here ask whether a line matches; this one asks whether a *string* carries
 * a character the renderer would have to substitute and nobody will. Prose
 * punctuation passes by character class; everything else needs an entry.
 *
 * ## The scope was measured before it was written, across three candidates
 *
 * | scope | reports |
 * |---|---|
 * | any non-ASCII in code | 183 — the em dashes in error messages swamp it |
 * | a literal with no ASCII word — "a mark" | 53, and it **misses the ruling** |
 * | this one | 58, of which 6 were unexcused |
 *
 * The middle one is the instructive failure: tighter, tidier, a smaller number,
 * and it excludes `loading…`, `… n more` and `▸ [y] yes` — the three sites the
 * ruling is about — because a mark embedded in a sentence is still a mark. A scan
 * tuned until its output looks tidy is tuned away from its class.
 *
 * ## The blind spot, with its number
 *
 * **106 literals carry prose punctuation and this passes every one.** An em dash
 * on a terminal reporting `unicode: ascii` is drawn as verbatim as `❯` was. That
 * is a real and much larger question — every error message in the tree — and it
 * is not this rule's, which is about marks. Recorded so it is re-checkable rather
 * than rediscovered.
 *
 * A second limit: this reads literals lexically, so a mark built by
 * `String.fromCodePoint` or held in a variable passes. Every current site is a
 * literal, and a computed one would be a change worth noticing on its own.
 */
const PROSE_MARKS = new Set("—§·×≤≥→«»⚠");

/**
 * Every site allowed to carry a mark, and **why** — the shape `UNCONSUMED_MEMBERS`
 * and `BUILDER_OMISSIONS` both have, for the reason F102 gives: an exemption
 * records which premise it rests on, so the premise can be re-checked rather than
 * inherited. Keyed by file, because a per-line key goes stale on any edit above it.
 */
export const MARK_EXEMPTIONS = Object.freeze({
  "src/presentation/blocks/glyphs.ts":
    "the vocabulary itself — every entry is a pair and C09 I5's test asserts each is 1:1 by cell count",
  "src/presentation/text.ts":
    "the truncation marker resolves against the capability on the line it is written (`ascii ? \"~\" : \"…\"`)",
  "src/presentation/patch/collapse.ts":
    "carries its own `[unicode, ascii]` pair; the marker is a whole row, so the ASCII form's three cells cost nothing",
  "src/presentation/patch/definition.ts":
    "picks its rule character from the capability in the expression that draws it",
  "src/presentation/plot/ramp.ts":
    "`RAMP_UNICODE` beside `RAMP_ASCII` — the ramp is the vocabulary for a plot cell",
  "src/presentation/plot/curve.ts":
    "the braille blank, folded per mode by `definition.ts`; braille is chosen only where the capability allows it",
  "src/presentation/plot/linedraw.ts":
    "the box-drawing glyph tables — the vocabulary for line-style curves, gated by ambiguousWidth in `definition.ts`",
  "src/shell/config.ts":
    "`PROMPT_SUBSTITUTION` is the pair, and `frame.ts` asserts both forms are `PROMPT_GUTTER.first` cells (C22 I52)",
  "src/shell/paint.ts":
    "the elision pair, resolved from `deps.capabilities`; the spinner is taken from C09's `spinnerFrames`",
  "src/data/fixtures/diff.ts":
    "a corpus-drift report written to a developer's terminal by a developer's command — never composed into a frame",
  "src/testing/measurement-conformance.ts":
    "the conformance report, same premise: a tool's output, not a rendered document",
  "src/testing/navigation-conformance.ts":
    "the element-conformance report, and the same premise as its sibling above: a tool's output read by a developer, never composed into a frame",
});

/**
 * A letter is prose; a **letterlike symbol** is a mark.
 *
 * `\p{L}` alone was the first version and it let `ℹ` through — U+2139 is in a
 * letter category and is C09's `info` glyph, sitting in the table this rule
 * exists to police. The block is excluded by range: everything from U+2100 is a
 * symbol that happens to be classified as a letter, which is exactly the set a
 * mark would be drawn from.
 *
 * Found by the count moving: 43 glyph-table hits became 42 when the letter
 * allowance landed, and one fewer violation in the file the rule is *about* is
 * the shape to distrust.
 */
function isLetter(c) {
  const cp = c.codePointAt(0) ?? 0;
  if (cp >= 0x2100 && cp <= 0x214f) return false;
  return /\p{L}/u.test(c);
}

const NON_ASCII = /[^\x00-\x7F]/u;
const LITERALS = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/gsu;

/** Comments blanked, newlines kept, so reported lines are the source's. */
function codeOnly(src) {
  const blank = (m) => m[0].replace(/[^\n]/gu, " ");
  return src
    .replace(/\/\*[\s\S]*?\*\//gu, (m) => blank([m]))
    .replace(/\/\/[^\n]*/gu, (m) => blank([m]));
}

export function checkMarks(files, readFile = (f) => readFileSync(f, "utf8"), exemptions = MARK_EXEMPTIONS) {
  const violations = [];
  const fired = new Set();

  for (const file of files) {
    const f = file.replaceAll("\\", "/");
    if (!f.startsWith("src/")) continue;
    const code = codeOnly(readFile(file));
    for (const m of code.matchAll(LITERALS)) {
      const body = m[0].slice(1, -1);
      const marks = [...body].filter((c) => c.codePointAt(0) > 127);
      if (marks.length === 0) continue;
      // **A letter is prose, whatever its diacritics.** `rôle` in a reason string
      // fired this on the first new file written after the rule landed, and the
      // rule was wrong rather than the file: the subject is a *mark*, and `ô` is
      // text. `\p{L}` rather than a longer character list, because the next one
      // is `naïve` or a far side's name and a list would be extended one panic
      // at a time.
      if (marks.every((c) => PROSE_MARKS.has(c) || isLetter(c))) continue;
      if (exemptions[f] !== undefined) {
        fired.add(f);
        continue;
      }
      violations.push({
        rule: "SS47",
        file: f,
        line: code.slice(0, m.index).split("\n").length,
        message:
          `\`${body.slice(0, 40)}\` carries a mark the framework draws and cannot substitute. ` +
          `A mark in framework text is a \`Glyph\` slot, or a pair resolved where the ` +
          `capability is in hand, or ASCII (C09 I22)`,
        spec: "C09 I22 · C22 I52",
      });
    }
  }

  // **The bidirectional arm** (MG27's, and `UNCONSUMED_MEMBERS`'). An entry whose
  // file no longer carries a mark has outlived its reason, and a list nobody
  // prunes is one nobody reads — which is how the reasons stop being checked.
  for (const f of Object.keys(exemptions)) {
    if (fired.has(f)) continue;
    violations.push({
      rule: "SS47",
      file: f,
      line: 1,
      message:
        `is excused from SS47 — "${exemptions[f]}" — and carries no mark. ` +
        `Remove the entry, or the reason stops being one anybody checks`,
      spec: "C09 I22",
    });
  }

  return violations;
}

/**
 * `readFile` is injected for the same reason the module graph injects it: a rule
 * is only known to work when it has been shown to fire, and showing that means
 * a fabricated violation at a path that does not exist on disk. A03 commitment
 * 14 requires one per rule — see `test/unit/enforce-rules.test.ts`.
 */
/** A rule's scopes, as a list. A bare string is the one-scope case. */
function scopesOf(scan) {
  return Array.isArray(scan.scope) ? scan.scope : [scan.scope];
}

export function checkSourceScans(files, readFile = (f) => readFileSync(f, "utf8")) {
  const violations = [];

  // **Each file was read once per rule, and there are 34 of them.**
  //
  // The read sat inside the rule loop, so a pass over 179 files did 6,086 reads
  // to see 179 distinct files, and the suite makes 43 passes — 261,698 reads of
  // an immutable tree. Measured on an idle machine: 411 ms a pass, 17.7 s of CPU
  // across the suite, which is why four scan rows timed out at 15 s inside a
  // loaded run and passed in 2.8 s alone.
  //
  // **Read once, and the loops below are otherwise untouched** — deliberately.
  // Inverting them to file-major would reorder every violation list, and the
  // rows that assert on those lists would have to move with it; a reordering
  // that happens to keep the suite green is a change nobody can check. So this
  // is a cache in front of the same walk, and `readFile` stays injected because
  // the fabricated-violation rows supply their own.
  const seen = new Map();
  const read = (f) => {
    const hit = seen.get(f);
    if (hit !== undefined) return hit;
    const src = readFile(f);
    seen.set(f, src);
    return src;
  };

  for (const scan of SCANS) {
    const scopes = scopesOf(scan);
    for (const file of files) {
      const f = file.replaceAll("\\", "/");
      if (!scopes.some((s) => f.startsWith(s))) continue;
      if (scan.allow.some((a) => f === a || f.startsWith(a))) continue;
      const src = read(file);
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
