// C09 I139, I140 — a panel's rails toned on every row, and a settled duration
// that is always drawn (T6.194, T6.195).
//
// **Seven ways to break it.** `paint`'s break guard (T6.194), the rails painted
// as one span again *with* the guard off — alone they survive, by design: the
// guard repairs them, so the two are one mutation and a lone rail revert is not
// a row (T6.194's own text) — then the settled formatter's finest band, its
// rounding-before-banding, the head reading the live counter, and the head
// drawing a figure for a clock that did not move.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass, strip } from "../mutate.mjs";

const ROOT = process.cwd();
const PAINT = "src/presentation/blocks/paint.ts";
const CONTAINERS = "src/presentation/blocks/kinds/containers.ts";
const STATUS = "src/presentation/blocks/kinds/status.ts";
const DOCUMENTS = "src/shell/documents.ts";
const FILES = [
  "test/contract/blocks.test.ts",
  "test/revert/blocks.test.ts",
  "test/unit/settled-duration.test.ts",
  "test/contract/tool-call.test.ts",
  "test/integration/confirm.test.ts",
  "test/contract/rows-arm.test.ts",
].join(" ");

const CONTROL = {
  // **A change the corpus can see** (F1254): a negative duration is the one
  // input `settled` answers with nothing, and T1.153 states it.
  file: STATUS,
  from: 'if (!Number.isFinite(ms) || ms < 0) return "";\n  const hundredths',
  to: 'if (!Number.isFinite(ms) || ms < 0) return "?";\n  const hundredths',
  why: "a negative figure reads `?` — if this survives, T1.153 is not reading settled",
};

const MUTATIONS = [
  {
    name: "T6.194: paint keeps a span's style across a break",
    file: PAINT,
    from: '    } else if (span.text.includes("\\n")) {',
    to: '    } else if (span.text.includes("\\u0000")) {',
    expect: "T2.232",
  },
  {
    // The pair: either alone is repaired by the other, so the property is
    // pinned by both being reverted together.
    name: "T6.194: the rails one span painted and split, with paint's guard off",
    file: CONTAINERS,
    from: "    const rail = Array.from({ length: Math.max(1, total) }, () => paint([{ text: g.vertical, style: dim }]));",
    to: '    const rail = paint([{ text: Array.from({ length: Math.max(1, total) }, () => g.vertical).join("\\n"), style: dim }]).split("\\n");',
    also: [{
      file: PAINT,
      from: '    } else if (span.text.includes("\\n")) {',
      to: '    } else if (span.text.includes("\\u0000")) {',
    }],
    expect: "T2.232",
  },
  {
    name: "T6.195: settled has no hundredths band",
    file: STATUS,
    from: "  if (hundredths < 10) return",
    to: "  if (hundredths < 0) return",
    expect: "T1.153",
  },
  {
    name: "T6.195: settled bands the unrounded figure",
    file: STATUS,
    from: "  if (tenths < 100) return",
    to: "  if (ms < 10_000) return",
    expect: "T1.153",
  },
  {
    name: "T6.195: the settled head reads the live counter",
    file: DOCUMENTS,
    from: "    parts.push(settled(call.elapsedMs));",
    to: "    parts.push(elapsed(call.elapsedMs));",
    expect: "T2.46",
  },
  {
    name: "a clock that did not move draws a figure beside `denied`",
    file: DOCUMENTS,
    from: "call.elapsedMs !== undefined && call.elapsedMs > 0 && isSettled(call)",
    to: "call.elapsedMs !== undefined && isSettled(call)",
    expect: "T4.92",
  },
];

const { read, write } = fsIo(ROOT);

const named = () => {
  const hit = [{ name: "control", ...CONTROL }, ...MUTATIONS].find((m) => read(m.file).includes(m.to));
  return hit === undefined ? "the clean tree" : hit.name;
};
const run = () => {
  const label = named();
  let out;
  try {
    out = execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const both = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    out = e.killed === true ? `${both}\nTIMED OUT after 300000ms` : both;
  }
  const fails = [...new Set(strip(out).split("\n").filter((l) => /^\s*FAIL\s/u.test(l)).map((l) => l.trim()))];
  console.log(`── ${label}: ${String(fails.length)} FAIL line(s)`);
  for (const l of fails) console.log(`   ${l}`);
  return out;
};

const results = runPass({ read, write, run, control: CONTROL, mutations: MUTATIONS });

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
