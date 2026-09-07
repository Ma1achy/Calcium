// C04 I97, I98 — the tail and the collapsed form, mutated.
//
// **Every mutation here is a way the follow ruling could be right in prose and
// wrong in the mechanism.** The ruling is *derived from where the box ended up,
// never from which way the reader went* (C14 I5, one level down), and three of
// the rows below ask the store a question that reads as the same one — where
// the reader *was*, where an untouched box *starts*, whether the landing is
// *written* — and each has a row that dies.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/contract/scroll-follow.test.ts test/contract/tool-call.test.ts " +
  "test/unit/actions-expand.test.ts test/contract/document-view.test.ts";
const CONTAINERS = "src/presentation/blocks/kinds/containers.ts";
const OFFSETS = "src/shell/scroll-offsets.ts";
const VIEW = "src/shell/document-view.ts";
const ACTIONS = "src/shell/actions.ts";

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
    // **`wasAtBottom` against the new list** — the brief's own mutation. Asked
    // of the grown document, every reader is at the bottom of the old one, so
    // the window moves under a reader who had scrolled up.
    name: "the document view asks were-we-at-the-bottom of the new list",
    file: VIEW,
    from: "        offset: followTail(at.offset, lastOffset(at), lastOffset(grown)),",
    to: "        offset: followTail(at.offset, lastOffset(grown), lastOffset(grown)),",
    expect: "T4.47",
  },
  {
    // The store's copy of the same defect: the snap decided from where the
    // reader *was* rather than where they *ended up*. A page up from the tail
    // resolves to the ceiling, reads as at-the-tail, and is written back as
    // `TAIL` — the follow cannot be left.
    name: "the store derives the follow from where the reader was, not where they landed",
    file: OFFSETS,
    from: "      held.set(blockId, atTail(next, box.ceiling) ? TAIL : next);",
    to: "      held.set(blockId, atTail(from, box.ceiling) ? TAIL : next);",
    expect: "T2.39",
  },
  {
    // **The walk's own first draft.** An untouched follow box holds nothing, and
    // nothing reads as `0` — the top — so the first `⇞` on a streaming box jumps
    // to its head. Found by writing T2.39 rather than by the trace, and kept as
    // a mutation so it cannot come back quietly.
    name: "a page from an untouched follow box starts at the top",
    file: OFFSETS,
    from: "      const current = held.get(blockId) ?? (box.follow === true ? TAIL : 0);",
    to: "      const current = held.get(blockId) ?? 0;",
    expect: "T2.39",
  },
  {
    // The landing is written as a number, so the box stops following the moment
    // its content grows past the value the reader left.
    name: "landing at the bottom is written as a position rather than as TAIL",
    file: OFFSETS,
    from: "      held.set(blockId, atTail(next, box.ceiling) ? TAIL : next);",
    to: "      held.set(blockId, next);",
    expect: "T2.39",
  },
  {
    // **Drop the `+N more` share** — the brief's second mutation. A fold that
    // the interior ignores draws a full box, so the residue row is no longer
    // the fold's whole statement and *+N more* has no mechanism.
    name: "the collapsed form is ignored by the interior",
    file: CONTAINERS,
    from: "  return block.collapsed === true ? 0 : block.height; // cells-ok — a row count",
    to: "  return block.height; // cells-ok — a row count",
    expect: "T2.42",
  },
  {
    // S2 undone: a collapsed follow box resolves its offset to the content, so
    // the residue reads *N above, 0 below* — the fold pointing the wrong way.
    name: "a collapsed box is not forced to offset zero",
    file: CONTAINERS,
    from: "  if (interior === 0) return 0;",
    to: "  if (interior === 0 && (false as boolean)) return 0;",
    expect: "T2.42",
  },
  {
    // No affordance: the elements of a declared fold carry nothing, and `⏎`
    // does nothing and says nothing — the empty-block class at a keystroke.
    name: "a declared fold carries no toggle on its elements",
    file: CONTAINERS,
    from: "      block.collapsed === undefined\n        ? {}",
    to: "      (true as boolean)\n        ? {}",
    expect: "T2.43",
  },
  {
    // **`expand` back to `table` only** — the brief's third mutation. The
    // reasoning-panel row dies because its target is a block and not a row.
    name: "expand searches rows and never blocks",
    file: ACTIONS,
    from: "        if (folded !== undefined) {",
    to: "        if (folded !== undefined && (false as boolean)) {",
    expect: "T4.62",
  },
  {
    // C23 I18's exception removed: every kind refused from a frozen entry again,
    // and the settled reasoning panel cannot be opened.
    name: "expand is refused from a frozen entry like every other kind",
    file: ACTIONS,
    from: '    if (action.kind !== "expand" && isFrozen(deps.transcript, from)) {',
    to: "    if (isFrozen(deps.transcript, from)) {",
    expect: "T4.64",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: CONTAINERS,
    from: "  if (held === undefined) return block.follow === true ? most : 0;",
    to: "  if (held === undefined) return 0;",
    why:
      "a follow box opens at its head — T2.37, T2.38 and T2.48 fail; a run in which the field " +
      "changes nothing and stays green cannot see where the box opens",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
