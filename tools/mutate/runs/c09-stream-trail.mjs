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
// **The command is what a mutation reaches** (F1243): T1.69 and T1.70 live in
// this run's suite, so the middle cut is mutated here rather than in
// `c09-cut-walk.mjs`, whose command names `text.test.ts` and not this file.
const TEXT = "src/presentation/text.ts";
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
      name: "the band is fourteen characters rather than fourteen cells",
      file: SIMPLE,
      from: "    while (start > 0 && cells(text.slice(start - 1), ambiguous) <= left) start -= 1; // cells-ok — a code-unit cursor",
      to: "    while (start > 0 && text.length - (start - 1) <= left) start -= 1; // cells-ok — a code-unit cursor",
      expect: "T1.54",
    },
    {
      // **As it shipped**: the band stops at the last wrapped row, so a short
      // last row carries a short band (parked 8).
      name: "the band stops at the last row",
      file: SIMPLE,
      from: "    if (start > 0) break;",
      to: "    break;",
      expect: "T1.76",
    },
    {
      // **As it shipped**: the head colour on the band's oldest cell, and the
      // character that just arrived in the run's plain ink.
      name: "the gradient runs from the head colour at the oldest cell",
      file: SIMPLE,
      from: "        from: target,\n        to: TRAIL_HEAD[form],",
      to: "        from: TRAIL_HEAD[form],\n        to: target,",
      expect: "T1.77",
    },
    {
      // **Thirteen cells shown of fourteen**: over `of` positions the oldest
      // cell sits at `t = 0`, which is the ink exactly.
      name: "the extent ends on the band's oldest cell",
      file: SIMPLE,
      from: "ramp: { ramp, at: at + 1, of: of + 1, ordinal: 0 }",
      to: "ramp: { ramp, at, of, ordinal: 0 }",
      expect: "T1.55",
    },
    {
      // **Two gradients for one band**: each row restarts, so the head on the
      // last row stops short of accent.
      name: "the ramp restarts at the break",
      file: SIMPLE,
      from: "  for (const { row, head, band } of bands) {\n    const banded: Run[] = [];",
      to: "  for (const { row, head, band } of bands) {\n    at = 0;\n    const banded: Run[] = [];",
      expect: "T1.76",
    },
    {
      // **The colour forms survive 1-bit** (I91). **A survivor, and it indicts
      // the subject rather than T1.58.** Below 4-bit `rampStyle` answers
      // `resolveTone(ramp.from)`, and since the gradient was turned round
      // (C09 I90, 2026-09-25) `from` is the run's own ink — so an unguarded
      // colour form at 1-bit draws the run's own style, which is *nothing*,
      // exactly what C09 I91 asks. The guard and the resolution now agree and
      // the guard is unobservable. It stays, because it states C09 I91 at the
      // site that owns it and costs a comparison; while `from` was the head
      // colour, `fade`'s `muted` drew dim over half the band and this was
      // caught. The first `to` here, `form === "nosuch"`, stopped type-checking
      // when `trail` became a closed union (F1106), which hid that the row had
      // stopped running at all.
      name: "the four colour forms are not held back at 1-bit",
      file: SIMPLE,
      from: "  if (colourDepth === 1 && form !== \"weight\") return wrapped;",
      // **Keyed on a depth no terminal reports**, since `form === "nosuch"`
      // stopped type-checking once `trail` was a closed union (F1106).
      to: "  if (colourDepth === 0 && form !== \"weight\") return wrapped;",
      expect: null,
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
      from: "    const text = runsText(wrapped[row] ?? []);",
      to: "    const text = \" \".repeat(prefixCells(block.glyph)) + runsText(wrapped[row] ?? []);",
      expect: "T1.55",
    },
    {
      // **The mark drawn but never reserved** (C09 I101). Every row about the
      // *mark* passes — it is in the same place, in the same tone, a frame of
      // the same set — and the last row is two cells wider than the frame, which
      // the compositor wraps into a row `measure` never counted. This is the
      // divergence the reservation exists to prevent, and it is invisible to
      // anything that reads the mark.
      // **Re-anchored when the button took its own cells** (I102): the budget
      // now subtracts three terms, so the anchor is the tail that names the
      // mark's and drops it, leaving the button's in place.
      name: "the mark is drawn without reserving its cells",
      file: SIMPLE,
      from: "prefixCells(block.glyph) + markCells(block) + buttonCells(block));",
      to: "prefixCells(block.glyph) + buttonCells(block));",
      expect: "T1.64",
    },
    {
      // **The other direction: reserved and never spent.** The wrap is exactly
      // the one `measure` counted, so T1.64 is green throughout, and two cells
      // at the head of the stream are blank forever. A block that says *more is
      // coming* and draws nothing saying so.
      name: "the cells are reserved and the mark is never drawn",
      file: SIMPLE,
      from: "  if (markCells(block) === 0) return wrapped;\n  const frame = spinnerFrameAt(",
      to: "  return wrapped;\n  const frame = spinnerFrameAt(",
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
      from: "  const frame = spinnerFrameAt(ctx.capabilities, glyphTick(ctx.tick, ctx.motion), \"agent\");",
      to: "  const frame = spinnerFrameAt(ctx.capabilities, 0, \"agent\");",
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
    {
      // **§073, and the defect is what the tree drew.** No ground at rest, so a
      // button is bare text and an action is invisible until you focus it —
      // which is the state this section was opened on. Every assertion about the
      // *focused* button passes.
      name: "a resting button takes no ground",
      file: SIMPLE,
      from: "  const ref = focused ? \"surface.pick\" : \"surface.bgElev\";",
      to: "  const ref = focused ? \"surface.pick\" : \"surface.nothing\";",
      expect: "T1.66",
    },
    {
      // **The focused button on `focusGround` again**, which is I83's arm and
      // the mechanism this MR moved it off. The button is painted, it is
      // focused, and it takes the region's ground rather than the chooser's —
      // a row asserting only *focused is painted* accepts it.
      name: "a focused button takes the focus ground rather than the chosen pair",
      file: SIMPLE,
      from: "  const ref = focused ? \"surface.pick\" : \"surface.bgElev\";",
      to: "  const ref = focused ? \"surface.focusGround\" : \"surface.bgElev\";",
      expect: "T1.66",
    },
    {
      // **The mark outside the wash.** Same glyph, same column, same ground —
      // one cell of background, which is what says where the affordance begins.
      // §082's `▸` is the same claim one component over.
      name: "the chooser's mark sits outside the button's ground",
      file: SIMPLE,
      from: "    { text: ` ${mark}`, style },",
      to: "    { text: mark, style: base }, { text: \" \", style },",
      expect: "T1.66",
    },
    {
      // **The brackets gone at the rung that has nothing else.** A button at one
      // bit is then bare text with zero carriers, which is the state M11's
      // matrix forbids and the reason this rung exists at all.
      name: "no brackets where the ground is gone",
      file: SIMPLE,
      from: "      { text: \"[ \", style: base },",
      to: "      { text: \"\", style: base },",
      expect: "T1.66",
    },
    {
      // **A call head painted as a button.** The predicate drops its second
      // half, every call header in the tree gains a cell of padding, and the
      // frame still reads as a call head at a glance. This shipped for one
      // build and T2.48 is what caught it.
      name: "a call head is painted as a button",
      file: SIMPLE,
      from: "  block.action === undefined || isCallHead(block) ? 0 : BUTTON_CELLS;",
      to: "  block.action === undefined ? 0 : BUTTON_CELLS;",
      expect: "T1.68",
    },
    {
      // **The reservation varying with the rung** — the shape I102's first
      // draft asked for and `measure` cannot express. Geometry then disagrees
      // with the frame at exactly the widths where a button wraps.
      name: "the button's chrome is reserved at the padded rung's width",
      file: SIMPLE,
      from: "const BUTTON_CELLS = 4;",
      to: "const BUTTON_CELLS = 2;",
      expect: "T1.67",
    },
    {
      // **§099's defect, reinstated**: the elided argument cut from its end, so
      // a path keeps *where* and loses *what*. The row is still exactly the
      // budget and still begins with the path's head — every assertion but the
      // tail passes, which is why T1.69 asserts the tail.
      name: "an elided run shortens from its end rather than its middle",
      file: SIMPLE,
      from: "caps, \"middle\") };",
      to: "caps, \"end\") };",
      expect: "T1.69",
    },
    {
      // **The head given the whole budget**, so the tail is empty and the
      // marker lands at the end — an end cut reached by a different route,
      // which a row asserting only *there is a marker* accepts.
      name: "the middle cut gives the head the whole budget",
      file: TEXT,
      from: "    const headBudget = Math.floor(budget / 3); // cells-ok — a cell budget",
      to: "    const headBudget = budget; // cells-ok — a cell budget",
      expect: "T1.69",
    },
    {
      // **The tail budgeted against the whole rather than the remainder**, so
      // head and tail together overrun: the answer is wider than the frame it
      // was measured at, which is the one failure that scrolls the alt screen.
      name: "the middle cut's tail does not pay for the head",
      file: TEXT,
      from: "    const tail = keptWithin(clean, budget - head.used, caps.ambiguousWidth, \"start\");",
      to: "    const tail = keptWithin(clean, budget, caps.ambiguousWidth, \"start\");",
      expect: "T1.70",
    },
  ],
});

console.log(report(results));

// **Named rather than excused**: each entry says why the mutation cannot fail
// anything, and the day it starts being caught the pass fails as a stale
// exemption, which is the notice that the reason no longer holds.
const EXPECTED_SURVIVORS = new Map([
  [
    "the four colour forms are not held back at 1-bit",
    "**the guard is unobservable, and this entry is the watch on that** (C09 I91, I90). Below " +
      "4-bit `rampStyle` answers `resolveTone(ramp.from)`, and `from` is the run's own ink since " +
      "the gradient was turned round — so an unguarded colour form draws the run's own style, " +
      "which is the nothing C09 I91 asks for. The day a 1-bit ramp resolves to anything but " +
      "`from`, or `from` stops being the target, this is caught and the pass fails as stale",
  ],
]);
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
