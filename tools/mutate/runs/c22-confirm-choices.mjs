// Entry 16 step 1 — the confirm's choices as a block, mutated.
//
// **The first mutation here is the selection opening at 0**, and it replaced the
// one the entry was going to write first. The plan named modular wrap versus
// stop-at-edge as the difference between the two implementations; measured, the
// two copies of the cycling are identical (`% length` in both directions at
// `confirm.ts:194`/`:199` and `keys.ts:496`/`:501`), so that mutation could not
// be written at all. What actually diverges is where the selection *starts* —
// and opening at 0 passes every assertion about arrows moving while putting a
// destructive verb's confirm on `yes`. A safety defect where the replaced one
// was a navigation defect.
//
// The rest attack the joint the block form created: a marker that is now a slot
// in a cell rather than a character this file wrote.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/integration/confirm.test.ts";
const CONFIRM = "src/shell/confirm.ts";
const SELECTION = "src/shell/choice-selection.ts";

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
    // **The shared store opens at 0.** Arrows still move, `⏎` still resolves,
    // every accelerator still fires, every menu row agrees — and `/prune` opens
    // on `yes`. The mutation the walk named first, and it survived the store
    // landing because the store is where a guess would live.
    name: "the shared store opens at 0 rather than at the supplied start",
    file: SELECTION,
    from: "  let index = start;",
    to: "  let index = start === null ? null : 0;",
    expect: "T4.12",
  },
  {
    // **Only the fallback, which is the subtler half.** Every caller in this
    // repository marks a default, so this is invisible until one forgets — and
    // the claim is that forgetting should be safe. The first mutation does not
    // cover it: with a marked default both arms agree.
    name: "an unmarked question falls back to the first choice",
    file: SELECTION,
    from: "  return marked < 0 ? choices.length - 1 : marked;",
    to: "  return marked < 0 ? 0 : marked;",
    expect: "T4.15",
  },
  {
    // **The store infers the start instead of being handed one.** The shape the
    // entry started from — one mechanism, so one rule — and it is wrong in the
    // direction that matters: the menu's last candidate is not a safe answer,
    // it is an arbitrary one, so a store that knew the confirm's rule would
    // open the completion menu on its final entry.
    name: "a null start becomes the last item, as the confirm's does",
    file: SELECTION,
    from: "    if (index === null || count <= 0) return;",
    to: "    if (count <= 0) return;\n    if (index === null) index = count - 1;",
    expect: "T4.31",
  },
  {
    // **`Esc` answers with the first rather than the marked one**, decoupling
    // the two halves that must agree: a question that opens on `no` and escapes
    // to `yes`.
    name: "the escape answer stops going through defaultStart",
    file: CONFIRM,
    from: "  return choices[defaultStart(choices)]!;",
    to: "  return choices[0]!;",
    expect: "T4.32",
  },
  {
    // **The marker shares the key's cell.** A glyph is part of a cell's width
    // rather than an addition to it, so the marked row shifts two columns left
    // of the others. Every count agrees; only the rows read against each other
    // disagree.
    name: "the marker goes in the key's cell instead of its own column",
    file: CONFIRM,
    from: '        mark: { text: "", ...(i === selected ? { glyph: "bullet" as const } : {}) },\n        key: { text: `[${c.key}]` },',
    to: '        mark: { text: "" },\n        key: { text: `[${c.key}]`, ...(i === selected ? { glyph: "bullet" as const } : {}) },',
    expect: "T4.14",
  },
  {
    // **The character written here again.** The form the block replaced, with
    // the capability gone — so it compiles, draws correctly on a Unicode
    // terminal, and puts a `•` on a `LANG=C` one. F122's defect restored
    // through the door the merge closed.
    name: "the marker is a written character rather than a slot",
    file: CONFIRM,
    from: '        mark: { text: "", ...(i === selected ? { glyph: "bullet" as const } : {}) },',
    to: '        mark: { text: i === selected ? "\\u2022" : "" },',
    expect: "T4.13",
  },
  {
    // **`expand` restored as the marker.** The glyph this file used while the
    // choices were text, and a collision the `raw` form concealed: C11 renders
    // `expand` for a row that can be opened, so `▸` inside a table row already
    // means *expandable* to the same renderer.
    name: "the marker is expand, as it was before the block form",
    file: CONFIRM,
    from: '{ glyph: "bullet" as const }',
    to: '{ glyph: "expand" as const }',
    expect: "T4.13",
  },
  {
    // **The key column's floor taken from one key.** Two-character
    // accelerators are legal — `AskOptions` puts no width on `key` — and a
    // floor of 3 truncates whichever is longer, which reads as a rendering
    // flicker rather than as a width defect. C19's menu carries the same
    // argument for its glyph.
    name: "the key column's floor is a constant rather than the widest",
    file: CONFIRM,
    from: "minWidth: keyWidth(choices)",
    to: "minWidth: 3",
    expect: "T4.16",
  },
];

/**
 * Survivors with a reason, and a staleness arm.
 *
 * Empty, and it took two attempts to be. The first pass exempted the default's
 * fallback and the key column's floor as *unreachable through the real graph* —
 * which was wrong in the way an exemption usually is: both states are one line
 * of `ask()` away, and the tests already call it directly. An exemption for a
 * constructible state is a gap wearing a reason, and the mutation pass is what
 * asked the question. T4.15 and T4.16 are the rows that replaced them.
 *
 * An entry here would name a mutation the suite cannot see and why that is
 * acceptable — and the pass fails if a listed mutation is caught after all, so
 * an entry cannot outlive its reason.
 */
const EXPECTED_SURVIVORS = new Map([]);

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: CONFIRM,
    from: "    rows: choices.map((c, i) => ({",
    to: "    rows: [].map((c, i) => ({",
    why:
      "no choice reaches the frame at all — if this survives, nothing in the set reads " +
      "the rendering and every kill below is unearned",
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
