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

/** vitest colours its summary; the codes sit between the word and the count. */
export function strip(output) {
  return output.replace(/\[[0-9;]*m/g, "");
}

/** Did the run kill anything? Read off the stripped summary, not the exit code:
 * a suite that fails to *start* also exits non-zero and kills nothing. */
export function killed(output) {
  return /Tests\s+\d+ failed/.test(strip(output));
}

/** Did the run reach a summary at all — pass *or* fail?
 *
 * **`killed` cannot answer this and must not be asked to.** A run that never
 * finished and a run that finished green are the same `false`, and they mean
 * opposite things. The control pair catches a harness that is blind from the
 * start; this catches one that goes blind in the middle, which is what happened:
 * a suite piped into `grep -q` under `pipefail`, the writer taking SIGPIPE, exit
 * 141 and a buffer cut before the summary. Every mutation after it would have
 * reported a survivor. */
export function ran(output) {
  return /Tests\s+\d+ (failed|passed)/.test(strip(output));
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
 * @param {object} opts
 * @param {Array<{name,file,from,to,expect}>} opts.mutations
 * @param {{file,from,to,why}} opts.control  a mutation whose kill is not in doubt
 * @param {(file:string)=>string} opts.read
 * @param {(file:string,src:string)=>void} opts.write
 * @param {()=>string} opts.run             runs the suite, returns its output
 */
export function runPass({ mutations, control, read, write, run }) {
  const files = [...new Set([control.file, ...mutations.map((m) => m.file)])];
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
      write(m.file, apply(originals.get(m.file), m));
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
  // An anchor miss stays in this count, as it always has: it is not caught, and
  // the line above it already says which kind of not-caught it is. Whether a
  // stale anchor should be counted apart is a separate question from this one.
  const survivors = results.filter((r) => !r.killed && !r.noSummary);
  lines.push(
    blind.length > 0
      ? `\n${blind.length} run(s) produced no summary — the harness went blind mid-pass. ` +
          `Nothing above those rows means anything`
      : survivors.length === 0
        ? "\nevery mutation was caught"
        : `\n${survivors.length} survived — a finding about the tests, or about the sentence they were written from`,
  );
  return lines.join("\n");
}
