// Does every mutation still have something to mutate?
//
// **A mutation run is code that nothing runs.** `make all` does not touch
// `tools/mutate/runs`, and `tools/instruments.mjs` exempts the directory by
// name — *mutation configurations, not instruments: each is an input to
// `mutate.mjs`, which is covered*. That reason is true and it leaves the inputs
// unwatched, which is the third category inside an exemption arriving again.
//
// What rots is the anchor. Every mutation is a `from` string that must appear
// verbatim in a source file, and a source file moves for reasons that have
// nothing to do with the mutation: `c26-address.mjs`'s **control** was anchored
// on `if (elements.length === 0) return null;` and a later sweep appended a
// `// graphemes-ok:` marker to that line. The control could not apply, so
// `runPass` threw before the first mutation and the whole run was unrunnable —
// for however long it had been since anyone ran it.
//
// **The harness reports this correctly and only to whoever runs it.** ANCHOR
// MISSED is already distinguished from SURVIVED, and a control that cannot
// apply already throws rather than passing. Nothing was wrong with the harness;
// what was missing is anyone asking the question between runs. This asks it in
// two seconds, over every run at once.
//
// It does not run the mutations and cannot tell whether one is still *pointed
// at the right thing* — an anchor that resolves against a line that has changed
// meaning is the citation-resolves-against-the-wrong-invariant class, and
// `docs/COMMITMENT_INVARIANT_AUDIT.md` §Fourth pass says why no mechanism for
// that should be built. F277 is the measured instance: a unique, present,
// textually correct anchor on a line whose *callers* moved, reporting SURVIVED
// against a test that was right all along.
//
// **And a mutation is a pair, of which this read one half** (F279, F1030).
// `anchorsOf` extracted `{file, from}`, confirmed `from` resolved, and reported
// `no drift` — a sentence about the corpus that was true of half of it.
// Re-anchoring is exactly the operation that breaks the unchecked half: a row
// moved from `svg.ts` to `figure.ts` kept the old arm's `to:`, which spliced a
// statement into an object literal, and every suite failed to *transform*.
// `ran()` caught that, and `ran()` exists for a SIGPIPE'd suite — the right
// outcome from the wrong instrument, minutes into a pass that is not in the
// default gate, where this runs in seconds.
//
// **The blocker F279 recorded is gone and the satisfier was never in this
// repository.** It read: the honest gate is apply-and-parse, TypeScript 7.0.2's
// JS entry point no longer exports `createSourceFile`, and `esbuild` is only
// vite's transitive dependency — so it was owed on a symbol, *a parser `tools/`
// may depend on*. Both halves still hold at HEAD (measured 2026-09-10:
// `Object.keys(await import("typescript"))` is `default, version,
// versionMajorMinor`; esbuild is transitive through vite **and** tsx). What
// changed is the runtime: node 22.23's `module.stripTypeScriptTypes` is a
// TypeScript parser in the standard library, needing no dependency row at all.
// `parseOf` below is that gate — **1947 of 1974 pairs applied and parsed in
// 6.8 s, zero false positives**, and the 27 are the `.md` anchors and the
// already-listed stale ones.
//
// **And that the run is a program at all** (F997). Every arm here reads the run
// as *text*, and text resolves whether or not the file parses: a `const STACK`
// declared twice in `c12-arm-seam.mjs` made the run die before its first
// mutation while this sweep reported *1005 anchors · 937 expectations · no run
// drifted from what the list says*. Every anchor did resolve and the sentence
// was true. `parseErrorOf` is the one question a text sweep cannot answer for
// itself, and it is asked first.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { importsOf, resolve as resolveSpec } from "../enforce/module-graph.mjs";

const ROOT = process.cwd();

/**
 * `--dir` points the sweep at a fabricated runs directory, for this tool's own
 * fixture. **The debt list does not travel with it**: against a foreign
 * directory every missing anchor is a failure, because `KNOWN_STALE` names runs
 * in *this* repository and a list that applied everywhere would let the fixture
 * pass by inheriting an excuse.
 */
const argDir = process.argv.indexOf("--dir");
const DIR = argDir === -1 ? "tools/mutate/runs" : process.argv[argDir + 1];
const OWN = argDir === -1;
// **A debt list the fixture can supply, and only a foreign one** (F1119). MA3's
// claim is that `KNOWN_STALE` does not excuse a run outside this repository's
// runs directory — and the only way it could ever be *shown* was to name a run
// the real list held. The list is empty now, so the fabrication's corpus is
// empty with it, and the row passes by having nothing to inherit rather than by
// the gate holding. This flag is the other arm: the same fabricated run is
// excused when a list is handed in, and never by the tree's own.
const argStale = process.argv.indexOf("--stale");
const SUPPLIED = argStale === -1 ? null : JSON.parse(process.argv[argStale + 1]);

/**
 * Anchors that do not resolve **today**, with the run they belong to.
 *
 * **A debt list and not an exemption**, and the difference is in the arm below:
 * an entry that starts resolving again is a failure, exactly as a stale
 * exemption is. Compared by equality in both directions, because a subset check
 * lets a dead entry outlive its reason unread.
 *
 * Each of these means *this run has not been run since its subject moved*, and
 * the remedy is to run it and re-derive what it reports — which is a session's
 * work per component and not a rewrite anyone should do from a list. Re-
 * anchoring a mutation without running it produces a row that applies and
 * asserts nothing, which is worse than one that says it could not apply.
 */
/**
 * Expectations that name a gate **outside their own run**, deliberately, with
 * the run they belong to and the tier that answers instead.
 *
 * **A row's `expect` is a claim about which instrument caught it** — the same
 * sentence `testPathsOf` above is written from, one step further along. That
 * check asks whether a named test **file** exists; this one asks whether the
 * named **row** is inside a file the run actually invokes, which is the question
 * the sentence was about. Measured when it was built: **927 expectations across
 * 99 runs, three of which named a row their run could not reach** — one in a
 * file the command does not list, one that had lost the space and the brackets
 * from a row named `F3 (b):`, and the entry below.
 *
 * **A debt list and not an exemption**, on `KNOWN_STALE`'s terms: an entry that
 * starts resolving is a failure too, because a list nobody prunes outlives its
 * reason unread.
 */
const CROSS_TIER = {
  // The run mutates `fits = 0;` out of the keys module and says so: *the line
  // tier 5 restored. Kept as a listed survivor with its reason.* Its integration
  // corpus cannot see it; `test/e2e/completion.test.ts` can, and this run does
  // not execute tier 5.
  "c19-menu-window.mjs": ["C19 T5.1"],
  // Two wirings the unit corpus cannot see: `session.ts` handing the sampler
  // the tapped `elapsed` (C28 I53) and `construct.ts` handing the transport the
  // wall clock (C06 I19). Both are one file below the seam T1.104 resolves, and
  // the row that counts is tier 5's parity on both channels (F971, F972).
  "c28-profiler.mjs": ["C28 T5.1c"],
};

/**
 * Anchors that resolve to **more than one site** — and there are none (F1113).
 *
 * It was a debt list of ten, on `KNOWN_STALE`'s terms, carrying the argument
 * that *the first match may well be the site the run names*. It was not:
 * `c04-kv-bar`'s row is called **the fill pair** and fired on `extentFor`, and
 * `c12-value-bar`'s comment says **re-anchored onto `pairFor`** and fired on
 * `extentFor` too, twenty lines above. Two of ten, and both named their subject
 * in the mutation, which is as close to a reader being told as a file gets.
 *
 * **A green run could never have shown it**, because the mutation kills either
 * way — `caught`, by the expected row, on the wrong function. That is why the
 * remedy is a refusal in `apply` rather than a note on a report, and why this
 * map is empty rather than absent: ten disambiguated, each pass re-run, and an
 * entry appearing here again is a failure the way a stale anchor is.
 *
 * Compared by **equality**, both directions.
 */
