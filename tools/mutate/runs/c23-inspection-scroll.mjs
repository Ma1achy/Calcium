// C23 I88 — an inspection scrolls its payload (review batch 4, shell lane,
// §6q.4 ruling 7).
//
// **The keys are consumed either way** (ruling 60 consumes every key in an
// inspection silently), so a scroll arm that does nothing is a key swallowed
// with a correct-looking frame. Each mutation names the row that reads where
// the box went.
//
// **The control** is the inspection's `scroll` arm answering "none": every key
// is consumed and no box moves, so T1.98 fails at the first `↓`.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CONFIRM = "src/shell/confirm.ts";
const FILES = "test/unit/question-routing.test.ts test/integration/confirm.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // T6.105 (C23 I88) — the inspection's scroll arm removed from `classify`.
    file: CONFIRM,
    from: '.includes(name) ? "scroll" : "none";',
    to: '.includes(name) ? "none" : "none";',
    why: "T6.105 — the inspection's scroll arm removed: T1.98's first ↓ leaves the offset at 0",
  },
  mutations: [
    {
      name: "a page is the whole interior, not the interior less one",
      file: CONFIRM,
      from: "      const page = Math.max(1, interior - 1);\n",
      to: "      const page = Math.max(1, interior);\n",
      expect: "T1.98",
    },
    {
      name: "an entry into the inspection keeps where the last one was left",
      file: CONFIRM,
      from: "      deps.inspectionBox?.reset();\n",
      to: "",
      expect: "T1.98",
    },
    {
      // C23 I88, the finding recorded with this lane — the box sized to the region
      // it is not drawn in, so the prompt slot's cut takes the key row.
      name: "the inspection's box is sized to the region, not the prompt's slot",
      file: CONFIRM,
      from: "(deps.slotRows?.() ?? deps.overlayRegion().height) - 6",
      to: "deps.overlayRegion().height - 6",
      expect: "T4.88",
    },
    {
      name: "a modified arrow scrolls the inspection",
      file: CONFIRM,
      from: 'return bareKey && (Object.values(QUESTION_KEYS.scroll)',
      to: 'return (Object.values(QUESTION_KEYS.scroll)',
      expect: "T1.98",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
