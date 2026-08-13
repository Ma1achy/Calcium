// C17 §5b — the selection model, mutated.
//
// **The first mutation here was written before the tests it has to kill**, and
// it is the reason the model has the shape it has: an extending motion that
// moves the *anchor* instead of the head.
//
// That defect is correct in every single-motion test. Extend once from an empty
// selection and the region is `[cursor, target)` whichever end you moved —
// `anchor := target` and `head := cursor` describe the same two numbers. It
// only separates on the second motion, and a suite indexed by "does ⇧→ select a
// character" agrees with it completely.
//
// The rest attack the joints the model shares with what was already here:
// collapsing, one-unit replacement, and the kill buffer's opposite ruling.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/editor.test.ts test/contract/editor.test.ts";
const EDITOR = "src/interaction/editor/editor.ts";

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
    // **The one the model was shaped against.** Written first, before any row
    // it kills. Right on the first keystroke, wrong on the second, and every
    // assertion about "⇧→ selects a character" still passes.
    name: "an extending motion moves the anchor instead of the head",
    file: EDITOR,
    from: "    this.#anchor ??= this.#cursor;\n    this.#cursor = clamp(this.#target(motion), count(this.#text));\n  }\n\n  selectAll",
    to: "    this.#anchor = clamp(this.#target(motion), count(this.#text));\n  }\n\n  selectAll",
    expect: "T1.23",
  },
  {
    // **The anchor re-placed on every extension.** Subtler than the above and
    // the same class: `=` for `??=` keeps the head moving correctly and drags
    // the anchor one step behind it, so every region is exactly one grapheme.
    name: "the anchor is re-placed on every extension, not only the first",
    file: EDITOR,
    from: "    this.#anchor ??= this.#cursor;",
    to: "    this.#anchor = this.#cursor;",
    expect: "T1.23",
  },
  {
    // **An unshifted motion stops collapsing.** The model becomes visible
    // everywhere: a region survives arrow keys and the next thing typed
    // replaces text the user was not looking at.
    name: "an unshifted motion no longer collapses",
    file: EDITOR,
    from: "    this.#anchor = null;\n    this.#cursor = clamp(this.#target(motion), count(this.#text));",
    to: "    this.#cursor = clamp(this.#target(motion), count(this.#text));",
    expect: "T1.26",
  },
  {
    // **Two units instead of one.** The replacement records its own snapshot,
    // so `undo` restores a buffer with the region already gone — an undo that
    // did half the job, and the text is *correct* after two of them.
    name: "typing over a region is two undo units",
    file: EDITOR,
    from: "    this.#takeSelection();\n\n    const { head, tail } = splitAt(this.#text, this.#cursor);",
    to: "    if (this.#takeSelection()) this.#history.edit(this.#snapshot(), \"structural\");\n\n    const { head, tail } = splitAt(this.#text, this.#cursor);",
    expect: "T1.28",
  },
  {
    // **The region AND a character.** The natural implementation, and
    // indistinguishable from the correct one whenever the region is one
    // grapheme wide — which is why the row that catches it uses three.
    name: "deleteBackward removes the region and a character",
    file: EDITOR,
    from: "      this.#takeSelection();\n      return;\n    }\n    if (this.#cursor <= 0) return;",
    to: "      this.#takeSelection();\n    }\n    if (this.#cursor <= 0) return;",
    expect: "T1.29",
  },
  {
    // **`killTo` cuts the region instead of collapsing.** Plausible — it looks
    // like consistency — and it gives one operation two answers to where the
    // cut goes. The kill buffer's contents are what say which was taken.
    name: "killTo cuts the region rather than collapsing",
    file: EDITOR,
    from: "    this.#anchor = null;\n    const to = clamp(this.#target(motion), count(this.#text));",
    to: "    const sel = this.selection;\n    this.#anchor = null;\n    const to = sel === null ? clamp(this.#target(motion), count(this.#text)) : Math.max(sel.anchor, sel.head);",
    expect: "T1.30",
  },
  {
    // **A region survives an undo**, which is the kill buffer's rule applied to
    // the wrong subject. It points at whatever characters now occupy those
    // indices, which after an undo is a different string.
    name: "a region survives undo",
    file: EDITOR,
    from: "    this.#cursor = clamp(s.cursor, count(s.text));\n    // **A region does not survive an undo**",
    to: "    this.#cursor = clamp(s.cursor, count(s.text));\n    if (false)\n    // **A region does not survive an undo**",
    expect: "T1.31",
  },
  {
    // **The second clipboard, arrived by accident.** Appending instead of
    // replacing is what a reader who remembers §5's consecutive-kill rule
    // writes, and it makes the buffer hold text from two different gestures
    // with no way to tell which `⌃y` will paste.
    name: "a copy appends to the kill buffer rather than replacing it",
    file: EDITOR,
    from: "    this.#kill = text;",
    to: "    this.#kill += text;",
    expect: "T1.33",
  },
  {
    // **Where ending the kill run actually happens, and the pass is what found
    // that.** `copy()` called `endKill()` itself and the mutation removing it
    // SURVIVED — every path to a region goes through `extend` or `selectAll`,
    // both of which end the run first, so the call could never be the thing
    // that did it. A line with nothing to be wrong about reads exactly like one
    // that is obeyed. It is gone, and this is the mutation that bites.
    name: "extend does not end the kill run, so a copy joins it",
    file: EDITOR,
    from: "  extend(motion: Motion): void {\n    this.#history.close();\n    this.#history.endKill();",
    to: "  extend(motion: Motion): void {\n    this.#history.close();",
    expect: "T1.36",
  },
  {
    // **A copy records an undo unit.** Nothing changed, so `undo` becomes a
    // no-op the user has to press twice — and the text after one press is
    // correct, which is how it reads as a near-miss.
    name: "a copy records an undo unit",
    file: EDITOR,
    from: '    this.#kill = text;',
    to: '    this.#history.edit(this.#snapshot(), "structural");\n    this.#kill = text;',
    expect: "T1.34",
  },
  {
    // **The empty guard removed**, so `⌥w` on a bare caret discards whatever a
    // previous kill put in the buffer. Same shape as `yank`'s guard.
    name: "a copy with no region empties the buffer",
    file: EDITOR,
    from: '    if (text === "") return;',
    to: '    if (false) return;',
    expect: "T1.35",
  },
];

/**
 * Survivors with a reason, and a staleness arm.
 *
 * Empty: every mutation above is expected to be caught. An entry would name a
 * mutation the suite cannot see and why that is acceptable — and the pass fails
 * if a listed mutation is caught after all, so an entry cannot outlive its
 * reason.
 */
const EXPECTED_SURVIVORS = new Map([]);

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: EDITOR,
    from: "  extend(motion: Motion): void {",
    to: "  extend(_motion: Motion): void {\n    return;\n  }\n  extendUnused(motion: Motion): void {",
    why:
      "extending does nothing at all — if this survives, no row in the set reaches a selection " +
      "and every kill below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
const stale = results.filter((r) => r.killed && EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length + stale.length > 0 ? 1 : 0);
