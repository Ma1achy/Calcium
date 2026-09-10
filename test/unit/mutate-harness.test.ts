// The harness that verifies tests, verified.
//
// A03 §2's sixth kind checks the other five, and this is that rule applied one
// level further out: the mutation pass is the only thing that asks whether a
// test can fail, so a mutation pass that cannot see a kill removes the check
// and leaves a report that reads like a thorough one.
//
// Every fabrication below is the real defect rather than an invented one
// (A03 commitment 14a). The ANSI case is the output that actually fooled it.
import { describe, expect, it } from "vitest";

import {
  AnchorError,
  apply,
  BlindHarnessError,
  hitsOf,
  incomplete,
  killed,
  report,
  runPass,
  strip,
  tally,
  unbuilt,
} from "../../tools/mutate/mutate.mjs";

/** vitest's real summary line, colours and all. */
const FAILED = "[2m Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[32m5 passed[39m";
const PASSED = "[2m Tests [22m [1m[32m6 passed[39m[22m";

/**
 * **A crashed worker, as bytes** — captured 2026-09-10 from vitest 4.1.10 over
 * two files, the second of which calls `process.kill(process.pid, "SIGKILL")`
 * in its third test. Six tests were collected across the two files and two of
 * them reported; the other four went with the worker.
 *
 * This is the block F897 saw once, wrote down, and shipped nothing against
 * because it would not come back. It comes back on demand.
 */
const E = "\u001b";
const CRASHED =
  `${E}[2m Test Files ${E}[22m ${E}[1m${E}[32m1 passed${E}[39m${E}[22m${E}[90m (2)${E}[39m\n` +
  `${E}[2m      Tests ${E}[22m ${E}[1m${E}[32m2 passed${E}[39m${E}[22m${E}[90m (6)${E}[39m\n` +
  `${E}[2m     Errors ${E}[22m ${E}[1m${E}[31m1 error${E}[39m${E}[22m`;

/**
 * The same crash beside a genuinely failing row in the other file — F897's own
 * shape, which printed a `Failed Tests` section above a summary that had lost
 * four tests. Here `killed` is true and the run is still not one to read.
 */
const CRASHED_WITH_KILL =
  `${E}[31m\u23af\u23af\u23af${E}[39m${E}[1m${E}[41m Failed Tests 1 ${E}[49m${E}[22m\n` +
  `${E}[2m Test Files ${E}[22m ${E}[1m${E}[31m1 failed${E}[39m${E}[22m${E}[90m (2)${E}[39m\n` +
  `${E}[2m      Tests ${E}[22m ${E}[1m${E}[31m1 failed${E}[39m${E}[22m${E}[2m | ${E}[22m` +
  `${E}[1m${E}[32m1 passed${E}[39m${E}[22m${E}[90m (6)${E}[39m\n` +
  `${E}[2m     Errors ${E}[22m ${E}[1m${E}[31m1 error${E}[39m${E}[22m`;

/**
 * Healthy summaries carrying a total, from the same capture session: a green
 * run, a failing run, and one with a `todo` and two `skip`s. **The control set
 * for the arithmetic** — every one of these sums to its own bracket, so a
 * predicate that fires on any of them is reading something other than loss.
 */
const WHOLE_GREEN = `${E}[2m      Tests ${E}[22m ${E}[1m${E}[32m2 passed${E}[39m${E}[22m${E}[90m (2)${E}[39m`;
const WHOLE_FAILED =
  `${E}[2m      Tests ${E}[22m ${E}[1m${E}[31m1 failed${E}[39m${E}[22m${E}[2m | ${E}[22m` +
  `${E}[1m${E}[32m2 passed${E}[39m${E}[22m${E}[90m (3)${E}[39m`;
const WHOLE_DEFERRED =
  `${E}[2m      Tests ${E}[22m ${E}[1m${E}[32m2 passed${E}[39m${E}[22m${E}[2m | ${E}[22m` +
  `${E}[33m2 skipped${E}[39m${E}[2m | ${E}[22m${E}[90m1 todo${E}[39m${E}[90m (5)${E}[39m`;

