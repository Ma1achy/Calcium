// C25 §3c — windowing a patch for the fullscreen view.
//
// **The control is the measured height, not the shape of the block.** A window
// that produced the wrong hunks would still be a valid `Patch` and would still
// render; what separates a correct window from a plausible one is that it fits
// the region it was built for, and that the rows it shows are the rows the
// offset asked for. So every test here measures, and the property test measures
// at every offset rather than at the three anyone would pick by hand.
//
// The pairing row (I19a) is the reason this file exists. §3c records the
// measurement: the illustration's hunk is seven rows split, and cut between its
// removed line and its two added ones the halves come to eight. Any window that
// cuts at an arbitrary line offset can invent a row, and the common case — a
// window landing in context — passes either way.
import { describe, expect, it } from "vitest";
import { block } from "../../src/data/viewmodel/index.js";
import type { Hunk, Patch } from "../../src/data/viewmodel/index.js";
import {
  totalRows,
  windowPlan,
  windowRows,
  type WindowPlan,
} from "../../src/presentation/patch/window.js";
import { patchDefinition } from "../../src/presentation/patch/definition.js";
import type { RenderScratch } from "../../src/presentation/blocks/types.js";
import { numberWidth } from "../../src/presentation/patch/layout.js";
import { hunkRows, isCollapsed, layoutFor, pairedRows } from "../../src/presentation/patch/height.js";
import { globSync, readFileSync } from "node:fs";
import { hunkOf as corpusHunk, PATCH_CORPUS, patchOf as corpusPatch } from "../support/blocks.js";
import { measurable } from "../support/render.js";
import { defaultTheme, loadTheme } from "../../src/presentation/theme/index.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";

const UNIFIED = 80;
const SPLIT = 120;

const line = (kind: "add" | "remove" | "context", text: string): Hunk["lines"][number] => ({
  kind,
  text,
});

/** §2's illustration: three context, one removed, two added, two context. */
const ILLUSTRATION: Hunk = {
  header: "@@ -18,6 +18,7 @@",
  lines: [
    line("context", "spec:"),
    line("context", "  selector:"),
    line("context", "    matchLabels:"),
    line("remove", "      app: volatility-estimator"),
    line("add", "      app: volatility-estimator"),
    line("add", "      prism.fmx.io/family: volatility"),
    line("context", "  replicas: 2"),
    line("context", "  template:"),
  ],
  collapsedBefore: 14,
};

const patchOf = (hunks: readonly Hunk[], collapsedAfter?: number): Patch =>
  block({
    kind: "patch",
    id: "p1",
    path: "serving/volatility-estimator.yaml",
    language: "yaml",
    hunks,
    ...(collapsedAfter === undefined ? {} : { collapsedAfter }),
  } as Patch);

const THREE = patchOf(
  [
    ILLUSTRATION,
    { ...ILLUSTRATION, header: "@@ -60,4 +61,4 @@", collapsedBefore: 30 },
    { header: "@@ -90,4 +91,4 @@", lines: ILLUSTRATION.lines },
  ],
  170,
);

/**
 * A window as a rebuilt `Patch`, over the surviving seam (C25 I18, §3b).
 *
 * **`windowPatch` was deleted with the pushed view** (R-EXA-082), and it was
 * the one caller that took an *offset and a height*. The transcript route takes
 * a row **range** — `BlockDefinition.window` is asked for `[from, to)` by C14,
 * which derives them from the viewport — so this names the range the old
 * signature implied and reads the block out.
 *
 * **It does not clamp, and that is the difference rather than an omission.**
 * `clampOffset` was the caller's snap and retired with the caller (F1251); `windowRows` clamps its own indices into the row array, which
 * is what a range seam owes. A row that relied on the ceiling is asserting
 * about a rule that no longer has a subject, and there is one — the struck
 * T2.12 and T2.13, which went with it.
 */
/**
 * The header rows of a patch's full rendering (C25 I18).
 *
 * `hunkHeaderRows` was `planOf(...).headers` and was reachable only from the
 * pushed view's seek; the plan still carries the list, so this reads it where
 * the function used to.
 */
const hunkHeaderRows = (patch: Patch, width: number, plan?: WindowPlan): readonly number[] =>
  (plan ?? windowPlan(patch, width)).rows.flatMap((row, i) => (row.kind === "header" ? [i] : []));

