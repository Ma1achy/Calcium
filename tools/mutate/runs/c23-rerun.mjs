// C23 §3a — re-run from a settled entry is refused with a hint, mutated.
//
// **An action from a frozen entry is refused** (`actions.ts`), and the refusal
// names the command so the reader can re-run it for a live copy. The mutations
// are the refusal removed, the re-run reading `liveId` instead of the focused
// entry (the ceiling again, on this verb), and the hint dropping the command.
//
// Anchors and expectations are Lane D's, each run by hand on 2026-09-03.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/actions-rerun.test.ts test/unit/execution.test.ts test/unit/session-navigation.test.ts";

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
    file: "src/shell/actions.ts",
    // Re-anchored 2026-09-05: `expand` became C23 I18's one exception (C04 §3c S4),
    // applied by hand and T1.17b died.
    from: "    if (action.kind !== \"expand\" && isFrozen(deps.transcript, from)) {",
    to: "    if (false as boolean) {",
    why: "the refusal removed — execution T1.17, actions-rerun T1.17b and session-navigation T3.41 fail; a run in which a frozen entry can dispatch and stay green cannot see the gate",
  },
  mutations: [
    {
      name: "rerun reads liveId",
      file: "src/shell/construct.ts",
      from: "    const id = focusedEntryId();\n    if (id === null) return;\n    const entry = stores.transcript.entries.find((e) => e.id === id);",
      to: "    const id = stores.transcript.liveId;\n    if (id === null) return;\n    const entry = stores.transcript.entries.find((e) => e.id === id);",
      expect: "T4.61",
    },
    {
      name: "the notice drops the command",
      file: "src/shell/actions.ts",
      from: "      const hint = command === \"\" ? \"\" : ` Re-run \\`${command}\\` for a live copy.`;",
      to: "      const hint = \"\";",
      expect: "T1.17b",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
