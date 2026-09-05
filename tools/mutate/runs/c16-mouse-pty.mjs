// C16 I31 — the mouse through a PTY (T5.6–T5.8), mutated at the decoder.
//
// **Why the decoder and not the router or the hit test.** `c16-mouse-wiring.mjs`
// already mutates `construct.ts`'s translation and the router's `find`, and every
// row it names fed the decoder from a string. What the tier-5 rows add is the
// one stage no fake reaches — the bytes a terminal writes, decoded by the
// process that read them — so the mutations here are the two translations that
// live *inside* `decode.ts` and that every fake-decoder row walks past.
//
// **The expected survivor is the finding.** Dropping the decoder's
// `capabilities.mouse` gate alone leaves T5.8 green: `routeMouse` has a second
// gate over the same record, so either alone is invisible to every row and the
// control is protected twice. Two guards over one condition is the drift shape
// C16 §5 names for `busy`; it is recorded here rather than closed, because the
// router's gate is what keeps a *decoded* event from a fake stdin out too.
//
// Runs the built artefact: tier 5 imports `dist/`, so `run` builds first.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npm run build && npx vitest run test/e2e/mouse.test.ts --no-file-parallelism";
const DECODE = "src/interaction/router/decode.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // **The 1-based wire, read as 0-based.** Every fake-decoder row still passes
    // because the fake never went through this line; T5.6 highlights the row
    // *below* the pointer — the second entry's first row, three rows away from
    // an assertion that only checked containment.
    name: "the row translation drops its - 1",
    file: DECODE,
    from: "        row: Math.max(0, Number(y) - 1),",
    to: "        row: Math.max(0, Number(y)),",
    expect: "T5.6",
  },
  {
    // **Wheel directions swapped.** Bits 0–1 under bit 64 select the direction;
    // the table is the only place the mapping is written.
    name: "wheelUp and wheelDown exchange places",
    file: DECODE,
    from: 'const WHEEL_DIRECTIONS = ["wheelUp", "wheelDown", "wheelLeft", "wheelRight"] as const;',
    to: 'const WHEEL_DIRECTIONS = ["wheelDown", "wheelUp", "wheelLeft", "wheelRight"] as const;',
    expect: "T5.7",
  },
  {
    // **The decoder's gate alone** — see the header. Expected to survive.
    name: "the decoder decodes mouse bytes under a record with mouse: false",
    file: DECODE,
    from: "    if (!capabilities.mouse) return consumed;\n\n    const [b, x, y]",
    to: "    const [b, x, y]",
    expect: "T5.8",
  },
];

const EXPECTED_SURVIVORS = new Map([
  [
    "the decoder decodes mouse bytes under a record with mouse: false",
    "routeMouse gates on the same record (`deps.mouseEnabled()`), so a decoded event under mouse: false " +
      "is dropped one stage later and T5.8 cannot tell the two gates apart — recorded in C16 T6.9h",
  ],
]);

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: DECODE,
    from: "    if (!capabilities.mouse) return consumed;\n\n    const [b, x, y]",
    to: "    return consumed;\n\n    const [b, x, y]",
    why: "the decoder never emits a mouse event — if T5.6 and T5.7 survive this, no row reaches the decoder",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
const stale = results.filter((r) => r.killed && EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length + stale.length > 0 ? 1 : 0);
