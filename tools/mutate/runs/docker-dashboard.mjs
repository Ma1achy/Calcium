// docker-tui's landing dashboard — the mutation pass.
//
// The discipline is Calcium's: a test file is not verified by passing, and this
// suite went green on first write, which is when to be least trusting.
//
// **Several of these are the frame's findings turned into guards.** The NAME
// column's glyph, the flex decision, the collapse's selection order and the
// toned bar's glyph were all wrong in code that passed its tests — three found
// by reading a real frame, one by a test that constructed a machine busier than
// this one. A mutation that restores any of them must go red on the assertion
// that names it, or the assertion was written to agree with the code.
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
    file: "src/dashboard.ts",
    from: "export const LIVE_STATES = new Set([\"running\", \"paused\", \"restarting\"]);",
    to: "export const LIVE_STATES = new Set([\"running\"]);",
    why: "walk A1 asserts the panel's membership includes paused",
  },
  mutations: [
    // --- the join, and what each source is authoritative for -----------------
    {
      name: "stats decides membership instead of ps -a",
      file: "src/dashboard.ts",
      from: "  return snap.containers",
      to: "  return snap.stats",
      expect: "A2 (R1.2)",
    },
    {
      name: "an unmeasured container reports zero rather than absent",
      file: "src/dashboard.ts",
      from: "  return m === null ? null : Number(m[1]);",
      to: "  return m === null ? 0 : Number(m[1]);",
      expect: "A3",
    },
    {
      name: "a bare number is accepted as a percentage",
      file: "src/dashboard.ts",
      from: "  const m = /^([0-9]+(?:\\.[0-9]+)?)%$/.exec(raw.trim());",
      to: "  const m = /^([0-9]+(?:\\.[0-9]+)?)%?$/.exec(raw.trim());",
      expect: "A4b",
    },

    // --- the bar, and the ceiling that is not 100 ----------------------------
    {
      name: "CPU is clamped to 100, so busy and saturated render alike",
      file: "src/dashboard.ts",
      from: "  const text = `${glyphs} ${value.toFixed(1)}%`.padEnd(CPU_WIDTH - GLYPH_SLOT);",
      to: "  const text = `${glyphs} ${Math.min(100, value).toFixed(1)}%`.padEnd(CPU_WIDTH - GLYPH_SLOT);",
      expect: "A4",
    },
    {
      name: "the glyph slot is not reserved, so the column reflows when a container gets hot",
      file: "src/dashboard.ts",
      from: "const CPU_WIDTH = GLYPH_SLOT + BAR_CELLS + 1 + 6;",
      to: "const CPU_WIDTH = BAR_CELLS + 1 + 6;",
      expect: "C4",
    },

    // --- the totals, which are two different kinds of number ------------------
    {
      name: "the CPU total is clamped, making a sum look like a utilisation",
      file: "src/dashboard.ts",
      from: "    cpu: `${sum((c) => c.cpu).toFixed(0)}%`,",
      to: "    cpu: `${Math.min(100, sum((c) => c.cpu)).toFixed(0)}%`,",
      expect: "A6",
    },
    {
      name: "MemPerc is summed where CPUPerc is meant",
      file: "src/dashboard.ts",
      from: "    cpu: `${sum((c) => c.cpu).toFixed(0)}%`,",
      to: "    cpu: `${sum((c) => c.memPerc).toFixed(0)}%`,",
      expect: "A6",
    },

    // --- the collapse, and the two orders it needs ---------------------------
    {
      name: "the tail collapses at SHOWN, so `… 1 more` costs the line it saves",
      file: "src/dashboard.ts",
      from: "  const collapse = live.length > SHOWN + 1;",
      to: "  const collapse = live.length > SHOWN;",
      expect: "A7",
    },
    {
      name: "the collapse selects by name, hiding the busiest container",
      file: "src/dashboard.ts",
      from: "    ? [...live].sort((x, y) => (y.cpu ?? -1) - (x.cpu ?? -1) || x.name.localeCompare(y.name)).slice(0, SHOWN)",
      to: "    ? [...live].slice(0, SHOWN)",
      expect: "A7b",
    },
    {
      name: "the shown rows keep the significance order, so rows move between ticks",
      file: "src/dashboard.ts",
      from: "  const shown = [...chosen].sort((x, y) => x.name.localeCompare(y.name));",
      to: "  const shown = chosen;",
      expect: "A7b",
    },

    // --- the order the daemon does not promise -------------------------------
    {
      name: "rows render in daemon order",
      file: "src/dashboard.ts",
      from: "    .sort((x, y) => x.name.localeCompare(y.name));",
      to: "    .slice();",
      expect: "A8",
    },

    // --- the title, which cannot carry anything that changes (F16) -----------
    {
      name: "the counts move back into the title, where they freeze",
      file: "src/dashboard.ts",
      from: 'export const LIVE_TITLE = "RUNNING";',
      to: 'export const LIVE_TITLE = "RUNNING (5)";',
      expect: "C1 (F16)",
    },
    {
      name: "the summary leaves the body, so nothing recomputes it per tick",
      file: "src/dashboard.ts",
      from: "    b.notice(\"muted\", summaryLine(live)),",
      to: "    b.notice(\"muted\", \"containers\"),",
      expect: "C1 (F16)",
    },

    // --- the boundaries the frame found --------------------------------------
    {
      name: "NAME is sized from the name alone, ignoring the glyph beside it",
      file: "src/dashboard.ts",
      from: "  b.col(\"name\", { label: \"NAME\", priority: 95, minWidth: NAME_CELLS + GLYPH_CELLS }),",
      to: "  b.col(\"name\", { label: \"NAME\", priority: 95, minWidth: NAME_CELLS }),",
      expect: "C3",
    },
    {
      name: "USAGE flexes again, taking the width NAME needs",
      file: "src/dashboard.ts",
      from: "  b.col(\"usage\", { label: \"USAGE\", priority: 40, minWidth: 18 }),",
      to: "  b.col(\"usage\", { label: \"USAGE\", priority: 40, minWidth: 18, flex: true }),",
      expect: "C3b",
    },

    // --- the empty state, which must still be a panel ------------------------
    {
      name: "zero running renders no table at all",
      file: "src/dashboard.ts",
      from: '      emptyMessage: "nothing running · every container is stopped",',
      to: '      emptyMessage: "",',
      expect: "A9",
    },

    // --- the shared NDJSON parse ---------------------------------------------
    {
      name: "the whole batch is parsed as one document, so one bad line loses every container",
      file: "src/ndjson.ts",
      from: "  for (const line of raw.split(\"\\n\")) {",
      to: "  for (const line of [raw]) {",
      expect: "A2 (R3.5)",
    },
  ],
});

console.log(report(results));
// **`killed`, not `caught`** — the field this harness sets. Written as
// `r.caught` it read `undefined` on every result and exited 1 unconditionally,
// so the exit code carried no information at all: a clean pass and a survivor
// were the same number. The survivor this pass did find (C4, comparing
// `minWidth` against a string padded to the same constant) was caught by
// reading the report text, which is the only channel that ever worked here.
//
// Third instance today of one class — a result read through a channel that
// cannot express it. The others were `make all | tail` reporting tail's status,
// and a `@ts-expect-error` satisfied by a `null` rather than by the type under
// test. `examples/docker/VERIFYING.md` carries the rule.
process.exit(results.some((r) => !r.killed) ? 1 : 0);