const KNOWN_AMBIGUOUS = {};

/**
 * Run files whose tail **runs and says nothing** (F768), by the shape of the
 * silence — a debt list on `KNOWN_STALE`'s terms, compared by equality both
 * ways, so a repaired tail still on the list is a failure.
 *
 * `report(results)` returns a string; a tail that does not `console.log` it
 * prints nothing, and one that does not `process.exit` on a survivor exits 0
 * whatever it found. Either way the pass ran — mutations applied, tree restored
 * — and the exit status is the same bit as a clean pass. `c26-select-all.mjs`
 * did this for five mutations before anyone opened the log.
 *
 * **Four of 146 on the sweep's first run** (2026-09-05): two of F768's exact
 * shape (`report(results);` alone) and two that print and do not exit. Listed
 * rather than repaired here, for the reason at the head of `KNOWN_STALE`: the
 * repair is one line and belongs to whoever runs the pass, because a tail
 * fixed without a run is a claim about what the run reports made by someone
 * who has not read it.
 */
// **Empty since 2026-09-05**, when the four it listed were repaired in one pass —
// two printed nothing (`report(results);` alone, F768's line) and two printed
// and never exited. Compared by equality both ways, so a new silent tail fails
// here and a repaired one must leave.
const KNOWN_SILENT = {};

/**
 * How a run's tail ends — `null` when it prints its report **and** exits on a
 * survivor, else the shape of the silence.
 *
 * Read from the last `runPass(` to the end of the file, because that is where
 * the results exist to be dropped. **The blind spots, stated**: a tail printing
 * the report of the *wrong* variable — `console.log(report(other))` — passes,
 * and so does an unconditional `process.exit(0)`; both are the citation-
 * resolves-against-the-wrong-thing class this tool declines to build for. And
 * a file with no `runPass(` at all is not a run and is not checked, which is
 * what lets a mutations-only fixture through MA1.
 */
/**
 * Why node refuses to parse a run, or `null` when it parses (F997).
 *
 * **The question every other arm in this file assumes an answer to.** A `from:`
 * is found by a regular expression and a tail is read by `lastIndexOf`, and
 * both work perfectly on a file that is not a program — so a run with a
 * duplicated `const` reports every anchor resolving, right up until someone
 * spends the half hour and watches it die before its first mutation. **A green
 * from this sweep is what licenses not spending that half hour**, which is why
 * the cheap proxy owes the cheap question.
 *
 * `process.execPath` rather than `node`: the parse that counts is the one
 * performed by the runtime that will run the pass, and a second binary on the
 * PATH answers a question nobody asked.
 *
 * **No debt list, and the asymmetry is the reason.** A stale anchor is listed
 * rather than repaired because re-anchoring without running the pass produces a
 * mutation that applies and asserts nothing — a repair that reads as coverage.
 * A syntax error has no such trap: the file cannot run at all, so there is
 * nothing a repair could quietly invalidate, and the remedy is the line eslint
 * has already printed. An entry here would be an excuse for a five-second fix.
 *
 * **The blind spots, stated.** This asks whether the file *parses*, not whether
 * it *links*: a mistyped named import — `import { runPas } from "../mutate.mjs"`
 * — is resolved when the module is instantiated, and no check short of running
 * the module sees it. Nor does it reach a run that parses, links, and throws on
 * its first statement, or one whose `to` does not parse — the harness reports
 * that last one itself, as `DID NOT BUILD`. What closes the class is executing
 * the run, and executing a run is the pass.
 */
function parseErrorOf(path) {
  const r = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  if (r.status === 0) return null;
  // node prints `<path>:<line>`, the offending source, a caret, then the error.
  const lines = `${r.stderr ?? ""}`.split("\n");
  const at = /:(\d+)$/.exec(lines[0] ?? "");
  const why = lines.find((l) => /^[A-Za-z]*Error: /.test(l))?.trim() ?? "node --check refused it";
  return at === null ? why : `${why} (line ${at[1]})`;
}

/**
 * Extensions `parseOf` can answer for. A mutation into a `.md` fixture or a
 * `.py` tool is not a syntax question this parser is entitled to; those rows
 * are counted as unparsed rather than skipped silently, on `tails`' argument.
 */
const PARSEABLE = /\.(ts|mts|cts|js|mjs|cjs)$/;

/**
 * Why the parser refuses a source, or `null` when it accepts it (F279, F1030).
 *
 * **`mode: "transform"` rather than `"strip"`**, and the difference is one
 * construct: strip-only refuses a TypeScript `enum` as unsupported rather than
 * as malformed, which would be a false positive the day somebody writes one.
 * The tree has none today — measured — and a gate that would fire on a legal
 * construct is a gate that gets an exemption and stops being read.
 *
 * **Stated blind spots.** It asks whether the result is a *program*, not
 * whether it type-checks and not whether it means anything: a `to` that swaps
 * two arguments of the same type parses perfectly, and so does one that
 * asserts nothing. And it cannot see `.tsx` (there is none in the tree) or a
 * `.md`/`.py` subject, which are counted apart. What closes the class is
 * running the pass, and running the pass is the pass.
 */
function parseOf(src) {
  try {
    stripTypeScriptTypes(src, { mode: "transform" });
    return null;
  } catch (e) {
    return `${e.message}`.split("\n")[0].slice(0, 120);
  }
}

function silenceOf(src) {
  const at = src.lastIndexOf("runPass(");
  if (at === -1) return null;
  const tail = src.slice(at);
  const printed = tail.includes("console.log(report(");
  const exits = tail.includes("process.exit(");
  if (printed && exits) return null;
  return printed ? "no exit" : exits ? "unprinted" : "unprinted, no exit";
}

/**
 * The debt list, and it is **empty** (F1118, 2026-09-11).
 *
 * Kept rather than deleted, for `KNOWN_AMBIGUOUS`'s reason: an absent map reads
 * as a mechanism nobody built, and an empty one reads as a debt that has been
 * paid. Every entry below is a headstone saying what rotted and what was done
 * about it, because a re-anchoring that nobody can read is a re-anchoring
 * nobody can check.
 *
 * **Seventeen across eleven runs were paid in one round**, and the split is the
 * thing to carry forward: **seven were re-anchored** — a rename, a reflow, a
 * clause added beside the subject — and **ten were re-derived**, meaning the
 * mutation itself had to be rewritten because the code it was about had moved
 * somewhere else or changed direction. `c22-construct`'s T4.6 is the sharpest:
 * its subject was deleted from the tree on purpose, and its row now stands
 * against that line being *added back*, so the mutation adds it.
 *
 * **And a mutation whose subject is a line's whole text rots for reasons that
 * are not about it.** Three of the seventeen were one cache-key line that grew
 * three axes; each mutation names one axis and each anchor reached to the end of
 * the line, so all three broke every time a fourth arrived. They are fragments
 * now — the axis and its neighbour — which is unique, drops exactly what the
 * mutation is about, and survives the next axis landing beside it.
 *
 * **A repaired anchor is never trusted without running the pass.** All eleven
 * runs were run; every mutation was caught by the row that names it.
 */
