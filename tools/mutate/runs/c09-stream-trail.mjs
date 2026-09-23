// C09 I90 and C09 I91, C04 I122 and C04 I123 — the trail's band.
//
// **A band is a colour, so every defect here is invisible in the text.** The
// rows read bytes for that reason, and these mutations attack the three things
// a green run cannot see: which cells the band covers, what it cools to, and
// what happens where there is no colour to cool with.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SIMPLE = "src/presentation/blocks/kinds/simple.ts";
const VALIDATE = "src/data/viewmodel/validate.ts";
const ANIMATION = "src/presentation/blocks/animation.ts";
const FILES = "test/unit/stream-trail.test.ts";

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
    // **A change the run's own corpus can see** (F1254): with the derivation a
    // no-op, no block has a band and every row about one fails. If this
    // survives, nothing below reaches the renderer.
    file: SIMPLE,
    from: "  if (block.streaming !== true) return wrapped;",
    to: "  if (true) return wrapped;\n  if (block.streaming !== true) return wrapped;",
    why:
      "no block gets a band, so the streaming and settled arms are byte-identical — "
      + "if this survives, the rows are not reading the frames they think they are",
  },
  mutations: [
    {
      // **THE DEFECT: a settled block keeps its trail.** The band is what
      // streaming means and a settled reply has no head — §026's *when it
      // stops, NOTHING replaces it*. Reversed, every finished notice in the
      // transcript carries a live-looking head, which no assertion about the
      // text would notice.
      name: "THE DEFECT: a settled block draws a band",
      file: SIMPLE,
      from: "  if (block.streaming !== true) return wrapped;",
      to: "  if (block.streaming === true && false) return wrapped;",
      expect: "T1.47",
    },
    {
      // **The target becomes fixed** — the defect `R-BLK-196` names and calls
      // *a bug that looks like a styling choice*: the reasoning block is dim,
      // and a trail whose target is fixed repaints it to the body colour.
      name: "the trail cools to the body tone whatever ink the run has",
      file: SIMPLE,
      from: "    const target = form === \"hue\" ? block.tone : (run.tone ?? block.tone);",
      to: "    const target = block.tone;",
      expect: "T1.56",
    },
    {
      // **The band counted in characters rather than cells.** Right for ASCII
      // and wrong for every wide cluster — a three-character band on `字字字` is
      // six cells, and nothing about the row's text moves.
      name: "the band is three characters rather than three cells",
      file: SIMPLE,
      from: "  while (start > 0 && cells(text.slice(start - 1), ambiguous) <= TRAIL_CELLS) start -= 1; // cells-ok — a code-unit cursor",
      to: "  while (start > 0 && text.length - (start - 1) <= TRAIL_CELLS) start -= 1; // cells-ok — a code-unit cursor",
      expect: "T1.54",
    },
    {
      // **The colour forms survive 1-bit** (I91). `rampStyle` at one bit
      // resolves to nothing much, so this reads as harmless — and it is the
      // difference between *nothing* and *something smaller*, which is what
      // T1.58 asserts byte-identically for.
      name: "the four colour forms are not held back at 1-bit",
      file: SIMPLE,
      from: "  if (colourDepth === 1 && form !== \"weight\") return wrapped;",
      to: "  if (colourDepth === 1 && form === \"nosuch\") return wrapped;",
      expect: "T1.58",
    },
    {
      // **A misspelled form defaults instead of being refused** (C04 I123).
      // The screen then shows `hotEdge` while the document says something else,
      // with nothing anywhere reporting the disagreement.
      name: "an unknown trail form is accepted and defaults",
      file: VALIDATE,
      from: "    if (b[\"trail\"] !== undefined && !TRAIL_FORMS.includes(b[\"trail\"] as never)) {",
      to: "    if (false) {",
      expect: "T1.47",
    },
    {
      // **The band measured over chrome as well as text** (`R-BLK-198`), which
      // is what *the reveal is a property of the stream* forbids: a header has
      // no position in the stream. Two cells of glyph lead counted into the
      // line shifts the band that far back, so it stops short of the true head
      // and, on a text shorter than the band, reaches the mark.
      //
      // **The first version of this mutation set `last` to 0 and survived,
      // correctly**: a notice renders one row and truncates, so the index is
      // degenerate and there was no case for it to be wrong in. Aimed at the
      // arithmetic instead of at the row, which is where the clause lives.
      name: "the band is measured over the glyph lead as well as the text",
      file: SIMPLE,
      from: "  const text = runsText(line);",
      to: "  const text = \" \".repeat(prefixCells(block.glyph)) + runsText(line);",
      expect: "T1.55",
    },
    {
      // **The mark drawn but never reserved** (C09 I101). Every row about the
      // *mark* passes — it is in the same place, in the same tone, a frame of
      // the same set — and the last row is two cells wider than the frame, which
      // the compositor wraps into a row `measure` never counted. This is the
      // divergence the reservation exists to prevent, and it is invisible to
      // anything that reads the mark.
      name: "the mark is drawn without reserving its cells",
      file: SIMPLE,
      from: "  const budget = proseWidth(width, prefixCells(block.glyph) + markCells(block));",
      to: "  const budget = proseWidth(width, prefixCells(block.glyph));",
      expect: "T1.64",
    },
    {
      // **The other direction: reserved and never spent.** The wrap is exactly
      // the one `measure` counted, so T1.64 is green throughout, and two cells
      // at the head of the stream are blank forever. A block that says *more is
      // coming* and draws nothing saying so.
      name: "the cells are reserved and the mark is never drawn",
      file: SIMPLE,
      from: "  if (markCells(block) === 0) return wrapped;\n  const frames = spinnerFrames(ctx.capabilities, \"agent\");",
      to: "  return wrapped;\n  const frames = spinnerFrames(ctx.capabilities, \"agent\");",
      expect: "T1.63",
    },
    {
      // **The mark takes the block's ink rather than `accent`.** Same glyph,
      // same column, same set, same tick — one channel of colour, which is what
      // a string assertion cannot see and why T1.63 reads the grid by cell.
      name: "the mark takes the block's tone rather than accent",
      file: SIMPLE,
      from: "{ text: \" \" }, { text: frame, tone: \"accent\" }",
      to: "{ text: \" \" }, { text: frame }",
      expect: "T1.63",
    },
    {
      // **The mark frozen at frame zero.** The column is right, the tone is
      // right, the character is a legal member of the set — and it never moves,
      // which is a spinner that reads as a hang. T1.63's second tick is the only
      // thing that asks.
      name: "the mark is frozen at the set's first frame",
      file: SIMPLE,
      from: "  const frame = frames[glyphTick(ctx.tick, ctx.motion) % frames.length]; // cells-ok — a frame index",
      to: "  const frame = frames[0]; // cells-ok — a frame index",
      expect: "T1.63",
    },
    {
      // **The tick clause removed** (C09 I101). Nothing on screen is wrong in
      // any single frame: the mark is in place, in accent, at the frame the tick
      // names — and no tick ever arrives, so it is frame zero forever and the
      // `ripple` trail is still with it. The state this repaired, reinstated.
      name: "a streaming notice asks for no tick",
      file: ANIMATION,
      from: "  if (block.kind === \"notice\" && (block as Notice).streaming === true) return spinnerIntervalMs(\"agent\");",
      to: "",
      expect: "T1.65",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
