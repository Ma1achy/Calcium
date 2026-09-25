// C04 I135–I137, C22 I118, C16 I60 — the form (§3ar, §105).
//
// **Two halves, and the second is where a defect hides.** The drawing half is
// literals worked by hand from §105's figure: a hint cut rather than dropped,
// an error not hung under its own text, a `›` that follows focus — each draws
// a plausible form. The borrowing half is one editor with two owners in turn,
// and its defects read as ordinary editing: a blur that discards, a key that
// falls through to `liveBlock` and leaves the field, a frame one keystroke
// behind because the cache never saw the draft.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const KIND = "src/presentation/blocks/kinds/form.ts";
const SUBMIT = "src/shell/form-submit.ts";
const CACHE = "src/shell/render-cache.ts";
const CONSTRUCT = "src/shell/construct.ts";
const FILES = "test/unit/form.test.ts test/integration/form.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 600_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 600000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change every row can see** (F1254): one row more than is drawn, so
    // T1.60's measure sweep parts from the rendered rows at every width.
    file: KIND,
    from: "  measure: (block: Form, width: number): number => layout(block, width).height,",
    to: "  measure: (block: Form, width: number): number => layout(block, width).height + 1,",
    why: "measure is one more than the rows drawn at every width, so T1.60's sweep fails at width 1",
  },
  mutations: [
    {
      // §3ar S4 — the hint is decoration: whole or not at all.
      name: "a hint too wide for the field is drawn anyway",
      file: KIND,
      from: 'field.hint !== "" && cells(stripControl(field.hint)) <= room) {',
      to: 'field.hint !== "") {',
      expect: "T1.60",
    },
    {
      // §3ar S3 — the error hangs under its own text, past the `✗ `.
      name: "the error wraps at the field's width, not under its own text",
      file: KIND,
      from: "wrapCells(stripControl(field.error), Math.max(1, room - HANG))",
      to: "wrapCells(stripControl(field.error), Math.max(1, room))",
      expect: "T1.60",
    },
    {
      // §3ar S1 — below a one-cell field the labels stack.
      name: "the labels stack only below a zero-cell field",
      file: KIND,
      from: "  const stacked = wide < 1;",
      to: "  const stacked = wide < 0;",
      expect: "T1.60",
    },
    {
      // §3ar S7 — `›` marks the default, never focus.
      name: "`›` follows focus instead of the default",
      file: KIND,
      from: "const mark = b.index === primary ?",
      to: "const mark = focused ?",
      expect: "T1.60",
    },
    {
      // C04 I137 — a value is one quoted token.
      name: "a flagged value is not quoted",
      file: SUBMIT,
      from: ': `${flag} ${quote(f.value ?? "")}`;',
      to: ': `${flag} ${f.value ?? ""}`;',
      expect: "T1.61",
    },
    {
      // C04 I137 — an empty value is omitted, not sent as an empty flag.
      name: "an empty value is sent",
      file: SUBMIT,
      from: '.filter((f) => (f.value ?? "") !== "")',
      to: ".filter(() => true)",
      expect: "T1.61",
    },
    {
      // C22 I118 — the walk's measured defect: the frame keyed without the draft.
      name: "THE MEASURED DEFECT: the render cache does not key on the draft",
      file: CACHE,
      from: '\\u0000${focus.inside === true ? "in" : ""}\\u0000${draft}`;',
      to: '\\u0000${focus.inside === true ? "in" : ""}\\u0000${draft.slice(0, 0)}`;',
      expect: "T4.99",
    },
    {
      // C04 §3ar F5, F6 — one predicate: is focus still on the field.
      name: "a blur discards and a stay commits",
      file: CONSTRUCT,
      from: "      endField(!onIt);",
      to: "      endField(onIt);",
      expect: "T4.99",
    },
    {
      // C04 §3ar F6, F7 — the construction F7 rests on: after every event the
      // borrow follows focus, so a click elsewhere writes before a release can
      // activate. (F7 first had a seam of its own before every action; removing
      // it failed nothing, because no path reached it — F7 was amended.)
      name: "the borrow does not follow focus after an event",
      file: CONSTRUCT,
      from: "      // follows it here rather than at each place that can move it.\n      reconcileField();",
      to: "      // follows it here rather than at each place that can move it.",
      expect: "T4.100",
    },
    {
      // C16 I60 — a key the field does not own passes to `global`. (First
      // ruled a reject; flipping it to a pass failed nothing, because a pass
      // reaches no lower rung — I60 was amended, and F1 is the row's key.)
      name: "an unowned key is rejected, and help is withheld from a field",
      file: CONSTRUCT,
      from: "      // still answer and `↓`, bound at neither, is dropped on the field.\n      return false;",
      to: "      // still answer and `↓`, bound at neither, is dropped on the field.\n      return \"reject\";",
      expect: "T4.101",
    },
    {
      // C17 I29, R-QST-003 — a field owns no history.
      name: "a field takes the prompt's history keys",
      file: CONSTRUCT,
      from: '(a) => a !== "insertNewline" && a !== "historyPrev" && a !== "historyNext"),',
      to: '(a) => a !== "insertNewline"),',
      expect: "T4.101",
    },
    {
      // §089, C04 §3ar F9 — a line break refuses the paste, whole.
      name: "a multi-line paste is inserted",
      file: CONSTRUCT,
      from: "        if (/[\\r\\n]/u.test(e.text)) {",
      to: "        if (/[\\u0000]/u.test(e.text)) {",
      expect: "T4.101",
    },
  ],
});

// Printed and exited on, not merely computed (F768).
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
