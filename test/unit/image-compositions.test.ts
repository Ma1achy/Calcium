/**
 * Phase 2's last question, **measured rather than predicted** (C04 §3h).
 *
 * §3h closes with a claim: *before/after/residual is three samples with a shared
 * scale, a confusion matrix of examples is a sample grid whose bands are the
 * confused classes, and image-plus-histogram is a `row` group holding an `image`
 * and a `plot`. Each is worth building when a consumer asks; **none needs a
 * mechanism this section does not already have.**
 *
 * **Each is built here the way a consumer would build it** — from `b` and
 * nothing else, because a builder added to the framework to make a composition
 * work *is* the mechanism the claim denies. Where one is needed the row says so
 * and names it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { b } from "../../src/shell/builders/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { validateBlock } from "../../src/data/viewmodel/index.js";
import { DARK_THEME, FULL_CAPS, drawsPicture } from "../support/render.js";
import { rgbPng64 } from "../support/png.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";

const SGR = new RegExp(String.fromCharCode(27) + String.raw`\[[0-9;]*m`, "gu");
// **`plot` is registered by C12 through the public `register`** and is not
// in C09's defaults — so a consumer composing an image with a plot registers
// it exactly as they would for a plot on its own. Not a mechanism: the
// composition inherits the registration the plot already needed.
const reg = createBlockRegistry();
reg.register(plotDefinition as unknown as BlockDefinition);
const measureBlock = (blk: Block, w: number): number => reg.measure(blk, w);

const draw = (blk: Block, w = 60, caps = FULL_CAPS): readonly string[] =>
  renderToLines(reg, blk, w, { theme: DARK_THEME, capabilities: caps }).map((l) => l.replace(SGR, ""));

/** The colours a row carries, in order — what a plain frame read cannot see. */
const colours = (blk: Block, w = 60, caps = FULL_CAPS): readonly string[] =>
  renderToLines(reg, blk, w, { theme: DARK_THEME, capabilities: caps })
    .flatMap((l) => [...l.matchAll(new RegExp(String.fromCharCode(27) + String.raw`\[38;2;(\d+;\d+;\d+)m`, "gu"))])
    .map((m) => m[1] ?? "");

/**
 * A consumer's picture: **they hold the pixels**, which is the case that decides
 * composition 1. An ML reader has an array and encodes a PNG to show it; they do
 * not start from a file they must decode.
 */
function picture(w: number, h: number, f: (x: number, y: number) => number): {
  png: string;
  values: readonly number[];
} {
  const values: number[] = [];
  const png = rgbPng64(w, h, (x, y) => {
    const v = Math.max(0, Math.min(255, Math.round(f(x, y))));
    values.push(v);
    return [v, v, v];
  });
  return { png, values };
}

