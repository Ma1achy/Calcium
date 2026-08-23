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
import { COLS, sheetSize, tileAt } from "../../tools/contact-defaults.mjs";
import { SVG_FAMILY } from "../../src/presentation/plot/svg.js";
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
    expect(forms.length, "and the union is 46").toBe(46);
    expect(refused.length, "some are still refused").toBeGreaterThan(0);
  });

  it("PC2: the ordering hazard is real — the sweeper would delete these frames", () => {
    // *Run AFTER `plot-catalogue.mjs`, and the order is not a preference.* The
    // fabricated violation for that sentence: the phase frames are `.txt` in
    // the same directory, and `clearGenerated` removes every `.txt`. Measured
    // once by watching 66 files become 1 (F257).
    const sweeper = sourceOf("tools/plot-catalogue.mjs");
    expect(sweeper, "the sweeper takes .txt").toMatch(/\\\.\(txt\|plain\|png\)/u);
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
