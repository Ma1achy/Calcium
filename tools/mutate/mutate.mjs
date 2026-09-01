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
import { readFileSync, writeFileSync, renameSync } from "node:fs";
/** vitest colours its summary; the codes sit between the word and the count. */
export function strip(output) {
  return output.replace(/\[[0-9;]*m/g, "");
}

/** Did the run kill anything? Read off the stripped summary, not the exit code:
 * a suite that fails to *start* also exits non-zero and kills nothing. */
export function killed(output) {
  return /Tests\s+\d+ failed/.test(strip(output)) || timedOut(output);
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

export function runPass({ mutations, control, read, write, run }) {
  const files = [
    ...new Set([control.file, ...mutations.flatMap((m) => editsOf(m).map((e) => e.file))]),
  ];
  const originals = new Map(files.map((f) => [f, read(f)]));
  const restore = () => {
    for (const [f, s] of originals) write(f, s);
  };

  restore();
  if (killed(run())) {
    throw new BlindHarnessError("the unmutated suite already fails, so no row below means anything");
  }

  write(control.file, apply(originals.get(control.file), control));
  const controlKilled = killed(run());
  restore();
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
      const output = run();
      outcome = ran(output)
        ? {
            name: m.name,
            expect: m.expect,
            killed: killed(output),
            byNamedTest: output.includes(m.expect),
          }
        : { name: m.name, expect: m.expect, killed: false, noSummary: true };
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
      : r.anchorMissed
      ? "ANCHOR MISSED   "
      : r.killed
        ? r.byNamedTest
          ? "caught          "
          : "CAUGHT ELSEWHERE"
        : "SURVIVED        ";
    return `${state} ${String(r.expect).padEnd(8)} ${r.name}`;
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
  const survivors = results.filter((r) => !r.killed && !r.noSummary && !r.anchorMissed);
  const staleNote =
    stale.length === 0
      ? ""
      : `\n${stale.length} anchor(s) did not match — those rows ran nothing and are not survivors`;
  lines.push(
    blind.length > 0
      ? `\n${blind.length} run(s) produced no summary — the harness went blind mid-pass. ` +
          `Nothing above those rows means anything`
      : (survivors.length === 0
          ? "\nevery mutation was caught"
          : `\n${survivors.length} survived — a finding about the tests, or about the sentence they were written from`) +
        staleNote,
  );
  return lines.join("\n");
}
