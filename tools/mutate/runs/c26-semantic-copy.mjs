// C26 §5c — the transcript's selection and semantic copy, mutated.
//
// **The first mutation here is copy taking the element's rendering rather than
// its source**, and it is the one the whole feature exists to be different from.
// A copy assembled from the painted cells is *what is on screen*: it passes
// every assertion about what is on screen, and it carries a truncation, an
// ellipsis, a marker column, and none of the columns the width dropped. A raw
// terminal's drag-select gives exactly that, which is why this being different
// is the payoff rather than a nicety.
//
// The rest attack the joints the selection shares with C17's, one level up: the
// anchor, the collapse, and the one clipboard.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/table.test.ts test/unit/session-keys.test.ts " +
  "test/unit/router-focus.test.ts";
const TABLE = "src/presentation/table/definition.ts";
const FOCUS = "src/interaction/router/focus.ts";
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

const MUTATIONS = [
  {
    // **The rendering, not the source.** Only the columns that survived this
    // width, in the order the plan put them — which is the copy a reader would
    // get by dragging, and is wrong about every column the width dropped.
    name: "the copy is assembled from the columns this width kept",
    file: TABLE,
    from: "  return block.columns.map((c) => r.cells[c.key]?.text ?? \"\").join(\"\\t\");",
    to: "  return planColumns(block.columns, 60).visible.map((c) => r.cells[c.column.key]?.text ?? \"\").join(\"\\t\");",
    expect: "T1.42",
  },
  {
    // **Truncated to the planned width.** Subtler than the above and the same
    // class: every column is present and each value is the painted one, so a
    // row asserting *which columns* agrees completely.
    name: "each value is cut to its planned width",
    file: TABLE,
    from: "  return block.columns.map((c) => r.cells[c.key]?.text ?? \"\").join(\"\\t\");",
    to: "  return block.columns.map((c) => (r.cells[c.key]?.text ?? \"\").slice(0, c.minWidth)).join(\"\\t\");",
    expect: "T1.43",
  },
  {
    // **The anchor moves with the head.** C17 T1.23's defect one level up:
    // right on the first `⇧↓` and wrong on the second, and every assertion
    // about *a row being selected* still passes.
    name: "an extending motion moves the anchor",
    file: FOCUS,
    from: "        anchor: stored.anchor ?? stored.element,",
    to: "        anchor: element,",
    expect: "T1.43",
  },
  {
    // **An unshifted motion stops collapsing**, so a range survives the arrow
    // keys and `y` copies rows the reader walked away from.
    name: "focusRow no longer collapses the range",
    file: FOCUS,
    from: "      stored = Object.freeze({ at: \"liveBlock\", element, anchor: null, mode: \"navigate\" });\n    },\n\n    /**\n     * `⇧↑`/`⇧↓`",
    to: "      stored = Object.freeze({ at: \"liveBlock\", element, anchor: stored.anchor, mode: \"navigate\" });\n    },\n\n    /**\n     * `⇧↑`/`⇧↓`",
    expect: "T1.44",
  },
  {
    // **`⇧↑` walks out of the block**, taking the selection with it and leaving
    // nothing to copy — the unshifted motion's rule applied where it does not
    // belong.
    name: "extendRowUp leaves the block at the first element",
    file: KEYS,
    from: "      if (i === null || i === 0) return;\n      const prev = elements[i - 1];",
    to: "      if (i === null) return;\n      if (i === 0) return deps.focus.toPrompt();\n      const prev = elements[i - 1];",
    expect: "T1.45",
  },
  {
    // **The head alone, ignoring the anchor.** A range is selected, drawn and
    // extended, and `y` copies one row of it — which looks like a copy that
    // worked.
    name: "the copy takes the focused element rather than the range",
    file: KEYS,
    from: "        .slice(Math.min(anchor, head), Math.max(anchor, head) + 1)",
    to: "        .slice(head, head + 1)",
    expect: "T1.43",
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
    file: TABLE,
    from: "  return block.columns.map((c) => r.cells[c.key]?.text ?? \"\").join(\"\\t\");",
    to: "  return \"\";",
    why:
      "no element declares any source text — if this survives, nothing in the set reaches a " +
      "copy at all and every kill below is unearned",
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
