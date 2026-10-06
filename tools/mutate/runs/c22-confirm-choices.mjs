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
// The rest attack the joint the block form created: a marker that is a slot
// rather than a character this file wrote. **They were rewritten for C23 I104**
// (§028): the choices stopped being a table with a `bullet` column and became one
// `pills` row of buttons, so the four mutations that named the table's columns
// have no anchor, and what replaces them are the mutations the new form has —
// the selection as a render focus, the lead's glyph and tone, the reply drawing
// no answers, and the first draft of the answers, a `group` row that shed a choice.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/integration/confirm.test.ts test/unit/question-queue.test.ts";
const CONFIRM = "src/shell/confirm.ts";
const SELECTION = "src/shell/choice-selection.ts";
const DOCUMENTS = "src/shell/documents.ts";

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
    from: "  if (marked >= 0) return marked;",
    to: "  if (marked >= 0) return marked;\n  if (choices.length > 0) return 0;",
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
    // **The selection stops being the render focus**: the chip named is the first
    // whichever answer the reader is on. Arrows still move the store, `⏎` still
    // answers the right choice, every key-path row agrees — and the wash sits on
    // the first answer, which for `deny`-first is right and for any other order
    // points the reader at a choice they are not on.
    name: "the render focus names the first chip rather than the selection's",
    file: CONFIRM,
    from: "rowId: `chip-${String(on)}`",
    to: "rowId: `chip-0`",
    expect: "T1.109",
  },
  {
    // **The answers lose their `buttons` flag**, and are chips again: the data is
    // the same labels in the same order, so only a row that reads the field or
    // the wash can tell.
    name: "the answers are chips and not buttons",
    file: CONFIRM,
    from: "    buttons: true,\n    padding: { t: 1, l: 1 },",
    to: "    padding: { t: 1, l: 1 },",
    expect: "T1.108",
  },
  {
    // **The first draft of the answers, restored**: a `group` row of buttons. It
    // draws the figure at 80 columns and **sheds the fourth of four at 60** — a
    // `group` places the children that fit and drops the rest, and nothing on the
    // screen says so. The row that holds it reads the narrow frame.
    name: "THE DEFECT: the answers are a group row, which sheds a choice it cannot place",
    file: CONFIRM,
    from: '    kind: "pills",\n    id: CHOICES_ID,\n    buttons: true,\n    padding: { t: 1, l: 1 },\n    chips: choices.map((c) => ({ label: c.label })),',
    to: '    kind: "group",\n    id: CHOICES_ID,\n    direction: "row",\n    padding: { t: 1, l: 1 },\n    childGap: 2,\n    children: choices.map((c) => block({ kind: "notice", id: `x-${c.key}`, tone: "default", text: c.label, action: { kind: "fill", label: c.label, command: c.key } })),\n    flex: choices.map((c) => ({ cells: c.label.length + 4 })),',
    expect: "T4.109",
  },
  {
    // **A reply draws the answers under the prompt it has just made live.** The
    // question then offers choices to someone typing a sentence, and `esc` is the
    // only way back that the screen does not mention.
    name: "a reply still draws the answers",
    file: CONFIRM,
    from: "  if (!replying) children.push(choiceBlock(opts.choices));",
    to: "  children.push(choiceBlock(opts.choices));",
    expect: "T4.110",
  },
  {
    // **The count before the refusal.** Both are on the question's row and the
    // order is a ruling: the refusal answers the key just pressed, the count is a
    // standing fact. Swapping them draws every cell and fails only the row that
    // reads their order.
    name: "the count sits before the refusal on the question's row",
    file: CONFIRM,
    from: "  const flex: { cells: number }[] = [];",
    to: "  const flex: { cells: number }[] = [];\n  if (more > 0 && refused) { beside.push(queuedNotice(more, separator, \"confirm-queued\")); flex.push({ cells: cells(`${separator} ${String(more)} more`) }); more = 0; }",
    expect: "T4.110",
  },
  {
    // **The lead is `▲` again.** The tree's old form, and `warn`'s glyph where
    // `question`'s belongs: the notice is the same tone and the same words, and
    // only the character is wrong — which is the character the registry names.
    name: "the lead is the warning's glyph rather than the question's",
    file: DOCUMENTS,
    from: '    glyph: "question",',
    to: '    glyph: "warn",',
    expect: "T1.108",
  },
  {
    // **The words take the lead's tone.** One span too few and the question reads
    // in `warn` throughout, which is §028's `⟩` and its sentence in one colour.
    name: "the question's words lose their default span",
    file: DOCUMENTS,
    from: '    spans: text === "" ? [] : [{ from: 0, to: text.length, tone: "default" }], // cells-ok — a code-unit offset',
    to: "    spans: [],",
    expect: "T1.108",
  },
  {
    // **The question gets its panel back.** Everything inside is the same, and
    // the form is the one the design does not draw.
    name: "the question is wrapped in a panel again",
    file: CONFIRM,
    from: "  if (!replying) children.push(choiceBlock(opts.choices));\n  return children;",
    to: '  if (!replying) children.push(choiceBlock(opts.choices));\n  return [block({ kind: "panel", id: "confirm-panel", title: titleOf(more, separator), children })];',
    expect: "T1.108",
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
    from: "    chips: choices.map((c) => ({ label: c.label })),",
    to: "    chips: [],",
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
