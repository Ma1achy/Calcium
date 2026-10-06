// Semantic copy mode — the two exits, the atomicity and the rung sharing.
//
// **The mutations here all leave a mode that works from the outside.** It is
// entered, `a` selects, `esc` gets out, the count moves. What changes is
// whether `⌃c` clears before leaving, whether the first `esc` leaves with a
// selection open, whether `a` is atomic, and whether the second target is a
// second *rung* — none of which a row about "does ⌥⇧V enter copy mode" can see.
//
// **The footer's mode label is parked** (C14 §6a), so the mode has no on-screen
// observable and the transition is the only place its rules can be reached.
// That is why the model is a pure function and why this run points at it: a
// rule whose only observation point is unbuilt is one no mutation can indict.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/semantic-selection.test.ts test/unit/router-focus.test.ts " +
  "test/unit/router-dispatch.test.ts test/unit/session-keys.test.ts test/unit/router-keymap.test.ts " +
  "test/integration/copy-drag.test.ts";
const MODEL = "src/shell/semantic-selection.ts";
const TYPES = "src/interaction/router/types.ts";
const ROUTER = "src/interaction/router/router.ts";

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
    // **C16 I51's asymmetry, collapsed the plausible way.** Making the first
    // `esc` always leave is the reading of "esc gets you out" that every other
    // target has, and it takes the clear step away silently: a reader with a
    // selection open loses the mode instead of the selection, on a key they
    // pressed to undo the smaller thing.
    name: "esc always leaves, with or without a selection",
    file: MODEL,
    // Re-anchored for C14 I59: `escape` branches on `hasSelection`.
    from: "  return hasSelection(mode) ? frozen(mode.caret, null, new Set<string>()) : null;",
    to: "  return null;",
    expect: "T1.41b",
  },
  {
    // **The same rule from the other end.** Never leaving on `esc` is the
    // symmetrical error and is worse, because the mode is then unleavable by
    // the key the footer tells the reader to press.
    name: "esc only ever clears, and never leaves",
    file: MODEL,
    from: "  return hasSelection(mode) ? frozen(mode.caret, null, new Set<string>()) : null;",
    to: "  return frozen(mode.caret, null, new Set<string>());",
    expect: "T1.41b",
  },
  {
    // **The caret dropped on a clear.** A clear that also forgot where the
    // reader was is a mode that still works and starts over each time — and the
    // count, which is what a reader watches, is identical either way.
    name: "clearing the selection also drops the caret",
    file: MODEL,
    from: "  return hasSelection(mode) ? frozen(mode.caret, null, new Set<string>()) : null;",
    to: "  return hasSelection(mode) ? frozen(null, null, new Set<string>()) : null;",
    expect: "T1.41b",
  },
  // **"the ⌃c rung clears first instead of leaving" is retired with the rung**
  // (C16 I62, ruling 59): copy mode rejects the interrupt, so there is no
  // semantic-selection `⌃c` rung to route anywhere. T1.41f now asserts the
  // refusal, and `c16-ownership.mjs` mutates the reject path itself.
  {
    // **Two rungs where the design has one** (C16 I50). Mapping the mode to
    // `substate` leaves every routing test green — it is still a target, it
    // still takes its keys — and quietly drops it out of every rule written
    // over the `copy` rung, starting with `page-scroll`'s refusal to move a
    // frozen screen.
    name: "the mode gets a rung of its own instead of sharing `copy`",
    file: TYPES,
    from: '  semanticSelection: "copy",',
    to: '  semanticSelection: "substate",',
    expect: "T1.41g",
  },
  {
    // C14 I47 — the footer's `⏎ copy` with nothing bound, as it shipped.
    name: "⏎ is unbound at semanticSelection",
    file: "src/interaction/router/keymap.ts",
    // Re-anchored for C16 §6c: the row spreads `fromRegistry` where it called `chordOf`.
    // Re-anchored for C14 I59: ⏎ is the copy that leaves.
    from: '  { target: "semanticSelection", ...fromRegistry("confirm"), action: "copyAndLeaveSemanticSelection" },\n',
    to: "",
    expect: "T1.47",
  },
  {
    // **T6.43, C14 I65 (F1409)** — the symmetric reading the finding asked
    // about: every entry the selection touches copied whole, which supplies the
    // first entry's head that the selection never took.
    name: "a touched entry is copied whole",
    file: MODEL,
    from: "    .map((e) => copySequence(e.blocks.filter((b) => selected.has(keyOf(e.id, b.id)))))",
    to: "    .map((e) => copySequence(e.blocks.some((b) => selected.has(keyOf(e.id, b.id))) ? e.blocks : []))",
    expect: "T4.48",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254's neighbour): entering
    // never produces a mode at all, so every row in the set that asserts the
    // mode is up fails. If this survives, nothing below reaches the model and
    // every kill is unearned.
    file: MODEL,
    from: "  return mode ?? frozen(caret, null, new Set<string>());",
    to: "  return null;",
    why:
      "entering produces no mode, so nothing in the set can select, clear or leave — " +
      "if this survives, no row reaches the model and every kill below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