/**
 * The last offset worth sweeping from, for a row that sweeps every offset.
 *
 * `clampOffset` was the pushed view's snap and retired with it (F1251). What the rows below need from it is only a **bound on the sweep**,
 * and the honest bound over a range seam is the total: an offset past the end
 * yields the last window, so sweeping to `totalRows` costs repeats and misses
 * nothing. Named rather than inlined so it does not read as the retired rule
 * surviving under another name.
 */
const sweepTo = (patch: Patch, width: number): number => totalRows(patch, width);

const windowPatch = (
  patch: Patch,
  width: number,
  offset: number,
  height: number,
  plan?: WindowPlan,
): Patch => windowRows(patch, width, offset, offset + height, plan).block;

describe("C25 §3c — windowing", () => {

  it("T1.20c (C25 I1, I19b): the window's row model and `measure` agree, row for row", () => {
    // **Containment is not correctness, and this row is what measured that.** Every
    // other row here bounds a window from above — it never exceeds its region — and
    // a unit that *over-states* its height satisfies all of them: it shows less
    // diff, never more. Restating a unit's rows as its line count rather than
    // asking `pairedRows` survived the whole patch suite, 99 rows across eight
    // files (measured 2026-09-04). Nothing said the window had shrunk.
    //
    // So this states the equality instead, and it states it across the seam: the
    // header positions come from `hunkHeaderRows`, which walks `rowsOf` and
    // therefore `unitsOf`, and the expectation comes from `height.ts`'s `hunkRows`,
    // which `measure` uses and which never sees a unit. A window that disagreed
    // with `pairedRows` about what a row is is the drift I1 exists to prevent, and
    // until now the suite took that agreement on trust.
    for (const candidate of PATCH_CORPUS) {
      if (candidate.kind !== "patch") continue;
      const patch = candidate;
      for (const width of [UNIFIED, SPLIT]) {
        const layout = layoutFor(patch, width);
        const expected: number[] = [];
        let at = 1; // the path header
        for (const hunk of patch.hunks) {
          if (isCollapsed(hunk.collapsedBefore)) at += 1;
          expected.push(at);
          at += hunkRows(hunk, layout) - (isCollapsed(hunk.collapsedBefore) ? 1 : 0);
        }
        const where = `${patch.id} at ${String(width)}`;
        expect([...hunkHeaderRows(patch, width)], where).toEqual(expected);
        expect(at + (isCollapsed(patch.collapsedAfter) ? 1 : 0), `${where}: total`).toBe(
          totalRows(patch, width),
        );
      }
    }
  });

  // ~~**T1.20b**: a window's cuts fall on `changedRuns`' boundaries~~
  // ~~**T1.20**: in split layout a window's lines never begin inside a run~~
  // ~~**T1.20**: an offset inside a run opens at the run, not past it~~
  //
  // **All three struck with the pushed view** (C25 §3b, R-EXA-082, F1251). The
  // snap was `clampOffset`'s and `clampOffset` had one caller. The retired
  // rule was about cutting the *line array*, which is what a caller holding an
  // offset did; the transcript route cuts **row-wise**, and I19a says that
  // a row-wise cut is additive and therefore needs no snap — asserted over every
  // run up to 4×4 at every cut point by T2.11, which is the surviving form.
  //
  // Kept as a comment rather than deleted because *what the old rows covered*
  // is how the next reader checks that I19a really does cover it.

  it("T1.20 (C25 I18): a window's rows account for exactly its range, at any offset or width", () => {
    // **The property, asserted over every offset rather than three.** A window
    // that cut inside a changed run would not account for its range exactly
    // where the run straddles the boundary, which is one offset out of twelve
    // in this fixture — and the eleven others pass under both implementations.
    //
    // **It read *never taller than its region* until M9b** (C25 §3b). A region
    // budget is a property of a caller that has one, and that caller was the
    // pushed view: `windowPatch` subtracted the sticky headers from the height
    // it was given. The transcript route is handed a row **range** and reports
    // what it re-added — `skipRows` at the top, `dropRows` at the bottom — so
    // the same rule reads as an accounting identity rather than a bound, and it
    // is the stronger form: a bound is satisfied by a window that draws less.
    for (const width of [UNIFIED, SPLIT]) {
      const total = totalRows(THREE, width);
      for (let height = 3; height <= 12; height += 1) {
        for (let offset = 0; offset + height <= total; offset += 1) {
          const w = windowRows(THREE, width, offset, offset + height);
          expect(
            totalRows(w.block, width) - w.skipRows - w.dropRows,
            `width ${width}, height ${height}, offset ${offset}`,
          ).toBe(height);
        }
      }
    }
  });


  it("T1.20 (C25 I19a): every line is reachable from some offset, over the whole sweep", () => {
    // **Added because a mutation failed nothing.** Disabling the snap left all
    // nine tests green, and the reason is that the walk skips interior rows of a
    // unit anyway — so without the snap an offset landing inside a run *skips
    // the run* rather than starting at it. That is snapping up, and it can make
    // a line unreachable: if the offset ceiling falls inside a unit, the lines
    // of that unit are never drawn at any offset. D38's rule, one level down.
    //
    // The property is the one worth asserting rather than the direction: sweep
    // every offset and every line must appear somewhere.
    for (const width of [UNIFIED, SPLIT]) {
      const seen = new Set<string>();
      const ceiling = sweepTo(THREE, width);
      for (let offset = 0; offset <= ceiling; offset += 1) {
        for (const hunk of windowPatch(THREE, width, offset, 6).hunks) {
          for (const l of hunk.lines) seen.add(`${hunk.header}|${l.kind}|${l.text}`);
        }
      }
      for (const hunk of THREE.hunks) {
        for (const l of hunk.lines) {
          expect(seen.has(`${hunk.header}|${l.kind}|${l.text}`), `${width}: ${l.text}`).toBe(true);
        }
      }
    }
  });


  it("T1.21 (I18): the path header and a touched hunk's header are sticky, and are reported rather than charged", () => {
    // A window opening inside the first hunk's body. Two rows are drawn before
    // a single line of diff appears, and the question is who pays for them.
    //
    // **It was the caller, and now it is reported** (C25 §3b, M9b). The pushed
    // view was handed a *height* and `windowPatch` subtracted the headers from
    // it — six rows meant four lines. The transcript route is handed a row
    // **range** and re-adds the headers on top, saying so through `skipRows`:
    // six rows means six lines, and C14 skips what the window tells it to. The
    // sticky rule is unchanged; the budget belonged to a caller that had one.
    const headers = hunkHeaderRows(THREE, UNIFIED);
    const firstHeader = headers[0];
    if (firstHeader === undefined) throw new Error("fixture");

    const from = firstHeader + 3;
    const w = windowRows(THREE, UNIFIED, from, from + 6);
    expect(w.block.path).toBe(THREE.path);
    expect(w.block.hunks).toHaveLength(1);
    expect(w.block.hunks[0]?.lines.length, "six rows of range, six lines").toBe(6);
    expect(w.skipRows, "the path header and the hunk header, re-added and declared").toBe(2);
    expect(totalRows(w.block, UNIFIED) - w.skipRows - w.dropRows, "and they account exactly").toBe(6);
  });

  it("T1.22 (I20): a collapse marker appears only on the window containing its row", () => {
    const headers = hunkHeaderRows(THREE, UNIFIED);
    const first = headers[0];
    if (first === undefined) throw new Error("fixture");

    // Top: the first hunk's `collapsedBefore` is in range.
    const top = windowPatch(THREE, UNIFIED, 0, 6);
    expect(top.hunks[0]?.collapsedBefore).toBe(14);
    expect(top.collapsedAfter).toBeUndefined();

    // Middle: past the marker, nowhere near the tail.
    const middle = windowPatch(THREE, UNIFIED, first + 4, 5);
    expect(middle.hunks[0]?.collapsedBefore).toBeUndefined();
    expect(middle.collapsedAfter).toBeUndefined();

    // Bottom: the tail marker is the last row of the last window. **Named as a
    // range rather than reached by over-scrolling** (C25 §3b): the row asked for
    // offset `total` and let `clampOffset` bring it back to the ceiling, which
    // was the pushed view's snap. A range caller asks for the last rows.
    const total = totalRows(THREE, UNIFIED);
    const bottom = windowPatch(THREE, UNIFIED, total - 6, 6);
    expect(bottom.collapsedAfter).toBe(170);
  });

  it("T1.23 (I21): a sliced hunk carries its original header verbatim", () => {
    const headers = hunkHeaderRows(THREE, UNIFIED);
    const first = headers[0];
    if (first === undefined) throw new Error("fixture");

    const win = windowPatch(THREE, UNIFIED, first + 2, 5);
    expect(win.hunks[0]?.header).toBe("@@ -18,6 +18,7 @@");
    // And the slice really is a slice — without this the assertion above passes
    // for a window that returned the whole hunk.
    expect(win.hunks[0]?.lines.length).toBeLessThan(ILLUSTRATION.lines.length);
  });

  // **C25 T2.12's row, and it was already here.** The rule the spec names as
  // The retired ceiling rule's whole content — property asserted rather than number — under a title
  // naming only the function. Third instance in one pass of a row that checks an
  // invariant perfectly and answers *no* to the question SP9 asks.

  it("hunkHeaderRows names a row per hunk, in order, and each one is a header", () => {
    const rows = hunkHeaderRows(THREE, UNIFIED);
    expect(rows).toHaveLength(3);
    expect([...rows]).toEqual([...rows].sort((a, b) => a - b));
    // Windowing at a header row puts that hunk first with its full header —
    // which is what makes `n` and `p` land somewhere legible.
    for (const [i, row] of rows.entries()) {
      const win = windowPatch(THREE, UNIFIED, row, 6);
      expect(win.hunks[0]?.header, `hunk ${String(i)}`).toBe(THREE.hunks[i]?.header);
    }
  });

  it("a one-row range is one row of content plus its sticky headers, and does not throw", () => {
    // **It read *the path header alone*** until the budget moved (C25 §3b). A
    // one-row *region* was entirely spent on the sticky path header and there
    // was nothing left; a one-row *range* is one row of content, with the
    // headers re-added above it and declared.
    const w = windowRows(THREE, UNIFIED, 4, 5);
    expect(totalRows(w.block, UNIFIED) - w.skipRows - w.dropRows).toBe(1);
    expect(w.skipRows, "the headers are above it").toBeGreaterThan(0);
  });

  it("a patch with no hunks windows to itself", () => {
    const empty = patchOf([]);
    expect(totalRows(windowPatch(empty, UNIFIED, 0, 10), UNIFIED)).toBe(1);
  });
});

