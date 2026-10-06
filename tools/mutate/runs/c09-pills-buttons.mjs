// C09 I139 / C04 I151 — a `pills` row drawn as buttons, mutated.
//
// The subject is the confirm host's answers (C23 I104), so the first thing this run
// has to say is that the geometry and the three rungs are held by rows that can fail:
// the chrome priced into the packing, the render branch, the chip's own tone, the
// focus, and the wire's refusal of a non-boolean.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/stream-trail.test.ts test/contract/pills-buttons.test.ts";
const SIMPLE = "src/presentation/blocks/kinds/simple.ts";
const VALIDATE = "src/data/viewmodel/validate.ts";

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
    // **The chrome is not priced.** `measure` and `render` read the same packing, so
    // they agree with each other and with every width — and the third chip no longer
    // wraps at 40, which is the row that counts it.
    name: "the packing drops a button's chrome",
    file: SIMPLE,
    from: "    const w = cells(text, ambiguous) + chipChrome(block);",
    to: "    const w = cells(text, ambiguous);",
    expect: "T1.153b",
  },
  {
    // **The render branch is dead.** The block still measures as buttons and draws
    // as chips: right height, right labels, no wash and no brackets.
    name: "a buttons row draws as chips",
    file: SIMPLE,
    from: "          if (block.buttons === true) {\n            // **A button, drawn by",
    to: "          if (false) {\n            // **A button, drawn by",
    expect: "T1.153",
  },
  {
    // **The chip's tone is dropped.** §073's destructive pair — green to go, red to
    // stop — is one chip's ink, and a button that ignored it passes every row that
    // draws untoned chips.
    name: "a button ignores its chip's tone",
    file: SIMPLE,
    from: '            const own = chip?.tone ?? "default";',
    to: '            const own = "default";',
    expect: "T1.153",
  },
  {
    // **Nothing is focused.** The focused chip is the answer the reader is on, and a
    // row in which none is washed is a question with nothing selected.
    name: "no chip is ever focused",
    file: SIMPLE,
    from: "            const focused = id === head;\n            const own",
    to: "            const focused = false;\n            const own",
    expect: "T1.153",
  },
  {
    // **The wire accepts anything.** `"yes"` is truthy to nothing and falsy to
    // everything, and a row of answers that draws as chips is one whose buttons are
    // not buttons.
    name: "a non-boolean buttons is accepted",
    file: VALIDATE,
    from: '    if (buttons !== undefined && typeof buttons !== "boolean")',
    to: "    if (false)",
    expect: "T2.156",
  },
  {
    // **A button's hit area is its label.** The element is where a pointer lands, and
    // a click on the pad or a bracket is a click on the button at every rung.
    name: "a button's element drops its chrome",
    file: SIMPLE,
    from: '      const cw = cells(text, "narrow") + chipChrome(block);',
    to: '      const cw = cells(text, "narrow");',
    expect: "T2.156b",
  },
];

/** Empty: every mutation above is caught by the row it names. */
const EXPECTED_SURVIVORS = new Map([]);

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: SIMPLE,
    from: "    ctx.probe?.gauge(\"pills.chips\", block.chips.length);",
    to: "    ctx.probe?.gauge(\"pills.chips\", block.chips.length); return rows([\"\"]);",
    why:
      "a `pills` block that draws nothing at all — if this survives, no row in the set " +
      "reads the rendering and every kill below is unearned",
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