const KNOWN_STALE = {
  // `docker-dashboard.mjs` was 2 and is gone (F1104). Both were the same edit
  // — `summaryLine(live)` and the `emptyMessage` literal each gained a
  // `unicode` argument — and the entry said the repair belonged to whoever ran
  // the pass, because re-anchoring without running it produces a mutation that
  // applies and asserts nothing. The pass was run: both are caught, and so is
  // the `C4` survivor beside them, which is what the sweep was for.
  // `c15-centred-width.mjs` was 1 and is gone (F1118): `selected` became a
  // thunk, so the line above the subject gained a call. The pass was run.
  // `c19-menu-window.mjs` was 1 and is gone (F1118): `selected` became
  // `selection.at`, a rename rather than a restructure. The pass was run.
  // `c12-origin.mjs` was 1 and is gone (F1118). It was debt older than its own
  // entry — a template literal this reader could not see until F1109's backtick
  // widening — and the subject had restructured rather than moved: the clamp
  // and mirror went into L0's `normalisedOf`, which takes *invert* as a boolean
  // because §3ac rules `Facing` the renderer's vocabulary. So the mutation is
  // now the argument rather than the expression, which is re-derivation and not
  // re-anchoring. The pass was run: OR1 catches it.
  // `c22-construct.mjs` was 2 and is gone (F1118). Both were re-derived rather
  // than re-pointed, and **one of them inverted**: `T4.6`'s
  // `stores.viewport.resize(...)` is not in the tree because C03 I15 removed it
  // as a second writer, and the row now stands against one being *added back*,
  // so the mutation adds it. `T4.8`'s commit left the wheel handler for the read
  // loop under C22 I27 — one commit per decoded batch, the handler's return not
  // gating it — so the mutation is `deliver`'s. The pass was run.
  // `c22-frame-session.mjs` was 2 and is gone (F1118): the `ctx` literal was
  // reflowed when `nativeSelection` and `lastFrame` joined it, and the overlay region's
  // height became the transcript's (I28) rather than the terminal's. Both are
  // re-anchored onto what the mutation is actually about. The pass was run.
  // `c22-selection-wash.mjs` was 1 and is gone (F1118): the local was inlined
  // into the `set`. The pass was run.
  // `c23-refresh.mjs` was 10 and is gone (F1011): all ten were re-anchored and
  // the pass runs 17 of 17 caught, control killed. Nine were one rework — the
  // thing that polls is the source, not the part — and the tenth was a mutation
  // whose subject `b.live` no longer has, so it went with it rather than being
  // re-pointed at a nearby line it would have asserted nothing about.

  // **Six of these arrived at once, and none of them rotted that day** (F173).
  // They were stale already and the checker could not see them: it matched only
  // double-quoted `from:` values, so 108 of 465 anchors across 30 of 54 runs
  // were outside its reading. Widening the pattern turned 357 anchors into 465
  // and 19 misses into 25 — the six below, plus one each already counted above.
  //
  // **The two this session owned were repaired rather than listed** —
  // `c12-ramp.mjs` and `c12-value-bar.mjs`, both re-anchored onto where the
  // encoding rule moved their subject and both re-run. These four are not, for
  // the reason at the head of this list: repairing an anchor without running the
  // pass produces a mutation that applies and asserts nothing, which reads as
  // coverage from the summary line.
  // `c10-categorical.mjs` was 1 and is gone (F1118): the cap gained `!matrix &&`
  // beside it. The pass was run.
  // `c26-elements.mjs` was 1 and is gone (F1118): re-derived rather than
  // re-pointed — the descent stopped being a list of kinds and became a question
  // asked of the definition, so the mutation is the walk returning before it
  // descends. The pass was run.

  // **Five runs moved under C26 §4g and C22 I76 on 2026-09-03, none of them
  // run that day.** `c04-scroll` and `c22-camera` anchor on the render slot,
  // which gained a seventh axis (`cursorKey`); `c26-address` on `keys.ts`'s
  // `↑`/`↓` rows, which now consult the focused entry; `c26-focus-target` and
  // `c26-semantic-copy` on `focus.ts`'s stored shape, which gained `entryId`.
  // Each is a one-token repair, and listed rather than repaired for the reason
  // at the head of this list: the repair belongs to whoever runs the pass.
  // `c04-scroll.mjs` was 1 and is gone (F1118): the slot key grew three axes
  // after the anchor was written, so a whole-line anchor rotted for reasons that
  // had nothing to do with the offsets. Re-anchored onto the fragment that names
  // the axis and its neighbour. The pass was run.
  // **`c22-camera` went from one to three and `c22-cursor` joined, under C22 I77
  // on 2026-09-04, neither run that day** (lane V). The render slot gained an
  // eighth axis (`framesKey`), the commit reason became `orbits.length > 0 ||
  // frames.length > 0`, and the cap's ternary moved onto one line (`const floor
  // = … ? ORBIT_MS : ORBIT_MS_TORN`); `c22-cursor`'s slot fragment moved with the
  // first. One-token repairs each, listed rather than repaired for the reason at
  // the head of this list — the lane could not run the pass.
  // `c22-camera.mjs` was 3 and is gone (F1118): the slot key (fragment now),
  // the commit reason (I77 put animated frames beside the orbits) and the
  // capability cap (reflowed onto one line). The pass was run.
  // `c22-cursor.mjs` was 1 and is gone (F1118): the slot key again, re-anchored
  // onto the axis and its successor. The pass was run.
  // `c26-address.mjs` was 3 and is gone (F1118). One was re-anchored — §4g row b
  // put an inner guard between the outer condition and the `toPrompt()` — and
  // two were re-derived: `rowDown` writes `next ?? elements[i]` back because I16
  // made a motion that stops collapse the range, so the ring is the fallback and
  // the block edge is the guard on the move. The pass was run.
  // `c26-focus-target.mjs` was 2 and is gone (F1118): the `interaction` gate
  // grew a fourth clause reading `deps.liveEntry.id`, so dropping the liveness
  // test now means dropping two, and `focusRow`'s `rowId` became `entryId` with
  // `element` and `anchor` beside it. The pass was run.
  // `c26-semantic-copy.mjs` was 2 and is gone (F1118): the stored record gained
  // `entryId`, and `extendRowUp`'s null test moved up to guard the store repair
  // that runs before the boundary is tested. The pass was run.

  // **The statement is gone, not moved** (C04 I81, 2026-09-03). "a log domain
  // is spaced linearly" mutated `xPositionOf`'s own log arm — `if (!isLog || …)
  // return linear;` — and that arm no longer exists: the function is one call
  // to `normalisedOf` through a range that carries its scale. The equivalent
  // mutation is dropping `scale` from that range, which is a different line
  // with a different shape, so it is listed rather than guessed at; the repair
  // belongs to whoever runs the pass. Four sibling drifts from the same session
  // (`c12-layer-merge`, `c12-plot3d`, `c12-shared-geometry` ×2, `c22-camera`'s
  // `elements` guard) were re-anchored instead, each onto the same statement
  // one token wider.
  // `c12-x-axis.mjs` was 1 and is gone (F1118): re-derived — the early return
  // went when `pickAxis` began dispatching on the scale, and the positivity test
  // moved into `niceLogAxis`. The pass was run.
};

/**
 * A quoted literal's body, whichever quote the author used.
 *
 * Both are turned into JSON's one escaping so a single parser reads them: a
 * single-quoted body may hold a bare `"` (JSON's delimiter) and a `\'` (not a
 * JSON escape at all), and each is the reason the naive wrap-in-quotes fails.
 */
/**
 * A literal's text, or `null` for one this reader will not guess at.
 *
 * **The backtick arm is the third widening of the same blind spot** (F1109).
 * F173 read `"` alone and could not see 108 of 465 anchors; F232 added the
 * `+`-joined sequence; and the comment written then says the lesson out loud —
 * *the same shape as F173 one turn later, a widening that fixed the form in
 * front of it and stopped there* — while stopping at the two quote characters it
 * had in front of it. A template literal is the form an author reaches for when
 * the anchor contains a `"`, which is exactly when an anchor is interesting.
 *
 * **23 of them, across 5 runs, and 4 interpolate.** Those 4 are refused rather
 * than guessed at: `${GUARD}` is a value this file does not have, so any text it
 * produced would be a fabrication. They are counted, on the same argument every
 * other refusal here is counted on — an exemption that is not counted is an
 * exclusion.
 */
function unquote(body, quote) {
  if (quote === '"') return JSON.parse(`"${body}"`);
  if (quote === "`") {
    if (body.includes("${")) return null;
    return JSON.parse(`"${body.replaceAll("\\`", "`").replaceAll('"', '\\"').replaceAll("\n", "\\n")}"`);
  }
  return JSON.parse(`"${body.replaceAll("\\'", "'").replaceAll('"', '\\"')}"`);
}

