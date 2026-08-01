// C22 tier 2 — the compile-level rules and the source scan.
//
// A03 declares TL6 and TL7 against C22 T2.6 and neither was implemented, which
// is the "inventoried and unbuilt" state §2's fourth failure describes: a row in
// a table, no entry in the tooling, and nothing that could ever fire.
//
// `tsconfig` type-checks `test/`, so a `@ts-expect-error` that stops being an
// error fails the build. That is what makes these assertions rather than
// comments — the check runs at compile time and cannot be skipped.
import { describe, expect, it, vi } from "vitest";
import { SCAN_BUDGET_MS } from "../support/budget.js";

import { readFileSync, readdirSync, statSync } from "node:fs";
import { checkSourceScans } from "../../tools/enforce/source-scans.mjs";

import { createProcessRunner } from "../../src/data/process/runner.js";
import { createTerminalLifecycle } from "../../src/terminal/lifecycle.js";
import { detectCapabilities } from "../../src/terminal/capabilities.js";
import { fakeStdin, fakeStdout } from "../support/fake-terminal.js";

// This file walks `src/`; `budget.ts` carries the measurement and why the 5 s
// default is not a margin. Re-measure before raising it.
vi.setConfig({ testTimeout: SCAN_BUDGET_MS });

function srcFiles(dir = "src", out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) srcFiles(path, out);
    else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(path);
  }
  return out;
}

describe("C22 contract", () => {
  it("T2.6 (I12, TL6): `SpawnOptions.cwd` is a function; a string does not compile", () => {
    // **I12's mechanism, not its restatement.** A captured string is correct at
    // capture and wrong for every verb after the first `cd` — and the failure
    // is silent, because the verb runs, just somewhere else. A type error at
    // the call site is the only thing that catches it before a user does.
    const runner = createProcessRunner({ env: {}, stdin: { isRaw: false } });

    // @ts-expect-error — TL6: `cwd` is `() => string`, read at spawn (C21 I10).
    void (() => runner.spawn(["true"], { cwd: "/work" }));

    // And the form that must keep compiling, so the rule is not "nothing works".
    expect(() => {
      const child = runner.spawn(["true"], { cwd: () => "/work" });
      child.signal("SIGKILL");
    }).not.toThrow();
  });

  it("T2.6b (C01 I14, TL7): the lifecycle cannot be constructed without `onFatal`", () => {
    // A failed alternate screen is the only fatal case in the system (A02 §7),
    // so it is the one failure that cannot have undefined handling — C01
    // commitment 13. Optional in the type, every consumer omits it and finds
    // out at the moment nothing can be rendered.
    const capabilities = detectCapabilities({ TERM: "xterm-256color" }).capabilities;
    const base = { stdout: fakeStdout(), stdin: fakeStdin(), capabilities };

    // @ts-expect-error — TL7: `onFatal` is required, not optional.
    void (() => createTerminalLifecycle(base));

    expect(() => {
      const l = createTerminalLifecycle({
        ...base,
        onFatal: ((err: unknown) => {
          throw err;
        }) as (err: unknown) => never,
      });
      l.release();
    }).not.toThrow();
  });

  it("T2.9 (I20, SS44): no module under `src/` resolves an app's variable", () => {
    // **The rule is imported, not restated** — C01 T2.10's shape. A test with
    // its own copy of the pattern agrees with itself while the tool drifts, and
    // the tool is what runs pre-commit.
    //
    // A hand-rolled version of this scan matched the *prose* in three files
    // explaining why the variable is not there. `checkSourceScans` already
    // skips comment lines, which is one more reason not to have written a
    // second scanner.
    const violations = checkSourceScans(srcFiles()).filter((v) => v.rule === "SS44");
    expect(violations.map((v) => v.file), violations.map((v) => v.message).join("\n")).toEqual([]);
  });

  it("T2.9b (I20): SS10's allow-list has one entry and that file does not spend it", () => {
    // **The honest count is zero, and asserting zero is stronger than SS10.**
    // C02 is allow-listed for `process.env` and takes an injected record
    // instead, so nothing under `src/` reads the environment at all. Asserted
    // here rather than by narrowing SS10's scope: an allow-list denies by
    // default, and a file added to `terminal/` later should have to argue its
    // way on rather than inherit an allowance nobody re-examined.
    const allowed = "src/terminal/capabilities.ts";
    const src = readFileSync(allowed, "utf8");
    const code = src
      .split("\n")
      .filter((l) => {
        const t = l.trimStart();
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
      })
      .join("\n");

    expect(/process\.env/.test(code), `${allowed} takes a record, so the allowance is unspent`).toBe(
      false,
    );
  });
});
