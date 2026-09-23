// The freeze — a held view over a record that keeps moving (C14 §6b).
//
// **Every mutation here leaves a mode that enters, selects and leaves.** The
// screen still stops moving, `y` still copies, the count still climbs. What
// changes is *which* of the two documents each reader sees — which is the whole
// of §6b, and none of it is visible from a row about the mode working.
//
// The one that matters most is the copy's: a hold implemented in the paint path
// alone freezes the screen correctly and copies the record, and the two disagree
// by exactly the content the freeze exists to keep out of the reader's way (A6).
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/copy-freeze.test.ts test/integration/copy-freeze.test.ts";
const CONSTRUCT = "src/shell/construct.ts";
const SESSION = "src/shell/session.ts";

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
    // **The hold in the paint path alone** — §6b A6's defect, built. The screen
    // is held correctly and the clipboard takes the record; every row about the
    // frame passes, and the only thing wrong is what the reader ends up with.
    // **Aimed at the one owner rather than at a caller**, and the first draft
    // was not: the choice was a `??` repeated in three readers, so a mutation
    // on any one of them could not be seen by a test that computed the same
    // expression itself. The survivor was the finding, and the repair was to
    // give the question a single site (F277's *ask why the mutation cannot
    // reach the test*, answered by moving the code rather than the row).
    name: "the document the frame draws is the record rather than the held view",
    file: CONSTRUCT,
    from: "        return heldView?.entries ?? transcript.entries;",
    to: "        return transcript.entries;",
    expect: "T1.33",
  },
  {
    // **The held viewport built over the record.** It is the obvious way to
    // write it — one store, one measurer — and the index then tracks a document
    // the frame is not drawing, which is A2.
    name: "the held viewport is built over the live store",
    file: CONSTRUCT,
    from: "        heldViewport = createViewport(heldView, viewportOptions);",
    to: "        heldViewport = createViewport(transcript, viewportOptions);",
    expect: "T1.30",
  },
  {
    // **A spread that evaluates the getter once.** The graph would carry the
    // live viewport for the life of the session and every row about the freeze
    // would pass against a hold that never reached the frame.
    name: "the graph captures the viewport instead of reading it per call",
    file: CONSTRUCT,
    from: "    get viewport() {\n      return stores.viewport;\n    },\n    get documentEntries() {",
    to: "    viewport: stores.viewport,\n    get documentEntries() {",
    expect: "T1.31",
  },
  {
    // **The count taken from the view rather than as the difference.** It reads
    // as *how much is held* and is the size of the document, so it is non-zero
    // the moment the mode opens and says nothing about anything arriving.
    name: "the buffered count is the held size instead of the difference",
    file: CONSTRUCT,
    from: "        return Math.max(0, transcript.entries.length - heldView.entries.length);",
    to: "        return heldView.entries.length;",
    expect: "T1.34",
  },
  {
    // **The ticker left running** (C14 I35). The document is perfectly held and the
    // spinner turns anyway, because the frame index is a counter no document
    // carries — the one clause the hold cannot reach.
    name: "the ticker keeps running under the hold",
    file: SESSION,
    from: "    if (this.#semantic !== null) return;\n    const now = this.config.clock();",
    to: "    const now = this.config.clock();",
    expect: "T4.34",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254): freezing produces no
    // held view at all, so every row that names one fails. If this survives,
    // nothing below reaches the hold.
    file: CONSTRUCT,
    from: "      freezeView(size: Readonly<{ width: number; height: number }>): void {\n        if (heldView !== null) return;",
    to: "      freezeView(size: Readonly<{ width: number; height: number }>): void {\n        if (size !== null) return;",
    why:
      "freezing produces no held view, so every row naming one fails — " +
      "if this survives, nothing below reaches the hold and every kill is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