describe("C25 §7 — the invariants that had no row", () => {
  it("T2.8 (C25 I11): there is no expanded flag — expansion is the rewrite of collapsedBefore", () => {
    /**
     * **Structural first, because that is the load-bearing half.** A flag would
     * be a second record of what the document already says, and the two would
     * disagree the first time a patch was replaced under an open region. The
     * only field is `Hunk.collapsedBefore`, and there is nothing to set.
     */
    const types = readFileSync("src/data/viewmodel/types.ts", "utf8");
    const hunk = types.slice(types.indexOf("export type Hunk = "), types.indexOf("export type Patch = "));
    expect(hunk, "the collapse is a count of hidden lines").toContain("collapsedBefore?: number;");
    expect(hunk.replace(/\/\*[\s\S]*?\*\//gu, ""), "and there is no flag beside it").not.toMatch(
      /^\s+(?:readonly )?expanded\??:/mu,
    );

    // **`ILLUSTRATION` already carries `collapsedBefore: 14`**, so a spread is
    // not an expanded form — it is the same block. The field is removed here,
    // which is the state the row claims to be constructing.
    const { collapsedBefore: _hidden, ...uncollapsed } = ILLUSTRATION;
    const collapsed = patchOf([{ ...ILLUSTRATION, collapsedBefore: 30 }]);
    const expanded = patchOf([uncollapsed]);

    // C25 renders whatever the field says, and renders it the same way twice —
    // so nothing outside the document decided what was shown.
    const first = windowPatch(collapsed, UNIFIED, 0, 40);
    const again = windowPatch(collapsed, UNIFIED, 0, 40);
    expect(JSON.stringify(again), "the same block, the same window").toBe(JSON.stringify(first));

    // **And the rewrite is what expands it**: the same hunks, one field removed,
    // and the collapse marker's row is gone. `hunkRows` is the arithmetic both
    // halves share, so this is measured rather than asserted about a frame.
    const layout = layoutFor(collapsed, UNIFIED);
    expect(hunkRows(collapsed.hunks[0]!, layout), "a collapsed region costs its marker a row").toBe(
      hunkRows(expanded.hunks[0]!, layout) + 1,
    );
    expect(isCollapsed(expanded.hunks[0]?.collapsedBefore), "and the rewritten block is not collapsed").toBe(false);
  });

  it("T2.9 (C25 I14, C25 I15, C25 I16): maxExpandHeight is in no source file, and this row expires when it is", () => {
    /**
     * **A watch, not a coverage row.** §3a records all three as *specified and
     * unbuilt*: the thresholds are multiples of a viewport height and C25 cannot
     * see a viewport, so the invariants have nothing to be false about — A03 §2's
     * vacuity class holding three of them open. A row asserting the behaviour
     * would assert nothing; this one asserts the absence and fails the day the
     * field lands, which is when I14, I15 and I16 owe real rows.
     */
    const sources = globSync("src/**/*.ts").filter((f) => !f.endsWith(".d.ts"));
    expect(sources.length, "over a non-empty tree").toBeGreaterThan(100);
    const naming = sources.filter((f) => readFileSync(f, "utf8").includes("maxExpandHeight"));
    expect(naming, "when this fails, C25 I14, I15 and I16 need rows and this one goes").toEqual([]);

    /**
     * **The half that is C25's and is true today.** Both numbers are computable
     * before either is offered, because `measure` is pure and takes the width —
     * nothing has to be rendered to know whether the expanded form would fit.
     */
    const { collapsedBefore: _hidden, ...uncollapsed } = ILLUSTRATION;
    const collapsed = patchOf([{ ...ILLUSTRATION, collapsedBefore: 30 }]);
    const expanded = patchOf([uncollapsed]);
    const layout = layoutFor(collapsed, UNIFIED);
    expect(hunkRows(collapsed.hunks[0]!, layout), "the collapsed height").toBeGreaterThan(0);
    expect(hunkRows(expanded.hunks[0]!, layout), "and the expanded one, both without a viewport").toBeGreaterThan(0);

    // **And the change that must not be made**, named in §3a: a height in
    // `measure`'s signature would make a block's geometry depend on the thing
    // C14 derives *from* that geometry.
    const vm = readFileSync("src/data/viewmodel/types.ts", "utf8");
    const measure = vm
      .slice(vm.indexOf("export type Measure<"), vm.indexOf("=> number;", vm.indexOf("export type Measure<")))
      .replace(/\/\*[\s\S]*?\*\//gu, "");
    expect([...measure.matchAll(/^ {2}(\w+)\??:/gmu)].map((m) => m[1])).toEqual([
      "block", "width", "measureChild", "probe",
    ]);
  });

  it("T2.12 (C25 I17, R-EXA-082): the deletion is pure — a patch renders every hunk it carries, and the pushed view showed no more", () => {
    // **Measured before the code was written, and it is why no expand arm was
    // added for a patch.** §82 says a run's detail expands in place, and the
    // obvious reading is that `⏎` unfolds something. A patch has nothing to
    // unfold: `collapsedBefore` and `collapsedAfter` are *counts of context the
    // block does not carry* (§3b), and the hunk **cap** that I14 specifies —
    // the only thing that ever dropped a hunk — is unbuilt, which T2.9 asserts
    // over `src/` beside this.
    //
    // So the pushed view's *every hunk, uncollapsed* was every hunk the block
    // already renders in the transcript, at the same width. The surface added a
    // hole and nothing else, which is R-EXA-082 exactly.
    for (const width of [UNIFIED, SPLIT]) {
      const drawn = windowRows(THREE, width, 0, totalRows(THREE, width));
      expect(
        drawn.block.hunks.map((h) => h.header),
        `every hunk at ${String(width)}`,
      ).toEqual(THREE.hunks.map((h) => h.header));
      expect(
        drawn.block.hunks.map((h) => h.lines.length),
        "and every line of each",
      ).toEqual(THREE.hunks.map((h) => h.lines.length));
    }

    // **The control**: the elision counts are carried, not resolved — without
    // it the row above passes for a block that had nothing elided to begin
    // with, and *there is nothing to expand* would be a statement about the
    // fixture rather than about the kind.
    expect(THREE.hunks[0]?.collapsedBefore, "context is elided").toBeGreaterThan(0);
    expect(
      THREE.hunks[0]?.lines.some((l) => l.kind === "context" && l.oldNo === 1),
      "and the elided lines are not in the block",
    ).toBe(false);
  });

  it("T2.11 (C25 I19a): a row-wise cut of a run is additive, over every run up to 4×4 at every cut point", () => {
    /**
     * **Asserted against `pairedRows` itself**, not against a restatement of it.
     * The whole invariant is that the window and the renderer share one row
     * model, so a second copy of the arithmetic here would be the drift I1
     * exists to prevent — and it would agree with itself whatever either did.
     *
     * The retired snap rule's non-additivity is about cutting the *line array*: one removed and
     * two added lines are two rows whole and three rows cut between them. A
     * row-wise cut takes the first `min(k, removes)` removes beside the first
     * `min(k, adds)` adds, and that is exactly `k`.
     */
    const run = (removes: number, adds: number): Hunk["lines"] => [
      ...Array.from({ length: removes }, (_, i) => line("remove", `- ${String(i)}`)),
      ...Array.from({ length: adds }, (_, i) => line("add", `+ ${String(i)}`)),
    ];

    let cases = 0;
    for (let removes = 0; removes <= 4; removes += 1) {
      for (let adds = 0; adds <= 4; adds += 1) {
        if (removes === 0 && adds === 0) continue;
        const whole = pairedRows(run(removes, adds));
        expect(whole, `${String(removes)}×${String(adds)} is max, not sum`).toBe(Math.max(removes, adds));

        for (let k = 0; k <= whole; k += 1) {
          const head = run(Math.min(k, removes), Math.min(k, adds));
          const tail = run(removes - Math.min(k, removes), adds - Math.min(k, adds));
          expect(pairedRows(head), `${String(removes)}×${String(adds)} cut at ${String(k)}: the head`).toBe(k);
          expect(pairedRows(tail), `${String(removes)}×${String(adds)} cut at ${String(k)}: the tail`).toBe(whole - k);
          cases += 1;
        }
      }
    }
    // The corpus is the claim's own scope, so a shrunken loop cannot pass quietly.
    // **The figure is the loop's, taken from the run.** Written by hand it was
    // 85; the sum of `max(r, a) + 1` over the twenty-four runs is 94.
    expect(cases, "every run up to 4×4, at every cut point").toBe(94);
  });

});

describe("C25 I22 — a window is built over a plan", () => {
  it("T1.24 (C25 I22, F1187): the plan's lists equal the patch-taking functions over the corpus at both widths, the planned window and clamp equal the unplanned ones at every offset and two heights, windowRows over the plan equals windowRows on the patch, the plan is frozen and heightless, and a plan for another block or width is refused", () => {
    /**
     * **The plan is a value the caller holds, so the row's job is that holding
     * it changes no byte.** Every function that accepts one is compared with
     * itself given none, at every offset the view could hold — and two past the
     * end, where the clamp's ceiling does the work — at two heights, because
     * the bottom search is the one arm whose walks depend on the height.
     */
    // Three rows is the height that puts the ceiling near the end of every
    // corpus patch — at ten and twenty-four the ceiling is offset 0 for most of
    // them, and the start-row arm would be comparing one offset.
    const HEIGHTS = [3, 10, 24] as const;
    let compared = 0;
    let interior = 0;
    for (const candidate of PATCH_CORPUS) {
      if (candidate.kind !== "patch") throw new Error("the corpus is patches");
      const patch: Patch = candidate;
      for (const width of [UNIFIED, SPLIT]) {
        const plan = windowPlan(patch, width);
        const total = totalRows(patch, width);

        expect(plan.rows.length, "one record per row of the full rendering").toBe(total);  // cells-ok — a row count, not a width
        expect(plan.numberWidth, "the pinned gutter (I21a)").toBe(numberWidth(patch));
        expect(plan.layout).toBe(layoutFor(patch, width));
        expect(Object.isFrozen(plan) && Object.isFrozen(plan.starts) && Object.isFrozen(plan.rows), "a frozen value").toBe(true);
        expect("height" in plan, "no reference to a height").toBe(false);
        interior += plan.rows.length - plan.starts.length;  // cells-ok — row counts, not widths
        // Every header is a row a window may begin at. **The second half — *and
        // the starts are exactly the offsets the clamp leaves where they are* —
        // went with the clamp** (C25 §3b, F1251): it compared the plan against a
        // caller's snap, and there is no caller holding an offset now.
        for (const h of hunkHeaderRows(patch, width, plan)) expect(plan.starts).toContain(h);
        for (const height of HEIGHTS) {
          for (let o = 0; o < total + 2; o += 1) {
            expect(windowPatch(patch, width, o, height, plan)).toEqual(windowPatch(patch, width, o, height));
            compared += 1;
          }
        }
        for (let from = 0; from < total; from += 1) {
          expect(windowRows(patch, width, from, from + 10, plan)).toEqual(windowRows(patch, width, from, from + 10));
        }
      }
    }
    expect(compared, "the sweep ran").toBeGreaterThan(200);
    // The corpus has interior rows to see — a run of three removes and one add
    // in split layout — or the start-row arm is a restatement of "every row".
    expect(interior, "the sweep saw interior rows").toBeGreaterThan(0);

    // A plan for another block, or the same block at another width, is a caller
    // error and is refused rather than read — a stale plan slices the new lines
    // by the old rows and shows a diff the block does not hold.
    const [a, b] = PATCH_CORPUS;
    if (a?.kind !== "patch" || b?.kind !== "patch") throw new Error("the corpus has two patches");
    const planA = windowPlan(a, UNIFIED);
    expect(() => windowPatch(b, UNIFIED, 0, 10, planA)).toThrow(/I22/u);
    expect(() => windowRows(a, SPLIT, 0, 5, planA)).toThrow(/I22/u);
  });
});

describe("C25 I22 — the plan travels through the seam, and a planned window costs the window", () => {
  it("T1.25 (C25 I22, F1191): over the corpus at both layouts and every start row, a planned windowRows reads no row index outside [from, to) and equals the unplanned window byte for byte; bodyStarts equal each hunk's first body row by a full scan, -1 for none", () => {
    let windows = 0;
    for (const candidate of PATCH_CORPUS) {
      if (candidate.kind !== "patch") throw new Error("the corpus is patches");
      const patch: Patch = candidate;
      for (const width of [UNIFIED, SPLIT]) {
        const plan = windowPlan(patch, width);
        // **The full scan the plan replaces**, as the row's reference.
        const scanned = patch.hunks.map(() => -1);
        plan.rows.forEach((row, i) => {
          if (row.kind === "body" && scanned[row.hunk] === -1) scanned[row.hunk] = i;
        });
        expect([...plan.bodyStarts], "bodyStarts are the first body rows").toEqual(scanned);
        expect(Object.isFrozen(plan.bodyStarts)).toBe(true);

        // **A recording proxy over the rows**: every numeric index read is noted.
        const seen = new Set<number>();
        const recording = new Proxy(plan.rows, {
          get(target, key, receiver) {
            if (typeof key === "string" && /^\d+$/u.test(key)) seen.add(Number(key));
            return Reflect.get(target, key, receiver);
          },
        });
        const recorded: WindowPlan = { ...plan, rows: recording };
        for (const from of plan.starts) {
          const to = from + 10;
          seen.clear();
          const planned = windowRows(patch, width, from, to, recorded);
          expect(planned, `the planned window at ${String(from)}`).toEqual(windowRows(patch, width, from, to));
          const outside = [...seen].filter((i) => i < from || i >= to);
          expect(outside, `rows read outside [${String(from)}, ${String(to)})`).toEqual([]);
          windows += 1;
        }
      }
    }
    expect(windows, "the sweep ran").toBeGreaterThan(50);
  });

  /**
   * **T1.27 (C25 I23, C10 I48) — a diff row's inks are the ones its ground was
   * measured for.** Read off the frame: the foregrounds an added row paints are
   * the theme's compositions for `diffAdd`, and never the flat slot a
   * composition replaced. Before the patch passed its ground, hcDark's gutter
   * drew `#0ab827` on `diffAdd` at 4.80 : 1 against a declared 7.
   */
  it("T1.27 (C25 I23, C10 I48): a diff row's gutter tone and syntax resolve against the row's own ground", () => {
    const foregrounds = (row: string): readonly string[] => {
      const out: string[] = [];
      for (const m of row.matchAll(/\x1b\[([0-9;]*)m/gu)) {
        const ps = m[1]!.split(";").map(Number);
        for (let i = 0; i < ps.length; i += 1) {
          if ((ps[i] === 38 || ps[i] === 48) && ps[i + 1] === 2) {
            if (ps[i] === 38) out.push(`#${ps.slice(i + 2, i + 5).map((n) => n.toString(16).padStart(2, "0")).join("")}`);
            i += 4;
          } else if ((ps[i] === 38 || ps[i] === 48) && ps[i + 1] === 5) i += 2;
        }
      }
      return out;
    };
    const patch = corpusPatch({ language: "typescript", layout: "unified", hunks: [corpusHunk(["-const a = 1", "+const b = 2"])] });
    let checked = 0; // cells-ok — a pairing count
    for (const id of ["nord", "hcDark", "hcLight"]) {
      const loaded = loadTheme(defaultTheme, id);
      if (!loaded.ok) throw new Error(`${id} loads`);
      const theme = loaded.value.current;
      const rows = measurable({ theme, definitions: [patchDefinition as unknown as BlockDefinition<never>] }).renderToLines(patch, 80);
      for (const [ground, text] of [["diffAdd", "const b"], ["diffRemove", "const a"]] as const) {
        const row = rows.find((r) => r.replace(/\x1b\[[0-9;]*m/gu, "").includes(text));
        if (row === undefined) throw new Error(`${id}: a row holding ${text}`);
        const drawn = foregrounds(row);
        for (const ref of ["tone.ok", "tone.error", "syntax.keyword"]) {
          if (ground === "diffAdd" && ref === "tone.error") continue;
          if (ground === "diffRemove" && ref === "tone.ok") continue;
          const composed = theme.tokens.composed?.[`surface.${ground}`]?.[ref];
          if (composed === undefined) continue;
          const [family, slot] = ref.split(".") as [string, string];
          const flat = theme.tokens.palettes[family]!.slots[slot]!;
          expect(drawn, `${id} ${ref} on ${ground}: the composed ink`).toContain(composed.toLowerCase());
          if (flat.toLowerCase() !== composed.toLowerCase()) {
            expect(drawn, `${id} ${ref} on ${ground}: not the flat slot`).not.toContain(flat.toLowerCase());
          }
          checked += 1;
        }
      }
    }
    // nord keyword on diffAdd; hcDark all four; hcLight tone.ok, tone.error, keyword on diffRemove.
    expect(checked, "the pairings the three themes compose").toBe(8);
  });

  it("T1.26 (C25 I22, F1191): the definition's window through a caller's scratch derives one plan per patch and width — set once, read back after, the block equal to a scratch-less call — and rebuilds for another width or another patch sharing the hunks array; with no scratch, as before", () => {
    // A stand-in with the seam's shape (C12 I107): one slot per owner.
    const slots = new Map<object, { key: string; value: unknown }>();
    let sets = 0;
    let gets = 0;
    const scratch: RenderScratch = {
      get: (owner, key) => {
        gets += 1;
        const slot = slots.get(owner);
        return slot !== undefined && slot.key === key ? slot.value : undefined;
      },
      set: (owner, key, value) => {
        sets += 1;
        slots.set(owner, { key, value });
      },
    };
    const window = patchDefinition.window;
    if (window === undefined) throw new Error("patch declares a window");
    const measure = (): number => 0;
    const candidate = PATCH_CORPUS.find((b) => b.kind === "patch" && (b as Patch).hunks.length >= 2);
    if (candidate === undefined || candidate.kind !== "patch") throw new Error("a two-hunk patch in the corpus");
    const patch: Patch = candidate;

    const plain = window(patch, SPLIT, 2, 8, measure);
    const a = window(patch, SPLIT, 2, 8, measure, scratch);
    expect(a, "the first call equals a call with no scratch").toEqual(plain);
    expect(sets, "one plan set").toBe(1);
    const b = window(patch, SPLIT, 3, 9, measure, scratch);
    expect(b).toEqual(window(patch, SPLIT, 3, 9, measure));
    expect(sets, "read back, not rebuilt").toBe(1);
    expect(gets).toBe(2);
    expect(slots.has(patch.hunks), "keyed on the hunks array").toBe(true);

    // **Another width rebuilds** — the key.
    window(patch, UNIFIED, 2, 8, measure, scratch);
    expect(sets, "a new width is a new plan").toBe(2);

    // **Another patch sharing the hunks array is refused, not read**: the held
    // plan's `patch` is not this block, so it is rebuilt and overwrites.
    const twin: Patch = block({ ...patch, id: `${patch.id}-twin`, path: `${patch.path}.twin` } as Patch) as Patch;
    expect(twin.hunks, "the twin shares the array").toBe(patch.hunks);
    const fromTwin = window(twin, UNIFIED, 2, 8, measure, scratch);
    expect(sets, "rebuilt for the twin").toBe(3);
    expect(fromTwin).toEqual(window(twin, UNIFIED, 2, 8, measure));
    expect((fromTwin.block as Patch).path, "the twin's own path, not the held plan's").toBe(twin.path);

    // **No scratch**: nothing is read or written and the bytes are the same.
    const before = sets + gets;
    expect(window(patch, SPLIT, 2, 8, measure)).toEqual(plain);
    expect(sets + gets).toBe(before);
  });
});
