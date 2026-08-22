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

describe("PC — the phase catalogue's two claims", () => {
  it("PC1: the refused list is derived from SVG_FAMILY, not written beside it", () => {
    // The tool writes a `refused forms` note. **It must be computed from the
    // table** — a hand-list is the drift `CATALOGUE_FORMS` had when it fell to
    // 26 of 34 — so this asserts the source, not the note.
    const src = sourceOf("tools/phase-catalogue.mjs");
    expect(src, "the refusal list comes from the table").toMatch(/SVG_FAMILY\)\.filter/u);
    const refused = Object.entries(SVG_FAMILY).filter(([, f]) => f === null);
    expect(refused.length, "27 of 46 carry their own geometry").toBe(27);
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
