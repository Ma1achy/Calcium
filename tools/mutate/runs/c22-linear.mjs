// C22 §6m, C01 I22, C02 I15 — linear rendering (§107, ruling 29).
//
// **Two halves, and the second is where a defect hides.** The event half is a
// table — §6m.2's rows, each a change and the lines it writes — and its
// defects read as a plausible stream: a fact said twice, a figure read out
// cell by cell, a notice's text spoken as its name and again as its source.
// The writing half is the one line linear edits in place, and its defects are
// silences: a key refused with nothing said, a commit that rewrites an
// unchanged line for a screen reader to speak again.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const LINEAR = "src/shell/linear.ts";
const CONSTRUCT = "src/shell/construct.ts";
const CONFIRM = "src/shell/confirm.ts";
const SESSION = "src/shell/session.ts";
const HANDLERS = "src/shell/local/handlers.ts";
const CAPS = "src/terminal/capabilities.ts";
const LIFECYCLE = "src/terminal/lifecycle.ts";
const FILES = [
  "test/unit/linear.test.ts",
  "test/integration/linear.test.ts",
  "test/unit/capabilities.test.ts",
  "test/unit/lifecycle.test.ts",
].join(" ");

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 600_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 600000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change every row can see** (F1254): every line the stream writes
    // gains a trailing mark, so T1.74's first equality parts at once.
    file: LINEAR,
    from: 'const clean = (line: string): string => stripControl(line).replaceAll("\\t", "  ").trimEnd();',
    to: 'const clean = (line: string): string => `${stripControl(line).replaceAll("\\t", "  ").trimEnd()}~`;',
    why: "every written line ends in `~`, so T1.74's first equality fails",
  },
  mutations: [
    {
      // I120 — deduplication is by fact.
      name: "a second settle writes the completion again",
      file: LINEAR,
      from: "  if (!state.said.has(done)) {\n    state.said.add(done);",
      to: "  if (!state.said.has(done) || change.kind === \"settle\") {\n    state.said.add(done);",
      expect: "T1.74",
    },
    {
      // §6m.2 row 4 — a block replaced after settle is not new.
      name: "a replaced block is read again after settle",
      file: LINEAR,
      from: "(b) => b !== headOf(entry.doc) && !read.has(b.id));",
      to: "(b) => b !== headOf(entry.doc));",
      expect: "T1.74",
    },
    {
      // I124 — a failure is assertive.
      name: "a failed completion is polite",
      file: LINEAR,
      from: '      level: failed(entry.doc) ? "assertive" : "polite",',
      to: '      level: "polite",',
      expect: "T1.74",
    },
    {
      // I124 — an appended error or warning is assertive.
      name: "an appended error notice is polite",
      file: LINEAR,
      from: '    level: fresh.some(isLoud) ? "assertive" : "polite",',
      to: '    level: "polite",',
      expect: "T1.74",
    },
    {
      // I121, §6m.5 — a figure reads its name and nothing else.
      name: "a figure reads its source",
      file: LINEAR,
      from: '  if (node.role === "figure") return [head];\n',
      to: "",
      expect: "T1.75",
    },
    {
      // I121 — a notice's name is its text; it is not said twice.
      name: "a source line equal to the name is written again",
      file: LINEAR,
      from: "  return [head, ...sourceLines(deps.copyOf(block)).filter((l) => l !== name)];",
      to: "  return [head, ...sourceLines(deps.copyOf(block))];",
      expect: "T1.75",
    },
    {
      // I123 — a commit that changes nothing writes nothing.
      name: "an unchanged input line is rewritten on every commit",
      file: LINEAR,
      from: "      if (next === shown) return;\n",
      to: "",
      expect: "T4.102",
    },
    {
      // I122, C16 I44 — the armed guard is stated on the cue.
      name: "the cue does not say the guard is armed",
      file: CONSTRUCT,
      from: 'const ready = router.ownerArmed ? " (ready in a moment)" : "";',
      to: 'const ready = "";',
      expect: "T4.103",
    },
    {
      // I122 — `2` is the second choice.
      name: "a number answers the choice after it",
      file: CONFIRM,
      from: "? opts.choices[Number(name) - 1] : undefined;",
      to: "? opts.choices[Number(name)] : undefined;",
      expect: "T4.103",
    },
    {
      // I122 — the number is linear's; rich mode has a picture to point at.
      name: "numbers answer on every route",
      file: CONFIRM,
      from: "deps.numbered === true && /^[1-9]$/u.test(name)",
      to: "/^[1-9]$/u.test(name)",
      expect: "T4.103",
    },
    {
      // I119 — linear has no frame, so no size gate.
      name: "the size gate runs on the linear route",
      file: SESSION,
      from: "    if (this.#graph.linear === null && tooSmall(size)) {",
      to: "    if (tooSmall(size)) {",
      expect: "T4.102",
    },
    {
      // C01 I22 — linear never takes the mouse.
      name: "linear takes the mouse",
      file: LIFECYCLE,
      from: '      if (!linear && capabilities.mouse) take("mouse"); // I10, C01 I22',
      to: '      if (capabilities.mouse) take("mouse"); // I10, C01 I22',
      expect: "T1.30",
    },
    {
      // C02 I15 — the environment states the route.
      name: "the route read from the environment reads as assumed",
      file: CAPS,
      from: '  return value === "linear" || value === "rich" ? [value, "stated"] : ["rich", "assumed"];',
      to: '  return value === "linear" || value === "rich" ? [value, "assumed"] : ["rich", "assumed"];',
      expect: "T1.15",
    },
    {
      // I125 — the route first.
      name: "/capabilities lists the route in record order",
      file: HANDLERS,
      from: '        "renderMode" as const,\n        ...(Object.keys(values) as (keyof TerminalCapabilities)[]).filter((f) => f !== "renderMode"),',
      to: '        ...(Object.keys(values) as (keyof TerminalCapabilities)[]),',
      expect: "T4.104",
    },
  ],
});

// Printed and exited on, not merely computed (F768).
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
