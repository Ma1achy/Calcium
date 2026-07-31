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
  { id: "SS40", spec: "C17 I2 · C17 T2.4",
    pattern: /\.length\b(?!.*\/\/ *graphemes-ok)|\.charAt\s*\(|\.slice\s*\(/,
    scope: "src/interaction/", allow: ["src/interaction/router/decode.ts"],
    why: "the editor indexes by grapheme, never by code unit: `.length` is a unit count and the cursor is a position. C16's decoder is out of scope and counts bytes, where a unit count is the correct measure" },

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
  { id: "SS24", spec: "C11 I11 · C11 T2.6 · C12 T2.5 · C25 T2.4 · C18 T2.2",
    pattern: /^(?:export\s+)?(?:let|var)\s/m,
    scope: ["src/presentation/table/", "src/presentation/plot/", "src/presentation/patch/"], allow: [],
    why: "C11, C12 and C25 own no state: a module-level binding is a cache two blocks share and only one of them invalidates" },

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
/** A rule's scopes, as a list. A bare string is the one-scope case. */
function scopesOf(scan) {
  return Array.isArray(scan.scope) ? scan.scope : [scan.scope];
}

export function checkSourceScans(files, readFile = (f) => readFileSync(f, "utf8")) {
  const violations = [];
  for (const scan of SCANS) {
    const scopes = scopesOf(scan);
    for (const file of files) {
      const f = file.replaceAll("\\", "/");
      if (!scopes.some((s) => f.startsWith(s))) continue;
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
