// C11 I15 — a table narrower than its gutter: the body reaches zero and every
// row is cut at the exit. Mutated (C11 T6.28–T6.30).
//
// **One mutation is deliberately absent, with its reason.** Flooring the body
// at one again fails nothing: behind the exit cut, a one-cell body's three-cell
// row is trimmed to exactly what a zero body draws. It indicted I15's sentence,
// which now says the cut is the guarantee — a mutation that can never fail is a
// finding, not a row on this list.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/edge/table.test.ts test/revert/table.test.ts";
const TABLE = "src/presentation/table/definition.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: TABLE,
    from: "const cut = (row: string): string => fitRow(row, width);",
    to: "const cut = (row: string): string => `${fitRow(row, width)}!`;",
    why: "every row one cell past the width after the cut, which T3.22's width sweep sees on its first row",
  },
  mutations: [
    {
      name: "UNCUT: the main exit returns the rows as drawn",
      file: TABLE,
      from: "    return parts.map(cut);\n  },\n};",
      to: "    return parts;\n  },\n};",
      expect: "T3.22",
    },
    {
      name: "EMPTY-UNCUT: the empty table's exit returns the rows as drawn",
      file: TABLE,
      from: "      return parts.map(cut);",
      to: "      return parts;",
      expect: "T3.22",
    },
    {
      name: "INDENT-UNFLOORED: the detail's indent over a zero body is 0 − 1",
      file: TABLE,
      from: "const inset = Math.max(0, inner - insetWidth(inner));",
      to: "const inset = inner - insetWidth(inner);",
      expect: "T3.22",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
