// C23 I73, I74 — replace or float, and the prompt's slot (§7f, §101).
//
// **Every mutation here draws a frame that looks right.** A question over the
// transcript, a question with the prompt still under it, a question with the
// editor's gutter on its top border — all of them put the question on the
// screen, which is what a reader checking *is the question drawn* asks and what
// every assertion short of the arithmetic accepts.
//
// The two that matter: `THE DEFECT: the question is drawn as an overlay as
// well` is the one a reader cannot see at all on a wide terminal, because the
// two copies land on different rows; and `the editor keeps its gutter` is the
// one that shipped for a run of T4.70 and reads as a styling detail rather than
// as the prompt still being there.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SESSION = "src/shell/session.ts";
const PAINT = "src/shell/paint.ts";
const ROUTING = "src/shell/question-routing.ts";
const CONFIRM = "src/shell/confirm.ts";
const FILES =
  "test/integration/question-slot.test.ts test/unit/question-routing.test.ts " +
  "test/integration/confirm.test.ts test/unit/session-paint.test.ts";

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
    // **A change every row can see** (F1254): nothing ever replaces the prompt,
    // so the question goes back to floating over the transcript and the prompt
    // stays where it was.
    file: SESSION,
    from: "    const layer = graph.confirm.replacing;",
    to: "    const layer = null;",
    why:
      "no question ever takes the prompt's rows, so the editor's line is still drawn and the "
      + "question is not in the band between the two lower rules",
  },
  mutations: [
    {
      // **THE DEFECT the filter exists for.** The question is drawn in the
      // prompt's slot *and* left in the overlay layout, so it is painted twice
      // — once over the transcript and once where it belongs. On a tall
      // terminal the two land far apart and neither looks wrong on its own.
      name: "THE DEFECT: the question is drawn as an overlay as well as in the prompt's slot",
      file: SESSION,
      from: "        return replacing === null ? placed : placed.filter((p) => p.layer !== replacing);",
      to: "        return placed;",
      expect: "T4.70",
    },
    {
      // **The editor keeps its gutter**, which shipped for one run of T4.70:
      // the question draws as a box indented two cells with a prompt character
      // on its top border, and the reader sees a prompt that is still there.
      name: "THE DEFECT: the prompt's gutter is drawn over the question's first row",
      file: PAINT,
      from: "    const gutter = replaced\n      ? \"\"",
      to: "    const gutter = false\n      ? \"\"",
      expect: "T4.70",
    },
    {
      // **The rows are the question's and the count is the editor's.** Both
      // readers of the prompt's height must answer from one place (C22 I80);
      // this is the pair T6.30 records, arriving through the new arm.
      name: "the frame reserves the editor's rows while the paint is handed the question's",
      file: SESSION,
      from: "        (graph === undefined || graph === null ? undefined : this.#questionRows(graph, width)?.length) ??",
      to: "        (graph === undefined || graph === null ? undefined : undefined) ??",
      expect: "T4.70",
    },
    {
      // **A choice-only question floats.** §101's whole first half: the prompt
      // has no job while an approval is up, so a row spent on it is a row
      // spent on nothing — and the question goes back over the transcript.
      name: "an approval floats rather than replacing the prompt",
      file: ROUTING,
      from: "  approval: Object.freeze({ replaces: true, blocking: true, dismissal: \"answer\" as const }),",
      to: "  approval: Object.freeze({ replaces: false, blocking: true, dismissal: \"answer\" as const }),",
      expect: "T1.68",
    },
    {
      // **The tie, written down** (T1.68's own subject). Blocking becomes a
      // function of replacing, which agrees with four of §101's six cells — and
      // the typed reply is the cell it cannot produce.
      name: "blocking is tied to replacing, which agrees on four of the six",
      file: ROUTING,
      from: "  reply: Object.freeze({ replaces: false, blocking: true, dismissal: \"answer\" as const }),",
      to: "  reply: Object.freeze({ replaces: false, blocking: false, dismissal: \"escape\" as const }),",
      expect: "T1.68",
    },
    {
      // **A question that an owner is waiting on becomes escapable.** The third
      // concept `dismissable` used to carry, arriving back through the table.
      name: "a blocking question is closed by escape rather than by its answer",
      file: ROUTING,
      from: "  choice: Object.freeze({ replaces: true, blocking: true, dismissal: \"answer\" as const }),",
      to: "  choice: Object.freeze({ replaces: true, blocking: true, dismissal: \"escape\" as const }),",
      expect: "T1.68",
    },
    {
      // **The peek stops being a projection of focus.** It is the one consumer
      // focus closes, because it is the one that is nothing but focus.
      name: "a peek is closed by escape rather than by focus leaving",
      file: ROUTING,
      from: "  peek: Object.freeze({ replaces: false, blocking: false, dismissal: \"focus\" as const }),",
      to: "  peek: Object.freeze({ replaces: false, blocking: false, dismissal: \"escape\" as const }),",
      expect: "T1.68",
    },
    {
      // **The state stops being read and becomes a constant.** `reply…` would
      // then leave the question replacing the prompt it needs, which is the
      // half of I73 that is about *derived rather than declared*.
      name: "the consumer ignores whether a typed reply has been chosen",
      file: ROUTING,
      from: "  if (replying) return \"reply\";",
      to: "  if (false) return \"reply\";",
      expect: "T1.68b",
    },
    {
      // **THE DEFECT the identity assertion exists for.** The transition pops
      // the question and pushes a second one. It draws the same picture — same
      // content, same placement, same id on the stack — and the promise the
      // first layer's owner is awaiting is dropped on the floor. A reader
      // checking *the reply is up* cannot see it.
      name: "THE DEFECT: choosing reply… opens a second question rather than moving the first",
      file: CONFIRM,
      from: "          deps.overlays.update(CONFIRM_LAYER_ID, {\n            content: render(opts, selected()),\n            placement:",
      to: "          disposable[Symbol.dispose]();\n          deps.overlays.push({ ...layer, blocking: false });\n          deps.overlays.update(CONFIRM_LAYER_ID, {\n            content: render(opts, selected()),\n            placement:",
      expect: "T1.69",
    },
    {
      // **`reply…` settles like any other choice**, which is the state the whole
      // MR is about never being reached: the caller gets `{key:"r"}` with no
      // text and the prompt never comes live.
      name: "reply… resolves the question rather than moving it",
      file: CONFIRM,
      from: "                if (pick?.reply === true && replying === null) return toReply(pick);",
      to: "                if (false) return toReply(pick);",
      expect: "T1.69",
    },
    {
      // **The floating question keeps eating keys.** It draws in the right
      // place over a prompt that can never be typed into — *float* as a
      // placement rather than as an ownership fact (C16 I25, router.ts:395).
      name: "a floating reply consumes the keystrokes the prompt needs",
      file: CONFIRM,
      from: "            case \"compose\":\n",
      to: "            case \"compose\":\n              return true;\n              // eslint-disable-next-line no-unreachable\n",
      expect: "T1.69",
    },
    {
      // **The answer drops the text.** Every assertion about the transition
      // still passes; what is lost is the fact the reply existed to carry, and
      // `{key}` is exactly what an escape answers — so the two arms collapse.
      name: "the reply answers with its key and discards what was composed",
      file: CONFIRM,
      from: "                return settle(key, text);",
      to: "                return settle(key);",
      expect: "T1.69",
    },
    {
      // **The reply's key is the highlighted choice rather than the one that
      // opened it.** The selection is wherever the reader left it, so a caller
      // routing on `key` acts on a choice nobody picked.
      name: "the reply answers with the selected choice rather than the reply choice",
      file: CONFIRM,
      from: "                const key = replying.key;",
      to: "                const key = opts.choices[selected()]?.key ?? replying.key;",
      expect: "T1.69",
    },
    {
      // **A replaced prompt keeps its caret.** The rows on screen are the
      // question's, so a cell placed by the editor's arithmetic lands inside a
      // box the editor has no coordinates in.
      name: "the caret stays where the editor put it while the prompt is replaced",
      file: SESSION,
      from: "      promptReplaced: () => this.#questionRows(graph, width) !== null,",
      to: "      promptReplaced: () => false,",
      expect: "T4.70",
    },
  ],
});

// Printed and exited on, not merely computed (F768).
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
