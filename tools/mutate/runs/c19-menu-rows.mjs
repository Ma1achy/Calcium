// C19 I32, I33, I34 — a row marks its match and draws its hint beside the label,
// the status row counts and names the keys, and the ghost is the current's
// remainder (design check I9; T6.31, T6.32, T6.33).
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass, strip } from "../mutate.mjs";

const ROOT = process.cwd();
const MENU = "src/interaction/completion/menu.ts";
const ENGINE = "src/interaction/completion/engine.ts";
const KEYS = "src/shell/keys.ts";
const CHROME = "src/shell/chrome.ts";
const FILES = [
  "test/unit/completion-rows.test.ts",
  "test/integration/completion-rows.test.ts",
  "test/revert/completion-rows.test.ts",
  "test/integration/completion-as-you-type.test.ts",
  "test/integration/completion.test.ts",
  "test/integration/session.test.ts",
  "test/edge/completion.test.ts",
].join(" ");

const CONTROL = {
  // **A change the corpus can see**: no match span is ever drawn.
  file: MENU,
  from: "  if (prefix === \"\" || !label.startsWith(prefix)) return undefined;",
  to: "  return undefined;",
  why: "no label is ever marked — if this survives, the rows are not reading the match",
};

const MUTATIONS = [
  {
    name: "T6.31: the hint right-aligned again",
    file: MENU,
    from: "        align: \"left\",\n        priority: 1,",
    to: "        align: \"right\",\n        priority: 1,",
    expect: "T1.73",
  },
  {
    name: "T6.31: the accent kept over a toned label",
    file: MENU,
    from: "...(toned ? {} : { tone: \"accent\" as const })",
    to: "...{ tone: \"accent\" as const }",
    expect: "T1.73",
  },
  {
    name: "T6.31: the hint column in default ink",
    file: MENU,
    from: "detail: { text: c.detail ?? \"\", tone: \"muted\" },",
    to: "detail: { text: c.detail ?? \"\" },",
    expect: "T4.13",
  },
  {
    name: "T6.32: the count dropped for the old indicator",
    file: MENU,
    from: "  return Object.freeze([top, body, statusRow(shown, shown + Math.max(0, remainder), facts.keys ?? [], facts.width)]);",
    to: "  return remainder <= 0 ? Object.freeze([top, body]) : Object.freeze([top, body, { kind: \"raw\", id: `${MENU_ID}-more`, text: `+ ${String(remainder)} more` } satisfies Block]);",
    expect: "T1.74",
  },
  {
    name: "T6.32: a key shed before the count (the row never sheds)",
    file: MENU,
    from: "  while (n > 0 && !fits(n)) n -= 1;",
    to: "",
    expect: "T1.74",
  },
  {
    name: "T6.32: the chrome count back to one row when nothing is cut",
    file: MENU,
    from: "const MENU_CHROME = 2;",
    to: "const MENU_CHROME = 1;",
    expect: "T1.74",
  },
  {
    name: "T6.32: the rest keys spelled as §029's specimen",
    file: CHROME,
    from: "    return [\n      ...keyParts(hints, \"prompt\", [\"submit\"], \"run\", caps),",
    to: "    return [\n      ...keyParts(hints, \"panel\", [\"menuPrev\", \"menuNext\"], \"move\", caps),\n      ...keyParts(hints, \"prompt\", [\"submit\"], \"run\", caps),",
    expect: "T4.13",
  },
  {
    name: "T6.33: the ghost a unique match's only",
    file: KEYS,
    from: "    return hasMenu() ? ghostOf(ctx.prefix, candidates[selection.at ?? 0]) : deps.completion.ghost(ctx);",
    to: "    return deps.completion.ghost(ctx);",
    expect: "T4.13",
  },
  {
    name: "T6.33: the chip guard removed",
    file: ENGINE,
    from: "  if (candidate === undefined || candidate.chip !== undefined) return null;",
    to: "  if (candidate === undefined) return null;",
    expect: "T1.75",
  },
  {
    name: "T6.33: the ghost ignores the selection (always the first candidate)",
    file: KEYS,
    from: "ghostOf(ctx.prefix, candidates[selection.at ?? 0])",
    to: "ghostOf(ctx.prefix, candidates[0])",
    expect: "T4.13",
  },
];

const { read, write } = fsIo(ROOT);

/**
 * **Which rows failed, printed after every run** (F1472). The pass reports
 * `caught` when the named row's id is anywhere in the output, and vitest prints
 * a passing row's line under a file where another row failed, so the verdict
 * alone cannot say the named row went red. The `FAIL` lines can.
 */
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

const results = runPass({
  read,
  write,
  run,
  control: CONTROL,
  mutations: MUTATIONS,
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
