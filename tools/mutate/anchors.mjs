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
// that should be built. This checks only that the text is there to be replaced.
import { readdirSync, readFileSync, existsSync } from "node:fs";

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
 * Anchors that resolve to **more than one site** today, with the run they
 * belong to — a debt list, on `KNOWN_STALE`'s terms and for its reasons (F219).
 *
 * These are not broken runs: the harness replaces the **first** match, and for
 * every one of them the first match may well be the site the run names. What
 * they are is *unchecked* — nothing said which site was mutated, so the run's
 * name and the run's subject were never compared.
 *
 * **Eleven on the sweep's first run, across five components, one of them 5×.**
 * They pre-date the check by a long way, which is the argument for recording
 * them by count rather than fixing them inside the commit that found them: a
 * repair here is a repair to a mutation nobody is running today, and repairing
 * an anchor without running its pass produces a mutation that applies and
 * asserts nothing — `KNOWN_STALE`'s own note, one property along.
 *
 * Compared by **equality**, both directions: an entry that becomes unique is a
 * failure too, because a list nobody prunes outlives its reason unread.
 */
const KNOWN_AMBIGUOUS = {
  "c04-kv-bar.mjs": 1,
  "c04-ohlc.mjs": 1,
  "c04-round-trip.mjs": 1,
  "c10-categorical.mjs": 1,
  "c10-colormap.mjs": 1,
  "c10-named-set.mjs": 1,
  "c12-annotate.mjs": 1,
  "c12-calendar.mjs": 1,
  "c12-distribution.mjs": 1,
  "c12-origin.mjs": 1,
  "c12-value-bar.mjs": 1,
};

const KNOWN_STALE = {
  // **Re-anchoring is not always the fix, and this one shows both halves.**
  // `summaryLine(live)` gained a `unicode` argument, so the statement is still
  // there and the anchor is one token short — trivially repairable. It is on
  // the list anyway, because repairing an anchor without running the pass
  // produces a mutation that applies and asserts nothing, and that reads as
  // coverage from the summary line. The repair belongs to whoever runs it.
  "docker-dashboard.mjs": 2,
  "c15-centred-width.mjs": 1,
  "c19-menu-window.mjs": 1,
  "c22-construct.mjs": 3,
  "c22-frame-session.mjs": 2,
  "c22-selection-wash.mjs": 1,
  "c23-refresh.mjs": 10,

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
  "c10-categorical.mjs": 1,
  "c26-elements.mjs": 1,
  "c26-focus-target.mjs": 1,
};

/**
 * A quoted literal's body, whichever quote the author used.
 *
 * Both are turned into JSON's one escaping so a single parser reads them: a
 * single-quoted body may hold a bare `"` (JSON's delimiter) and a `\'` (not a
 * JSON escape at all), and each is the reason the naive wrap-in-quotes fails.
 */
