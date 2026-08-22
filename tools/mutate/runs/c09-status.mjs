// C09 I31, I32 — the two ladders and the animation.
//
// **The second and third rows restore defects that actually happened**, which is
// the strongest form this pass takes. Both were found by reading a frame during
// the build, not by any assertion: the width ladder decided only the tag, so a
// bordered padded row was five cells of furniture drawn at width 3 — a row wider
// than its frame, which Ink wraps, and the block rendered **ten rows against a
// measured six**. Making the furniture affordable then drew **four** at width 9,
// because the rows the border and padding gave up went nowhere.
//
// Every count in the renderer agreed through both defects. Only the figure
// disagreed.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SRC = "src/presentation/blocks/kinds/status.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync("npx vitest run test/edge/status.test.ts test/revert/status.test.ts 2>&1", {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 300_000,
    });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.code === "ETIMEDOUT" ? `${out}\nTIMED OUT` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: SRC,
    from: "  measure: (block: Status): number => Math.max(1, Math.floor(block.height)), // cells-ok — a row count",
    to: "  measure: (): number => 1,",
    why: "every box collapses to one row, which T3.38 asserts across seven heights and three states",
  },
  mutations: [
    {
      // **The rung as it was first written.** Two borders, two blanks and a tag
      // row is six; the figure said five for as long as it existed on paper, and
      // drawing it is the only thing that said otherwise.
      name: "the height ladder's top rung is labelled five",
      file: SRC,
      from: "  if (height >= FULL_FIGURE_ROWS) return { border: true, pad: true, tag: tagged };",
      to: "  if (height >= 4) return { border: true, pad: true, tag: tagged };",
      expect: "T3.39",
    },
    {
      // **The first of the two the frame read found**, and neither shipped —
      // both were caught inside this commit. The width ladder spoke only about
      // the tag and the height ladder alone decided the border, so a bordered
      // padded row at width 3 was five cells of furniture in a three-cell frame.
      name: "the width ladder does not decide whether the border is affordable",
      file: SRC,
      from: "  const border = frame.border && width >= 3;\n  const canPad = border && width >= 5;",
      to: "  const border = frame.border;\n  const canPad = border;",
      expect: "T3.40",
    },
    {
      // **The second, and it only became reachable once the first was fixed**: furniture the width ladder took away has to give its
      // rows back, or `render` draws fewer than `measure` committed.
      name: "the group is not centred and the slack all falls below it",
      file: SRC,
      from: "    const slack = Math.max(0, interior - group); // cells-ok — a row count",
      to: "    const slack = 0; // cells-ok — a row count",
      expect: "T3.39",
    },
    {
      // C09 I31 — the tag row's reassignment. Without it a narrow box spends a
      // row on nothing while its message is truncated.
      name: "a dropped tag row is left blank rather than given to the message",
      file: SRC,
      from: '    const tagRows = frame.tag && tagFit !== "none" ? 1 : 0;',
      to: "    const tagRows = frame.tag ? 1 : 0;",
      expect: "T3.41",
    },
    {
      // C09 I31 — at one row the **failed** states keep the message. The
      // countdown is the actionable number and it is still worth less than the
      // cause.
      name: "the activity line is admitted with no room for it",
      file: SRC,
      // **Reachable only once the clamp went.** With `out.slice(0, height)` in
      // place this was masked: the assembly made one row too many and the slice
      // cut the line, so the rule and its absence produced the same frame.
      //
      // **Re-anchored when `loading` was given the other half of the rung**
      // (F235) — the guard gained a state term rather than moving, so what this
      // restores is unchanged: a failed box admitting a line it has no room for.
      from: '    const lineRows = line !== "" && (interior - tagRows >= 2 || lineWins) ? 1 : 0;',
      to: '    const lineRows = line !== "" ? 1 : 0;',
      expect: "T3.42",
    },
    {
      // **F235's own half, and it is the one the frame found.** `loading` has no
      // cause, so the sentence the rung above is built on says nothing about
      // which of its two rows to keep — and applied unchanged it drew `loading`
      // over `⠋ loading`, the word twice, with every count agreeing.
      name: "`loading` is given the failed states' one-row rung",
      file: SRC,
      from: "    const lineWins = block.state === \"loading\";",
      to: "    const lineWins = false;",
      expect: "T3.42a",
    },
    {
      // **The precedence returning to a truncation**, which is the defect the
      // rung's own note records having been fixed once already — in the other
      // direction. A floor of one puts the message back and lets the final clamp
      // decide which row survives, so the rule and its absence agree on the row
      // count and part company only in the contents.
      name: "the message floor puts it back and lets the clamp choose",
      file: SRC,
      from: "    const forMessage = Math.max(0, interior - tagRows - lineRows); // cells-ok — a row count",
      to: "    const forMessage = Math.max(1, interior - tagRows - lineRows); // cells-ok — a row count",
      expect: "T3.42c",
    },
    {
      // **C09 I32, and the field was declared and unread when this was written.**
      // `spinnerFrames(ctx.capabilities)` with no name ignores the block's set
      // entirely — F227's class, caught by a test before it shipped rather than
      // after.
      name: "the block's spinner set is ignored and the default is always used",
      file: SRC,
      from: "activityLine(block, spinnerFrames(ctx.capabilities, block.spinner), ctx.tick)",
      to: "activityLine(block, spinnerFrames(ctx.capabilities), ctx.tick)",
      expect: "T3.44",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