/**
 * Every `{file, from}` pair a run declares, control included.
 *
 * **Both quote styles, and reading only one was this instrument's own blind
 * spot.** The first version matched `from: "…"` alone, so **108 of 465 anchors
 * across 30 of 54 runs were invisible** — a gate that ran, reported a count, and
 * could not see 23% of its subject. It was found the way the sixth blind spot
 * says: a real stale anchor in `c02-ambiguous.mjs` survived a commit and the
 * checker said the tree was clean, so the number it printed was checked against
 * the tree rather than trusted. FINDINGS F173.
 *
 * **A count is what a working gate looks like from outside**, which is why the
 * MA4 arm asserts equality against the tree and this comment records the figure.
 */
function anchorsOf(src) {
  const out = [];
  // **A branch per quote style rather than a backreference**, because a class
  // cannot exclude `\2`: one pattern over both would have to allow the delimiter
  // inside the body and stop at the first one followed by a comma, which a value
  // containing `",` ends early and silently. Comment lines between `file:` and
  // `from:` are skipped — a re-anchoring usually arrives with its reason.
  // **And the value may be a concatenation, on its own lines** — the second form
  // this instrument could not see (F232). Widening for both quote styles left
  // `from:` followed by a newline and a `+`-joined run of literals outside the
  // pattern: **6 of 838 anchors across 5 runs**, and one of them was stale on the
  // day it was measured. The same shape as F173 one turn later — a widening that
  // fixed the form in front of it and stopped there — which is why this matches a
  // *sequence* of literals rather than a third alternative.
  // **Three quote characters, not two** (F1109). The backtick is the form an
  // author reaches for when the anchor contains a `"` — so the reader that could
  // not see it was blind precisely where an anchor is most likely to be awkward.
  const LITERAL = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\`(?:[^\`\\]|\\.)*\``;
  // **The `to:` half, optional in the pattern on purpose** (F1030). Requiring
  // it would let a row whose replacement this reader cannot see vanish from the
  // anchor count instead of failing — F173's shape exactly, a widening that
  // narrows. So it is a trailing optional group, and the rows without one are
  // counted rather than dropped: `to: null` reaches the caller, which reports
  // the number.
  // **A name is a fourth form, beside the three quote characters** (F1117). It
  // is resolved against the file's own `const` declarations rather than by
  // importing the module — importing a run **executes the pass**, which is why
  // this reader is textual in the first place.
  const VALUE = String.raw`[A-Z_][A-Z_0-9]*|(?:(?:${LITERAL})\s*\+?\s*)+`;
  // **The newline between `file:` and `from:` was required, and that is a fifth
  // form** (F1245). Every mutation in this tree is written across lines, so the
  // pattern was built around the shape in front of it — and an `also:` edit,
  // which is one object inside a one-line array, has its `file:` and its `from:`
  // on the same line and matched nothing. Not stale, not ambiguous: **not an
  // anchor**, which is F1117's finding arriving through the separator instead of
  // through the value. Measured before the widening: four `also:` edits across
  // four runs, each invisible, and breaking one by hand left the sweep printing
  // *no run drifted from what the list says*. So the line break is optional.
  const SEP = String.raw`\s*,\s*(?:\n\s*)?(?:\/\/[^\n]*\n\s*)*`;
  const re = new RegExp(
    String.raw`file:\s*([A-Z_][A-Z_0-9]*|"[^"]*"|'[^']*')${SEP}from:\s*` +
      String.raw`(${VALUE})` +
      String.raw`(?:${SEP}to:\s*(${VALUE}))?`,
    "g",
  );
  const pieces = new RegExp(LITERAL, "g");
  // `null` from any piece poisons the join: a half-read anchor is worse than
  // an unread one, because it matches nothing and reports as stale.
  const join = (blob) => {
    const parts = (blob.match(pieces) ?? []).map((lit) => unquote(lit.slice(1, -1), lit[0]));
    return parts.some((x) => x === null) ? null : parts.join("");
  };

  // **The declarations, read with the same machinery as the anchors** (F1117).
  // The old reader took `const NAME = "…";` on one line in one of two quotes,
  // and served `file:` alone — so a `from: GATE` was not a stale anchor, an
  // ambiguous one or an unreadable one. It was **not an anchor**: the pattern
  // requires a literal in that position, so the whole mutation fell out of the
  // corpus and its run reported a number that never counted it. Twenty-four
  // across ten runs, and `c22-gate3b`'s **control** was among them — stale, so
  // the run threw at its first `apply` and could not start at all, with the
  // sweep saying no run had drifted.
  const consts = {};
  for (const m of src.matchAll(
    new RegExp(String.raw`^const ([A-Z_][A-Z_0-9]*) =\s*((?:(?:${LITERAL})\s*\+?\s*)+);`, "gm"),
  )) {
    consts[m[1]] = join(m[2]);
  }

  /**
   * A `from:`/`to:` value: a literal sequence, or a name this file declares.
   *
   * Three outcomes rather than two. A string is read; `null` with a reason is
   * **counted by name**, because an exemption that is not counted is an
   * exclusion; and a name that resolves to an interpolated body is the
   * interpolation case, which is F1109's and not this one.
   */
  const value = (blob) => {
    if (blob === undefined) return { text: null, why: null };
    const t = blob.trim();
    if (!/^[A-Z_][A-Z_0-9]*$/u.test(t)) {
      const text = join(t);
      return { text, why: text === null ? "interpolates" : null };
    }
    if (!(t in consts)) return { text: null, why: `names \`${t}\`, which is not a literal here` };
    return { text: consts[t], why: consts[t] === null ? "interpolates" : null };
  };

  for (const m of src.matchAll(re)) {
    const raw = m[1];
    const file = raw.startsWith('"') || raw.startsWith("'") ? raw.slice(1, -1) : consts[raw];
    if (file === undefined || file === null) continue;
    const from = value(m[2]);
    out.push({ file, from: from.text, why: from.why, to: value(m[3]).text });
  }
  return out;
}

/**
 * Every test path a run hands to `vitest`.
 *
 * **The second thing that rots in these files, and it rots more quietly than an
 * anchor.** `c12-shared-geometry.mjs` named `test/golden/plots.test.ts`; the
 * files are `plot.test.ts` and `plot-forms.test.ts`. **vitest drops a filter
 * that resolves to nothing whenever another one does** — no warning, no
 * non-zero exit — so the run executed three files where four were named, went
 * green, and its header argued *from* the goldens being in the corpus.
 * `c04-weights.mjs` had the same defect on a file that had moved a directory.
 *
 * An anchor that will not apply throws and stops the run. **A test file that is
 * not there changes nothing anyone can see**, and the pass reports `caught`
 * against a corpus it does not have: every row's `expect` becomes a claim about
 * which instrument caught it, made against an instrument set that is short.
 *
 * All 97 runs name their files after `vitest run`, and eight of them through a
 * `FILES` const — so concatenation is collapsed and single-string consts are
 * substituted before the tokens are read.
 */
