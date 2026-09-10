// `tools/instruments.mjs` — the runner's own row reader.
//
// **The runner reported `0 rows` for a child that had run six rows and failed
// one** (F929, F949). Its reader matched `Tests N passed` with the digits
// straight after the word, and vitest writes `Tests  1 failed | 5 passed (6)`
// when a row fails — so exactly the runs with something to report read as *no
// rows at all*, and a finding was written about a starved child. The reader is
// exported now; these rows hand it the summaries vitest actually writes, taken
// as bytes from real runs, and IN7 spawns vitest to show the bytes are still
// what it writes today.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { readCounter, stateOf } from "../../tools/instruments.mjs";

type Counter =
  | { rows: number; failed: number; reported: number; collected: number | null }
  | null;
const read = readCounter as (out: string) => Counter;
const state = stateOf as (ok: boolean, counter: Counter) => string;

/**
 * vitest 4.1.10's summary lines, as bytes — captured 2026-09-09 from
 * `npx vitest run` over a two-row file with one failure, a file that does not
 * parse, and `test/revert/profiler.test.ts` while it still held a todo. The
 * escapes are kept because the first version of the reader fell to them.
 */
const E = "\u001b";
const FILES_PASSED = `${E}[2m Test Files ${E}[22m ${E}[1m${E}[32m1 passed${E}[39m${E}[22m${E}[90m (1)${E}[39m`;
const FILES_FAILED = `${E}[2m Test Files ${E}[22m ${E}[1m${E}[31m1 failed${E}[39m${E}[22m${E}[90m (1)${E}[39m`;
const FAILED = `${E}[2m      Tests ${E}[22m ${E}[1m${E}[31m1 failed${E}[39m${E}[22m${E}[2m | ${E}[22m${E}[1m${E}[32m1 passed${E}[39m${E}[22m${E}[90m (2)${E}[39m`;
const NO_TESTS = `${E}[2m      Tests ${E}[22m ${E}[2mno tests${E}[22m`;
const TODO = `${E}[2m      Tests ${E}[22m ${E}[1m${E}[32m15 passed${E}[39m${E}[22m${E}[2m | ${E}[22m${E}[90m1 todo${E}[39m${E}[90m (16)${E}[39m`;
/**
 * **A crashed worker** — captured 2026-09-10 from vitest 4.1.10 over two files,
 * the second calling `process.kill(process.pid, "SIGKILL")` in its third test.
 * Six tests collected, two reported, and an `Errors` line beside them.
 */
const CRASHED =
  `${E}[2m Test Files ${E}[22m ${E}[1m${E}[32m1 passed${E}[39m${E}[22m${E}[90m (2)${E}[39m\n` +
  `${E}[2m      Tests ${E}[22m ${E}[1m${E}[32m2 passed${E}[39m${E}[22m${E}[90m (6)${E}[39m\n` +
  `${E}[2m     Errors ${E}[22m ${E}[1m${E}[31m1 error${E}[39m${E}[22m`;