function unquote(body, quote) {
  if (quote === '"') return JSON.parse(`"${body}"`);
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
  const consts = {};
  for (const m of src.matchAll(/^const ([A-Z_][A-Z_0-9]*) = (["'])([^"']+)\2;/gm)) consts[m[1]] = m[3];

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
  const LITERAL = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'`;
  const re = new RegExp(
    String.raw`file:\s*([A-Z_][A-Z_0-9]*|"[^"]*"|'[^']*')\s*,\s*\n\s*(?:\/\/[^\n]*\n\s*)*from:\s*` +
      String.raw`((?:(?:${LITERAL})\s*\+?\s*)+)`,
    "g",
  );
  const pieces = new RegExp(LITERAL, "g");
  for (const m of src.matchAll(re)) {
    const raw = m[1];
    const file = raw.startsWith('"') || raw.startsWith("'") ? raw.slice(1, -1) : consts[raw];
    if (file === undefined) continue;
    const from = (m[2].match(pieces) ?? [])
      .map((lit) => unquote(lit.slice(1, -1), lit[0]))
      .join("");
    out.push({ file, from });
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
  const out = new Set();
  for (const m of flat.matchAll(/vitest run ([^"`]+)/g)) {
    const expanded = m[1].replace(/\$\{([A-Z_][A-Z_0-9]*)\}/g, (whole, name) => consts[name] ?? whole);
    for (const token of expanded.trim().split(/\s+/)) {
      if (/\.test\.[cm]?tsx?$/.test(token)) out.add(token);
    }
  }
  return [...out];
}

// An absolute `--dir` is used as given; the default is repo-relative.
const RUNS_AT = DIR.startsWith("/") ? DIR : `${ROOT}/${DIR}`;

const runs = readdirSync(RUNS_AT)
  .filter((f) => f.endsWith(".mjs"))
  .sort();

let checked = 0;
let suites = 0;
const missing = {};
/** Anchors matching more than once — see the note in the loop below (F219). */
const ambiguous = [];
const ambiguousBy = {};
const unresolvable = [];

// **Two roots, because a run cwds to the package it mutates.** The docker runs
// address `src/ps.ts` and mean `examples/docker/src/ps.ts`; resolving against
// the repo root alone reported twenty files that do not exist, which would have
// been a gate failing on its own reading rather than on anything stale.
const rootsFor = (file) => [`${ROOT}/${file}`, `${ROOT}/examples/docker/${file}`];

for (const run of runs) {
  const src = readFileSync(`${RUNS_AT}/${run}`, "utf8");
  for (const path of testPathsOf(src)) {
    suites += 1;
    if (rootsFor(path).some((p) => existsSync(p))) continue;
    unresolvable.push(`${run}: names ${path}, which does not exist — vitest drops it silently`);
  }
  for (const { file, from } of anchorsOf(src)) {
    const path = rootsFor(file).find((p) => existsSync(p));
    if (path === undefined) {
      unresolvable.push(`${run}: ${file} does not exist under either root`);
      continue;
    }
    checked += 1;
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
    if (hits === 1) continue;
    if (hits === 0) missing[run] = (missing[run] ?? 0) + 1;
    else {
      ambiguousBy[run] = (ambiguousBy[run] ?? 0) + 1;
      ambiguous.push(`${run}: an anchor matches ${String(hits)}x in ${file} — replace() takes the first`);
    }
  }
}

const runsWith = Object.keys(missing).length;
const total = Object.values(missing).reduce((a, n) => a + n, 0);
console.log(
  `mutation anchors — ${String(runs.length)} runs · ${String(checked)} anchors · ` +
    `${String(suites)} test paths · ` +
    `${String(total)} missing across ${String(runsWith)} run(s)` +
    `${ambiguous.length > 0 ? ` · ${String(ambiguous.length)} ambiguous` : ""}`,
);

const problems = [...unresolvable];

// The ambiguity arm, on the same equality terms as the stale one below.
const AMBIG = OWN ? KNOWN_AMBIGUOUS : {};
for (const [run, n] of Object.entries(ambiguousBy)) {
  const known = AMBIG[run];
  if (known === undefined) problems.push(`${run}: ${String(n)} ambiguous anchor(s) and it is not on the list`);
  else if (known !== n) problems.push(`${run}: ${String(n)} ambiguous anchor(s), the list says ${String(known)}`);
}
for (const [run, n] of Object.entries(AMBIG)) {
  if (ambiguousBy[run] === undefined) {
    problems.push(`${run}: the list says ${String(n)} ambiguous and every anchor is unique — remove it`);
  }
}

// The equality arm, both directions.
const LIST = OWN ? KNOWN_STALE : {};
for (const [run, n] of Object.entries(missing)) {
  const known = LIST[run];
  if (known === undefined) problems.push(`${run}: ${String(n)} anchor(s) missing and it is not on the list`);
  else if (known !== n) problems.push(`${run}: ${String(n)} anchor(s) missing, the list says ${String(known)}`);
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
