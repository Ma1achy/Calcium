// C04 §3c — the scroll container.
//
// **One mutation, and the second is named rather than written.** The cache-key
// mutation this kind owes — *the offset omitted from `(entry, rev, width, focus,
// theme)`* — has **no subject in the tree yet**: nothing holds an offset, so
// nothing can be omitted from a key, and a mutation whose anchor cannot exist is
// worse than a missing one. `ANCHOR MISSED` is already reported apart from
// `SURVIVED` because a mutation that did not apply is not evidence; one written
// against a mechanism that does not exist would read as coverage from the
// summary line and be nothing at all. It is listed in OWED below and arrives
// with L4.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/scroll.test.ts test/contract/render-cache.test.ts test/integration/scroll-wiring.test.ts";
const SRC = "src/presentation/blocks/kinds/containers.ts";

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
    // **The marker drawn unconditionally** (C04 I49). It passes every overflow
    // fixture — the corpus's `scroll-1` holds three children in a box of two —
    // and shows only against a container whose content fits, where it draws
    // `⋯ 0 above, 0 below` under a box hiding nothing. The golden corpus is
    // where a short child lives, which is why that suite is in the command.
    name: "the residue row is drawn whether or not anything is hidden",
    file: SRC,
    from: "    if (content > block.height) {",
    to: "    if (true) {",
    expect: "T2.25",
  },
  {
    // **`measure` conditioned on the offset rather than on the block.** The
    // same row, one layer up: a box that loses a row when there is residue
    // *below* changes height as the reader scrolls, which is the jitter I47
    // forbids and the reason I49's condition is on `(block, width)`.
    name: "the residue row is counted only when something is below",
    file: SRC,
    from: "    return block.height + (contentHeight(block, w, measureChild) > block.height ? 1 : 0);",
    to: "    return block.height;",
    expect: "T2.20",
  },
  {
    // **The two windows added**, which is cell 1's whole subject. There is no
    // `window` to add the offset to any more, so the way back to that defect is
    // the seam itself: declaring one re-opens it. The conformance sweep refuses
    // it in sixteen rows, and T2.21 refuses it here in one.
    name: "the container declares a window seam again",
    file: SRC,
    from: "export const scrollDefinition: BlockDefinition<Scroll> = {\n  kind: \"scroll\",",
    to:
      "export const scrollDefinition: BlockDefinition<Scroll> = {\n  kind: \"scroll\",\n" +
      "  window: (block: Scroll, _w: number, from: number, to: number) =>\n" +
      "    Object.freeze({ block, skipRows: from, takeRows: Math.max(0, to - from) }),",
    expect: "T2.21",
  },
  {
    // **The elements clipped to the box**, which is C26 I3's refusal and the
    // shape C04 §3c cell 8 ruled against. It leaves every row about a fitting
    // container green.
    name: "the element list stops at the box's height",
    file: SRC,
    from: "      childRanges(block, w, measureChild).map((r) =>",
    to: "      childRanges(block, w, measureChild).filter((r) => r.to <= block.height).map((r) =>",
    expect: "T2.22",
  },
  {
    // **The fourth axis omitted from the render cache key** (C04 I48, C22 §6c).
    // Third instance of focus own story: a fact the render reads that moves
    // nothing in (entry, rev, width, focus, theme). It fails nothing until a row
    // scrolls twice and reads the frame, which is why T4.18e exists and why this
    // row could not be written until the store did.
    name: "the render cache key ignores the scroll offset",
    file: "src/shell/session.ts",
    // **Re-pointed when the tick axis joined the slot** (F227). The line used to
    // end at `${offsets}` and now carries `${animated}` after it, so the old
    // anchor named a string that no longer exists. The mutation is unchanged —
    // it still drops the offsets and leaves everything else — and the pass was
    // re-run on the commit that moved it (F219).
    from: "\\u0000${offsets}${animated}`;",
    to: "${animated}`;",
    expect: "T4.41",
  },
  {
    // **The container kinds enumerated again**, which is the class rather than
    // the instance. `tree.ts` derives them from the union and a `Record` keyed
    // by the derived kind fails to compile when one is missing — but the suite
    // does not typecheck, so this row asks the other question: with `scroll`
    // dropped, do any *observable* rows fail? Three do, at three different
    // layers, which is what the four independent enumerations cost before it.
    name: "the container set forgets scroll",
    file: "src/data/viewmodel/tree.ts",
    from: "  scroll: true,\n",
    to: "",
    expect: "T2.31",
  },
  {
    // **The walk descends past a container that answers for itself.** The
    // tempting form of the class fix — *anything with children is walked into* —
    // and it emits a scroll's children twice, the second copy at content
    // coordinates the sequence never had. The condition is the definition's.
    name: "elementsIn walks into every container, answered or not",
    file: "src/presentation/blocks/registry.ts",
    // Re-anchored when the two element questions became one call (C09 I30,
    // F224). The subject is unchanged — the condition is still the definition's
    // — and this pass was re-run rather than re-anchored blind.
    from: "        if (hasChildren(block) && !own.owned) {",
    to: "        if (hasChildren(block)) {",
    expect: "T2.34",
  },
  {
    // **The box stops stating its height** (C04 I47, C25 I1) — the shipped
    // defect, restored. Every fixture whose content fills or overflows the box
    // is unchanged by it, which is why eighteen rows and a frame-read missed it.
    name: "the box does not pad to its declared height",
    file: SRC,
    from: "{ length: Math.max(0, block.height - drawn) }, // cells-ok",
    to: "{ length: 0 }, // cells-ok",
    expect: "T2.28",
  },
  {
    // **The copy taken from what the box shows** (C04 I50, C26 I17). The
    // boundary-aware form, which is the tempting one: it is right for every
    // container whose content fits and wrong exactly where the ruling applies.
    name: "the container copies only the children the box can show",
    file: SRC,
    from: "          copy: copyTextOf(r.child),",
    to: "          copy: r.to <= block.height ? copyTextOf(r.child) : \"\",",
    expect: "T2.35",
  },
  {
    // **The join stopping at one level.** A child that is itself a container
    // carries its children's sources, and a `default` arm swallowing `scroll`
    // reads as total — the switch answers every kind, and answers one wrongly.
    name: "a nested container contributes no source",
    file: SRC,
    from: "    case \"scroll\":\n      return child.children",
    to: "    case \"scroll-not\":\n      return child.children",
    expect: "T2.35b",
  },
  {
    // **The offset trusted rather than clamped** (C04 I48, cell 4). Nothing in
    // the tree writes one yet, so this is the arm that will matter the day L4
    // does — and it is live now because `ctx.scrollOffsets` is readable.
    name: "the offset is used as given, without the clamp",
    file: SRC,
    from: "  return Math.min(Math.max(0, Math.trunc(held)), most);",
    to: "  return Math.trunc(held);",
    expect: "T2.25",
  },
];

/**
 * Survivors with a reason, and a staleness arm.
 *
 * **OWED, not survived**: *the offset omitted from the render cache key.* Its
 * subject does not exist — no store holds an offset and no key could carry one —
 * so it is recorded here in prose rather than as a row that would report
 * `ANCHOR MISSED` every run. The day the store and the axis land, it becomes a
 * mutation against `session.ts`'s key and this note goes.
 */
const EXPECTED_SURVIVORS = new Map();

// **The clamp exemption was removed by its own staleness arm**, which is the
// argument for arms over predictions in one run. It read *nothing writes an
// offset yet, so a clamp of 0 and a trunc of 0 are the same number* -- true
// when it was written and false the moment L4 landed. The first pass after the
// store existed reported EXEMPTION IS STALE rather than quietly excusing a
// mutation that had become killable, and T2.29 is the row that kills it. A dead
// reason left in place reads as a considered survivor for as long as nobody
// re-derives it.

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: SRC,
    from: "    const shown = ranges.filter((r) => r.to > offset && r.from < offset + block.height);",
    to: "    const shown = ranges;",
    why:
      "every child is drawn and the box is not bounded at all — if this survives, no row reads " +
      "what the container renders and every kill below is unearned",
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
