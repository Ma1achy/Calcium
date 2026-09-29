// C16 I62–I65, C15 I29, C22 I133, C23 I82 — the ownership ladder, mutated
// (review batch 2, M5).
//
// **Three mechanisms that each read as the other when broken.** A reject that
// runs the rung first, a refusal nobody explains, and an owner line naming a
// chord nobody bound all leave a frame that looks like a working session: the
// question is still up, the mode is still frozen, the footer still has chips.
// So each mutation below names the row that sees the difference, and T6.37–T6.44
// are C16 §8's own list; the rest are this round's C16 I65, C22 I133 and ruling 60 sites.
//
// The control is the reject as it shipped before I62: the owning rung runs
// first, so `⌃c` at a question answers it with its default.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/router-dispatch.test.ts test/integration/confirm.test.ts test/unit/overlay.test.ts " +
  "test/unit/session-construct.test.ts test/unit/session-paint.test.ts test/integration/session.test.ts " +
  "test/unit/semantic-selection.test.ts";
const ROUTER = "src/interaction/router/router.ts";
const INTERCEPTS = "src/interaction/router/intercepts.ts";
const CONFIRM = "src/shell/confirm.ts";
const MANAGER = "src/viewport/overlay/manager.ts";
const CONSTRUCT = "src/shell/construct.ts";
const CHROME = "src/shell/chrome.ts";
const KEYMAP = "src/interaction/router/keymap.ts";

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
    file: ROUTER,
    from: '      if (declared === "reject") return refuse(rung, "intercept");\n',
    to: '      if (declared === "reject") {\n        runRung(activeTarget(inputs()), e);\n        return refuse(rung, "intercept");\n      }\n',
    why: "T6.37 — the reject as it shipped before C16 I62: the owning rung runs first, and ⌃c answers the question",
  },
  mutations: [
    {
      // T6.38 (I62, ruling 59) — the interrupt handled at a question again.
      name: "the interrupt's question verdict back to handle",
      file: INTERCEPTS,
      from: '    copy: "reject",\n    question: "reject",\n',
      to: '    copy: "reject",\n    question: "handle",\n',
      expect: "T4.81b",
    },
    {
      // T6.39 (I62) — consumed, and nobody told.
      name: "the refused call deleted from refuse",
      file: ROUTER,
      from: "    stages.push(\"reject\");\n    deps.refused({ rung, cause });\n    return true;\n",
      to: "    stages.push(\"reject\");\n    return true;\n",
      expect: "T1.165",
    },
    {
      // T6.40 (C23 I82) — the second refusal updates again. A frame diff cannot
      // see it; the row counts updates and invalidates.
      name: "the one-shot guard deleted from the question's refuse",
      file: CONFIRM,
      from: "          if (refused || suspended || replying !== null) return;\n",
      to: "          if (suspended || replying !== null) return;\n",
      expect: "T4.82",
    },
    {
      // T6.41 (I64) — `⌥↑` falls to the ladder and the question classifies it.
      name: "the global-intercept dispatch deleted",
      file: ROUTER,
      from: '      if (declared === "global-intercept") {\n',
      to: '      if (declared === "global-intercept" && e.kind === "focus") {\n',
      expect: "T1.40",
    },
    {
      // T6.42 (I65) — a release answers the next question.
      name: "the release path given back to every target",
      file: ROUTER,
      from: '      if (target === "child" && run(target, e)) return true;\n      stages.push("release-dropped");\n',
      to: '      if (run(target, e)) return true;\n      stages.push("release-dropped");\n',
      expect: "T1.169",
    },
    {
      // T6.43 (C15 I29) — a declared owner its fields contradict is placed.
      name: "the owner check deleted from assertPlaceable",
      file: MANAGER,
      // Re-anchored in review batch 3: the owner is read off a widened view,
      // because the union types a peek's owner as absent (C15 I30).
      from: "  if (owner !== undefined) {\n    const agrees =\n",
      to: "  if (owner !== undefined && layer.id === \"\") {\n    const agrees =\n",
      expect: "T1.34",
    },
    {
      // T6.44 (C16 I62, C16 I44) — the guard explains twice: its mark and a notice.
      name: "refused called from the guard's branch as well",
      file: ROUTER,
      from: '      stages.push("question-guard");\n      stages.push("reject");\n      return true;\n',
      to: '      stages.push("question-guard");\n      stages.push("reject");\n      deps.refused({ rung: rungNow(), cause: "blocked" });\n      return true;\n',
      expect: "T1.165",
    },
    {
      // Ruling 62 — the child's unbound key falls to `global` again, and F1 at
      // a delegation submits `/help keys` behind it.
      name: "the child rung stops consuming",
      file: ROUTER,
      from: '    if (target === "child") {\n      stages.push("child:consumed");\n      return true;\n    }\n',
      to: "",
      expect: "T4.84",
    },
    {
      // C22 I133 — the scope line spells its own newline chord again.
      name: "the newline chip spelled rather than looked up",
      file: CHROME,
      from: '        ...keyed(hints, "prompt", ["insertNewline"], "newline", caps),\n',
      to: '        { label: hint([{ name: "enter", shift: true }], "newline", caps), tone: "muted" },\n',
      expect: "T1.77",
    },
    {
      // C22 I133 — the copy line names the caret's arrows for extend.
      name: "the copy line's extend chip reads the caret's rows",
      file: CHROME,
      // Re-anchored for C14 I60: the rectangle adds the horizontal pair.
      from: '? ["extendSemanticSelectionUp", "extendSemanticSelectionDown"]',
      to: '? ["moveSemanticCaretUp", "moveSemanticCaretDown"]',
      expect: "T1.171",
    },
    {
      // C22 I133, C15 I29 — the substate's declared name never reaches the line.
      name: "the substate name dropped from the hints",
      file: CONSTRUCT,
      from: '        ...(top?.rung === "substate" ? { substate: top.name } : {}),\n',
      to: "",
      expect: "T1.77",
    },
    {
      // C22 I133 — `esc →` names the first choice rather than the default.
      name: "the question's safe path resolves to its first choice",
      file: CONFIRM,
      from: "          resolvesTo: defaultChoice(opts.choices).label,\n",
      to: "          resolvesTo: opts.choices[0]?.label ?? \"\",\n",
      expect: "T1.171",
    },
    {
      // Ruling 60 — semantic copy mode's refusal draws nothing.
      name: "the copy-mode refusal never sets the chip",
      file: CONSTRUCT,
      from: '    else if (r.rung === "copy" && deps.frame.semanticSelection()) copyRefused = true;\n',
      to: "",
      expect: "T4.83",
    },
    {
      // Ruling 60 — the chip outlives the key it described.
      name: "the copy-mode chip is never taken down",
      file: CONSTRUCT,
      from: "      copyRefused = false;\n      router.dispatch(e);\n",
      to: "      router.dispatch(e);\n",
      expect: "T4.83",
    },
    {
      // C22 I133 — the first-row order the find line reads. `⇥` first again:
      // the line would say `↑⇥ hits`.
      name: "menuNext's rows back in their old order",
      file: KEYMAP,
      // Re-anchored for C16 §6c: the rows spread `fromRegistry` where they
      // called `chordOf`.
      from:
        '  { target: "panel", ...fromRegistry("move.down"), action: "menuNext" },\n' +
        '  { target: "panel", ...fromRegistry("focus.next"), action: "menuNext" },\n',
      to:
        '  { target: "panel", ...fromRegistry("focus.next"), action: "menuNext" },\n' +
        '  { target: "panel", ...fromRegistry("move.down"), action: "menuNext" },\n',
      expect: "T1.77",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
