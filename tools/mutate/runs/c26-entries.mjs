// C26 §4g — block-to-block focus: the ceiling lifts, mutated.
//
// **Every mutation here restores the ceiling or a piece of it.** `focusedEntryId`
// answering `liveId` unconditionally was the tree's state for the life of C26
// until §4g; the others are the forms the walk's rows were written against — a
// row activated from the wrong entry, `↑` at a settled head leaving to the
// prompt, the interaction gate widened back, and the decoder taking any
// parameterised `CSI Z` as `⇧tab`.
//
// Anchors and expectations are Lane D's, each run by hand with the row it names
// on 2026-09-03; this file is the record of that run, and `anchors.mjs` watches
// the anchors between runs.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/session-navigation.test.ts test/unit/router-focus.test.ts test/unit/router-decode.test.ts";

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
    file: "src/shell/construct.ts",
    from: "    if (stores.transcript.entries.some((e) => e.id === at.entryId)) return at.entryId;\n    return stores.transcript.liveId;",
    to: "    return stores.transcript.liveId;",
    why: "the ceiling restored — `focusedEntryId` answers `liveId` unconditionally, which was the tree's state before §4g; T3.40 (and T3.41, T3.42, T3.44, T3.45) fail, and T3.43 survives by design because it asserts the fallback",
  },
  mutations: [
    {
      name: "rowActivate takes liveId as the origin",
      file: "src/shell/keys.ts",
      from: "      const from = deps.focusedEntryId();\n      if (action === undefined || from === null) return;",
      to: "      const from = deps.liveEntryId();\n      if (action === undefined || from === null) return;",
      expect: "T3.41",
    },
    {
      name: "↑ at a settled head leaves to the prompt",
      file: "src/shell/keys.ts",
      from: "        if (i === null || deps.focusedEntryId() === deps.liveEntryId()) deps.focus.toPrompt();",
      to: "        deps.focus.toPrompt();",
      expect: "T3.40",
    },
    {
      name: "interaction gate widened back to any live entry",
      file: "src/interaction/router/focus.ts",
      from: "    deps.liveEntry !== null &&\n    deps.stored.entryId === deps.liveEntry.id",
      to: "    deps.liveEntry !== null",
      expect: "T3.45",
    },
    {
      // `router-decode.test.ts` answers this one, which is why it is in CMD.
      name: "CSI Z takes any parameterised form",
      file: "src/interaction/router/decode.ts",
      from: "    if (final === \"Z\" && body === \"\")",
      to: "    if (final === \"Z\")",
      expect: "T3.13",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
