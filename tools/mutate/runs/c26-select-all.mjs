// C26 §5c, I16 — select-all and the selection's edges, mutated.
//
// **Four mutations, and three of them are states the tree has shipped.** The
// tail-stop keeping a selection alive and the stale anchor falling to the
// block's first element were both measured at bd93056e before the rows that
// kill them were written (§5c table row g, trace row 3); the one-element
// special case is the branch-on-count the effect was written not to have. The
// first is the brief's own: a select-all that moves the head only is right
// whenever focus is already on the first element, which is why T3.46 starts
// from the second.
//
// Anchors and expectations are Lane S's, each applied by hand on 2026-09-05
// against the two files in CMD: every mutation killed exactly the rows named.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/session-navigation.test.ts test/unit/session-keys.test.ts";
const KEYS = "src/shell/keys.ts";

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
    file: KEYS,
    from: "      deps.editor.copyText(text);\n",
    to: "",
    why: "`y` writes nothing — every copy row in both files fails (T1.42, T3.46), so a run that cannot see this cannot see the clipboard",
  },
  mutations: [
    {
      // **The brief's mutation.** Head only: the anchor is wherever focus was.
      name: "select-all moves the head only",
      file: KEYS,
      from: "      deps.focus.focusRow(entry, addressOf(first));\n      deps.focus.extendRow(entry, addressOf(last));",
      to: "      deps.focus.extendRow(entry, addressOf(last));",
      expect: "T3.46",
    },
    {
      // The shipped state at bd93056e: `rowDown` at the tail issued no store
      // call, so `↓` did not collapse and `y` copied two rows.
      name: "a stopped ↓ no longer collapses",
      file: KEYS,
      from: "      const target = next ?? elements[i];",
      to: "      const target = next;",
      expect: "T3.49",
    },
    {
      // The shipped state at bd93056e: the anchor through `resolveFocus`, whose
      // fall lands on the block's first element and widens the copy.
      name: "a stale anchor falls to the block's first element",
      file: KEYS,
      from: "      const anchor = exact === -1 ? head : exact;",
      to: "      const anchor =\n        exact === -1 ? (anchorAt === null ? head : (resolveFocus(anchorAt, elements) ?? head)) : exact;",
      expect: "T3.50",
    },
    {
      // The branch on the count. Honouring the prose sentinel literally by
      // refusing to select a one-element entry: right for `n > 1` and tested by
      // nothing that does not construct `n === 1`.
      name: "a one-element entry is not selected",
      file: KEYS,
      from: "      if (first === undefined || last === undefined || entry === null) return;",
      to: "      if (first === undefined || last === undefined || entry === null || first === last) return;",
      expect: "T3.47",
    },
  ],
});

// **Printed and exited on, not merely computed.** The first version of this file
// read `report(results);` — the string built and dropped, no exit status — so the
// pass ran five mutations, restored the tree, and wrote nothing: exit 0 with no
// witness, the same bit as a clean pass (F768).
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
