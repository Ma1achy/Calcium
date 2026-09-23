// C11 I14, I15, §5b — the reserved gutter, and the sentinel's kind.
//
// **The subject is the reservation, and a reservation is invisible to every row
// that looks at the frame where it is spent.** A gutter that appeared with the
// mark draws the focused frame identically to one that was always there; the
// only frame the two mechanisms disagree about is the one where nothing is
// drawn. So every assertion about `▸` — which row carries it, what tone it
// takes, whether it survives 1-bit — passes under both, and the mechanism the
// design asks for is pinned by exactly one property: the content edge is the
// same column in all four states. T2.11 is that row and this run is what says
// it can be violated.
//
// **The second subject is a distinction that reads as an optimisation.**
// `FocusState.selected` *absent* is C26 I16's head-alone sentinel and any
// *present* extent is a real selection, one element included (R-SEL-006). A
// test on the extent's **size** agrees with the tree on every frame the repo
// draws today, because nothing yet produces a one-element selection — which is
// the shape of a rule inferred from two cases. T2.12 constructs the third.
//
// **The measurement invariant is the third**, and it is the carve-out that binds
// whatever else the design says: `bodyWidth` does the subtraction once, inside
// `detailHeight`, because four callers ask for a detail's height and a
// subtraction at each is four chances to disagree by two cells. It was three of
// four for one commit and `window-height` reported 353 failures of 42.
//
// **What the control has to be.** Not a value — `GUTTER_CELLS` is derived from
// a glyph's width and could legitimately move. The control removes the
// reservation from `emit`, which is the mechanism: every row loses its lead, the
// content edge moves in every frame *together*, and a run whose control only
// some rows noticed could not say whether a survivor was a live defect or a dead
// corpus.
//
// **Anchors checked for uniqueness before the pass** (F219), anchored on what
// changes plus the least context that makes it unique.
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const TABLE = "src/presentation/table/definition.ts";
const CELLS = "src/presentation/table/cells.ts";

// `render-focus` carries T2.11 and T2.12; C11's contract suite carries T2.3, the
// generic measurement suite at seven widths flat and expanded, so a gutter that
// moves the arithmetic is caught where the arithmetic lives rather than only in
// the row that names it.
const FILES =
  "test/unit/render-focus.test.ts test/unit/table.test.ts test/edge/table.test.ts test/contract/table.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 300_000,
    });
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
    file: TABLE,
    from: "      parts.push(paint([...lead(marked), ...clampSpans(spans, inner, ctx.capabilities)]));",
    to: "      parts.push(paint([...clampSpans(spans, inner, ctx.capabilities)]));",
    why: "with no lead on any row the content edge moves in every frame together, the columns no longer sit under their header, and every suite that reads a table row goes with it",
  },
  mutations: [
    {
      // **The defect the design is about.** A gutter that appears with the fact
      // rather than being reserved: the focused frame is byte-identical, and the
      // unfocused one is two cells narrower. Every row about the *mark* passes.
      name: "the gutter appears with the mark instead of being reserved",
      file: TABLE,
      from: "        : [{ text: blank }];",
      to: "        : [];",
      expect: "T2.11",
    },
    {
      // The header is outside the reservation. The body rows keep their gutter
      // and the header does not, so the columns stop being one axis — a frame
      // that reads as deliberate at a glance and is the C09 I82 rule from the
      // other side. **Caught elsewhere on this run's first pass**, and the
      // finding is which row did not catch it: T2.11 held the header in a set it
      // compared *across* frames, and a header that leaves the reservation moves
      // in all four together, so the comparison was blind to it. A comment
      // saying the header is in the set is not an assertion that it is.
      name: "the header sits outside the reservation",
      file: TABLE,
      // **Re-anchored when the header took its ground** (C11 I24): the header
      // no longer goes through `emit`, because it paints its own row to the
      // block's edge. The gutter is now the `{ text: blank }` lead the ground
      // is merged onto, and dropping it is the same mutation as before.
      from: "              { text: blank },\n              ...spans,",
      to: "        ...spans,",
      expect: "T2.11",
    },
    {
      // **The sentinel by size.** Green on every frame the tree draws today,
      // because a one-element selection is a state nothing yet produces — which
      // is what makes it a rule tested against one case.
      name: "the sentinel is told by the extent's size",
      file: TABLE,
      from: "const on = isSelected || (isHead && selected.has(row.id))",
      to: "const on = isSelected || (isHead && selected.size > 1)",
      expect: "T2.12",
    },
    {
      // Focus and selection share the ground again, which is the mechanism the
      // tree had before the design: one ground and ink to tell the two apart.
      //
      // **Re-anchored on `on` rather than on the ground** (C10 I48): one
      // expression now answers both which ground the row takes and which ground
      // its inks resolve against, so the mutation moves both together — which is
      // the property the single expression exists to hold.
      name: "focus takes the selection ground",
      file: TABLE,
      from: "        : isHead\n          ? \"focusGround\"",
      to: "        : isHead\n          ? \"selection\"",
      expect: "T2.12",
    },
    {
      // **The ground reaches the ink, or it does not** (C10 I48, F1240). The row
      // keeps its own tones and each of them is resolved against the surface
      // underneath; a painter that washes an extent and does not say so paints
      // the page's ink on a band, which is the value the contrast gate already
      // measures as wrong there.
      //
      // **It lives here and not in `spans`, and that is the finding** (F1243).
      // It was written there, in place of the span-drop mutation C11 I14's
      // amendment retired, and it survived — `spans.mjs`'s command names five
      // files and none of them is a table's, so the mutation applied cleanly,
      // the suite it ran was green for the reason it is always green, and the
      // report said *survived*. A mutation reaches only as far as its run's
      // command, and the anchor sweep checks the text rather than the reach.
      name: "a table row's runs are painted on the page rather than on its ground",
      file: CELLS,
      from: "    spans.push(...paintRuns(pieces, style, { ...ctx, on: options.on }));",
      to: "    spans.push(...paintRuns(pieces, style, ctx));",
      expect: "T2.13",
    },
    {
      // **The measurement invariant, from the caller's side.** `detailHeight`
      // does the subtraction internally; a caller that subtracts again measures
      // a plan two cells narrower than the one on screen.
      name: "the detail's height is taken at the outer width",
      file: TABLE,
      from: "  const inner = bodyWidth(width);\n  const plan = planColumns(block.columns, inner);",
      to: "  const inner = width;\n  const plan = planColumns(block.columns, inner);",
      expect: "T2.3",
    },
    {
      // A detail child that forgets the gutter. The parent rows keep it, so the
      // detail hangs two cells left of the row it belongs to — geometry that
      // measures correctly and is wrong, which is the class `emit`'s one exit
      // exists to close. **It survived this run's first pass**, against T2.3 and
      // against every row in the three suites: the measurement invariant counts
      // rows and says nothing about a column, and nothing else looked at a
      // detail child's left edge. T2.11 grew the assertion.
      name: "a detail child forgets the gutter",
      file: TABLE,
      from: "          parts.push(line === \"\" ? \"\" : `${blank}${fitRow(pad + line, inner)}`);",
      to: "          parts.push(line === \"\" ? \"\" : fitRow(pad + line, inner));",
      expect: "T2.11",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
