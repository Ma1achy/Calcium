// C07 tier 2 — contract. The properties that hold across every path rather
// than at any one of them.
//
// I5 is the one that earns this tier. C07 is the component most likely to
// hand-build a document under stress — exit 2, a spawn failure, an adapter
// throw, a degraded stream — and an invalid document does not surface as a bad
// rendering. It surfaces as a render crash, one layer up, in a component that
// did nothing wrong. So the corpus here is every §4 row crossed with every §5
// shape, and what it asserts is validity rather than appearance.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createAdapterRegistry } from "../../src/data/adapters/index.js";
import type { AdapterContext, RawResult } from "../../src/data/adapters/types.js";
import { validateDocument } from "../../src/data/viewmodel/index.js";

import { producerContext } from "../support/producer-context.js";
const CTX: AdapterContext = Object.freeze({
  ...producerContext(),
  command: "/ps",
  verb: "ps",
  width: 100,
  userRequestedJson: false,
  flags: {},
  transport: "subprocess",
  origin: "user",
  tool: null,
});

/** Every §4 row, as the `RawResult` that selects it. */
const ROWS: readonly Readonly<{ name: string; over: Partial<RawResult> }>[] = [
  { name: "cancelled", over: { cancelled: true, exitCode: 130 } },
  { name: "timedOut", over: { timedOut: true, exitCode: null } },
  { name: "exit 0", over: { exitCode: 0 } },
  { name: "exit 1", over: { exitCode: 1 } },
  { name: "exit 2", over: { exitCode: 2, stderr: "unknown flag" } },
  { name: "signal", over: { exitCode: null, signal: "SIGTERM" } },
  { name: "exit 7", over: { exitCode: 7, stderr: "boom" } },
  { name: "never started", over: { exitCode: null, signal: null } },
];

/** Every §5 shape, as the stdout that selects it. */
const SHAPES: readonly Readonly<{ name: string; stdout: unknown; rawText?: string }>[] = [
  { name: "object of scalars", stdout: { a: "1", b: 2, c: true } },
  { name: "uniform array", stdout: [{ id: "a" }, { id: "b" }] },
  { name: "object with one array", stdout: { n: 1, items: [{ id: "a" }, { id: "b" }] } },
  { name: "nested object", stdout: { a: { b: { c: 1 } } } },
  { name: "ragged array", stdout: [{ a: 1 }, { b: 2 }] },
  { name: "empty array", stdout: [] },
  { name: "bare scalar", stdout: 42 },
  { name: "null", stdout: null },
  { name: "unparseable", stdout: undefined, rawText: "<html>502</html>" },
  { name: "no output", stdout: undefined, rawText: "" },
];

function resultOf(over: Partial<RawResult>, stdout: unknown, rawText: string): RawResult {
  return {
    argv: ["prism", "ps", "--json"],
    exitCode: 0,
    signal: null,
    stdout,
    stdoutRaw: rawText,
    stderr: "",
    durationMs: 5,
    parseError: null,
    cancelled: false,
    timedOut: false,
    overflowed: false,
    ...over,
  };
}

describe("T2.3 (I5) — every §4 row × every §5 shape produces a valid document", () => {
  const registry = createAdapterRegistry();

  for (const row of ROWS) {
    for (const shape of SHAPES) {
      it(`${row.name} · ${shape.name}`, () => {
        const raw = resultOf(
          row.over,
          shape.stdout,
          shape.rawText ?? JSON.stringify(shape.stdout) ?? "",
        );

        for (const json of [false, true]) {
          const doc = registry.adapt(raw, { ...CTX, userRequestedJson: json });
          const validity = validateDocument(doc);

          expect(validity.ok, validity.ok ? "" : validity.error.join("; ")).toBe(true);
          expect(doc.blocks.length, "no document is empty (I3)").toBeGreaterThan(0);
          // I6, both directions, on every cell of the cross product.
          expect(doc.error !== undefined).toBe(doc.status === "error");
          // I14 — finite everywhere, including the paths where C06 reports null.
          expect(Number.isFinite(doc.meta.exitCode)).toBe(true);
          // I13 — provenance is stated, never inherited from a payload.
          expect(doc.meta.origin).toBe("user");
          expect(doc.meta.transport).toBe("subprocess");
        }
      });
    }
  }

  it("I12 — `proposed` is never produced, on any row or shape", () => {
    for (const row of ROWS) {
      for (const shape of SHAPES) {
        const doc = registry.adapt(
          resultOf(row.over, shape.stdout, shape.rawText ?? ""),
          CTX,
        );
        expect(doc.status).not.toBe("proposed");
      }
    }
  });
});

