// C23 I104, C22 I88/I111/I153/I154 and C28 I66 — design check I2, I4, I5, I6, I7
// and I12: a call head toned per token, a blank gutter under the hook, the
// echo's wash, the prompt's muted mark, the label defaulting to the name, and a
// card that names no key (T6.126, T6.158–T6.160, T6.107, T6.21).
//
// **One mutation per site, each the shape the design check found**: the outcome
// in the furniture's voice, the argument and the verb losing their tones, the
// wash not applied, the mark unpainted and painted at 1 bit, the label default
// gone, the bar back under the hook, and the two key hints back in the cards.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const DOCUMENTS = "src/shell/documents.ts";
const PAINT = "src/shell/paint.ts";
const CONFIG = "src/shell/config.ts";
const LAYOUT = "src/shell/entry-layout.ts";
const VERDICT = "src/shell/profiling/panes/verdict.ts";
const APP = "src/shell/profiling/panes/app.ts";
const FILES = [
  "test/unit/call-head-tones.test.ts",
  "test/contract/call-state.test.ts",
  "test/unit/frame-budget.test.ts",
  "test/unit/session-paint.test.ts",
  "test/unit/session-config.test.ts",
  "test/unit/profile-deck.test.ts",
].join(" ");

const { read, write } = fsIo(ROOT);
const run = () => {
  let out;
  try {
    out = execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    if (e.killed === true) out = `${out}\nTIMED OUT after 300000ms`;
  }
  const fails = out
    .replace(/\x1b\[[0-9;]*m/g, "")
    .split("\n")
    .filter((l) => /^\s*FAIL\s/.test(l));
  console.error(`  -- FAIL lines: ${fails.length === 0 ? "none" : `\n${fails.join("\n")}`}`);
  return out;
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change the corpus can see**: the muted separator's tone.
    file: DOCUMENTS,
    from: 'out.push({ text: "(", tone: "muted" }',
    to: 'out.push({ text: "(", tone: "dim" }',
    why: "the parenthesis is `dim` — if this survives, T1.108 is not reading the span tones",
  },
  mutations: [
    {
      name: "T6.126: the outcome spanned muted with the furniture",
      file: DOCUMENTS,
      from: "    muted(sep);\n    out.push({ text: part });",
      to: "    muted(sep);\n    out.push({ text: part, tone: \"muted\" });",
      expect: "T1.108",
    },
    {
      name: "T6.126: the argument loses its identifier tone",
      file: DOCUMENTS,
      from: '{ text: call.args, tone: "identifier", elide: true }',
      to: "{ text: call.args, elide: true }",
      expect: "T1.108",
    },
    {
      name: "T6.126: the verb loses its default tone",
      file: DOCUMENTS,
      from: '{ text: call.name, tone: "default" }',
      to: "{ text: call.name }",
      expect: "T1.108",
    },
    {
      name: "T6.158: the echo is not washed",
      file: PAINT,
      from: "if (ground?.background === undefined) return rows.map",
      to: "if (ground?.background !== null) return rows.map",
      expect: "T1.187",
    },
    {
      name: "T6.159: the prompt's mark left unpainted",
      file: PAINT,
      from: "if (replaced || deps.capabilities.colourDepth === 1) return rows;",
      to: "return rows;",
      expect: "T1.188",
    },
    {
      name: "T6.159: the prompt's mark painted at 1 bit",
      file: PAINT,
      from: "if (replaced || deps.capabilities.colourDepth === 1) return rows;",
      to: "if (replaced) return rows;",
      expect: "T1.188",
    },
    {
      name: "T6.159: the prompt's mark painted over a question",
      file: PAINT,
      from: "if (replaced || deps.capabilities.colourDepth === 1) return rows;",
      to: "if (deps.capabilities.colourDepth === 1) return rows;",
      expect: "T1.188",
    },
    {
      name: "T6.160: the label's default gone",
      file: CONFIG,
      from: "return chrome.label !== undefined ? chrome : Object.freeze({ ...chrome, label: () => name });",
      to: "return chrome;",
      expect: "T1.189",
    },
    {
      name: "T6.107: the bar back under the hook",
      file: LAYOUT,
      from: '{ first: lead(), rest: "blank" }',
      to: '{ first: lead(), rest: "bar" }',
      expect: "T1.48",
    },
    {
      name: "T6.21: the verdict card's walk hint back",
      file: VERDICT,
      from: "\\`/profile <section>\\`${ctx.sep}",
      to: "\\`n\\`/\\`p\\` walk the cards${ctx.sep}",
      expect: "T1.130",
    },
    {
      name: "T6.21: the frame-gone line's Press n back",
      file: APP,
      from: "\\`/profile app\\` again draws the frames still retained",
      to: "Press \\`n\\` for one that is still there",
      expect: "T1.130",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
