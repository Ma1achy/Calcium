// docker-tui's `/ps` adapter — the reference app's first mutation pass.
//
// The discipline is Calcium's, one level up: a test file is not verified by
// passing, and 29 tests green on first write is when to be least trusting.
//
// **Two of these mutations are the app's own findings turned into guards.** F4
// is a ruling that was wrong the first time, and F3 is a hazard invisible until
// a far side that pre-truncates arrives — neither would be caught by a test
// written from the specs alone, because the specs were what got them wrong.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = `${process.cwd()}/examples/docker`;

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync("npx vitest run --dir test 2>&1", { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: "src/ps.ts",
    from: '      status: { text: str(raw, "Status"), glyph, tone },',
    to: '      status: { text: "", glyph, tone },',
    why: "walk C1 asserts the STATUS cell carries docker's prose verbatim",
  },
  mutations: [
    // --- the rulings the walk made ------------------------------------------
    {
      name: "the glyph derives from Status rather than State",
      file: "src/ps.ts",
      from: '  const { glyph, tone } = stateOf(str(raw, "State"));',
      to: '  const { glyph, tone } = stateOf(str(raw, "Status"));',
      expect: "C1 (R1.2, R5.1)",
    },
    {
      name: "Ports is parsed into the tidy form the drawing showed",
      file: "src/ps.ts",
      from: '      ports: ports === "" ? { text: "—", tone: "muted" } : { text: ports.replace(/\\s+/g, " ") },',
      to: '      ports: ports === "" ? { text: "—", tone: "muted" } : { text: ports.replace(/^\\S+:(\\d+)->(\\d+).*$/, "$1→$2") },',
      expect: "B2 (R1.4, R5.2)",
    },
    {
      name: "PORTS truncates from the start, losing the host port",
      file: "src/ps.ts",
      from: '  b.col("ports", { label: "PORTS", priority: 40, minWidth: 20, truncateFrom: "end" }),',
      to: '  b.col("ports", { label: "PORTS", priority: 40, minWidth: 20, truncateFrom: "start" }),',
      expect: "B2b (R3.4)",
    },
    {
      name: "the column priorities are flattened",
      file: "src/ps.ts",
      from: '  b.col("name", { label: "NAME", priority: 95, minWidth: 16, flex: true, sortable: true }),',
      to: '  b.col("name", { label: "NAME", priority: 40, minWidth: 16, flex: true, sortable: true }),',
      expect: "B2b (R3.4)",
    },

    // --- the transport boundary ---------------------------------------------
    {
      name: "the NDJSON split becomes one JSON.parse over the batch",
      file: "src/ps.ts",
      from: "  for (const line of raw.split(\"\\n\")) {",
      to: "  for (const line of [raw]) {",
      expect: "A2 (R3.5)",
    },
    {
      name: "a malformed line is dropped silently instead of counted",
      file: "src/ps.ts",
      from: "    } catch {\n      skipped += 1;\n    }",
      to: "    } catch {\n      /* dropped */\n    }",
      expect: "A2 (R3.5)",
    },
    {
      name: "parseError is read as a failure",
      file: "src/ps.ts",
      from: "      const failed = result.exitCode !== 0;",
      to: "      const failed = result.exitCode !== 0 || result.parseError !== null;",
      expect: "A1: a set parseError",
    },

    // --- the far side's own values ------------------------------------------
    {
      name: "a value docker already elided is elided again",
      file: "src/ps.ts",
      from: '      image: { text: str(raw, "Image") },',
      to: '      image: { text: str(raw, "Image").slice(0, 12) + "…" },',
      expect: "F3b:",
    },
    {
      name: "a non-string field is stringified rather than refused",
      file: "src/ps.ts",
      from: '  return typeof v === "string" ? v : "";',
      to: "  return v === undefined || v === null ? \"\" : String(v);",
      expect: "C4: a non-string field",
    },
    {
      name: "an unknown state borrows created's mark",
      file: "src/ps.ts",
      from: '  STATES[state] ?? { glyph: "bullet", tone: "muted" };',
      to: '  STATES[state] ?? { glyph: "queued", tone: "muted" };',
      expect: "C1b:",
    },
    {
      name: "the empty state stops naming the flag that would widen it",
      file: "src/ps.ts",
      from: '                emptyMessage: "no containers running · try /ps --all",',
      to: '                emptyMessage: "no containers",',
      expect: "C5 (R1.6, R3.1)",
    },
    {
      name: "comma-joined names lose everything after the first",
      file: "src/ps.ts",
      from: "    names.length > 1 ? { detail: [b.kv({ names: names.join(\", \") })] } : undefined,",
      to: "    undefined,",
      expect: "C3 (R1.3)",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
