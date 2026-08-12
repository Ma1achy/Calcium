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
  killed,
  report,
  runPass,
  strip,
} from "../../tools/mutate/mutate.mjs";

/** vitest's real summary line, colours and all. */
const FAILED = "[2m Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[32m5 passed[39m";
const PASSED = "[2m Tests [22m [1m[32m6 passed[39m[22m";

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
    expect(text, "a survivor indicts the test or the sentence, not the code").toMatch(
      /2 survived/,
    );
  });
});
