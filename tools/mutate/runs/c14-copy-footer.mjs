// The copy rung's footer (C14 I55, I38, `R-SEL-005`, `R-SEL-009`, `R-SEL-015`).
//
// **Three facts on one line, and each can be lost alone**: which mode, how much
// a copy would take, and what the next `esc` does. Each mutation leaves a line
// that still names the rung, which is the part every older row asserted.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/semantic-selection.test.ts test/integration/copy-freeze.test.ts";
const CHROME = "src/shell/chrome.ts";
const MODEL = "src/shell/semantic-selection.ts";
const SESSION = "src/shell/session.ts";
const FRAME = "src/shell/frame.ts";

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
    // **As it shipped**: the clearing press labelled as the leaving one.
    name: "esc always says out",
    file: CHROME,
    from: 'hint([ESC], size === null ? "out" : "clear", caps)',
    to: 'hint([ESC], "out", caps)',
    expect: "T4.37g",
  },
  {
    name: "the count is never drawn",
    file: CHROME,
    from: "        ...(size === null\n          ? []\n          : [\n              {\n                label: [",
    to: "        ...(true\n          ? []\n          : [\n              {\n                label: [",
    expect: "T1.50",
  },
  {
    // **The handoff reads as the semantic mode**, advertising keys that reach
    // nothing while the terminal owns the mouse.
    name: "native reads as semantic",
    file: CHROME,
    from: '      if (copy?.mode === "native") {',
    to: '      if (copy?.mode === ("never" as string)) {',
    expect: "T1.50",
  },
  {
    name: "the header ignores the mode",
    file: CHROME,
    from: '? [{ label: ctx.copy?.mode === "native" ? "NATIVE" : "COPY", tone: "warn" as const }]',
    to: '? [{ label: "COPY", tone: "warn" as const }]',
    expect: "T1.50",
  },
  {
    name: "one is plural",
    file: CHROME,
    from: "`${String(n)} ${n === 1 ? one : many}`",
    to: "`${String(n)} ${many}`",
    expect: "T1.50",
  },
  {
    // **UTF-16 units for code points** — `𝄞` counts two.
    name: "chars counts code units",
    file: MODEL,
    from: "  let chars = 0;\n  for (const _ of text) chars += 1;",
    to: "  const chars = text.length; // cells-ok",
    expect: "T1.51",
  },
  {
    // **An entry that copies nothing is counted** — the block count's error,
    // one level up.
    name: "a declining entry contributes",
    file: MODEL,
    from: "    .map((e) => copySequence(e.blocks.filter((b) => selected.has(keyOf(e.id, b.id)))))\n    .filter((t) => t !== \"\");",
    to: "    .map((e) => copySequence(e.blocks.filter((b) => selected.has(keyOf(e.id, b.id)))))\n    .filter((t, i) => t !== \"\" || i >= 0);",
    expect: "T1.51",
  },
  {
    name: "the session supplies no copy state",
    file: SESSION,
    from: "      copy: () => this.#copyState(),",
    to: "      copy: () => undefined,",
    expect: "T4.37g",
  },
  {
    name: "compose drops the copy state",
    file: FRAME,
    from: "    ...(copy === undefined ? {} : { copy }),",
    to: "",
    expect: "T4.37g",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254): every copy footer
    // says `esc clear`, so the idle frames fail.
    file: CHROME,
    from: 'hint([ESC], size === null ? "out" : "clear", caps)',
    to: 'hint([ESC], "clear", caps)',
    why: "the idle copy footer says esc clear, so T1.50's and T4.37g's controls fail — if this survives, nothing reads the footer",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
