// The mutation harness. A test file is not verified by passing; it is verified
// by breaking the thing it covers and watching it fail.
//
// **The control pair is inside the harness, not in each component's run.** Two
// instances of the same class produced it, and both reported live mutants as
// survivors:
//
//   - An edit script that printed `ok` having changed nothing, because it did
//     not assert its anchors matched. Twelve invariants were lost that way.
//   - This harness's first version, which read `/Tests\s+\d+ failed/` against
//     vitest output carrying ANSI codes between "Tests" and "1 failed". Eight
//     caught mutations were reported as uncaught.
//
// The second is worse than the first and it is worth saying why. A03 §2's whole
// subject is a check that cannot fire, and the remedy throughout is a
// fabricated violation. **A mutation harness that cannot see a kill is that
// defect in the instrument built to apply the remedy** — and it fails in the
// direction that reads as diligence: "nine mutations, none caught" looks like a
// thorough run against weak tests, which is exactly what a mutation pass is
// supposed to discover. Nothing about the output says the harness is blind.
//
// So a pass refuses to report at all until two things are shown: the clean tree
// passes, and a mutation whose kill is not in doubt is seen to be killed. The
// caller supplies that second one and says why it cannot survive — a generic
// sentinel would be the harness marking its own homework.
//
// **And a third instance, which is the same defect in the reader's arity**
// (F897, F1018). A worker that dies mid-file takes its remaining tests with it;
// vitest reports the ones that finished — `Tests 2 passed (6)` — and every
// predicate this file had answers correctly: there is a summary, no test
// failed, no file failed. The row says SURVIVED for a run in which four of six
// tests never executed. **A reader with two outcomes cannot report a third
// state that exists**, and the missing one is *I could not tell*. `incomplete`
// is that question and `INDETERMINATE` is the row it produces.
//
// F897 recorded the bytes once and shipped nothing, on the grounds that the
// case would not reproduce. It reproduces on demand — `process.kill(
// process.pid, "SIGKILL")` inside a test, vitest 4.1.10, measured 2026-09-10 —
// and it never needed to: a summary reader is a pure function over a string,
// and the bytes were already written down.
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { execSync } from "node:child_process";
/** vitest colours its summary; the codes sit between the word and the count. */
export function strip(output) {
  return output.replace(/\[[0-9;]*m/g, "");
}

/** Did the run kill anything? Read off the stripped summary, not the exit code:
 * a suite that fails to *start* also exits non-zero and kills nothing.
 *
 * **This predicate has two outcomes and there are three** — see `incomplete`
 * below, which is the one it cannot express and must not be asked to. */
export function killed(output) {
  return /Tests\s+\d+ failed/.test(strip(output)) || timedOut(output);
}

/**
 * What vitest's summary says it **collected**, and what it says it **reported**.
 * `null` when there is no `Tests` line, or when that line carries no total.
 *
 * vitest writes one bucket per outcome and the collected count in brackets:
 * `Tests  1 failed | 5 passed (6)`, `Tests  15 passed | 1 todo (16)`,
 * `Tests  1 passed | 4 skipped (5)`. In every healthy run the buckets sum to
 * the total — measured across a green run, a failing run, a run with a `todo`
 * and a `skip`, and a `-t`-filtered run, all against vitest 4.1.10.
 *
 * **The total is only read when it is there.** A capture sheared before the
 * closing bracket has a `Tests` line and no total, and the honest answer to
 * *were rows lost* is then *I cannot tell from this* rather than *yes* — a
 * predicate that fires on absence would report every truncated buffer as an
 * incomplete run and mean neither thing. `ran` owns truncation.
 */
export function tally(output) {
  const line = /^\s*Tests\s+(.*)$/m.exec(strip(output));
  if (line === null) return null;
  const total = /\((\d+)\)$/.exec(line[1].trimEnd());
  if (total === null) return null;
  let reported = 0;
  for (const m of line[1].matchAll(/(\d+)\s+(passed|failed|skipped|todo)\b/g)) reported += Number(m[1]);
  return { reported, collected: Number(total[1]) };
}

/**
 * Did the run report every test it collected?
 *
 * **The third state, and the one that reads as a survivor** (F897, F1018). A
 * worker that dies mid-file takes its remaining tests with it, and vitest
 * reports the ones that finished:
 *
 *      Test Files  1 passed (2)
 *           Tests  2 passed (6)
 *          Errors  1 error
 *
 * — a summary, so `ran` is true; no failing *test*, so `killed` is false; no
 * failing *file*, so `unbuilt` is false. Every predicate this file had answers
 * correctly and the row says `SURVIVED`, for a run in which four of six tests
 * never executed. That is the direction the preamble calls worse than useless.
 *
 * **The reproduction was the blocker and it is not one.** F897 recorded the
 * bytes once, could not make them come back, and shipped nothing. Measured
 * 2026-09-10 on vitest 4.1.10: `process.kill(process.pid, "SIGKILL")` inside a
 * test produces the block above on demand, every time, and the `Errors` line
 * and the arithmetic arrive together.
 *
 * **The arithmetic is the signal, not the `Errors` line.** An unhandled error
 * beside a complete set of rows loses nothing, and reads identically on that
 * line; `reported < collected` says exactly *tests were collected and never
 * reported*, which is the property the verdict depends on. It is also the count
 * F929 went looking for outside the run — the corpus size it wanted is written
 * on vitest's own summary, per run, and needs no golden number to drift.
 */
export function incomplete(output) {
  const t = tally(output);
  return t !== null && t.reported < t.collected;
}

/** Did the run reach a summary at all — pass *or* fail?
 *
 * **`killed` cannot answer this and must not be asked to.** A run that never
 * finished and a run that finished green are the same `false`, and they mean
 * opposite things. The control pair catches a harness that is blind from the
 * start; this catches one that goes blind in the middle, which is what happened:
 * a suite piped into `grep -q` under `pipefail`, the writer taking SIGPIPE, exit
 * 141 and a buffer cut before the summary. Every mutation after it would have
 * reported a survivor.
 *
 * **The second cause is output volume, and it looks identical.** `c11-table-window`
 * went blind on three of nine: a mutation that makes *every* window wrong emits a
 * conformance report with thousands of failure rows, `execSync`'s 1 MiB default
 * `maxBuffer` cuts the child off, and the throw carries a truncated `stdout` with
 * the summary sheared away. Same symptom, no signal involved — and it is worse
 * than the SIGPIPE case, because it strikes exactly the mutations that break the
 * most. A run whose subject is a sweep sets `maxBuffer` explicitly. */
export function ran(output) {
  return /Tests\s+\d+ (failed|passed)/.test(strip(output)) || timedOut(output);
}

/**
 * Did the run's **suites** load?
 *
 * **The third state that reads as a survivor, and the one this file did not
 * have.** A mutation can break the parse of a module the suites import: three of
 * four files then fail to collect, the fourth runs green, and vitest prints
 *
 *     Test Files  3 failed | 1 passed (4)
 *          Tests  10 passed | 2 todo (12)
 *
 * — a summary, so `ran` is true; no failing *test*, so `killed` is false. The row
 * reads `SURVIVED` and the summary tells the reader to go and look at the tests.
 * The diagnosis is inverted: the finding is about the mutation, which did not
 * compile, and nothing was measured at all. Measured on `c21-pty`'s
 * wrapped-error row, whose `to` opened a `try` it never closed.
 *
 * **The signal is the disagreement between the two lines**, not the transform
 * error above them — that wording is esbuild's and would miss a module that
 * throws at import, which fails the same way for the same reason.
 */
export function unbuilt(output) {
  const s = strip(output);
  return /Test Files\s+\d+ failed/.test(s) && !/Tests\s+\d+ failed/.test(s);
}

/**
 * The harness's own vocabulary for *the suite did not return*.
 *
 * **A timeout is the strongest possible failure and vitest cannot report it**,
 * because there is no summary to read: the child was killed before it wrote one.
 * A run whose mutation restores a non-terminating render — C12's `niceAxis`
 * handing a `NaN` range to Bresenham, which stops on `x === ex` — produced no
 * summary and was correctly flagged blind, which is right about the harness and
 * wrong about the mutation.
 *
 * So a run that times out **says so in a line of its own**, and this is the only
 * marker either predicate accepts besides vitest's. It is not a fabricated
 * summary: `runPass` asks *did the suite fail*, and a suite that never returned
 * is the most complete yes available. A run emits it only from its own `catch`
 * on `e.killed`, never from parsing test output.
 */
export function timedOut(output) {
  return /^TIMED OUT after \d+ms/mu.test(strip(output));
}

/** A named error rather than a boolean, so a miss cannot be read as a survivor. */
export class AnchorError extends Error {
  constructor(file, from) {
    super(`mutation anchor not found in ${file}: ${JSON.stringify(from.slice(0, 60))}`);
    this.name = "AnchorError";
  }
}

export class BlindHarnessError extends Error {
  constructor(reason) {
    super(`mutation harness is not live: ${reason}`);
    this.name = "BlindHarnessError";
  }
}

export function apply(src, { file, from, to }) {
  if (!src.includes(from)) throw new AnchorError(file, from);
  return src.replace(from, to);
}

/**
 * How many places an anchor matches — `replace` takes the first (F219).
 *
 * **The report could not tell F219 and F277 apart, and this is the half that
 * makes it able to** (F1037). Both arrive as `SURVIVED` and they want opposite
 * repairs: F219 is one mutation matching two sites, and wants the duplicate
 * extracted; F277 is a **unique, present, textually correct** anchor on a line
 * whose callers moved, and wants the anchor followed. F277's own body says the
 * report cannot distinguish them — the multiplicity is the thing it was not
 * carrying, and `anchors.mjs` has known it all along in a file nobody reads
 * beside the pass.
 *
 * It does not close F277. Nothing static can: an anchor that resolves against a
 * line that has changed *meaning* is the citation-resolves-against-the-wrong-
 * invariant class, and `docs/COMMITMENT_INVARIANT_AUDIT.md` §Fourth pass says
 * why no mechanism for it should be built. What it does is stop one of the two
 * dispositions being invisible on the row that reports it.
 */
export function hitsOf(src, from) {
  return src.split(from).length - 1;
}

/**
 * Every edit a mutation makes: its own, then any `also` beside it.
 *
 * **`also` exists because two wirings can each be sufficient on their own.**
 * F227 measured it: supplying `RenderContext.tick` while nothing raised C03's
 * spinner commit left the frame exactly as frozen, so a mutation deleting either
 * half alone goes red for a reason it does not name — and would go red just as
 * hard with the other half already broken. A revert row about a *pair* has to
 * break the pair, on the same argument F226 makes about a row named for a catch
 * having to reach one.
 *
 * @param {{file,from,to,also?:Array<{file,from,to}>}} m
 * @returns {Array<{file,from,to}>}
 */
export function editsOf(m) {
  return [{ file: m.file, from: m.from, to: m.to }, ...(m.also ?? [])];
}

/**
 * @param {object} opts
 * @param {Array<{name,file,from,to,expect,also?}>} opts.mutations
 * @param {{file,from,to,why}} opts.control  a mutation whose kill is not in doubt
 * @param {(file:string)=>string} opts.read
 * @param {(file:string,src:string)=>void} opts.write
 * @param {()=>string} opts.run             runs the suite, returns its output
 */
/**
 * `read`/`write` for a run, with an **atomic** write (F237).
 *
 * **The restore is the dangerous write, and it was not atomic.** `runPass` holds
 * each file's original text and puts it back with a plain `writeFileSync`; a
 * `SIGKILL` landing mid-write leaves whatever had been flushed, which is a
 * *prefix*. Measured: five source files lost their tails — `types.ts` at 1297
 * lines against 2218 — when two-day-old runs sitting mid-pass were killed. Every
 * gate had been green ten minutes earlier, because the damage arrives after the
 * last check and before the next.
 *
 * Write-to-temp then `rename`, which is atomic on any POSIX filesystem: a kill
 * at any instant leaves either the old file or the new one, never half of one.
 *
 * **Not yet adopted by every run.** 91 of the 92 still define their own
 * `writeFileSync` pair inline, and the sweep is a mechanical commit of its own
 * rather than a rider on this one — the number is here so it is a residue and
 * not a silence.
 */
export function fsIo(root) {
  return {
    read: (f) => readFileSync(`${root}/${f}`, "utf8"),
    write: (f, s) => {
      const path = `${root}/${f}`;
      const tmp = `${path}.mutate-tmp`;
      writeFileSync(tmp, s);
      renameSync(tmp, path);
    },
  };
}

/**
 * Does the mutated tree type-check? `null` if it does, the first error line if
 * not.
 *
 * **The fifth row that is not a survivor, and the one `unbuilt` cannot see**
 * (F1106). `unbuilt` reads vitest's summary, so it catches a `to` that does not
 * *parse* — the suites fail to load and the disagreement between the two count
 * lines says so. A `to` that parses and does not *type-check* goes straight
 * through: esbuild strips types without checking them, so the suite runs, the
 * row reads SURVIVED, and the reader is sent to the tests.
 *
 * Measured on `c12-lines3d`'s LN6, the survivor that produced this: the
 * mutation passes `rows` where `frameOf`'s fourth parameter became
 * `area: Readonly<{ w: number; rows: number }>` at F489, so both fields are
 * `undefined` inside the injected draw. `tsc --noEmit` names it —
 * `scatter3.ts(999,45): error TS2345` — and nine of nine tests pass.
 *
 * **What the signal is, stated exactly — the first wording was wrong.** It read
 * *the tree that ran is not the tree the mutation describes*, and types are
 * erased: the mutated code always runs exactly as written, LN6 included. What a
 * type error actually says is that the `to` **is not expressible against the
 * current tree**, which is strong evidence it was written against an older one.
 * LN6 ran precisely as written — it passed a number and the callee read `.w`
 * off it — and the defect is that its author wrote it against a signature that
 * had changed. The row is *suspect*, not *unmeasured*.
 *
 * **The unused family is excluded, and the corpus is why.** Applying every
 * mutation in F1105's seventeen red runs — 224 of them — and type-checking each
 * gives **61 red, and 44 of those are TS6133**, a binding left with no reader.
 * The blind spot was stated as an edge and is the majority. An unused binding is
 * erased and runs identically, so `noUnusedLocals` is a house rule about source
 * and never a statement about behaviour; that is the line this filter draws, and
 * it is the only class that provably cannot reach runtime. TS18047 stays in:
 * a deleted null guard is a legal mutation *and* the compiler is right that the
 * code may now throw.
 *
 * **The remaining blind spot has no mechanical answer.** An **additive**
 * mutation type-checks perfectly and is inert for a reason no compiler can see
 * — LN6's second defect is that it inserts a draw before the loop while the real
 * call four hundred lines below still runs after, so the later draw wins.
 *
 * Costs 1.3 s on this tree (`skipLibCheck`, 372 files), and only on a survivor.
 *
 * **`root` is where the compiler comes from and `project` is what it checks, and
 * the two had to be separated.** `npx` resolves a binary by walking up from its
 * `cwd`, so running it inside a temporary directory finds `tsc` only on a machine
 * that happens to have one elsewhere. The devcontainer does — a global at
 * `/usr/local/share/npm-global/bin/tsc` — and the CI runner does not, so MH11d
 * went green here and red there with *the type-check itself did not run*, a
 * refusal that named the right thing and gave no reason.
 *
 * **The local answer was right by coincidence.** Both compilers are 7.0.2, so
 * the green was correct and not for any reason the test controlled: the day the
 * image and the lockfile disagree, an instrument that decides whether a mutation
 * is rotted would be answering with a compiler the project does not use, and
 * nothing would say so. The binary is the repository's now; the project is a
 * parameter.
 */
export function tscTypecheck(root, project = "tsconfig.json") {
  return () => {
    try {
      execSync(`npx tsc --noEmit -p ${project} 2>&1`, {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      return null;
    } catch (e) {
      const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
      const errors = out.split("\n").filter((l) => /error TS\d+/u.test(l));
      if (errors.length === 0) {
        // **With the reason on it.** The first version of this line said only
        // that the check did not run, and that is exactly what a reader needs a
        // reason for: on the CI runner it was `npx` failing to resolve `tsc`,
        // and the message made the diagnosis a guess.
        const tail = out.trim().split("\n").slice(-2).join(" · ").trim();
        return `tsc exited non-zero and named no error — the type-check itself did not run: ${tail}`;
      }
      // TS6133 / TS6192 / TS6196: a declaration, import or label with no reader.
      // Erased, so it cannot change what runs — 44 of the 61 reds in the corpus
      // measurement, and every one of them a good mutation that orphaned a
      // binding. If nothing else is wrong, the `to` is fine.
      const real = errors.filter((l) => !/error TS(?:6133|6192|6196)\b/u.test(l));
      return real[0] ?? null;
    }
  };
}

/** The four states that are not survivors, asked as one predicate. */
function isSurvivor(o) {
  return !o.killed && !o.noSummary && !o.anchorMissed && !o.unbuilt && !o.indeterminate;
}

export function runPass({
  mutations,
  control,
  read,
  write,
  run,
  typecheck = tscTypecheck(process.cwd()),
}) {
  const files = [
    ...new Set([control.file, ...mutations.flatMap((m) => editsOf(m).map((e) => e.file))]),
  ];
  const originals = new Map(files.map((f) => [f, read(f)]));
  const restore = () => {
    for (const [f, s] of originals) write(f, s);
  };

  restore();
  // **Two ways for a clean tree to be unusable, and `killed` only sees one.**
  // A suite that does not compile produces no summary, so `killed` is `false`
  // and this gate passes — then the control produces no summary either, and the
  // pass throws naming the *control*. Measured: a syntax error in a fixture
  // (`-(x) ** 2`, which esbuild refuses) sent two runs' diagnosis to their
  // control mutations, where the tree was what would not build. `ran` is the
  // predicate this file already defines for exactly the distinction, and the
  // preamble above says why — *a run that never finished and a run that
  // finished green are the same `false`, and they mean opposite things*.
  const clean = run();
  if (ran(clean) && unbuilt(clean)) {
    throw new BlindHarnessError(
      "a suite in the unmutated tree does not load — its tests never ran, and a mutation they " +
        "cover would come back a survivor. The summary says so in two lines that disagree: " +
        "`Test Files N failed` with no failing test. Fix the build first",
    );
  }
  if (!ran(clean)) {
    throw new BlindHarnessError(
      "the unmutated suite did not reach a summary — it did not compile, did not start, or was " +
        "cut off. Nothing below can mean anything, and the fault is in the tree rather than in " +
        "any mutation: fix the build first",
    );
  }
  if (killed(clean)) {
    throw new BlindHarnessError("the unmutated suite already fails, so no row below means anything");
  }
  // **The same bytes mean different things at the three moments `run` is
  // called, and this is the first of them** (F1018). A clean run that lost rows
  // is a baseline nobody measured: the rows below are compared against a tree
  // whose coverage is unknown, and a mutation covered by one of the tests that
  // never executed comes back a survivor with nothing wrong anywhere else.
  if (incomplete(clean)) {
    const t = tally(clean);
    throw new BlindHarnessError(
      `the unmutated suite reported ${String(t.reported)} of the ${String(t.collected)} tests it ` +
        `collected — a worker died or the run was cut short, so the baseline is not the corpus. ` +
        `Run it again before reading any row below`,
    );
  }

  write(control.file, apply(originals.get(control.file), control));
  const controlRun = run();
  const controlKilled = killed(controlRun);
  restore();
  // **The second moment, and the worst of the three.** The control pair is the
  // harness's own guard against blindness, and a `killed` read off a run that
  // lost rows satisfies it: the pair proves the harness saw *a* kill in a run
  // that was not complete, which is not the claim the pair is making. Checked
  // before `!controlKilled`, so the refusal names the incompleteness rather
  // than sending the reader to the control's `why` — F922's lesson about a
  // refusal that names the wrong subject.
  if (incomplete(controlRun)) {
    const t = tally(controlRun);
    throw new BlindHarnessError(
      `the control's run reported ${String(t.reported)} of the ${String(t.collected)} tests it ` +
        `collected, so the pair proved nothing: a kill seen by a run that lost rows does not show ` +
        `this pass can see one. Run it again`,
    );
  }
  if (!controlKilled) {
    throw new BlindHarnessError(
      `a mutation that cannot survive was not caught — ${control.why}. ` +
        `Fix the harness before reading any result: an uncaught live mutant and a blind ` +
        `harness produce the same report, and the blind one reads as thoroughness`,
    );
  }

  const results = [];
  for (const m of mutations) {
    let outcome;
    try {
      // Grouped by file, so two edits to one file compose rather than the
      // second overwriting the first from the original.
      const staged = new Map();
      for (const edit of editsOf(m)) {
        staged.set(edit.file, apply(staged.get(edit.file) ?? originals.get(edit.file), edit));
      }
      for (const [f, src] of staged) write(f, src);
      // Read off the tree as found, not off the staged copy: an `also` edit to
      // the same file would have already changed it.
      const hits = hitsOf(originals.get(m.file) ?? "", m.from);
      const output = run();
      // **`unbuilt` is asked before `incomplete`, deliberately.** Both can hold
      // at once — a mutation that takes three suites down and kills a worker in
      // the fourth — and the more specific diagnosis is the one that names the
      // mutation rather than the machine. Where the suites merely fail to load,
      // the counts agree and only `unbuilt` fires: `Test Files 3 failed |
      // 1 passed (4)` sits above `Tests 10 passed | 2 todo (12)`, and 12 is 12.
      outcome = !ran(output)
        ? { name: m.name, expect: m.expect, killed: false, noSummary: true }
        : unbuilt(output)
          ? { name: m.name, expect: m.expect, killed: false, unbuilt: true }
          : incomplete(output)
            ? {
                name: m.name,
                expect: m.expect,
                killed: false,
                indeterminate: true,
                tally: tally(output),
              }
            : {
                name: m.name,
                expect: m.expect,
                killed: killed(output),
                byNamedTest: output.includes(m.expect),
                hits,
              };
      // **Only a survivor pays for this, and only a failure pays twice**
      // (F1106). The mutated tree is still on disk here — `finally` has not
      // run — so the check is asked exactly where the reader is about to be
      // told the tests are weak.
      //
      // **A baseline nobody measured is the failure this file guards against
      // everywhere else**, and the clean-suite guard at the top does not cover
      // it: a tree that does not type-check runs a green suite, which is the
      // whole of what this finding is. So when an error appears, restore and
      // ask the same question of the unmutated tree. Restoring early is safe —
      // `finally` restores again and the write is idempotent.
      if (isSurvivor(outcome)) {
        const err = typecheck();
        if (err !== null) {
          restore();
          const base = typecheck();
          if (base !== null) {
            throw new BlindHarnessError(
              `the unmutated tree does not type-check — ${base}. Every row below is measured ` +
                `against a tree the project would refuse, so nothing here means anything: fix ` +
                `the type error first`,
            );
          }
          outcome = { ...outcome, untyped: err };
        }
      }
    } catch (err) {
      if (!(err instanceof AnchorError)) throw err;
      outcome = { name: m.name, expect: m.expect, killed: false, anchorMissed: true };
    } finally {
      restore();
    }
    results.push(outcome);
  }

  restore();
  return results;
}

export function report(results) {
  const lines = results.map((r) => {
    const state = r.noSummary
      ? "NO SUMMARY      "
      : r.unbuilt
      ? "DID NOT BUILD   "
      : r.anchorMissed
      ? "ANCHOR MISSED   "
      : r.indeterminate
      ? "INDETERMINATE   "
      : r.untyped
      ? "DID NOT TYPE    "
      : r.killed
        ? r.byNamedTest
          ? "caught          "
          : "CAUGHT ELSEWHERE"
        : "SURVIVED        ";
    // The figures, because *I could not tell* with no number beside it is a
    // verdict the reader has to go and re-derive from the log. And a survivor
    // whose anchor is not unique says so on its own line (F219, F277, F1037):
    // `replace` took the first of several sites, so the row may be reporting on
    // a site nobody chose.
    const why =
      r.untyped
        ? `   ← ${r.untyped.trim()}`
        : r.indeterminate && r.tally
          ? `   ← ${String(r.tally.reported)} of ${String(r.tally.collected)} tests reported`
          : !r.killed && typeof r.hits === "number" && r.hits > 1
            ? `   ← its anchor matches ${String(r.hits)}x — replace() took the first`
            : "";
    return `${state} ${String(r.expect).padEnd(8)} ${r.name}${why}`;
  });
  // **A run that did not finish is not a survivor and is not counted as one.**
  // Both exit non-zero, so the gate is the same; the report is not, and reading
  // `9 survived` off a harness that stopped producing output is the failure the
  // control pair exists to prevent, arriving after the control pair has passed.
  const blind = results.filter((r) => r.noSummary);
  // **Counted apart now, and the open question above is closed by an instance.**
  // It read: *an anchor miss stays in this count, as it always has… whether a
  // stale anchor should be counted apart is a separate question.* The instance
  // arrived when a mutation's anchor was rewritten by the change it was written
  // for: the row said ANCHOR MISSED and the summary said `1 survived`. The body
  // was right and the abstract was wrong, which is the compression class in a
  // tool's own output — and *ANCHOR MISSED is not a survivor* is the standing
  // rule the summary was contradicting.
  //
  // Both still fail the gate. What changes is what the one line says happened.
  const stale = results.filter((r) => r.anchorMissed);
  // **The third row that is not a survivor**, and the newest. A `to` that does
  // not parse takes the suites down with it, so nothing was measured — the
  // finding is about the mutation and not about the tests it names.
  const broke = results.filter((r) => r.unbuilt);
  // **The fourth row that is not a survivor** (F897, F1018). A run that reported
  // fewer tests than it collected answers neither question: the row it was
  // aimed at may be one of the ones that never executed. Counted apart, because
  // *I could not tell* and *the tests are weak* are opposite findings and the
  // second one costs a session.
  const unsure = results.filter((r) => r.indeterminate);
  // **The fifth row that is not a survivor** (F1106). `unbuilt` above catches a
  // `to` that does not parse, because the suites fail to load and say so. A `to`
  // that parses and does not type-check runs a green suite — esbuild strips
  // types without checking them — so the row read SURVIVED and sent the reader
  // to the tests. The `to` is not expressible against this tree, which is
  // evidence it was written against an older one: suspect, not weak.
  const untyped = results.filter((r) => r.untyped);
  const survivors = results.filter(isSurvivor).filter((r) => !r.untyped);
  const unsureNote =
    unsure.length === 0
      ? ""
      : `\n${unsure.length} run(s) reported fewer tests than they collected — a worker died or the ` +
        `run was cut short, so those rows are not survivors and not kills. Run them again`;
  const staleNote =
    stale.length === 0
      ? ""
      : `\n${stale.length} anchor(s) did not match — those rows ran nothing and are not survivors`;
  const untypedNote =
    untyped.length === 0
      ? ""
      : `\n${untyped.length} mutation(s) did not type-check — the \`to\` is not expressible ` +
        `against this tree, which is evidence it was written against an older one. Those rows ` +
        `are suspect rather than weak: **Read the \`to\`** (F1106). An unused binding does not ` +
        `count, because it is erased and cannot change what runs`;
  const brokeNote =
    broke.length === 0
      ? ""
      : `\n${broke.length} mutation(s) did not compile — the suites failed to load, so nothing ` +
        `was measured. Fix the \`to\`, not the test it names`;
  lines.push(
    blind.length > 0
      ? `\n${blind.length} run(s) produced no summary — the harness went blind mid-pass. ` +
          `Nothing above those rows means anything`
      : (survivors.length === 0
          ? stale.length + broke.length + unsure.length + untyped.length === 0
            ? "\nevery mutation was caught"
            : "\nno survivors among the rows that ran"
          : `\n${survivors.length} survived — a finding about the tests, about the sentence they ` +
            `were written from, or about the mutation. **Ask why the mutation cannot reach the ` +
            `test before rewriting the test** (F277): the anchor may be textually perfect and ` +
            `name a line whose callers moved, which reads exactly like a weak row`) +
        unsureNote +
        staleNote +
        brokeNote +
        untypedNote,
  );
  return lines.join("\n");
}
