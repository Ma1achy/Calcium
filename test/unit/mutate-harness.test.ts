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