describe("T2.2 (I1) — the source scan, from C07's side", () => {
  // SS3 is the mechanical half and runs in `make enforce`. This is the half
  // that says what the rule is *for*, and it fails for a reason a reader can
  // act on rather than as a regex mismatch in a tools directory.
  function filesIn(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const path = `${dir}/${entry}`;
      if (statSync(path).isDirectory()) filesIn(path, out);
      else if (path.endsWith(".ts")) out.push(path);
    }
    return out;
  }

  it("no clock, no randomness, no filesystem, no process in adapters/", () => {
    for (const file of filesIn("src/data/adapters")) {
      const code = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => {
          const start = line.trimStart();
          return !start.startsWith("//") && !start.startsWith("*") && !start.startsWith("/*");
        })
        .join("\n");

      expect(code, `${file}: an adapter that reads the clock is untestable against a fixture`)
        .not.toMatch(/\bDate\.now|new Date\(|performance\.now/);
      expect(code, `${file}: randomness makes two runs of one fixture disagree`).not.toMatch(
        /\bMath\.random\b/,
      );
      expect(code, `${file}: an adapter reaching the filesystem is not a pure function`).not.toMatch(
        /from\s+["']node:(?:fs|os|child_process)["']/,
      );
      expect(code, `${file}: nothing in adapters/ reads the process`).not.toMatch(/\bprocess\.\w/);
    }
  });
});

describe("T2.6 (I10, MG7) — C07's runtime import graph stays inside L0 data", () => {
  it("no value import reaches terminal/ or above, which is the property", () => {
    // MG1 catches the upward half as a build gate. Asserted here too because
    // the *reason* is C07-specific: an adapter that reaches into
    // `presentation/` is one that cannot be tested without a terminal, which is
    // the property commitment 2 exists to keep.
    //
    // **Value imports, because I10 changed and this row is what it changed
    // against.** `ProducerContext` names `TerminalCapabilities`, type-only —
    // the runtime edge stays forbidden, so `data/` still builds as JavaScript
    // with `terminal/` absent, which is what A02 §1 protects. The next row
    // pins that it is the only one and that it really is type-only.
    for (const file of readdirSync("src/data/adapters")) {
      const code = readFileSync(`src/data/adapters/${file}`, "utf8");
      const valueImports = code
        .split("\n")
        .filter((l) => /^\s*(?:import|export)\s/.test(l) && !/^\s*(?:import|export)\s+type\b/.test(l));
      expect(valueImports.join("\n"), `${file} imports upward`).not.toMatch(
        /from\s+["'][^"']*(?:terminal|presentation|viewport|interaction|shell)\//,
      );
    }
  });

  it("I10: exactly one type-only name crosses the halves, and MG3 excuses it by name", () => {
    // The control for the row above. Without it, "no value import" is satisfied
    // by a component that type-imports the whole of `terminal/` — which is the
    // shape the old row was written to forbid and the new one no longer does.
    const crossings: string[] = [];
    for (const file of readdirSync("src/data/adapters")) {
      for (const line of readFileSync(`src/data/adapters/${file}`, "utf8").split("\n")) {
        if (!/^\s*(?:import|export)\s+type\b/.test(line)) continue;
        if (!/from\s+["'][^"']*terminal\//.test(line)) continue;
        crossings.push(`${file}: ${line.trim()}`);
      }
    }

    expect(crossings).toHaveLength(1);
    expect(crossings[0]).toContain("TerminalCapabilities");
    // Named in the enforcement's own allow-list, not merely tolerated here.
    expect(readFileSync("tools/enforce/module-graph.mjs", "utf8")).toContain("TerminalCapabilities");
  });
});

describe("T2.7 (I11) — no adapter is required for a verb to be usable", () => {
  it("an entirely empty registry produces a document for every shape a verb can return", () => {
    const registry = createAdapterRegistry();
    for (const shape of SHAPES) {
      const doc = registry.adapt(
        resultOf({}, shape.stdout, shape.rawText ?? JSON.stringify(shape.stdout) ?? ""),
        CTX,
      );
      expect(validateDocument(doc).ok).toBe(true);
      expect(doc.blocks.length).toBeGreaterThan(0);
    }
  });
});
