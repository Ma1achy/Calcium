// C22 I111, §6l.10 — the label on the prompt's upper rule.
//
// **The subject is a slot the design argues for on cost**: the rules are drawn
// anyway, so putting the application's identity in one spends no rows. Every
// mutation below attacks the part of that argument a green run would not
// notice — which rule carries it, which channel paints it, and whether the
// frame still sheds it.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const PAINT = "src/shell/paint.ts";
const FRAME = "src/shell/frame.ts";
// **Two corpora, because the unit rows cannot reach one of the two sheds.**
// `labelSpansOf` drops the label at 1-bit — there is no ground to paint with,
// and drawing it flat would put the application's identity in the rule's own
// voice — and no row in the unit file is at that rung. The golden's
// `label-mono` arm is, and it only became so on a capability override: no
// environment reaches 1-bit in a session, because `detectColourDepth` answers
// `1` for `dumb` alone and `unusableCause` refuses `dumb` by name.
const FILES = "test/unit/frame-rule-label.test.ts test/golden/session-frame.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254): with the label never
    // drawn, every labelled arm is the bare frame and three rows fail. If this
    // survives, nothing below is reaching the seam at all.
    file: PAINT,
    from: "  if (label === null || width <= MIN_COLUMNS) return null;",
    to: "  if (label !== null) return null;\n  if (label === null || width <= MIN_COLUMNS) return null;",
    why:
      "the label is never drawn, so the labelled frame is the bare frame — "
      + "if this survives, the rows are not reading the frame they think they are",
  },
  mutations: [
    {
      // **THE DEFECT: the lower rule takes the label too.** This is the one the
      // invariant's own wording exists to refuse — *two rules with two labels
      // is a header, and the header already exists* — and it is invisible to
      // any row that asks whether the label is drawn, because it is. Only the
      // control frame catches it: one row differs, not two.
      name: "THE DEFECT: the label lands on the lower rule as well",
      file: PAINT,
      from: "      ...promptRegion(frame, deps, width),\n      rule(width, deps),",
      to: "      ...promptRegion(frame, deps, width),\n      rule(width, deps, frame.label),",
      expect: "T1.65",
    },
    {
      // **The label painted in the rule's own voice.** `R-COL-003` is the whole
      // of the distinction — *things take a ground and facts about things take
      // a tone* — and a label drawn muted is byte-identical to a correct one in
      // every assertion about position, width and shedding. Only the channel
      // separates them.
      name: "the label takes a tone rather than a ground",
      file: PAINT,
      from: "    { text, style: ground },",
      to: "    { text, style: muted },",
      expect: "T1.65b",
    },
    {
      // **The width floor goes off by one**, which is the whole of §069's *at
      // 60 columns the label drops* — and it is the mutation that found the
      // defect rather than confirmed the fix. Its first version set a private
      // `LABEL_MIN_COLUMNS = 60` to 0 and **survived**: below 60 there is no
      // frame at all, so a strict comparison against a second copy of the
      // number could never fire. The constant is now `MIN_COLUMNS` itself and
      // the comparison is `<=`, so one column is the difference between a
      // frame that works with no label and a frame spending its narrowest rule
      // on a name.
      name: "the label survives at the narrowest width the frame draws",
      file: PAINT,
      from: "  if (label === null || width <= MIN_COLUMNS) return null;",
      to: "  if (label === null || width < MIN_COLUMNS) return null;",
      expect: "T1.66",
    },
    {
      // **The derived half of the drop.** The second condition is not a chosen
      // number — it is *at least one rule glyph must remain*, which is what
      // stops a label from becoming the row. Off by one glyph and the label
      // fills the rule entirely with nothing to mark it as one.
      name: "a label may leave no rule glyph beside it",
      file: PAINT,
      from: "  if (left < glyphCells) return null;",
      to: "  if (left < 0) return null;",
      expect: "T1.66",
    },
    {
      // **The 1-bit shed removed**, and it is the branch no unit row reaches.
      // It is also the mutation the golden's first draft could not have caught:
      // that arm read `{TERM: "xterm-mono", NO_COLOR: "1"}`, came back at four
      // bits — `fg 90  bg 40` in the styles grid — and drew the label the row
      // exists to watch shed. An arm named for the rung it was meant to be at
      // is not a measurement of the rung it reaches.
      name: "the label is drawn where there is no ground for it",
      file: PAINT,
      from: "  if (deps.capabilities.colourDepth === 1) return null;",
      to: "  if (deps.capabilities.colourDepth === 0) return null;",
      expect: "label-mono",
    },
    {
      // The one trailing glyph, gone. The fixture is `──── calcium ─`, and a
      // label flush to the right edge has stopped being inline-end — which is
      // a change to the grid and to nothing else.
      name: "the label runs to the edge with no glyph after it",
      file: PAINT,
      from: "    { text: glyph, style: muted },",
      to: "    { text: \" \", style: muted },",
      expect: "T1.65",
    },
    {
      // **A string that strips to nothing becomes a label.** The frame narrows
      // a supplied string to `null` when it is blank, so `" "` is *no label*
      // rather than a one-cell ground floating in the rule. Nothing about the
      // geometry changes, which is why it needs its own row.
      //
      // **Re-anchored when the label became a record** (C22 I114): the narrowing
      // moved onto `text`, because a caller may now return a string or a record
      // naming a hue and the stripping is the text's either way — a hue name is
      // not drawn, so it is not a channel a control character could travel on.
      name: "a blank label is drawn rather than narrowed away",
      file: FRAME,
      from: '  const text = raw === null ? null : stripControl(typeof raw === "string" ? raw : raw.text).trim() || null;',
      to: '  const text = raw === null ? null : stripControl(typeof raw === "string" ? raw : raw.text);',
      expect: "T1.65d",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
