/**
 * The three catalogue tools that landed without a fixture (`make instruments`).
 *
 * **This target went red the day they landed and nobody ran it**, which is the
 * fourth time in this repository — `plot-catalogue.mjs` and `catalogue-png.mjs`
 * have a comment in `tools/instruments.mjs` saying the same thing about
 * themselves. **The gate is not missing; it is in `make all` and was skipped**
 * while three of seven targets were run and reported as per-target verification.
 *
 * **What a generator's fixture can honestly assert.** Not the picture: a sheet
 * is two megabytes of pixels and a row that opens it is asserting a photograph.
 * What can be *wrong* is arithmetic and correspondence — a digest that does not
 * move, a caption colliding with the row beneath it, a refusal list that has
 * drifted from the table it claims to mirror.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { digestOf } from "../../tools/catalogue-hash.mjs";
// @ts-expect-error — same.
import { COLS, defaultTiles, sheetSize, tileAt } from "../../tools/contact-defaults.mjs";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { PAIR_WIDTH, VARIANT_REFUSALS, drawablePick, pairLayout, partition, refusalMap, terminalWidthFor } from "../../tools/pair-catalogue.mjs";
import { SVG_FAMILY } from "../../src/presentation/plot/svg.js";
import type { PlotForm } from "../../src/data/viewmodel/index.js";
import { CATALOGUE_FORMS } from "../../tools/catalogue-forms.js";
import { sourceOf } from "../support/source.js";

const dir = mkdtempSync(join(tmpdir(), "cat-hash-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("CH — the catalogue digest, because git cannot see the directory (F257)", () => {
  it("CH1: a frame that changes changes the digest", () => {
    writeFileSync(join(dir, "a.txt"), "one\n");
    writeFileSync(join(dir, "b.txt"), "two\n");
    const before = digestOf(dir);
    expect(before.frames, "both frames counted").toBe(2);

    // **The fabricated violation, and it is the whole reason for `--dir`.**
    // Against `docs/catalogue/` this row could only be written by mutating the
    // thing being measured, so it would not have been written — and the other
    // rows would certify a tool that prints a constant.
    writeFileSync(join(dir, "b.txt"), "two but different\n");
    expect(digestOf(dir).digest, "one byte moved the digest").not.toBe(before.digest);

    writeFileSync(join(dir, "b.txt"), "two\n");
    expect(digestOf(dir).digest, "and restoring it restores the digest").toBe(before.digest);
  });

  it("CH2: a rename is a change, and the same input is the same answer", () => {
    const twice = [digestOf(dir), digestOf(dir)];
    expect(twice[0]?.digest, "reproducible — an unstable digest reports every run as a move")
      .toBe(twice[1]?.digest);

    // The name is hashed as well as the bytes, so two frames swapping contents
    // is a change. Hashing contents alone would call it identical.
    const before = digestOf(dir).digest;
    writeFileSync(join(dir, "a.txt"), "two\n");
    writeFileSync(join(dir, "b.txt"), "one\n");
    expect(digestOf(dir).digest, "a swapped pair is not the same catalogue").not.toBe(before);
    writeFileSync(join(dir, "a.txt"), "one\n");
    writeFileSync(join(dir, "b.txt"), "two\n");
  });

  it("CH4: the two populations are hashed apart (F264)", () => {
    // **The catalogue's frames are the terminal arm; `phase*` is the SVG arm's
    // own output.** Hashed as one, a frame the SVG arm was meant to add is
    // indistinguishable from a terminal frame that moved — and *the terminal
    // arm is untouched* is the gate this tool exists for.
    //
    // Measured on the first commit that added one: the total went from
    // `e25a2defe7da643d` to `9be0fef40a38305e` with **every one of the 890
    // byte-identical**, confirmed by stashing and regenerating.
    writeFileSync(join(dir, "phase3-new-cells.txt"), "added by the other arm\n");
    const cat = digestOf(dir, "catalogue");
    const phase = digestOf(dir, "phase");
    expect(cat.frames, "the addition is not counted as a catalogue frame").toBe(2);
    expect(phase.frames, "it is counted where it belongs").toBe(1);
    expect(digestOf(dir, "all").frames, "and the whole is still available").toBe(3);

    // The gate's own claim: adding to one leaves the other's digest alone.
    const before = digestOf(dir, "catalogue").digest;
    writeFileSync(join(dir, "phase3-another-cells.txt"), "and another\n");
    expect(digestOf(dir, "catalogue").digest, "the terminal arm did not move").toBe(before);
    expect(digestOf(dir, "phase").digest, "and the SVG arm did").not.toBe(phase.digest);

    rmSync(join(dir, "phase3-new-cells.txt"));
    rmSync(join(dir, "phase3-another-cells.txt"));
  });

  it("CH5: an empty group is a count, and the count is what says so", () => {
    // `sha256("")` is `e3b0c44298fc1c14…` and it prints exactly like an answer.
    // **The frame count is the only thing that distinguishes a clean population
    // from one the tool could not see** — the same one bit F257 was about, in
    // the tool built to fix it.
    const empty = mkdtempSync(join(tmpdir(), "cat-empty-"));
    const d = digestOf(empty, "catalogue");
    expect(d.frames, "zero, and visible").toBe(0);
    expect(d.digest, "the digest of nothing is still a digest").toBe(
      digestOf(empty, "phase").digest,
    );
    rmSync(empty, { recursive: true, force: true });
  });

  it("CH3: a non-frame in the directory is not counted", () => {
    const before = digestOf(dir);
    writeFileSync(join(dir, "sheet.png"), "not a frame");
    const after = digestOf(dir);
    expect(after.frames, "`.png` is output, not a frame").toBe(before.frames);
    expect(after.digest).toBe(before.digest);
  });
});

describe("CD — the defaults sheet's geometry", () => {
  const W = 400;
  const H = 120;

  it("CD1: tiles wrap at the column count and never overlap", () => {
    const boxes = Array.from({ length: 13 }, (_, i) => tileAt(i, W, H));
    expect(new Set(boxes.map((t) => t.top)).size, "13 tiles at 5 columns is 3 rows").toBe(3);
    expect(boxes[COLS]?.left, "the sixth tile starts a new row").toBe(boxes[0]?.left);
    expect(boxes[COLS]?.top).toBeGreaterThan(boxes[0]?.top ?? 0);
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        const apart = a.left + W <= b.left || b.left + W <= a.left || a.top + H <= b.top || b.top + H <= a.top;
        expect(apart, `tile ${i} clear of its neighbours`).toBe(true);
      }
    }
  });

  it("CD2: a caption sits below its tile and clear of the row beneath", () => {
    const rows = 3;
    for (let i = 0; i < rows * COLS; i += 1) {
      const t = tileAt(i, W, H);
      expect(t.labelY, "below the tile it names").toBeGreaterThan(t.top + H);
      const below = tileAt(i + COLS, W, H);
      expect(t.labelY, "and above the tile in the next row").toBeLessThan(below.top);
    }
  });

  it("CD4 (F313): one tile per form, every form, and no form twice", () => {
    // **The sheet collected `*-default-24bit.png`** — a substring test standing
    // in for *is this the form's representative frame*, and wrong in both
    // directions. It dropped every form with no variant called `default`
    // (`horizon`, `pie`) and picked up every *variant* whose name ends in
    // `-default` (`violin/bimodal-default`, tiled twice and labelled
    // `violin-bimodal` as though it were a form). 44 forms, one doubled, two
    // absent — **reported as 45** against a corpus of 46.
    //
    // `catalogue-png.mjs` carries a comment about this exact filter naming
    // `horizon` as its victim. It was fixed there and not here: the same file
    // pair, and the same relationship F261 already caught once.
    const tiles = (defaultTiles as () => { form: string; variant: string; file: string; name: string }[])();
    const forms = Object.keys(CATALOGUE_FORMS);
    expect(tiles.map((t) => t.form).sort()).toEqual([...forms].sort());
    expect(new Set(tiles.map((t) => t.form)).size, "no form appears twice").toBe(tiles.length);
    // **And the two that were absent are the rule's own subjects**, so this row
    // fails if either grows a `default` variant and the coverage question stops
    // being asked. Named rather than counted: a count reads as satisfied by any
    // two forms.
    const noDefault = forms.filter((f) => !("default" in (CATALOGUE_FORMS[f as PlotForm] as object)));
    expect(noDefault.sort(), "the forms whose representative is not called default").toEqual(["horizon", "pie"]);
    for (const f of noDefault) {
      const t = tiles.find((x) => x.form === f)!;
      expect(t.variant, `${f} still gets a tile`).not.toBe("default");
      expect(t.name, "and its label says which variant it is showing").toContain(t.variant);
    }
  });

  it("CD3: the sheet holds every tile it lays out", () => {
    for (const count of [1, 5, 6, 45]) {
      const { width, height, rows } = sheetSize(count, W, H);
      expect(rows).toBe(Math.ceil(count / COLS));
      const last = tileAt(count - 1, W, H);
      expect(last.left + W, `${count} tiles fit the width`).toBeLessThanOrEqual(width);
      expect(last.labelY, `${count} tiles fit the height`).toBeLessThanOrEqual(height);
    }
  });
});

describe("CG — a tool that exports a helper does not run on import", () => {
  const TOOLS = [
    "tools/catalogue-hash.mjs",
    "tools/contact-defaults.mjs",
    "tools/catalogue-png.mjs",
    "tools/plot-catalogue.mjs",
    "tools/phase-catalogue.mjs",
    "tools/pair-catalogue.mjs",
  ] as const;

  it("CG1: every catalogue tool with an export guards its work behind isMain", () => {
    // **This row exists because the suite caught the fixture** (F261).
    // `contact-defaults.mjs` had its whole sheet build at module top level with
    // a top-level `await`, so importing three pure helpers **rendered two
    // megabytes of PNG**. It passed alone, because `docs/catalogue` held 956
    // tiles at that moment; `plot-catalogue.mjs` clears every `.png` in that
    // directory, so the next full run found none and sharp refused the width.
    //
    // **A test that passes because of the state of a generated directory**, and
    // the tool that generates it sweeps. `catalogue-hash.mjs` got its guard in
    // the same commit and this one did not — the fix applied where the flaw was
    // noticed rather than to the pair, which is what this row is for.
    for (const tool of TOOLS) {
      const src = sourceOf(tool);
      const exports = /^export /mu.test(src);
      if (!exports) continue;
      expect(src, `${tool} exports a helper, so it must not run on import`).toMatch(/isMain/u);
    }
  });

  it("CG2: the scan sees the exports it is filtering on", () => {
    // **The control.** `CG1` is a loop with a `continue`, so a filter that
    // matched nothing would pass over an empty set in exactly the same green.
    const withExports = TOOLS.filter((t) => /^export /mu.test(sourceOf(t)));
    expect(withExports.length, "the rule has subjects").toBeGreaterThan(2);

    // And the one that does not export anything is named rather than silently
    // skipped: it cannot be imported for a helper, which is the whole hazard.
    const without = TOOLS.filter((t) => !/^export /mu.test(sourceOf(t)));
    expect(without, "phase-catalogue exports nothing, so nothing can import it")
      .toEqual(["tools/phase-catalogue.mjs"]);
  });

  it("CG3: an empty tile set is named, not thrown at by sharp", () => {
    // *Expected valid width, height and channels* says nothing about the
    // ordinary state between `plot-catalogue.mjs` and `catalogue-png.mjs`.
    expect(sourceOf("tools/contact-defaults.mjs")).toMatch(/no default tiles in/u);
  });
});

describe("PC — the phase catalogue's two claims", () => {
  it("PC1: the refused list is derived from SVG_FAMILY, not written beside it", () => {
    // The tool writes a `refused forms` note. **It must be computed from the
    // table** — a hand-list is the drift `CATALOGUE_FORMS` had when it fell to
    // 26 of 34 — so this asserts the source, not the note.
    const src = sourceOf("tools/phase-catalogue.mjs");
    expect(src, "the refusal list comes from the table").toMatch(/SVG_FAMILY\)\.filter/u);
    // **A total partition, not a count.** The refused set shrinks by design as
    // each family lands — 27 at phase 3, 24 once distribution claimed three —
    // so a number here would be a row that fails on every commit that works.
    // What holds is that the two sides are exhaustive and disjoint.
    const forms = Object.keys(SVG_FAMILY);
    const refused = forms.filter((f) => SVG_FAMILY[f as keyof typeof SVG_FAMILY] === null);
    const claimed = forms.filter((f) => SVG_FAMILY[f as keyof typeof SVG_FAMILY] !== null);
    expect(refused.length + claimed.length, "every form is on exactly one side").toBe(forms.length);
    expect(forms.length, "and the union is 47").toBe(47);
    // **The refused set is empty, and the sentence above is why that is asserted
    // by equality** (F383). *A number here would be a row that fails on every
    // commit that works* was right about a **count**; it stopped being right the
    // day the count reached its floor, because `> 0` cannot say *this side is
    // now empty* and a returning refusal would pass it. The partition is still
    // the claim — exhaustive and disjoint, above — and this is the one value the
    // shrinking set can no longer shrink past.
    // **And the shrinking set grew, which is the day the equality was written
    // for.** `scatter3d` carries geometry this path does not compute (C12
    // §3am), so the refusal it names is a decision rather than a gap.
    expect(refused, "the refused forms, derived from SVG_FAMILY").toEqual(["scatter3d"]);
    expect(claimed.length, "and the claimed side is the rest of it").toBe(forms.length - 1);
  });

  it("PC2: the ordering hazard is real — the sweeper would delete these frames", () => {
    // *Run AFTER `plot-catalogue.mjs`, and the order is not a preference.* The
    // fabricated violation for that sentence: the phase frames are `.txt` in
    // the same directory, and `clearGenerated` removes every `.txt`. Measured
    // once by watching 66 files become 1 (F257).
    const sweeper = sourceOf("tools/plot-catalogue.mjs");
    // **`svg` joined the pattern when T2 landed** and this row is what noticed —
    // a source assertion doing the job it exists for. The SVG baseline is
    // generated into a tracked directory by the same sweep-then-write shape, so
    // a removed fixture must leave a *deletion* in its diff too (F275). The
    // hazard this row is about is unchanged: a `.txt` extension is what makes
    // the phase frames vulnerable to running the two tools out of order.
    expect(sweeper, "the sweeper takes .txt").toMatch(/\\\.\(txt\|plain\|png\|svg\)/u);
    const phase = sourceOf("tools/phase-catalogue.mjs");
    expect(phase, "and the phase frames are .txt").toMatch(/\.txt/u);
    // **The precondition, which is the half that could stop being true.** The
    // hazard needs both tools writing into *one* directory; if either moved,
    // the ordering rule in the header would be a caution about nothing.
    for (const tool of ["tools/plot-catalogue.mjs", "tools/phase-catalogue.mjs"]) {
      expect(sourceOf(tool), `${tool} writes to docs/catalogue`).toMatch(/"docs", "catalogue"/u);
    }
  });
});

describe("PR — the pair catalogue's partition, which is the counter restated (F309)", () => {
  const refused = refusalMap as (dir?: string) => Record<string, Record<string, boolean>>;
  const split = partition as (
    map?: Record<string, Record<string, boolean>>,
    decls?: Record<string, Record<string, string>>,
  ) => {
    family: string[]; variant: string[]; undeclared: string[]; declaredUnused: string[];
  };
  const pick = drawablePick as (form: string, map?: Record<string, Record<string, boolean>>) => string;
  const layout = pairLayout as (l: number, r: number) => {
    width: number; height: number; left: { x: number; y: number }; right: { x: number; y: number };
  };
  // **`VARIANT_REFUSALS` is empty and PR4 fabricates its own** (F383), so this
  // is read for its *shape* rather than its members: the rows below still have
  // to typecheck against the declaration format, and an empty object with the
  // wrong type would say nothing.
  const declared = VARIANT_REFUSALS as Record<string, Record<string, string>>;
  expect(Object.keys(declared), "every declaration retired as its refusal lifted").toEqual([]);

  const map = refused();
  const part = split(map);
  const allRefused = Object.entries(map)
    .flatMap(([form, vs]) => Object.entries(vs).filter(([, r]) => r).map(([v]) => `${form}/${v}`))
    .sort();

  it("PR1 (F309): every refused frame is attributable to a named cause", () => {
    // **The plan's counter was *refusals drawn against `SVG_FAMILY`'s null
    // count, and they must agree*.** They cannot: the left is **frames** and the
    // right is **forms**. Restated as a total partition it works, and finding
    // out that it works is what turned up the nine frames no record covered.
    expect([...part.family, ...part.variant].sort()).toEqual(allRefused);
    expect(part.family.length + part.variant.length, "and nothing is counted twice")
      .toBe(allRefused.length);
    // **The corpus has no refusals left, and that is asserted rather than
    // implied** (F383). It was `> 0` — *the corpus has refusals to partition* —
    // which is a premise the row needed and could not state once the count
    // reached zero. The partition above still holds over an empty set, so the
    // row keeps its shape and gains the one fact the bound cannot carry: a
    // refusal reappearing fails here, named.
    // **And a refusal returned, which is what the equality was for** (C12
    // §3am). `scatter3d` is `SVG_FAMILY: null`, so every one of its variants is
    // refused **by family** rather than by variant — the partition above is
    // what says which side they land on, and it says family, which is the
    // truth: no variant of the form draws and none could.
    expect(allRefused, "the refused frames, by name").toEqual([
      "scatter3d/axes-none",
      "scatter3d/axes-origin",
      "scatter3d/axis-styles",
      "scatter3d/box-full",
      "scatter3d/colour-series",
      "scatter3d/colour-value",
      "scatter3d/coplanar",
      "scatter3d/default",
      "scatter3d/lines-series",
      "scatter3d/orthographic",
      "scatter3d/trajectory",
      "scatter3d/wireframe",
    ]);
    expect(part.family.sort(), "and every one of them is a family refusal").toEqual(allRefused);
    // **Not a magnitude** (F310). `> 50` was a number that had to be edited every
    // time a form landed and said nothing when it did — and this pass has moved
    // it from 77 to 45 in eight commits. What the row needs is that the partition
    // has something to partition, which is what the two assertions above are
    // about; the floor is `> 0`, and the day it reaches zero the arm claims every
    // frame and this row says so first.
  });

  it("PR2 (F309): the declared variant refusals match the corpus, both directions", () => {
    // **Equality, never a subset** — a subset check lets a dead entry outlive
    // its reason unread, and lets a new refusal in silently, which is the one
    // thing a `null` arm must not do (F259).
    expect(part.undeclared, "a refusal in the corpus that no declaration names").toEqual([]);
    expect(part.declaredUnused, "a declaration for a frame that now draws").toEqual([]);
  });

  it("PR3 (F309): the family half is exactly SVG_FAMILY's null set — forms against forms", () => {
    // This **is** the plan's counter, in the units that make it true. A form
    // whose every variant refuses is a family refusal; the table says which
    // forms have no emitter. The two sets are the same set or one of them is
    // wrong, and either way it is a form refused somewhere the record does not
    // say.
    const familyForms = [...new Set(part.family.map((s) => s.split("/")[0]))].sort();
    const nulls = Object.keys(SVG_FAMILY)
      .filter((f) => SVG_FAMILY[f as keyof typeof SVG_FAMILY] === null)
      .sort();
    expect(familyForms).toEqual(nulls);
  });

  it("PR4: the partition responds — a new refusal and a dead declaration are both named", () => {
    // **The control.** PR1–PR3 are three green assertions over one corpus, and
    // a classifier that returned empty arrays for everything would satisfy two
    // of them. Fabricated both violations rather than trusting the shape.
    // **The first declared form is the degenerate pick.** It was `bar`, whose
    // one declaration was `empty`; when the empty variants stopped being
    // refusals (F363) the first became `flame`, which has two variants and one
    // already refused — so flipping the other made every variant refused, the
    // form slid to a *family* refusal, and `undeclared` was correctly empty
    // while the control read as broken. A fabrication needs a subject that can
    // carry it: a form with at least two variants still drawing.
    //
    // **And now `declared` is empty, so the subject has to be fabricated too**
    // (F383). Every entry retired, so `Object.keys(declared)[…]` was `undefined`
    // and the control threw — which is the good failure for a control losing its
    // subject, and it is why `partition` takes its declarations. The *arm* being
    // tested is unchanged; what changed is that its live instances are gone, and
    // a control that only runs while a defect exists is not a control.
    const form = Object.keys(map).find((f) =>
      Object.values(map[f] ?? {}).filter((r) => !r).length > 1)!; // cells-ok — a variant count
    const variant = Object.keys(map[form]!)[0]!;
    const decls = { [form]: { [variant]: "fabricated, so the arm has a subject" } };

    const appeared = structuredClone(map);
    const victim = Object.keys(appeared[form]!).find((v) => !appeared[form]![v] && v !== variant)!;
    appeared[form]![victim] = true;
    expect(split(appeared, decls).undeclared, "a refusal nothing declares is named")
      .toEqual([`${form}/${victim}`]);

    // The declared frame draws — which is what a dead declaration *is*, and in
    // the live corpus is now true of every frame, so this is the whole of the
    // arm's coverage rather than a supplement to it.
    expect(split(map, decls).declaredUnused, "a declaration whose frame now draws is named")
      .toEqual([`${form}/${variant}`]);
  });

  it("PR5: the sheet shows a form by a variant this arm can draw, not by its name", () => {
    // **The rule `phase-catalogue.mjs` already had to make**, for the same
    // measured reason: `flame` and `icicle` carry two datum shapes and their
    // `default` is the one this arm refuses. A sheet keyed on the name shows
    // two claimed forms as refused and reads as an arm working for fewer forms
    // than it does.
    // **The rule survives its own reason** (F383). `flame` and `icicle` still
    // carry two datum shapes, and their `default` — categories with no
    // hierarchy — is no longer refused: it routes to the bar family, because
    // that is what the terminal draws for it. So `pick` must still return a
    // drawable variant, and now every variant is one.
    for (const form of ["flame", "icicle"]) {
      expect(map[form]?.default, `${form}'s default draws now`).toBe(false);
      expect(map[form]?.[pick(form)], `so ${form} is shown by a drawable variant`).toBe(false);
    }
    // **And `pick` is still exercised against a form with nothing drawable** —
    // except no such form exists any more, so the fallback has no witness in the
    // corpus. Asserted by equality so the row wakes up if one returns; `pick`'s
    // own placard arm keeps its unit coverage in PR6.
    // **And one returned, so `pick`'s fallback has a witness in the corpus
    // again.** `scatter3d` is refused in every variant, which is the state this
    // row was written against and lost when F383 gave the density family an
    // emitter. `pick` must still return a variant — a placard is a frame — and
    // the assertion is that it does rather than throwing or returning nothing.
    const allDead = Object.keys(map).filter((f) => Object.values(map[f]!).every(Boolean));
    expect(allDead, "the forms refused in every variant").toEqual(["scatter3d"]);
    expect(map["scatter3d"]?.[pick("scatter3d")], "and pick still names one of them").toBe(true);
  });

  it("PR7 (F315): the terminal scale is constant, so tiles compare with each other too", () => {
    // **Width is the axis and the fit is not the rule.** Fitting each pair to
    // the slot is F311's mistake one level down, and the first sheet showed it:
    // the frames run **27 to 80 columns**, so a per-pair fit applies 0.99× to
    // 2.84× and a 33-column waffle arrives two and a half times the size of an
    // 80-column line. A contact sheet whose tiles are at different scales is not
    // a contact sheet.
    const w = terminalWidthFor as (natural: number) => number;
    const eighty = w(685); // an 80-column frame, near enough to the reference
    expect(eighty, "80 columns fills the slot").toBeGreaterThan(670);
    expect(eighty, "and does not overflow it").toBeLessThanOrEqual(PAIR_WIDTH as number);
    // **Linear, which is the whole property**: half the columns is half the
    // width, never half of a refitted slot. A fit would return the same number
    // for both of these, and that is exactly the defect.
    expect(w(342)).toBeLessThan(eighty * 0.55);
    expect(w(342)).toBeGreaterThan(eighty * 0.45);
    expect(w(171) * 2, "and it composes").toBeCloseTo(w(342), -1);
  });

  it("PR6 (F309): the halves are laid out at equal width, and the taller one sets the box", () => {
    // **The plan said equal *height* and the axis is wrong.** A terminal frame
    // is wide and short — 80 cells across, 3–20 rows down — and every SVG frame
    // is 640×320 whatever the block's `height` says. Matching heights scales a
    // 3-row heatmap by ten. Matching widths leaves both at reading size and
    // makes the height difference the visible thing, which is a real
    // disagreement no row reaches.
    const box = layout(92, 340);
    expect(box.right.x - box.left.x, "the two halves start one width plus a gap apart")
      .toBeGreaterThan(PAIR_WIDTH as number);
    expect(box.height, "the taller half sets the body").toBeGreaterThan(340);
    expect(box.left.y, "and both sit below the caption").toBe(box.right.y);
    // Symmetric in its argument: the terminal half being the taller one must
    // work the same way, or the box clips whichever side the corpus happens to
    // make short.
    expect(layout(340, 92).height).toBe(box.height);
  });
});