describe("phase 2 · the three compositions, against §3h's claim", () => {
  it("C1 (§3h): image + histogram — a `row` group, and the pixels never leave the consumer", () => {
    // **The prediction was that this breaks the claim outright**: the histogram
    // needs decoded pixels, which live behind `pixelsOf` in `presentation/`,
    // while a plot's data lives in the document, and there is no seam between
    // them. Measured, the premise is the thing that is wrong — **the consumer
    // already holds the pixels**. They encode a PNG to *show* the array; the
    // histogram is of the array they had before there was a PNG at all.
    // A radial falloff, so the histogram has a shape rather than a flat top.
    const { png, values } = picture(64, 32, (x, y) =>
      255 * Math.exp(-(((x - 32) / 22) ** 2 + ((y - 16) / 11) ** 2)),
    );

    const composed = b.group("row", [
      b.image({ id: "pic", data: png, height: 8, alt: "the sample" }),
      b.plot({
        id: "hist",
        form: "histogram",
        height: 8,
        series: [{ label: "luminance", values }],
      }),
    ]);

    const v = validateBlock(JSON.parse(JSON.stringify(composed)));
    expect(v.ok, v.ok ? "" : JSON.stringify(v.error)).toBe(true);

    const lines = draw(composed);
    console.log(`C1  measured ${String(measureBlock(composed, 60))} · rendered ${String(lines.length)}`);
    for (const l of lines) console.log(`C1  |${l}|`);
    // **Read the frame, not only the numbers**: both halves must be present on
    // the same rows, which is the whole of what "a row group" claims.
    expect(measureBlock(composed, 60)).toBe(lines.length);
    expect(lines.some((l) => drawsPicture(l)), "the picture is drawn").toBe(true);
    // **Both halves on the same rows**, which is the whole of what "a row
    // group" claims and the only thing a frame read can confirm.
    expect(
      lines.filter((l) => drawsPicture(l) && /[▏▎▍▌▋▊▉█]/u.test(l)).length,
      "picture and histogram share their rows",
    ).toBeGreaterThanOrEqual(7);
  });

  it("C1b (§3h): the consumer who holds only a PATH has no route to the pixels", () => {
    // **The residue C1 leaves, and it is a surface rather than a rendering.**
    // `b.image({ path })` reads a file, so that consumer never sees a pixel —
    // and `decodePng` is not on C24's public surface. They can show the picture
    // and cannot plot anything about it.
    //
    // **Written to expire.** A negative claim passes hardest the day it becomes
    // false, so this fails when the export lands rather than going quiet — and
    // the failure is the reminder that the residue was closed.
    const api = readFileSync(new URL("../../src/index.ts", import.meta.url), "utf8");
    expect(
      /\bdecodePng\b/u.test(api),
      "decodePng has reached C24 — close the residue in C04 §3h.3 and delete this row",
    ).toBe(false);
    // The control: the surface is being read at all, rather than an empty string
    // agreeing with every absence.
    expect(/\bexport \{ b \}/u.test(api), "the file read is C24's surface").toBe(true);
  });

  it("C2 (§3h): before / after / residual — three panels, and the scale is the question", () => {
    // **The one predicted to want a mechanism.** Three `b.image` blocks
    // normalise separately by construction — so the measurement is what a
    // residual does when each panel is read on its own extent.
    const before = picture(48, 24, (x, y) => 120 + 40 * Math.sin(x / 6) * Math.cos(y / 5));
    const after = picture(48, 24, (x, y) => 120 + 40 * Math.sin(x / 6 + 0.4) * Math.cos(y / 5));
    // The residual is small — a few units where the panels are hundreds.
    const diff = before.values.map((v, i) => Math.abs(v - (after.values[i] ?? 0)));
    const grid = (vals: readonly number[], w: number, h: number, cols: number, rows: number): number[][] =>
      Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          let sum = 0;
          let n = 0;
          for (let y = Math.floor((r * h) / rows); y < Math.floor(((r + 1) * h) / rows); y += 1) {
            for (let x = Math.floor((c * w) / cols); x < Math.floor(((c + 1) * w) / cols); x += 1) {
              sum += vals[y * w + x] ?? 0;
              n += 1;
            }
          }
          return n === 0 ? 0 : sum / n;
        }),
      );

    const beforeField = grid(before.values, 48, 24, 8, 8);
    const afterField = grid(after.values, 48, 24, 8, 8);
    const diffField = grid(diff, 48, 24, 8, 8);

    // **Arm A — each panel on its own extent**, which is what an overlay with no
    // declared scale does and what matplotlib's `imshow` does by default.
    const own = (values: number[][], id: string): Block =>
      b.image({ id, data: before.png, height: 6, alt: id, overlay: { values } });
    // **Arm B — one scale across all three**, declared.
    const lo = Math.min(...[beforeField, afterField, diffField].flat(2));
    const hi = Math.max(...[beforeField, afterField, diffField].flat(2));
    const shared = (values: number[][], id: string): Block =>
      b.image({ id, data: before.png, height: 6, alt: id, overlay: { values, yMin: lo, yMax: hi } });

    const panels = (make: (v: number[][], id: string) => Block): Block =>
      b.group("row", [make(beforeField, "b"), make(afterField, "a"), make(diffField, "r")]);

    // **The residual read on its own, because that is where the lie is.**
    // Three panels side by side would average the effect away; the question is
    // whether the *difference* panel looks as loud as the two it came from.
    const hottest = (blk: Block): number => {
      const seen = colours(blk, 20).map((c) => c.split(";").map(Number));
      // inferno runs dark blue to pale yellow, so the hottest cell is the one
      // with the greatest luminance — a reading of the ramp rather than of a
      // colour name.
      return Math.max(0, ...seen.map((c) => 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0)));
    };

    console.log(
      `C2  residual extent ${diffField.flat().reduce((a, x) => Math.min(a, x), Infinity).toFixed(1)}..` +
        `${diffField.flat().reduce((a, x) => Math.max(a, x), -Infinity).toFixed(1)} against panels ` +
        `${lo.toFixed(1)}..${hi.toFixed(1)}`,
    );
    const ownResidual = hottest(own(diffField, "r"));
    const sharedResidual = hottest(shared(diffField, "r"));
    const ownBefore = hottest(own(beforeField, "b"));
    const sharedBefore = hottest(shared(beforeField, "b"));
    console.log(
      `C2  hottest cell — residual own ${ownResidual.toFixed(0)} shared ${sharedResidual.toFixed(0)} · ` +
        `before own ${ownBefore.toFixed(0)} shared ${sharedBefore.toFixed(0)}`,
    );
    console.log(`C2  three panels, own-extent: ${String(new Set(colours(panels(own), 60)).size)} distinct colours`);
    console.log(`C2  three panels, declared:   ${String(new Set(colours(panels(shared), 60)).size)} distinct colours`);

    // **The measurement, and it is the whole finding.** Read on its own extent
    // the residual reaches the top of the ramp — it looks exactly as loud as the
    // panels it is the difference of, and a reader comparing three pictures
    // reads a 14-unit difference as a 158-unit signal. Declared, it sits where
    // it belongs.
    expect(ownResidual, "own extent: the residual burns as bright as a panel").toBeGreaterThan(ownBefore * 0.9);
    expect(sharedResidual, "declared: it does not").toBeLessThan(sharedBefore * 0.6);
  });

  it("C3 (§3h): a confusion matrix of examples — a mosaic whose bands are the classes", () => {
    // **Predicted to compose, and the headers are the part `b.samples` has no
    // room for**: a confusion matrix needs a true-class axis down the side and a
    // predicted-class axis across the top, and a sample grid is a flat band of
    // pictures with captions.
    const classes = ["cat", "dog", "fox"];
    const cell = (i: number, j: number): string =>
      picture(24, 24, (x, y) => 30 + i * 60 + j * 30 + ((x + y) % 12) * 8).png;

    // Header row, then one band per true class: label, then the three cells.
    const cols = classes.length + 1;
    const rowsSpec: string[] = [];
    const children: Block[] = [];
    const name = (n: number): string =>
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[n] ?? ".";
    let next = 0;
    // The corner and the predicted-class headers.
    const head: string[] = [];
    for (let c = 0; c < cols; c += 1) {
      head.push(name(next));
      children.push(b.raw(c === 0 ? "" : (classes[c - 1] ?? ""), { id: `h${String(c)}` }));
      next += 1;
    }
    rowsSpec.push(head.join(""));
    for (const [i, klass] of classes.entries()) {
      const band: string[] = [];
      for (let c = 0; c < cols; c += 1) {
        band.push(name(next));
        children.push(
          c === 0
            ? b.raw(klass, { id: `r${String(i)}` })
            : b.image({ id: `c${String(i)}${String(c)}`, data: cell(i, c - 1), height: 3, alt: `${klass}->${String(classes[c - 1])}` }),
        );
        next += 1;
      }
      rowsSpec.push(band.join(""));
    }

    const matrix = b.mosaic({
      height: 1 + classes.length * 3,
      areas: rowsSpec.join("/"),
      rows: [{ cells: 1 }, ...classes.map(() => ({ cells: 3 }))],
      columns: [{ cells: 6 }, 1, 1, 1],
      children,
    });

    const v = validateBlock(JSON.parse(JSON.stringify(matrix)));
    expect(v.ok, v.ok ? "" : JSON.stringify(v.error)).toBe(true);
    const lines = draw(matrix, 60);
    console.log(`C3  measured ${String(measureBlock(matrix, 60))} · rendered ${String(lines.length)}`);
    for (const l of lines) console.log(`C3  |${l}|`);
    expect(measureBlock(matrix, 60)).toBe(lines.length);
    // The headers are on the first row and the class labels down the first column.
    expect(lines[0]).toContain("cat");
    expect(lines.slice(1).some((l) => l.startsWith("cat"))).toBe(true);
    expect(lines.filter((l) => drawsPicture(l)).length).toBeGreaterThan(0);
  });
});