describe("instruments — the runner's row reader", () => {
  it("IN1: a python fixture's `n/m rows` is m rows with m − n failed", () => {
    expect(read("  ok    x\n\nbeats.py — 12/12 rows\n")).toEqual({
      rows: 12,
      failed: 0,
      reported: 12,
      collected: 12,
    });
    expect(read("  FAIL  y\n\nbeats.py — 11/12 rows\n")).toEqual({
      rows: 12,
      failed: 1,
      reported: 12,
      collected: 12,
    });
  });

  it("IN2: a green vitest summary is its passed count, and a todo is not a row", () => {
    // `rows` is what ran and `reported` is what the line accounts for — the
    // todo is in the second and not the first, which is why the bracket cannot
    // be compared against `rows`. A reader that did would call every deferred
    // row a lost one.
    expect(read(`${FILES_PASSED}\n${TODO}\n`)).toEqual({
      rows: 15,
      failed: 0,
      reported: 16,
      collected: 16,
    });
  });

  it("IN3 (F949): `1 failed | 1 passed` is two rows with one failed — reading `passed` alone → 0 rows, which was F929's premise", () => {
    const c = read(`${FILES_FAILED}\n${FAILED}\n`);
    expect(c, "the rows that ran, whichever way they went").toEqual({
      rows: 2,
      failed: 1,
      reported: 2,
      collected: 2,
    });
    expect(state(false, c), "and the state is the fixture disagreeing, not an absence").toBe("diverged");
  });

  it("IN4: no counter under a non-zero exit is `did not run`, and under exit 0 it is `no rows` — both arms", () => {
    // Both arms, because either alone is satisfied by a reader returning a
    // constant — and F929's two states were one name.
    expect(read(`${FILES_FAILED}\n${NO_TESTS}\n`), "`no tests` is not a counter").toBeNull();
    expect(state(false, null), "a child that died before its first row").toBe("did not run");
    expect(state(true, null), "a fixture that ran nothing and called it clean").toBe("no rows");
    expect(
      state(true, { rows: 0, failed: 0, reported: 0, collected: 0 }),
      "and a counter of zero reads the same as none",
    ).toBe("no rows");
  });

  it("IN5: the escapes are stripped, so the coloured line and the plain one read alike", () => {
    const plain = FAILED.replace(/\u001b\[[0-9;]*m/g, "");
    // The control: the plain line is what a reader sees, and it is the line
    // the coloured bytes above claim to carry.
    expect(plain).toBe("      Tests  1 failed | 1 passed (2)");
    expect(read(plain)).toEqual(read(FAILED));
  });

  it("IN6: every row green under a non-zero exit is an error outside the rows; green under exit 0 is ok", () => {
    const whole = (rows: number, failed: number) => ({
      rows,
      failed,
      reported: rows,
      collected: rows,
    });
    expect(state(false, whole(6, 0))).toBe("errored after its rows");
    expect(state(true, whole(6, 0))).toBe("ok");
    expect(state(true, whole(6, 1)), "and a failure is a divergence whatever the exit").toBe(
      "diverged",
    );
  });

  it("IN8 (F897, F1018): a crashed worker's `2 passed (6)` is rows lost, not an error after the rows", () => {
    // **F929's own symptom, read correctly at last.** F949 fixed the reader
    // that turned this into `0 rows`; what it left was a counter that reads the
    // buckets and not the bracket, so a run which collected six tests and
    // reported two came back as *every row green under a non-zero exit*. Every
    // one of those words is false about this run.
    const c = read(CRASHED);
    expect(c, "two buckets, six collected").toEqual({
      rows: 2,
      failed: 0,
      reported: 2,
      collected: 6,
    });
    expect(state(false, c)).toBe("lost rows");
    // **Rows lost outrank a divergence**, because the row it would have
    // diverged on may be one of the ones that never ran.
    expect(state(false, { rows: 2, failed: 1, reported: 2, collected: 6 })).toBe("lost rows");
  });

  it("IN8b (F1018): the control — three whole summaries, and a line with no bracket cannot be asked", () => {
    // **The corpus the rule resolves against, shown non-empty.** A predicate
    // that fires on a healthy summary changes every row in every run, so the
    // three shapes vitest writes when nothing is lost are asserted here beside
    // the one where something is.
    for (const [name, out] of [
      ["green", `${FILES_PASSED}\n${TODO}\n`],
      ["failing", `${FILES_FAILED}\n${FAILED}\n`],
      ["python", "beats.py — 11/12 rows\n"],
    ] as const) {
      const c = read(out);
      expect(c?.reported, `${name}: the buckets account for the bracket`).toBe(c?.collected);
      expect(state(false, c), `${name} is not a lost-rows run`).not.toBe("lost rows");
    }
    // And the blind spot: a `Tests` line sheared before its bracket has no
    // collected count, so the question is unanswerable rather than answered
    // `yes` — `did not run` already owns a child that died before its summary.
    const noBracket = FAILED.replace(" (2)", "");
    expect(noBracket, "the bracket and nothing else is gone").not.toContain("(2)");
    expect(read(noBracket)?.collected, "no bracket, no answer").toBeNull();
    expect(state(false, read(noBracket))).toBe("diverged");
  });

  it(
    "IN7: the fixture responds — the installed vitest still writes the line the rows above were read from",
    () => {
      // test/support/README.md: a fixture is shown to respond to the thing under
      // test before it is asserted against. The summaries above are bytes from
      // one version of vitest; this spawns the installed one over a two-row file
      // with one failure and reads the real line, so a format change fails here
      // rather than reading as `did not run` in `make instruments`.
      const dir = mkdtempSync(join(tmpdir(), "calcium-instruments-"));
      try {
        writeFileSync(
          join(dir, "probe.test.ts"),
          'import { expect, it } from "vitest";\n' +
            'it("passes", () => { expect(1).toBe(1); });\n' +
            'it("fails", () => { expect(1).toBe(2); });\n',
        );
        // The worker's own VITEST_* variables would make the child think it is
        // a worker of this run rather than a run of its own.
        const env = Object.fromEntries(
          Object.entries(process.env).filter(([k]) => !k.startsWith("VITEST")),
        );
        let out = "";
        let ok = true;
        try {
          out = execFileSync("npx", ["vitest", "run", "--dir", dir], {
            cwd: process.cwd(),
            encoding: "utf8",
            stdio: "pipe",
            env,
          });
        } catch (e) {
          ok = false;
          const err = e as { stdout?: string; stderr?: string };
          out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
        }
        expect(ok, "a run with a failing row exits non-zero").toBe(false);
        // **And the bracket, which is what makes `lost rows` expressible**
        // (F1018): a format change that dropped it would leave `collected`
        // null and the state unaskable, and this is where that fails rather
        // than in `make instruments`.
        expect(read(out), "and its summary reads as two rows, one failed, out of two").toEqual({
          rows: 2,
          failed: 1,
          reported: 2,
          collected: 2,
        });
        expect(state(ok, read(out))).toBe("diverged");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