describe("mutation harness", () => {
  it("MH1: reads a kill through the colour codes — the defect, restored", () => {
    // **The fabrication is the real output.** The first version tested
    // `/Tests\s+\d+ failed/` against a string it wrote itself, which had no
    // codes in it, so the regex and the fixture agreed and the tree did not.
    // That is the same sitting, same misreading failure A03 §2 records for SP1.
    expect(killed(FAILED), "a real failing summary").toBe(true);
    expect(killed(PASSED)).toBe(false);
    expect(strip(FAILED)).toContain("Tests  1 failed");
  });

  it("MH2: a naive reader misses it, which is why MH1 uses the real bytes", () => {
    expect(/Tests\s+\d+ failed/.test(FAILED), "the regex that shipped").toBe(false);
  });

  it("MH3: an anchor that does not match throws rather than reporting a survivor", () => {
    // A miss and a survivor are the same line in a report that does not
    // distinguish them, and they mean opposite things: one is a stale script,
    // the other is a weak test.
    expect(() => apply("const a = 1;", { file: "x.ts", from: "const b", to: "const c" })).toThrow(
      AnchorError,
    );
    expect(apply("const a = 1;", { file: "x.ts", from: "const a", to: "const z" })).toBe(
      "const z = 1;",
    );
  });

  it("MH4 fires: a blind harness refuses to report", () => {
    // The whole reason the control pair moved inside. `run` never reports a
    // kill, so every mutation would come back a survivor and the run would read
    // as nine findings about weak tests.
    const files = new Map([["a.ts", "const x = 1;"]]);

    expect(() =>
      runPass({
        mutations: [{ name: "m", file: "a.ts", from: "1", to: "2", expect: "T1.1" }],
        control: { file: "a.ts", from: "const x", to: "const BROKEN", why: "renames the export" },
        read: (f) => files.get(f) as string,
        write: (f, s) => void files.set(f, s),
        run: () => PASSED,
      }),
    ).toThrow(BlindHarnessError);

    expect(files.get("a.ts"), "and the tree is left as it was found").toBe("const x = 1;");
  });

  it("MH5 fires: a tree that already fails refuses too", () => {
    const files = new Map([["a.ts", "const x = 1;"]]);

    expect(() =>
      runPass({
        mutations: [],
        control: { file: "a.ts", from: "const x", to: "const BROKEN", why: "renames the export" },
        read: (f) => files.get(f) as string,
        write: (f, s) => void files.set(f, s),
        run: () => FAILED,
      }),
    ).toThrow(/already fails/);
  });

  it("MH4b: a run that never reaches a summary is blindness, not a survivor", () => {
    // **Today's instance, and it is the same class as MH4 arriving from the
    // channel rather than from the regex.** The suite was piped into `grep -q`
    // under `pipefail`; grep exited on its first match, the writer took SIGPIPE,
    // and the pipeline returned 141 with a truncated buffer. No summary line
    // reached `killed`, so every mutation came back a survivor — nine findings
    // about weak tests, and the tests were never run to completion.
    //
    // The control pair is what catches it, and this row is what says so: a
    // `run` that returns nothing at all must refuse rather than report.
    const files = new Map([["a.ts", "const x = 1;"]]);

    expect(() =>
      runPass({
        mutations: [{ name: "m", file: "a.ts", from: "1", to: "2", expect: "T1.1" }],
        control: { file: "a.ts", from: "const x", to: "const BROKEN", why: "renames the export" },
        read: (f) => files.get(f) as string,
        write: (f, s) => void files.set(f, s),
        run: () => "",
      }),
    ).toThrow(BlindHarnessError);

    // And a truncated one, which is what the buffer actually held: real output,
    // cut before the summary. It reads far more like a real run than `""` does.
    expect(() =>
      runPass({
        mutations: [{ name: "m", file: "a.ts", from: "1", to: "2", expect: "T1.1" }],
        control: { file: "a.ts", from: "const x", to: "const BROKEN", why: "renames the export" },
        read: (f) => files.get(f) as string,
        write: (f, s) => void files.set(f, s),
        run: () => " RUN  v4.1.10 /workspaces/tui-kit\n\n ✓ test/unit/a.test.ts (6 tests)",
      }),
    ).toThrow(/not live/);
  });

  it("MH4c: a harness that goes blind MID-pass is not nine findings", () => {
    // **The residue MH4b leaves, and the one that actually bit.** The control
    // pair is checked once, before the first mutation — so a `run` that stops
    // producing output *after* it passes is invisible to it, and every row from
    // there on reads as a survivor. That is nine findings about weak tests, from
    // a suite that never ran.
    //
    // `ran` is the distinction `killed` cannot make: a run that did not finish
    // and a run that finished green are the same `false` and mean opposite
    // things.
    const files = new Map([["a.ts", "const x = 1;\nconst y = 2;\n"]]);
    let calls = 0;
    const run = (): string => {
      calls += 1;
      // clean, control, then the pipe breaks
      if (calls === 1) return PASSED;
      if (calls === 2) return `${FAILED}\n  × T1.1 asserts x`;
      return " RUN  v4.1.10\n\n ✓ test/unit/a.test.ts (6 tests)";
    };

    const results = runPass({
      mutations: [
        { name: "first", file: "a.ts", from: "const x = 1;", to: "const x = 9;", expect: "T1.1" },
        { name: "second", file: "a.ts", from: "const y = 2;", to: "const y = 9;", expect: "T1.2" },
      ],
      control: { file: "a.ts", from: "const x = 1;", to: "const x = 0;", why: "T1.1 asserts x" },
      read: (f) => files.get(f) as string,
      write: (f, s) => void files.set(f, s),
      run,
    });

    expect(results.map((r) => r.noSummary ?? false)).toEqual([true, true]);

    const text = report(results);
    expect(text).toContain("NO SUMMARY");
    expect(text, "and it does not read as a finding about the tests").not.toMatch(/\d+ survived/);
    expect(text).toContain("went blind mid-pass");
  });

  it("MH7: two files — each row runs against a tree holding only its own mutation", () => {
    // **Found by mutation, and it is a finding about these tests rather than
    // about the harness.** Deleting the `finally { restore() }` between rows
    // survived every row above, because all of them mutate one file and each
    // write is `originals + this mutation` — so the previous row is overwritten
    // anyway. The moment two files are in play it is a real defect: row 1's
    // mutation to `a.ts` is still on disk while row 2 runs against `b.ts`, and
    // the two kills cannot be told apart.
    //
    // The same shape as `screen_test.py`'s ported six, which addressed column 0
    // and left *CUP ignores its column* alive: a suite indexed by the case in
    // hand tests each rule against itself and agrees.
    const files = new Map([
      ["a.ts", "const x = 1;"],
      ["b.ts", "const y = 2;"],
    ]);
    // What `a.ts` held at each run: clean, control, row a, row b. The fourth is
    // the assertion — row b must run against an `a.ts` nobody has touched.
    const aDuring: string[] = [];
    const run = (): string => {
      aDuring.push(files.get("a.ts") as string);
      // The control is the second call and must be seen killed, or the pass
      // refuses to report at all.
      return aDuring.length === 2 ? `${FAILED}\n  × T1.1 asserts x` : PASSED;
    };

    runPass({
      mutations: [
        { name: "a", file: "a.ts", from: "const x", to: "const X", expect: "T1.1" },
        { name: "b", file: "b.ts", from: "const y", to: "const Y", expect: "T1.2" },
      ],
      control: { file: "a.ts", from: "const x = 1;", to: "const x = 0;", why: "T1.1 asserts x" },
      read: (f) => files.get(f) as string,
      write: (f, s) => void files.set(f, s),
      run,
    });

    expect(aDuring.length, "clean, control, row a, row b").toBe(4);
    expect(aDuring[2], "row a's own mutation is applied").toBe("const X = 1;");
    expect(aDuring[3], "and row b runs against an untouched a.ts").toBe("const x = 1;");
    expect([files.get("a.ts"), files.get("b.ts")], "restored at the end").toEqual([
      "const x = 1;",
      "const y = 2;",
    ]);
  });

  it("MH8: a mutation that does not compile is not a survivor", () => {
    // **The third state that read as a survivor, and the real bytes that did
    // it.** `c21-pty`'s wrapped-error row opened a `try` it never closed. Three
    // of four suites failed to collect, the fourth ran green, and the two
    // summary lines disagreed:
    const BROKEN =
      "\u001b[2m Test Files \u001b[22m \u001b[1m\u001b[31m3 failed\u001b[39m\u001b[22m" +
      "\u001b[2m | \u001b[22m\u001b[1m\u001b[32m1 passed\u001b[39m\u001b[22m\u001b[90m (4)\u001b[39m\n" +
      "\u001b[2m      Tests \u001b[22m \u001b[1m\u001b[32m10 passed\u001b[39m\u001b[22m" +
      "\u001b[2m | \u001b[22m\u001b[90m2 todo\u001b[39m\u001b[90m (12)\u001b[39m";

    // A summary exists, so the blindness check passes; no test failed, so
    // `killed` is false. Both true, and together they said SURVIVED.
    expect(killed(BROKEN), "no test failed").toBe(false);
    expect(unbuilt(BROKEN), "and the suites did not load").toBe(true);

    // **The controls, because a predicate that answers true to everything reads
    // the same as one that works.** A real kill and a real survivor must both
    // come back false, or every row in every pass changes state.
    expect(unbuilt(FAILED), "a genuine kill is not a build failure").toBe(false);
    expect(unbuilt(PASSED), "and neither is a genuine survivor").toBe(false);

    const rows = report([
      { name: "broke", expect: "T1.1", killed: false, unbuilt: true },
      { name: "lived", expect: "T1.2", killed: false },
    ]);
    expect(rows, "the row says which").toContain("DID NOT BUILD");
    expect(rows, "and the count excludes it").toContain("1 survived");
    expect(rows, "with the reader sent to the mutation").toContain("Fix the `to`");

    // **And the wiring, because the two rows above only exercise the pieces.**
    // A branch deleted from `runPass` leaves `unbuilt` correct, `report`
    // correct, and every row back to reading SURVIVED — the shape where a test
    // calls the mechanism and misses the call site.
    const files = new Map([["a.ts", "const x = 1;"]]);
    const answers = () => {
      const src = files.get("a.ts") as string;
      if (src.includes("BROKEN")) return " Tests  1 failed | 5 passed";
      if (src.includes("2")) return " Test Files  3 failed | 1 passed (4)\n      Tests  10 passed (10)";
      return " Tests  6 passed";
    };
    const live = runPass({
      mutations: [{ name: "m", file: "a.ts", from: "1", to: "2", expect: "T1.1" }],
      control: { file: "a.ts", from: "const x", to: "const BROKEN", why: "renames the export" },
      read: (f) => files.get(f) as string,
      write: (f, v) => void files.set(f, v),
      run: answers,
    });
    expect(live[0]?.unbuilt, "the pass says the mutation did not build").toBe(true);
    expect(live[0]?.killed, "and does not call it a kill").toBe(false);
    expect(report(live), "with no survivor claimed").toContain("no survivors among the rows that ran");
  });

  it("MH8b: a tree whose suites do not load refuses before the first mutation", () => {
    // The same disagreement in the *clean* run. `ran` is true — there is a
    // summary — so the existing gate passes it, and then every mutation covered
    // by the file that will not load comes back a survivor.
    const files = new Map([["a.ts", "const x = 1;"]]);
    expect(() =>
      runPass({
        mutations: [{ name: "m", file: "a.ts", from: "1", to: "2", expect: "T1.1" }],
        control: { file: "a.ts", from: "const x", to: "const BROKEN", why: "renames the export" },
        read: (f) => files.get(f) as string,
        write: (f, s) => void files.set(f, s),
        run: () => " Test Files  3 failed | 1 passed (4)\n      Tests  10 passed (10)",
      }),
    ).toThrow(/does not load/);
  });

  it("MH6: a live harness reports kills and survivors apart", () => {
    const files = new Map([["a.ts", "const x = 1;\nconst y = 2;\n"]]);
    // Killed only when `x` is touched: `y` is the line no test covers. The
    // failing output names T1.1, so "caught" and "CAUGHT ELSEWHERE" are
    // distinguishable — a kill by *some other* test is a finding too, since the
    // mutation was aimed at one and hit another.
    const run = (): string =>
      files.get("a.ts")?.includes("const x = 1;") ? PASSED : `${FAILED}\n  × T1.1 asserts x`;

    const results = runPass({
      mutations: [
        { name: "covered", file: "a.ts", from: "const x = 1;", to: "const x = 9;", expect: "T1.1" },
        { name: "uncovered", file: "a.ts", from: "const y = 2;", to: "const y = 9;", expect: "T1.2" },
        { name: "stale", file: "a.ts", from: "const z", to: "const q", expect: "T1.3" },
      ],
      control: { file: "a.ts", from: "const x = 1;", to: "const x = 0;", why: "T1.1 asserts x" },
      read: (f) => files.get(f) as string,
      write: (f, s) => void files.set(f, s),
      run,
    });

    expect(results.map((r) => [r.name, r.killed, r.anchorMissed ?? false])).toEqual([
      ["covered", true, false],
      ["uncovered", false, false],
      ["stale", false, true],
    ]);
    expect(files.get("a.ts"), "restored after every row").toBe("const x = 1;\nconst y = 2;\n");

    const text = report(results);
    expect(text).toContain("caught");
    expect(text).toContain("SURVIVED");
    expect(text).toContain("ANCHOR MISSED");
    // **One survivor, not two.** The stale row ran nothing, so counting it here
    // made the summary contradict the line above it — and `ANCHOR MISSED is not
    // a survivor` is the rule the summary was breaking. Both still fail the
    // gate; only the sentence changed.
    expect(text, "a survivor indicts the test or the sentence, not the code").toMatch(
      /1 survived/,
    );
    expect(text, "and the anchor miss is reported as what it is").toMatch(
      /1 anchor\(s\) did not match/,
    );
  });

  it("MH9 (F897, F1018): a crashed worker's summary is not a survivor — the real bytes, and every other predicate says it is", () => {
    // **The row F897 could not write, and the reason it could not was wrong.**
    // The finding said the fix waited on a reproduction; a summary reader is a
    // pure function over a string, and F897's own entry held the string. The
    // fixture above is better than that: bytes captured from the installed
    // vitest, on demand, 2026-09-10.
    //
    // Every predicate this file already had answers *correctly* here, and the
    // three correct answers compose into SURVIVED for a run that lost four of
    // its six tests. That is the interaction, and it is why no row indexed by
    // one predicate would find it.
    expect(strip(CRASHED), "there is a summary").toContain("Tests  2 passed (6)");
    expect(killed(CRASHED), "and no test failed").toBe(false);
    expect(unbuilt(CRASHED), "and no file failed to load").toBe(false);
    // The two lines the harness never read: the collected count, and the gap.
    expect(tally(CRASHED)).toEqual({ reported: 2, collected: 6 });
    expect(incomplete(CRASHED), "four tests were collected and never reported").toBe(true);
  });

  it("MH9b (F1018): the control set — a green, a failing and a deferred summary all report everything they collected", () => {
    // **The fabricated violation owes a corpus that is not empty**, and this is
    // it: three healthy shapes vitest writes, each summing to its own bracket.
    // A predicate that fires on any of these is reading something other than
    // loss, and every row in every pass would change state.
    for (const [name, out] of [
      ["green", WHOLE_GREEN],
      ["failing", WHOLE_FAILED],
      ["with a todo and two skips", WHOLE_DEFERRED],
    ] as const) {
      const t = tally(out);
      expect(t, `${name}: the line carries a total`).not.toBeNull();
      expect(t?.reported, `${name}: the buckets sum to the bracket`).toBe(t?.collected);
      expect(incomplete(out), `${name} is a whole run`).toBe(false);
    }
    // And the arithmetic is read rather than assumed: change the bracket and
    // the predicate must move, or it is agreeing with itself.
    expect(incomplete(WHOLE_DEFERRED.replace("(5)", "(9)"))).toBe(true);
  });

  it("MH9c (F1018): a kill inside an incomplete run is not a kill you can attribute", () => {
    // **The cell where two correct statements overlap.** `killed` is true — a
    // row really did fail — and four tests never ran, so the row this mutation
    // was aimed at may be one of them. Reporting `caught` here is the same
    // error as reporting SURVIVED, pointed the other way: it reads as coverage.
    //
    // Ruled INDETERMINATE rather than `caught`, and the alternative is named:
    // *the crash itself is what failed the row, so call it caught*. The cost of
    // being wrong that way is a mutation believed covered and not; the cost of
    // this way is a re-run.
    expect(killed(CRASHED_WITH_KILL), "a row did fail").toBe(true);
    expect(incomplete(CRASHED_WITH_KILL), "and the run lost four tests").toBe(true);
    expect(tally(CRASHED_WITH_KILL)).toEqual({ reported: 2, collected: 6 });
  });

  it("MH9d (F1018): a summary with no total cannot answer, and says so rather than guessing", () => {
    // **The stated blind spot, as a row.** `maxBuffer` shearing and a SIGPIPE
    // both truncate, and a `Tests` line cut before its bracket has no total to
    // compare against — so *were rows lost* is unanswerable, not `yes`. `ran`
    // owns truncation; this predicate must not claim it.
    //
    // It is also what keeps the fixtures above this line meaning what they
    // meant: `PASSED` and `FAILED` are captures without a bracket, and a
    // predicate firing on absence would turn every row in this file
    // indeterminate while every assertion still passed.
    expect(tally(PASSED), "no bracket, no answer").toBeNull();
    expect(tally(FAILED)).toBeNull();
    expect(incomplete(PASSED)).toBe(false);
    expect(incomplete(FAILED)).toBe(false);
    expect(tally(""), "and nothing at all is not an incomplete run").toBeNull();
    expect(incomplete("TIMED OUT after 600000ms"), "nor is a timeout — it has no Tests line").toBe(
      false,
    );
  });

  it("MH9e (F1018): the wiring — an incomplete row reads INDETERMINATE, claims no survivor, and its figures are on the line", () => {
    // **A test that calls the mechanism misses the wiring.** MH9 asks the
    // predicate; a branch missing from `runPass` leaves `incomplete` correct,
    // `report` correct, and every row back to SURVIVED.
    const files = new Map([["a.ts", "const x = 1;"]]);
    const answers = (): string => {
      const src = files.get("a.ts") as string;
      if (src.includes("BROKEN")) return `${FAILED} (6)\n  \u00d7 T1.1 asserts x`;
      if (src.includes("2")) return CRASHED;
      return WHOLE_GREEN;
    };
    const live = runPass({
      mutations: [{ name: "m", file: "a.ts", from: "1", to: "2", expect: "T1.1" }],
      control: { file: "a.ts", from: "const x", to: "const BROKEN", why: "renames the export" },
      read: (f) => files.get(f) as string,
      write: (f, v) => void files.set(f, v),
      run: answers,
    });

    expect(live[0]?.indeterminate, "the pass says it could not tell").toBe(true);
    expect(live[0]?.killed, "and does not call it a kill").toBe(false);

    const text = report(live);
    expect(text).toContain("INDETERMINATE");
    expect(text, "with the figures, so nobody re-derives them from the log").toContain(
      "2 of 6 tests reported",
    );
    expect(text, "and no survivor claimed").not.toMatch(/\d+ survived/);
    expect(text, "nor a clean sweep").not.toContain("every mutation was caught");
    expect(text).toContain("reported fewer tests than they collected");
  });

  it("MH9f (F1018): the clean run and the control run are two more moments, and the same bytes mean something else at each", () => {
    // **The sequence trace, and neither row is reachable from the table.** The
    // classification table asks which predicate claims which output; these two
    // are about *when* the output arrives. `run` is called at three kinds of
    // moment and the harness read only the third.
    const files = new Map([["a.ts", "const x = 1;"]]);
    const opts = (run: () => string) => ({
      mutations: [{ name: "m", file: "a.ts", from: "1", to: "2", expect: "T1.1" }],
      control: { file: "a.ts", from: "const x", to: "const BROKEN", why: "renames the export" },
      read: (f: string) => files.get(f) as string,
      write: (f: string, v: string) => void files.set(f, v),
      run,
    });

    // The clean run lost rows: the baseline is not the corpus, so no row below
    // is measured against anything known.
    expect(() => runPass(opts(() => CRASHED))).toThrow(/is not the corpus/);

    // And the control run lost rows while still reporting its kill. `killed` is
    // true, so the pair passed — the harness's own guard against blindness,
    // satisfied by a blind run. The refusal names the incompleteness rather
    // than the control's `why`, or the reader goes to the wrong file.
    let calls = 0;
    const staggered = (): string => {
      calls += 1;
      return calls === 1 ? WHOLE_GREEN : CRASHED_WITH_KILL;
    };
    expect(() => runPass(opts(staggered))).toThrow(/the pair proved nothing/);
    expect(calls, "it refused at the control, not before it").toBe(2);
    expect(files.get("a.ts"), "and the tree is left as it was found").toBe("const x = 1;");
  });

  it("MH10 (F219, F277, F1037): a survivor says whether its anchor was unique, because the two survivors want opposite repairs", () => {
    // **F277's own sentence is that the report cannot tell them apart.** One
    // mutation matching two sites is F219 and wants the duplicate extracted; a
    // unique, present, textually correct anchor on a line whose callers moved
    // is F277 and wants the anchor followed. Both print `SURVIVED`. The
    // multiplicity is the thing the row was not carrying, and `anchors.mjs` has
    // known it all along in a file nobody reads beside the pass.
    expect(hitsOf("const x = 1;\nconst x = 2;\n", "const x"), "two sites").toBe(2);
    expect(hitsOf("const x = 1;", "const x"), "one site").toBe(1);

    // Two rows against one file: `y` appears once, `dup` twice. Neither is
    // covered, so both survive, and only one of them is ambiguous.
    const files = new Map([["a.ts", "const x = 1;\nconst y = 2;\nconst dup = 3;\nconst dup2 = 3;\n"]]);
    const run = (): string =>
      files.get("a.ts")?.includes("const x = 1;") ? WHOLE_GREEN : `${FAILED}\n  \u00d7 T1.1 asserts x`;

    const results = runPass({
      mutations: [
        { name: "unique", file: "a.ts", from: "const y = 2;", to: "const y = 9;", expect: "T1.2" },
        { name: "ambiguous", file: "a.ts", from: "const dup", to: "const DUP", expect: "T1.3" },
      ],
      control: { file: "a.ts", from: "const x = 1;", to: "const x = 0;", why: "T1.1 asserts x" },
      read: (f) => files.get(f) as string,
      write: (f, v) => void files.set(f, v),
      run,
    });

    expect(results.map((r) => [r.name, r.killed, r.hits])).toEqual([
      ["unique", false, 1],
      ["ambiguous", false, 2],
    ]);

    const text = report(results);
    expect(text, "the ambiguous one says so on its own line").toContain(
      "its anchor matches 2x",
    );
    // **The control**, and it is the whole of what makes the line above mean
    // something: a report that annotated every survivor would say nothing. The
    // unique row must carry no such note.
    const unique = text.split("\n").find((l) => l.includes("unique")) ?? "";
    expect(unique, "and the unique one does not").not.toContain("anchor matches");
    // And the survivor line names the third disposition, which is F277's own
    // habit: ask why the mutation cannot reach the test before rewriting it.
    expect(text).toContain("Ask why the mutation cannot reach the test");
  });
});