function testPathsOf(src) {
  const flat = src.replace(/"\s*\+\s*\n?\s*"/g, "");
  const consts = {};
  for (const m of flat.matchAll(/^const ([A-Z_][A-Z_0-9]*) =\s*\n?\s*"([^"]*)";/gm)) consts[m[1]] = m[2];
  // **And an array const, which the single-string form does not reach** (F336).
  // `c22-construct.mjs` names its files as `const SUITE = [ … ]` and
  // interpolates the array, so this function found **no paths at all** for it —
  // and a run with no paths passes the existence check above by having nothing
  // to check. That is A03 §2's vacuity class inside the gate written against it:
  // the blind spot was found by building the sibling check on top, which read
  // every one of that run's expectations as unreachable.
  for (const m of flat.matchAll(/^const ([A-Z_][A-Z_0-9]*) =\s*\[([\s\S]*?)\]/gm)) {
    consts[m[1]] = [...m[2].matchAll(/"([^"]+)"/gu)].map((q) => q[1]).join(" ");
  }
  const out = new Set();
  for (const m of flat.matchAll(/vitest run ([^"`]+)/g)) {
    const expanded = m[1].replace(/\$\{([A-Z_][A-Z_0-9]*)\}/g, (whole, name) => consts[name] ?? whole);
    for (const token of expanded.trim().split(/\s+/)) {
      if (/\.test\.[cm]?tsx?$/.test(token)) out.add(token);
    }
  }
  return [...out];
}

/**
 * A gate name that is not a test row — the whole suite, or a make target.
 */
const RESERVED_EXPECTS = new Set([
  "baseline", "golden", "enforce", "check", "e2e", "instruments",
  "(none — expected to survive)",
]);

/**
 * A second row inside one `expect:` — a comma at **paren depth zero** followed by
 * another row-shaped token. The convention is one row per expectation; see the
 * refusal at the call site for why this is refused rather than split (F606).
 *
 * **The depth test is not fastidiousness, it is the first draft's defect.** A
 * plain `/,\s*[A-Z]{1,3}\d/` reads `"C1 (R1.2, R5.1)"` — a row name followed by
 * the requirements it cites, and the verbatim title of a real test — as two
 * rows, and fired on **four** legal expectations in `docker-ps.mjs` the first
 * time it ran. That is the false positive CLAUDE.md names: a gate that fires on
 * a legal construct is a gate that gets an exemption and stops being read. The
 * corpus caught it, review would not have, and the rule shipped one shape
 * narrower as a result.
 */
function namesTwoRows(expectation) {
  let depth = 0;
  for (let i = 0; i < expectation.length; i += 1) {
    const c = expectation[i];
    if (c === "(" || c === "[") depth += 1;
    else if (c === ")" || c === "]") depth -= 1;
    else if (c === "," && depth === 0 && /^\s*[A-Z]{1,3}\d/u.test(expectation.slice(i + 1))) return true;
  }
  return false;
}

/** Every `expect:` string a run declares. */
function expectationsOf(src) {
  return [...src.matchAll(/expect:\s*"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * The text of every test file a run invokes — named files and `--dir` alike.
 *
 * **Two roots, and the run's own `ROOT` says which.** The docker runs cwd to
 * `examples/docker`, so `--dir test` means that package's `test/` and not the
 * repo's; resolving against the repo root alone walks the wrong tree and reports
 * every one of their rows unreachable. That is `rootsFor`'s hazard on a
 * directory rather than on a file, and it fired while this was being written.
 */
function testCorpusOf(src, _run) {
  const pkg = /const ROOT = .*examples\/docker/u.test(src) ? "examples/docker/" : "";
  const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
  const walk = (d) => {
    if (!existsSync(d)) return [];
    return readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      (e.isDirectory() ? walk(`${d}/${e.name}`) : /\.test\.[cm]?tsx?$/u.test(e.name) ? [`${d}/${e.name}`] : []));
  };
  const parts = testPathsOf(src).map((p) => rootsFor(p).map(read).join(""));
  for (const m of src.matchAll(/vitest run --dir (\S+)/gu)) {
    const dir = [`${ROOT}/${pkg}${m[1]}`, `${ROOT}/${m[1]}`].find((d) => existsSync(d));
    if (dir !== undefined) parts.push(...walk(dir).map(read));
  }
  return parts.join("\n");
}

/**
 * Does `corpus` contain this expectation **as a row**, rather than as a prefix?
 *
 * **The substring test is how F1243 got through a gate built for it.** The
 * reachability check above has existed since this file did, and it asked
 * `corpus.includes("T2.13")`. `test/unit/text.test.ts` mentions **T2.133** —
 * three orders along, in a different component, and in a **comment** — so the
 * substring was present, the check passed, and a mutation whose suite could not
 * possibly execute C11 T2.13 was declared reachable. The survivor that followed
 * read as a finding about the tests.
 *
 * Two defects in one predicate, and they are the two this fixes:
 *
 * - **A row number has a boundary.** `T2.13` is a prefix of `T2.130`, and the
 *   repo's own SP5 message already says this about findings — *a number chosen
 *   by grepping a prefix, `^## F6[0-9]` cannot see F70*. The same arithmetic,
 *   one gate over.
 * - **A mention is not a row.** The name must be followed by what a title is
 *   followed by — a colon, a space, a paren — and preceded by a quote, a space
 *   or a line start, so `(F969, F978, T2.133)` in prose cannot satisfy a claim
 *   about which instrument catches a mutation.
 *
 * **What it does not reach, stated because an unrecorded limit reads as
 * strength**: a row's *title* may be present in a file the command names and
 * still be skipped, filtered out, or inside a `describe` that never runs. This
 * is a textual reach check and `reachOf` below is the executable one; neither is
 * the other, and F1037 is why no third is attempted.
 */
const ROW_ID = /^[A-Z]{1,4}\d[\w.]*$/u;
function namesARowIn(corpus, e) {
  if (!corpus.includes(e)) return false;
  // **Two forms, and one rule cannot serve both.** An expectation is either a
  // row **id** — `T2.13`, `SF3`, `MH10` — or a **fragment of a title**, which
  // several runs use where a row has no number. A fragment has no boundary
  // semantics and no fixed position, so it keeps the substring test it always
  // had; an id has both, and it is the id form that the substring test let
  // through (F1243).
  if (!ROW_ID.test(e)) return true;
  const name = e.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const bounded = new RegExp(`(?<![\\w.])${name}(?![\\w.])`, "u");
  // **An id names a row when it is inside a title and not inside prose.** The
  // anchor is not `it(`, which sits on the previous line for every multi-line
  // title in the tree, and it is not the opening quote either, because a title
  // may qualify the row first — `it("C10 T2.26 (C10 I33, …)"`. What separates
  // the two cases is what the line is: a string literal opens on it, and it is
  // not a comment. Measured against the corpus, that is the line both failures
  // fall on — `// … wrapped in Ink (T2.133).` and `// **R4.7 stood here**`.
  //
  // **Its blind spot, stated**: a title built across two lines, or from a
  // template with the id in an interpolation, reads as absent and is reported
  // here rather than passing quietly. That is the safe direction and it is not
  // the same as being right.
  for (const line of corpus.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    if (!line.includes('"') && !line.includes("'") && !line.includes("`")) continue;
    if (bounded.test(line)) return true;
  }
  return false;
}

/**
 * Every module a run's test files can reach, transitively.
 *
 * **The other half of F1243, and the half the user asked for.** A mutation is
 * only as good as the command that can execute it: `spans.mjs` mutated
 * `src/presentation/table/cells.ts` and named five test files, none of which
 * loads a table. The mutation applied, the anchor sweep said `anchors missed 0`,
 * the suite was green for the reason it is always green, and the report printed
 * `SURVIVED` — which in this harness means *a finding about the tests*.
 *
 * **This is reach, not correctness.** A run whose files import the mutated
 * module may still have no assertion that sees the change — that is F277 and
 * the audit says not to build a mechanism for it. What is mechanical is the
 * opposite: a module **no** test file in the command can import cannot be
 * covered by any of them, whatever they assert.
 *
 * The walk shares `importsOf` with the layer rules rather than re-reading
 * imports here, for the reason `inkOn` is shared: a second reader is a second
 * set of forms to miss.
 */
const reachCache = new Map();
const EXTS = ["", ".ts", ".tsx", ".mts", ".cts", ".mjs", ".cjs", ".js"];
// **Resolution is a pure function of the tree and is asked the same question
// thousands of times.** Eight `existsSync` plus a `statSync` per specifier, once
// per specifier per entry, is most of what the reach walk costs — and the answer
// cannot change inside one sweep.
const fileForCache = new Map();
function fileFor(spec) {
  const held = fileForCache.get(spec);
  if (held !== undefined) return held;
  const found = fileForUncached(spec);
  fileForCache.set(spec, found);
  return found;
}
function fileForUncached(spec) {
  for (const ext of EXTS) {
    const at = `${ROOT}/${spec}${ext}`;
    if (existsSync(at) && statSync(at).isFile()) return `${spec}${ext}`;
  }
  // **A directory specifier is its barrel**, which is most of this tree's edges:
  // `../table/index.js` arrives here as `src/presentation/table/index`, and a
  // resolver that only tries extensions on the literal path answers nothing for
  // `../table`. Half the reach walk was missing on the first measurement and it
  // presented as fourteen runs unable to see their own subject.
  for (const ext of EXTS.slice(1)) {
    const at = `${ROOT}/${spec}/index${ext}`;
    if (existsSync(at) && statSync(at).isFile()) return `${spec}/index${ext}`;
  }
  return null;
}
/**
 * One module's import specifiers, read once.
 *
 * **The cache is per file and not per entry, and the difference is the whole
 * cost.** `reachOf` already caches a closure against the entry that produced it,
 * which does nothing for two entries that share most of their graph — and in
 * this tree they nearly all do, because a barrel is on almost every path. Every
 * entry re-read and re-scanned the same files: measured on 247 runs, the sweep
 * went 12.6 s → 29.3 s when the reach walk landed, past the 120 s budget MA4 and
 * MS3 run it under once the suite is loaded. Reading each file once brings it
 * back.
 */
const specsCache = new Map();
function specsOf(file) {
  const held = specsCache.get(file);
  if (held !== undefined) return held;
  const body = readFileSync(`${ROOT}/${file}`, "utf8");
  const specs = [
    ...importsOf(`${ROOT}/${file}`, () => body, true),
    ...[...body.matchAll(/\bimport\s*\(\s*["'`]([^"'`]+)["'`]/gu)].map((m) => m[1]),
  ];
  specsCache.set(file, specs);
  return specs;
}

function reachOf(entry) {
  const held = reachCache.get(entry);
  if (held !== undefined) return held;
  const seen = new Set();
  const stack = [entry];
  while (stack.length > 0) {
    const next = fileFor(stack.pop().replace(/\.(m|c)?js$/u, ""));
    if (next === null || seen.has(next)) continue;
    seen.add(next);
    // Type-only edges included on purpose: a module a test reaches only for its
    // types is still one that file can be asked about, and the safe direction
    // for a *reach* check is to count more edges rather than fewer.
    // **A dynamic `import()` is an edge and `importsOf` does not read one**, by
    // design: it serves the layer rules, where a deferred import is a
    // deliberately different question (the emulator behind one on the shell
    // route is a shipped decision). Widening it there would move MG1–MG3. So the
    // dynamic form is added here, where the question is only *can this file be
    // loaded from that one* — and it is not an embellishment: it is the edge
    // `plot-detail-scope.test.ts` uses, `await import(".../plot/definition.js")`,
    // and without it this gate reported a run whose every mutation is caught.
    for (const spec of specsOf(next)) {
      const target = resolveSpec(next, spec);
      if (target !== null) stack.push(target);
    }
  }
  reachCache.set(entry, seen);
  return seen;
}

/** `src/a/b.ts` without its extension, which is what `resolve` answers in. */
const bare = (p) => p.replace(/\.(m|c)?[jt]sx?$/u, "");

/** Runs already reported unreached, so one run is one line rather than one per anchor. */
const unreached = new Set();
const out_unreached = [];

/**
 * Every module the run's own test files can import, transitively — or `null`
 * where this reader cannot say.
 *
 * **`null` rather than an empty set, because they mean opposite things.** A run
 * naming a `--dir`, or whose files this reader cannot resolve, has an *unknown*
 * reach; reporting that as *nothing is reachable* would flag every one of its
 * mutations, which is a gate firing on a legal construct — the false positive
 * CLAUDE.md names, and the thing that gets a rule exempted and then unread.
 */
const runReach = new Map();
const reachableCache = new Map();
function reachableIn(src) {
  // **Cached on the run's own source, before anything is read.** `reachableIn`
  // is asked once per *anchor* and the cache below keys on the test paths, so
  // every question re-derived those paths and re-read every test file the run
  // names just to ask whether the corpus scans — 2441 calls where there are 247
  // runs. The answer is a function of the source text and nothing else.
  const cached = reachableCache.get(src);
  if (cached !== undefined) return cached;
  const answer = reachableUncached(src);
  reachableCache.set(src, answer);
  return answer;
}
function reachableUncached(src) {
  const paths = testPathsOf(src);
  // **A bare directory in the command is an unknown reach, not an empty one.**
  // `vitest run … test/golden` runs every file under it, and `testPathsOf` keeps
  // only `*.test.*` tokens — so a run ending in a directory looks like it names
  // three files when it runs forty. Reporting that as *cannot reach* is a gate
  // firing on a legal construct, which is how a rule gets an exemption and then
  // stops being read.
  const named = [...src.matchAll(/vitest run ([^"`]+)/gu)].flatMap((m) => m[1].trim().split(/\s+/u));
  // **A corpus that walks the tree has an unknown reach, and unknown is the
  // answer to give.** `router-focus.test.ts` reads every `.ts` under `src/` and
  // `public-api.test.ts` globs `src/**/*.ts`; both reach files they name
  // nowhere, and no reading of this file can say which. **The first draft tried
  // to enumerate the scan roots** out of the corpus's quoted strings, and it is
  // the wrong shape — each new form of walk is another clause, and a gate that
  // grows a clause per false positive is a gate on its way to an exemption list.
  // Saying nothing about a scanner is the same answer `--dir` already gets, for
  // the same reason.
  if (/\breaddirSync\b|\bglobSync\b|\breaddir\b/u.test(testCorpusOf(src)) ) return null;
  const walksADir =
    /vitest run --dir/u.test(src) ||
    named.some((t) => !t.startsWith("-") && !/\.test\./u.test(t) && rootsFor(t).some((q) => existsSync(q) && statSync(q).isDirectory()));
  if (paths.length === 0 || walksADir) return null;
  const key = paths.join(" ");
  const held = runReach.get(key);
  if (held !== undefined) return held;
  const all = new Set();
  let resolvedAny = false;
  for (const p of paths) {
    const at = rootsFor(p).find((q) => existsSync(q));
    if (at === undefined) continue;
    resolvedAny = true;
    for (const m of reachOf(at.slice(ROOT.length + 1))) all.add(bare(m));
  }
  const answer = resolvedAny ? all : null;
  runReach.set(key, answer);
  return answer;
}

// An absolute `--dir` is used as given; the default is repo-relative.
const RUNS_AT = DIR.startsWith("/") ? DIR : `${ROOT}/${DIR}`;

const runs = readdirSync(RUNS_AT)
  .filter((f) => f.endsWith(".mjs"))
  .sort();

let checked = 0;
let suites = 0;
let expectations = 0;
/** Expectations naming a row no test path of their own run contains. */
const unreachable = [];
/** Expectations naming more than one row — the convention, stated (F606). */
const malformed = [];
const missing = {};
// **And which** — a count that says one is missing sends the reader to a second
// tool to learn which one (the C28 run, 119 anchors, on the day the header mask
// moved). The file and the head of the anchor, per run.
const missingWhat = {};
/** Anchors matching more than once — see the note in the loop below (F219). */
const interpolated = [];
const ambiguousWhat = {};
const ambiguousBy = {};
const unresolvable = [];
/** Runs whose tail runs and says nothing (F768), by run — see `silenceOf`. */
const silent = {};
/** Runs whose tail was read at all — the counter, so a reader matching nothing shows. */
let tails = 0;
/** Runs node refuses to parse (F997) — see `parseErrorOf`. */
const unparseable = [];
/** Runs handed to `node --check` — the control, on `tails`' argument. */
let parsed = 0;
/** Mutations applied and re-parsed (F1030) — the control, on `tails`' argument. */
let applied = 0;
/** Anchors whose `to:` this reader could not see — counted, never dropped. */
let toless = 0;
/** Anchors whose subject is not a language this parser answers for. */
let foreign = 0;
/** Mutations whose result is not a program — see `parseOf`. */
const splices = [];

// **Two roots, because a run cwds to the package it mutates.** The docker runs
// address `src/ps.ts` and mean `examples/docker/src/ps.ts`; resolving against
// the repo root alone reported twenty files that do not exist, which would have
// been a gate failing on its own reading rather than on anything stale.
const rootsFor = (file) => [`${ROOT}/${file}`, `${ROOT}/examples/docker/${file}`];

for (const run of runs) {
  const src = readFileSync(`${RUNS_AT}/${run}`, "utf8");
  // **Can the run start?** (F997). Checked before the tail, on the tail's own
  // argument one step earlier: a run that cannot report is a run whose anchors
  // do not matter, and a run that cannot parse is a run whose *tail* does not
  // matter either. Reported once and the file abandoned, because anchors read
  // out of a file nothing will execute are noise stacked on the one thing that
  // has to be fixed first.
  parsed += 1;
  const broken = parseErrorOf(`${RUNS_AT}/${run}`);
  if (broken !== null) {
    unparseable.push(`${run}: ${broken} — the run cannot start, so no anchor of its resolves against anything that will run (F997)`);
    continue;
  }
  // **Does the run say what it found?** (F768). Checked before the anchors,
  // because a run that cannot report is a run whose anchors do not matter.
  if (src.includes("runPass(")) {
    tails += 1;
    const how = silenceOf(src);
    if (how !== null) silent[run] = how;
  }
  for (const path of testPathsOf(src)) {
    suites += 1;
    if (rootsFor(path).some((p) => existsSync(p))) continue;
    unresolvable.push(`${run}: names ${path}, which does not exist — vitest drops it silently`);
  }
  // **An expectation names a row, and a row lives in a file the run must run**
  // (F336). `testPathsOf`'s own note says why: *every row's `expect` becomes a
  // claim about which instrument caught it, made against an instrument set that
  // is short.* A file that is absent is caught above; a file that is present and
  // **unnamed** is caught here, and it reads identically from the report.
  //
  // **The corpus is what the run invokes**, so `--dir` is walked rather than
  // skipped — resolving it against the repo root alone reports every docker row
  // unreachable, which is this check's own two-roots hazard and it fired while
  // the check was being written.
  //
  // **One row per `expect:`, and the convention is stated here because it was
  // stated nowhere** (F606, F1041). The lookup is a substring test over the
  // corpus, so a two-row expectation like `"T1.20, T6.22"` is searched for as
  // one literal string and can never be found — it reports *unreachable* on two
  // rows that both exist. Eight of eleven expectations in `c14-cap.mjs` were
  // rewritten to one row each when that was discovered, and the convention they
  // were rewritten to was never written down anywhere, so nothing stopped the
  // next one.
  //
  // **Refusing is the honest gate, not splitting on the comma.** An `expect:`
  // is a claim about *which instrument catches this mutation*, and two rows make
  // the claim ambiguous in a way no reader resolves: caught by both, or by
  // either, or by whichever ran first. Splitting would make the string resolve
  // and leave the ambiguity — a repair that turns a loud wrong answer into a
  // quiet one. So a multi-row expectation is refused by name, with the remedy in
  // the message, and the mutation gets split into the two it was always
  // describing.
  //
  // **Its blind spot, stated**: this recognises a second row by a comma followed
  // by a row-shaped token. An expectation naming two rows some other way — a
  // slash, a range, prose — reads as one row and reaches the substring test,
  // where it fails as *unreachable* rather than as malformed. That is the safe
  // direction and it is not the same as being caught.
  const corpus = testCorpusOf(src, run);
  for (const e of expectationsOf(src)) {
    expectations += 1;
    if (namesTwoRows(e)) {
      malformed.push(
        `${run}: expects "${e}", which names more than one row — an expectation is a claim ` +
          `about which instrument catches this mutation, and two rows leave it ambiguous. ` +
          `Split the mutation, one row each (F606)`,
      );
      continue;
    }
    if (RESERVED_EXPECTS.has(e) || namesARowIn(corpus, e)) continue;
    const known = (OWN ? CROSS_TIER[run] : undefined) ?? [];
    if (known.includes(e)) continue;
    unreachable.push(`${run}: expects "${e}", which no test path it runs contains`);
  }
  for (const { file, from, to } of anchorsOf(src)) {
    // **An anchor this reader will not guess at is counted, never skipped**
    // (F1109). A template literal with `${…}` interpolates a value this file
    // does not have; reading it as its own source text would produce an anchor
    // that matches nothing and reports as stale, which is a fabricated finding
    // rather than a missing one.
    if (from === null) {
      interpolated.push(`${run}: an anchor in ${file} interpolates — not read`);
      continue;
    }
    const path = rootsFor(file).find((p) => existsSync(p));
    if (path === undefined) {
      unresolvable.push(`${run}: ${file} does not exist under either root`);
      continue;
    }
    checked += 1;
    // **Can any test this run issues actually load the module it mutates?**
    // (F1243) The anchor check above says the mutation will *apply*; this says
    // the suite can *see* it. They fail identically from outside: a run whose
    // command cannot reach the mutated module compiles the mutation, runs a
    // suite that is green for its usual reasons, and prints `SURVIVED`, which
    // in this harness means *a finding about the tests*.
    //
    // Measured on the case that produced it: `spans.mjs` mutated
    // `src/presentation/table/cells.ts` and named `spans`, `text` and their
    // tiers — five files, none of which loads a table.
    //
    // **Reach, not coverage.** A run that reaches the module may still have no
    // assertion that sees the change; that is F277 and
    // `docs/COMMITMENT_INVARIANT_AUDIT.md` §Fourth pass says not to build a
    // mechanism for it. What is mechanical is the opposite direction, and only
    // that is claimed here.
    // **A test can reach a subject by reading it or by running it**, and both
    // are real: a source scan opens a file by path, and `enforce`'s own rows
    // spawn `node tools/enforce/index.mjs`. Neither is an import, and a check
    // that knew only imports flagged nine runs whose tests do see their subject
    // — including every one that mutates a markdown spec, which cannot be
    // imported at all. So the corpus naming the path counts as reach.
    const reach = reachableIn(src);
    const seen =
      reach !== null &&
      (reach.has(bare(file)) ||
        // **A path named in the corpus.** A source scan opens a file by path,
        // and a markdown spec can be reached no other way.
        corpus.includes(file) ||
        // **A build the command runs first.** `c24-bundle` mutates the bundler
        // and asserts against `dist/bundle/index.js`; the edge is the build, and
        // it is a real one — the mutation changes what the tests import.
        /npm run build/u.test(src));
    if (!unreached.has(run) && reach !== null && !seen) {
      unreached.add(run);
      out_unreached.push(
        `${run}: mutates ${file}, which no test file its command runs can import — ` +
          `the mutation applies, the suite runs green for its own reasons, and the pass ` +
          `reports SURVIVED, which in this harness is a claim about the tests (F1243)`,
      );
    }
    const body = readFileSync(path, "utf8");
    // **Existence is one property and uniqueness is another** (F219).
    //
    // The harness mutates by `String.replace`, which takes the **first** match.
    // So an anchor matching twice is not a missing anchor — it is a run that
    // still passes while testing a site nobody chose, and this sweep called it
    // `ok` because it asked `includes`. Measured on the commit that extracted
    // `tickLabels`: the precision line was copied rather than shared, two runs
    // anchored on it, and both reported clean.
    //
    // **A duplicated anchor is reported as its own kind rather than folded into
    // `missing`**, because the remedy is different — a missing anchor is
    // re-pointed and an ambiguous one means the source has two copies of
    // something that should have one.
    const hits = body.split(from).length - 1;
    // **The half this sweep did not read** (F279, F1030). A mutation is a pair,
    // and re-anchoring moves the `from` while leaving the `to` behind — which
    // is how a statement got spliced into an object literal and every suite
    // failed to transform, minutes after this file reported no drift.
    //
    // Applied only where the anchor is unique, because `String.replace` takes
    // the first match and an ambiguous anchor is already its own failure above.
    // The clean file is parsed only when the mutated one refuses, so a source
    // that was already broken is reported as itself rather than blamed on the
    // mutation it happens to carry.
    if (hits === 1 && to !== null) {
      if (!PARSEABLE.test(file)) foreign += 1;
      else {
        applied += 1;
        const why = parseOf(body.replace(from, to));
        if (why !== null && parseOf(body) === null) {
          splices.push(
            `${run}: applying a mutation to ${file} leaves something that is not a program — ` +
              `${why}\n      to ${JSON.stringify(to).slice(0, 88)}`,
          );
        }
      }
    }
    if (hits === 1 && to === null) toless += 1;
    if (hits === 1) continue;
    if (hits === 0) {
      missing[run] = (missing[run] ?? 0) + 1;
      (missingWhat[run] ??= []).push(`${file} · ${JSON.stringify(from).slice(0, 88)}`);
    }
    else {
      ambiguousBy[run] = (ambiguousBy[run] ?? 0) + 1;
      // **Named, on `missing`'s terms** (F1113). This list was built and read
      // only for its length: a stale anchor printed its file and its first
      // eighty-eight characters and an ambiguous one printed a count, so the
      // kind whose remedy is *extend this anchor* was the kind that did not say
      // which anchor. Ten of them sat unrepaired while the report said a number.
      (ambiguousWhat[run] ??= []).push(
        `${file} · ${String(hits)}x · ${JSON.stringify(from).slice(0, 88)}`,
      );
    }
  }
}

const runsWith = Object.keys(missing).length;
const ambiguousTotal = Object.values(ambiguousBy).reduce((a, n) => a + n, 0);
const total = Object.values(missing).reduce((a, n) => a + n, 0);
// **A clause rather than a rewrite.** `test/unit/mutate-sweep.test.ts` MS3 reads
// the *last* line's total and the fixture reads `· n test paths ·` out of this
// one, so every counter keeps its ` · ` neighbours and the new one is appended
// to the family instead of resetting it.
console.log(
  `mutation anchors — ${String(runs.length)} runs · ${String(parsed)} parsed · ` +
    `${String(checked)} anchors · ` +
    `${String(suites)} test paths · ${String(expectations)} expectations · ` +
    `${String(tails)} tails · ` +
    `${String(applied)} applied+parsed · ` +
    `${String(total)} missing across ${String(runsWith)} run(s)` +
    `${unparseable.length > 0 ? ` · ${String(unparseable.length)} unparseable` : ""}` +
    `${malformed.length > 0 ? ` · ${String(malformed.length)} multi-row expectations` : ""}` +
    `${splices.length > 0 ? ` · ${String(splices.length)} splice(s)` : ""}` +
    `${toless > 0 ? ` · ${String(toless)} with no readable to:` : ""}` +
    `${foreign > 0 ? ` · ${String(foreign)} not a language this parses` : ""}` +
    `${interpolated.length > 0 ? ` · ${String(interpolated.length)} interpolated` : ""}` +
    `${ambiguousTotal > 0 ? ` · ${String(ambiguousTotal)} ambiguous` : ""}` +
    `${Object.keys(silent).length > 0 ? ` · ${String(Object.keys(silent).length)} silent` : ""}`,
);

// The parse arm leads, because it is the failure that makes the rest of the
// report about a file nothing can run (F997).
// **No debt list for the splices, and the asymmetry is `parseErrorOf`'s.** A
// stale anchor is listed rather than repaired because re-anchoring without
// running the pass produces a mutation that applies and asserts nothing — a
// repair that reads as coverage. A `to` that is not a program has no such trap:
// it asserts nothing *today*, the pass reports it as DID NOT BUILD if anyone
// runs one, and any repair is strictly better than what is there. An entry here
// would be an excuse for a five-second fix.
const problems = [...unparseable, ...malformed, ...splices, ...unresolvable, ...unreachable, ...out_unreached];

// **The silence arm** (F768), on the same equality terms as the others: a tail
// that says nothing and is not on the list fails; one on the list for a
// different silence fails; one on the list that now speaks fails.
const SILENT = OWN ? KNOWN_SILENT : {};
for (const [run, how] of Object.entries(silent)) {
  const known = SILENT[run];
  if (known === undefined) {
    problems.push(`${run}: runs and says nothing — its tail is ${how}: ` +
      "print `console.log(report(results))` and `process.exit` on a survivor (F768)");
  } else if (known !== how) {
    problems.push(`${run}: its tail is ${how}, the list says ${known}`);
  }
}
for (const [run, how] of Object.entries(SILENT)) {
  if (silent[run] === undefined) {
    problems.push(`${run}: the list says its tail is ${how} and it now prints and exits — remove it`);
  }
}

// The ambiguity arm, on the same equality terms as the stale one below.
const AMBIG = OWN ? KNOWN_AMBIGUOUS : {};
for (const [run, n] of Object.entries(ambiguousBy)) {
  const known = AMBIG[run];
  const named = (ambiguousWhat[run] ?? []).map((a) => `\n      ${a}`).join("");
  if (known === undefined) problems.push(`${run}: ${String(n)} ambiguous anchor(s) and it is not on the list${named}`);
  else if (known !== n) problems.push(`${run}: ${String(n)} ambiguous anchor(s), the list says ${String(known)}${named}`);
}
for (const [run, n] of Object.entries(AMBIG)) {
  if (ambiguousBy[run] === undefined) {
    problems.push(`${run}: the list says ${String(n)} ambiguous and every anchor is unique — remove it`);
  }
}

// **The cross-tier list, pruned by equality like the others.** An entry whose
// row has come into the run's corpus is a failure: a list nobody prunes outlives
// its reason unread.
for (const [run, names] of Object.entries(OWN ? CROSS_TIER : {})) {
  const src = readFileSync(`${RUNS_AT}/${run}`, "utf8");
  const corpus = testCorpusOf(src, run);
  for (const e of names) {
    if (corpus.includes(e)) problems.push(`${run}: the list says "${e}" is cross-tier and its run now reaches it — remove it`);
  }
}

// The equality arm, both directions.
//
// **`OWN` decides which list, and a supplied one is never the tree's** (F1119):
// the canonical directory reads `KNOWN_STALE` and ignores `--stale`, a foreign
// one reads only what it was handed. So MA3 can construct both arms — excused
// when supplied, checked when not — whatever `KNOWN_STALE` happens to hold.
const LIST = OWN ? KNOWN_STALE : (SUPPLIED ?? {});
const named = (run) => (missingWhat[run] ?? []).map((a) => `\n      ${a}`).join("");
for (const [run, n] of Object.entries(missing)) {
  const known = LIST[run];
  if (known === undefined) problems.push(`${run}: ${String(n)} anchor(s) missing and it is not on the list${named(run)}`);
  else if (known !== n) problems.push(`${run}: ${String(n)} anchor(s) missing, the list says ${String(known)}${named(run)}`);
}
for (const [run, n] of Object.entries(LIST)) {
  if (missing[run] === undefined) {
    problems.push(`${run}: the list says ${String(n)} stale and every anchor resolves — remove it`);
  }
}

if (problems.length > 0) {
  console.log(`\n${problems.map((p) => `  ${p}`).join("\n")}\n\n${String(problems.length)} problems.`);
  process.exit(1);
}

console.log(`  ${String(total)} known stale, and no run drifted from what the list says`);
