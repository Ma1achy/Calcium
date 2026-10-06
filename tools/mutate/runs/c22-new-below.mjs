// C22 §6u.2 — the new-messages button (I154, I155, §067).
//
// The count is read off C13's changes and C14's `followTail`, and the button is a
// paint and a press, so the suite is two unit files and one integration file and
// nothing here needs `dist/`. Each mutation names the row that kills it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/new-messages.test.ts test/integration/new-messages.test.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: "src/shell/new-below.ts",
    from: "    count: () => n,",
    to: "    count: () => 0,",
    why: "every row asserts a count above zero somewhere; a counter that always answers 0 is a run that cannot see a kill",
  },
  mutations: [
    {
      name: "a count is taken while the transcript follows the tail",
      file: "src/shell/new-below.ts",
      from: "    if (following()) return;\n    const entry",
      to: "    const entry",
      expect: "T1.188",
    },
    {
      name: "the running entry is counted at its append",
      file: "src/shell/new-below.ts",
      from: '    if (change.kind === "append" && entry.streaming) return;',
      to: "",
      expect: "T1.188",
    },
    {
      name: "the reader's own entry is counted",
      file: "src/shell/new-below.ts",
      from: '    if (origin === "user" || origin === "action") return;',
      to: "",
      expect: "T4.123",
    },
    {
      name: "the viewport reaching the tail does not reset the count",
      file: "src/shell/new-below.ts",
      from: "    if (following()) n = 0;",
      to: "    void 0;",
      expect: "T1.188",
    },
    {
      name: "clear leaves the count standing",
      file: "src/shell/new-below.ts",
      from: "      n = 0;\n      return;",
      to: "      return;",
      expect: "T1.188",
    },
    {
      name: "one message is plural",
      file: "src/shell/paint.ts",
      from: 'n === 1 ? "message" : "messages"',
      to: '"messages"',
      expect: "T1.189",
    },
    {
      name: "the button is drawn in a region too short to spare the row",
      file: "src/shell/paint.ts",
      from: "frame.region.height >= NEW_BELOW_MIN_ROWS ? (deps.newBelow?.() ?? 0) : 0",
      to: "(deps.newBelow?.() ?? 0)",
      expect: "T1.189",
    },
    {
      name: "the button takes the region's first row",
      file: "src/shell/paint.ts",
      from: "if (button !== null) out[out.length - 1] = button;",
      to: "if (button !== null) out[0] = button;",
      expect: "T1.189",
    },
    {
      name: "a press anywhere on the row reaches the tail",
      file: "src/shell/construct.ts",
      from: "        e.col >= NEW_BELOW_INDENT &&\n        e.col < NEW_BELOW_INDENT + cells(label, detection.capabilities.ambiguousWidth)",
      to: "        true",
      expect: "T4.123",
    },
    {
      name: "a press on any row reaches the tail",
      file: "src/shell/construct.ts",
      from: "        label !== null &&\n        e.row === region.top + region.height - 1 &&",
      to: "        label !== null &&",
      expect: "T4.123",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
