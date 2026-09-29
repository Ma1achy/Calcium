// C22 I135–I140 and C16 I76 — the watch set, the verbs, the footer's row and
// the row's keys, mutated (C22 T6.134–T6.136, C16 T6.64; ruling 50, §6p).
//
// **Each mutation is a plausible build of one §6p ruling going the other
// way**: the store dropping the watch before the notifier asks (two
// subscribers in the wrong order), the row shedding watches before bars, the
// default `/watch` finding the queued line it was typed as, and `⇧⇥` ignoring
// the watch set. The control is the store's release answering nothing, which
// T1.79 reads directly.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run --maxWorkers=3 test/unit/watches.test.ts test/integration/watches.test.ts";
const STORE = "src/shell/watches.ts";
const CONSTRUCT = "src/shell/construct.ts";
const CHROME = "src/shell/chrome.ts";
const HANDLERS = "src/shell/local/handlers.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: STORE,
    from: "    unwatch: (id) => watched.delete(id),",
    to: "    unwatch: () => false,",
    why: "T1.79 asserts `unwatch` answers true for a watch it released; a release that answers nothing cannot satisfy it",
  },
  mutations: [
    {
      // Two subscribers, registered in the order that reads naturally: the
      // store drops the watch at the settle, and the notifier then asks a set
      // that no longer holds it.
      name: "T6.134: the store's drop runs before the notifier's read",
      file: CONSTRUCT,
      from: "    notifier?.settled(change.id);\n    watches.settled(change.id);",
      to: "    watches.settled(change.id);\n    notifier?.settled(change.id);",
      expect: "T4.111",
    },
    {
      // **One span, because the order lives in two lines** (T6.135): the step
      // removed alone is equivalent — the ladder below draws its chips bare,
      // so with nothing to shed it returns the bare row. The first pass on
      // landing survived that single-line form.
      name: "T6.135: watches shed before bars — the bar step removed and the ladder keeping bars",
      file: CHROME,
      from: "  const bare = all(false);\n  if (width(bare) <= columns) return bare;\n\n  // Watches from the right, never the one the row is on — or, with no\n  // selection, the first, which is the oldest and the one `⇧⇥` lands on.\n  const keep = state.selected ?? 0;\n  const kept = state.items.map((_, i) => i);\n  let shed = 0;\n  const line = (): Chip[] => [\n    lead,\n    ...kept.map((i) => chipOf(i, false)),",
      to: "  const keep = state.selected ?? 0;\n  const kept = state.items.map((_, i) => i);\n  let shed = 0;\n  const line = (): Chip[] => [\n    lead,\n    ...kept.map((i) => chipOf(i, true)),",
      expect: "T1.78",
    },
    {
      name: "T6.136: the default target's `transport: \"local\"` filter removed",
      file: HANDLERS,
      from: '            .find((e) => e.streaming && e.doc.meta.transport !== "local");',
      to: "            .find((e) => e.streaming);",
      expect: "T1.80",
    },
    {
      name: "C16 T6.64: `focusPrevious` sends focus to the transcript whatever the watches",
      file: CONSTRUCT,
      from: "      if (first === undefined) return void focusTranscript();",
      to: "      return void focusTranscript();",
      expect: "T4.95",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
