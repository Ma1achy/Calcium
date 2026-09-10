/**
 * IK1–IK6 — the protocol arm, asserted as **properties rather than bytes**
 * (C09 I36 · C04 I73).
 *
 * **A golden of a kitty image is a base64 blob**, which is a record nobody can
 * check — F245's lesson about snapshots, arriving from the other side: a
 * snapshot agrees with whatever it recorded, and a reviewer cannot tell a
 * correct payload from a corrupt one by looking. So the dither frames are the
 * goldens and this arm is asserted structurally:
 *
 *   one transmission per digest
 *   the escape's form
 *   the grid's dimensions equal to what the block committed
 *   every placeholder carrying the diacritic pair its position implies
 */
import { describe, expect, it } from "vitest";
import { Box, Text, renderToString } from "ink";
import { createElement } from "react";
import {
  imageId,
  imageKey,
  placementFits,
  placementIdOf,
  placementRows,
  transmit,
  MAX_PLACEHOLDER_SPAN,
  PLACEHOLDER,
} from "../../src/presentation/image/kitty.js";
import { imageCells, placesAtProtocol } from "../../src/presentation/blocks/kinds/image.js";
import { digestOf, type Image } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";
import { ONE_PER_KIND } from "../support/blocks.js";
import { transmitImage, transmits, type SentImages } from "../../src/shell/transmit-image.js";
import { readFileSync } from "node:fs";

/**
 * Source with comments removed, because a source assertion over prose measures
 * the prose: every mechanism named below is also *described* in a comment two
 * lines away, so an unstripped match is satisfied by the explanation of the
 * thing it is meant to find.
 */
const strip = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
import { b } from "../../src/shell/builders/index.js";
import { rgbPng64 } from "../support/png.js";

const ESC = String.fromCharCode(27);
const KITTY_CAPS = { ...FULL_CAPS, imageProtocol: "kitty" as const };

const block = ONE_PER_KIND.image as Image;

/** The frame the protocol arm draws, unsplit. */
function frame(caps: TerminalCapabilities = KITTY_CAPS, width = 40): readonly string[] {
  const reg = createBlockRegistry();
  return renderToLines(reg, block, width, { theme: DARK_THEME, capabilities: caps });
}

describe("IK — the kitty arm, as properties", () => {
  it("IK1 (C09 I36): the id is derived from the digest, so duplication is free", () => {
    // **Derived rather than allocated** — two blocks holding one image agree on
    // the id without anything holding a table, so the second transmission
    // replaces the first with identical bytes.
    expect(imageId(block.digest)).toBe(imageId(block.digest));
    expect(imageId("aaaaaaaa")).not.toBe(imageId("bbbbbbbb"));
    // Never zero: kitty reads 0 as *unspecified* and would allocate its own,
    // which is an id nothing can place against.
    for (const d of ["00000000", "ffffffff", "0", "", "deadbeef"]) {
      expect(imageId(digestOf(d)), `digest of ${JSON.stringify(d)}`).toBeGreaterThan(0);
      expect(imageId(digestOf(d))).toBeLessThanOrEqual(0xff_ff_ff);
    }
  });

  it("IK2 (C09 I36): the transmit escape carries the four options that make it a placement", () => {
    const esc = transmit(7, "AAAA", 6, 3);
    expect(esc.startsWith(`${ESC}_G`), "an APC graphics escape").toBe(true);
    expect(esc.endsWith(`${ESC}\\`), "terminated by ST").toBe(true);
    for (const opt of ["a=T", "f=100", "i=7", "U=1", "c=6", "r=3", "q=2"]) {
      expect(esc, `carries ${opt}`).toContain(opt);
    }
    // **`q=2` for C02's own reason**: this framework runs no interactive probes,
    // and a reply would arrive as input nobody asked for.
    expect(esc).toContain("q=2");
    // The payload is last and after the semicolon, which is the format's rule.
    expect(esc.slice(esc.indexOf(";") + 1, -2), "the payload, unaltered").toBe("AAAA");
  });

  it("IK3 (C09 I36): every placeholder carries the diacritic pair its position implies", () => {
    const cols = 5;
    const rows = 3;
    const placed = placementRows(1, cols, rows);
    expect("rows" in placed, "a legal placement").toBe(true);
    if (!("rows" in placed)) return;
    expect(placed.rows, "the grid's dimensions are the block's").toHaveLength(rows);

    for (const [r, line] of placed.rows.entries()) {
      const marks = [...line.matchAll(new RegExp(`${PLACEHOLDER}(.)(.)`, "gu"))];
      expect(marks, `row ${String(r)} has one placeholder per column`).toHaveLength(cols);
      // **The row diacritic is constant down a row and the column one ascends**,
      // which is the property that makes a windowed row still address correctly
      // (F248) — and it is the one a byte comparison would never state.
      const rowMarks = new Set(marks.map((m) => m[1]));
      expect(rowMarks.size, `row ${String(r)} names one row`).toBe(1);
      const colMarks = marks.map((m) => m[2]);
      expect(new Set(colMarks).size, `row ${String(r)} names ${String(cols)} columns`).toBe(cols);
      // Distinct across rows, so no two rows claim the same part of the image.
      if (r > 0) {
        const previous = [...(placed.rows[r - 1] ?? "").matchAll(new RegExp(`${PLACEHOLDER}(.)`, "gu"))];
        expect(marks[0]?.[1], "each row names its own").not.toBe(previous[0]?.[1]);
      }
    }
  });

  it("IK4 (C09 I36): a placement past the encoding is refused, not wrapped", () => {
    // **A wrapped diacritic addresses the wrong part of the image**, which draws
    // a plausible wrong picture — the failure this arm exists to avoid, and the
    // one a reader cannot diagnose.
    const over = placementRows(1, MAX_PLACEHOLDER_SPAN + 1, 2);
    expect("fault" in over, "refused").toBe(true);
    if ("fault" in over) expect(over.fault).toMatch(/exceeds the \d+ positions/u);
    expect("fault" in placementRows(1, 0, 2), "and a zero span is not a placement").toBe(true);
    expect("rows" in placementRows(1, MAX_PLACEHOLDER_SPAN, 1), "the boundary itself is legal").toBe(true);
  });

  it("IK5 (C09 §4c): Ink strips the escape, which is why the arm has no call site", () => {
    // **The row that records the falsification.** The arm shipped on a ruling —
    // *transmission rides with placement, so no seam is needed* — built from
    // three true statements: `a=T` replaces at a stable id, Ink writes nothing
    // when nothing changes, therefore no session state. The conclusion was about
    // a mechanism nobody had run.
    const esc = transmit(7, "AAAA", 2, 1);
    const drawn = renderToString(
      createElement(Box, null, createElement(Text, null, `${esc}xy`)),
      { columns: 20 },
    );
    expect(drawn, "the APC is discarded and the text survives").toBe("xy");
    expect(drawn.includes(`${ESC}_G`), "so a frame cannot carry a transmission").toBe(false);
    // SGR is the control: Ink's tokeniser understands one escape family and not
    // the other, so this is about APC rather than about escapes.
    const sgr = renderToString(
      createElement(Box, null, createElement(Text, null, `${ESC}[38;2;1;2;3mxy${ESC}[39m`)),
      { columns: 20 },
    );
    expect(sgr, "SGR survives unchanged").toContain(`${ESC}[38;2;1;2;3m`);
  });

  it("IK6 (C09 §4c): the placeholders go through Ink and the transmission does not", () => {
    // **This row asserted the opposite until `transmitImage` landed** — *the
    // same frame at both protocols* was true while the arm was parked, and the
    // row is what said the state had changed rather than a comment going stale.
    const kitty = frame(KITTY_CAPS);
    const plain = frame(FULL_CAPS);
    expect(kitty, "the protocols now differ").not.toEqual(plain);
    expect(kitty.join("").includes(PLACEHOLDER), "kitty places").toBe(true);
    expect(plain.join("").includes(PLACEHOLDER), "and everything else dithers").toBe(false);

    // **No transmission in the frame**, because Ink would strip it and the
    // shell writes it instead. This is the property that keeps the two halves
    // in their own layers.
    expect(kitty.join("").includes(`${ESC}_G`), "the escape is not in the rendered lines").toBe(false);
    const { rows } = imageCells(block, 40);
    expect(kitty, "and it is the committed height").toHaveLength(rows);
  });

  it("IK9 (F379): the table is kitty's, and the arm reaches a real terminal's width", () => {
    // **The bound was 40 and every image a consumer places is wider**, so the
    // arm fell back to the dither on everything and had never drawn a pixel.
    // The sentence that justified it — *forty entries cover forty rows and forty
    // columns, which is past any height a transcript block declares* — is true
    // about height and silent about width, and a block's width is the
    // terminal's. Found in a real kitty; no assertion here could have said it,
    // because a refusal that falls back is well-formed.
    expect(MAX_PLACEHOLDER_SPAN).toBe(297);

    // The widths a terminal actually has, against the one that must still
    // refuse — a wrapped diacritic addresses the wrong part of the image.
    for (const cols of [56, 80, 130, 297]) {
      expect(placementRows(1, cols, 14), `${String(cols)} columns must place`).toHaveProperty("rows");
    }
    expect(placementRows(1, 298, 14), "past the encoding, still refused").toHaveProperty("fault");
  });

  it("IK10 (F380): the transmission declares the box the placement uses", () => {
    // **`c=1` was hardcoded at three call sites**, under a comment saying the
    // field is advisory. It is not: `c` sizes the virtual placement, so 784
    // placeholders spanning 56 columns addressed an image declared one column
    // wide, and nothing drew. Revert the width to a literal and this fails.
    const wide = { ...block, height: 14 } as Image;
    const out = transmitImage([wide], KITTY_CAPS, new Map<number, string>(), 120);
    const box = imageCells(wide, 120);
    expect(box.cols, "the fixture must be wider than one cell").toBeGreaterThan(1);
    expect(out, "the escape declares the placement's columns").toContain(`,c=${String(box.cols)},`);
    expect(out).toContain(`,r=${String(box.rows)},`);

    // **And it moves with the width**, which is what makes it a computation
    // rather than a second constant.
    // A width narrow enough that the clamp bites, so the two boxes differ.
    const narrow = transmitImage([wide], KITTY_CAPS, new Map<number, string>(), 8);
    const small = imageCells(wide, 8);
    expect(small.cols, "the narrow width must clamp").toBeLessThan(box.cols);
    expect(narrow).toContain(`,c=${String(small.cols)},`);
  });

  it("T1.42 (C09 I67): the arm is the capability and the box, and the two axes of the refusal are not equally reachable", () => {
    // **The gate has one expression.** `placementFits` and `placementRows`
    // answer the same question, so a copy of the condition in either cannot
    // drift from the other. Swept over both axes; the pairs are chosen so no
    // passing box builds more than a few hundred cells except at the boundary
    // itself, which is built once on each side.
    let swept = 0;
    const edges = [0, 1, 2, 3, 10, 296, 297, 298, 299, 400];
    for (const cols of [...Array.from({ length: 301 }, (_c, i) => i), 400]) {
      for (const rows of [0, 1, 2, 297, 298]) {
        expect(placementFits(cols, rows), `${String(cols)}x${String(rows)}`).toBe(
          "rows" in placementRows(1, cols, rows),
        );
        swept += 1;
      }
    }
    for (const rows of [...Array.from({ length: 301 }, (_c, i) => i), 400]) {
      for (const cols of [0, 1, 2, 297, 298]) {
        expect(placementFits(cols, rows), `${String(cols)}x${String(rows)}`).toBe(
          "rows" in placementRows(1, cols, rows),
        );
        swept += 1;
      }
    }
    for (const cols of edges) {
      for (const rows of edges) {
        if (cols * rows > 100_000) continue; // the 297x297 corner is built once, below
        expect(placementFits(cols, rows), `${String(cols)}x${String(rows)}`).toBe(
          "rows" in placementRows(1, cols, rows),
        );
        swept += 1;
      }
    }
    expect(placementFits(297, 297), "the corner itself").toBe("rows" in placementRows(1, 297, 297));
    expect(swept, "the sweep is not empty").toBeGreaterThan(3000);

    // **The capability is half of the arm and the box is the other half**
    // (F624, F1026). A shell that asked only the first gathered no frames for a
    // picture it was rasterising.
    const small = b.image({ id: "s", data: rgbPng64(16, 16, () => [200, 10, 10]), height: 4, alt: "a" }) as Image;
    for (const protocol of ["none", "iterm2", "sixel"] as const) {
      expect(
        placesAtProtocol(small, { ...FULL_CAPS, imageProtocol: protocol }, 80),
        `no arm but kitty places, and ${protocol} is not it`,
      ).toBe(false);
    }
    expect(placesAtProtocol(small, KITTY_CAPS, 80), "and kitty with an addressable box does").toBe(true);

    // **The columns axis needs a terminal wider than 297**, because
    // `imageCells` clamps `cols` to the width. Swept over the widths a terminal
    // has and the aspects a picture has.
    const aspects: readonly (readonly [number, number])[] = [[8, 8], [320, 240], [16, 400], [640, 64], [1, 100]];
    let overCols = 0;
    const widthsThatOverflow = new Set<number>();
    for (const width of [40, 60, 80, 120, 200, 296, 297, 298, 400, 600]) {
      for (const height of [1, 3, 10, 40, 100, 296, 297, 298, 400, 1000, 2000]) {
        for (const [pw, ph] of aspects) {
          const blk = b.image({ id: "x", data: rgbPng64(pw, ph, () => [1, 2, 3]), height, alt: "a" }) as Image;
          const box = imageCells(blk, width);
          if (box.cols > MAX_PLACEHOLDER_SPAN) { overCols += 1; widthsThatOverflow.add(width); }
        }
      }
    }
    expect(overCols, "the sweep reaches the columns axis at all").toBeGreaterThan(0);
    expect(
      [...widthsThatOverflow].every((w) => w > MAX_PLACEHOLDER_SPAN),
      "and only ever on a terminal wider than the encoding",
    ).toBe(true);

    // **The rows axis needs no unusual terminal at all**, which is the half
    // F624's defence — *at 298+ cells a still was already the honest answer* —
    // never covered. A 16x400 picture declared 400 rows tall is 32 cells wide.
    const tall = b.image({ id: "t", data: rgbPng64(16, 400, (x, y) => [x, y % 256, 0]), height: 400, alt: "a" }) as Image;
    expect(imageCells(tall, 80)).toEqual({ cols: 32, rows: 400 });
    expect(placesAtProtocol(tall, KITTY_CAPS, 80), "refused on rows, at 32 cells wide").toBe(false);
    expect(
      "fault" in placementRows(1, 32, 400) && placementRows(1, 32, 400),
      "and the refusal names the encoding rather than the width",
    ).toBeTruthy();

    // **The floor cannot be reached from `imageCells`**, so the `1x1` arm of the
    // refusal has no subject on this path — stated rather than left as a row
    // that restates its own rule.
    for (const width of [0, 1, -5, 0.4]) {
      const box = imageCells(tall, width);
      expect(Math.min(box.cols, box.rows), `width ${String(width)}`).toBeGreaterThanOrEqual(1);
    }
  });

  it("IK11 (F381): every chunk's payload is a multiple of four base64 bytes", () => {
    // **kitty decodes base64 per chunk rather than concatenating first**, so a
    // chunk whose length is not a multiple of 4 corrupts everything after it.
    // The reserve was `CHUNK - opts.length - 9` = 4042, and the failure was
    // total and silent: one chunk drew, two drew nothing, and the escape was
    // well-formed under every reading available here.
    //
    // Only a real terminal could find it. This row is what keeps it fixed.
    const big = "A".repeat(20_000);
    const out = transmit(7, big, 40, 10);
    const parts = out.split(`${ESC}_G`).slice(1);
    expect(parts.length, "the fixture must need several escapes").toBeGreaterThan(4);

    for (const [i, part] of parts.entries()) {
      const body = part.slice(part.indexOf(";") + 1, part.lastIndexOf(`${ESC}\\`));
      const last = i === parts.length - 1;
      if (!last) {
        expect(body.length % 4, `chunk ${String(i)} is not 4-aligned`).toBe(0);
      }
      // And the whole escape still fits the cap it is chunked for.
      expect(`${ESC}_G${part}`.length).toBeLessThanOrEqual(4096);
    }

    // The payload survives reassembly — the property the alignment protects.
    expect(parts.map((p) => p.slice(p.indexOf(";") + 1, p.lastIndexOf(`${ESC}\\`))).join("")).toBe(big);
  });

  it("IK7 (C09 §4c): the seam transmits once per digest, and only at kitty", () => {
    const sent: SentImages = new Map();
    const twice = [block, { ...block, id: "other" } as Image];
    const first = transmitImage(twice, KITTY_CAPS, sent, 80);
    const count = [...first.matchAll(new RegExp(`${ESC}_G`, "gu"))].length;
    expect(count, "two blocks of one image transmit once").toBe(1);
    expect(first).toContain(`i=${String(imageId(block.digest))}`);

    // **The set is session-scoped**, so a redraw sends nothing.
    expect(transmitImage(twice, KITTY_CAPS, sent, 80), "a second frame owes nothing").toBe("");

    // And at every other protocol there is nothing to send.
    expect(transmitImage(twice, FULL_CAPS, new Map<number, string>(), 80), "no protocol, no payload").toBe("");
  });

  it("IK8 (C09 §4c): the seam reaches an image nested inside a container", () => {
    // **The walk is structural, on `children`** — the same field the validator
    // and the animation walk read, which is the third mechanism that turns on
    // that name (C04 I73).
    const wrapped = b.mosaic({ height: 4, areas: "AB", children: [block, b.raw("x")] });
    const out = transmitImage([wrapped], KITTY_CAPS, new Map<number, string>(), 80);
    expect(out, "an image inside a mosaic still transmits").toContain(`${ESC}_G`);
    expect(out).toContain(`i=${String(imageId(block.digest))}`);
  });
  it("IK12 (F889): the transmit guard is one implementation, and the caller asks it before building its argument", () => {
    // **The argument is a `flatMap` over every block in every transcript entry,
    // built every frame.** `transmitImage`'s first line returns `""` unless the
    // terminal speaks kitty, so on every other terminal that array was built
    // and thrown away — 90 µs and eight thousand elements of garbage per frame
    // at two thousand entries (F889).
    expect(transmits(KITTY_CAPS), "kitty transmits").toBe(true);
    expect(transmits({ ...KITTY_CAPS, imageProtocol: "sixel" }), "nothing else does").toBe(false);
    expect(transmits({ ...KITTY_CAPS, imageProtocol: "none" })).toBe(false);

    // The predicate is exported so the caller can skip building the argument,
    // never so it can decide: `transmitImage` reads it too, and a second
    // `imageProtocol !== "kitty"` in `session.ts` is the drift C09 I1 forbids.
    const seam = strip(readFileSync("src/shell/transmit-image.ts", "utf8"));
    expect(seam, "the seam asks the same predicate").toMatch(/if \(!transmits\(capabilities\)\) return "";/);
    expect(seam, "and holds the only comparison").not.toMatch(/imageProtocol !== "kitty"/);

    // **The ordering is the row.** Reverting the caller to an unconditional
    // call restores the cost with no output change at all, on every terminal
    // that is not kitty — which is why nothing else here can see it.
    //
    // **Not asserted as "session.ts compares the protocol nowhere".** It does,
    // once, at `rasterising` — and that asks a different question (whether an
    // animated frame is a text frame) that happens to have the same test. A
    // negative over the file would fail for a reason it does not name, which is
    // the shape this row exists to avoid rather than to join.
    const caller = strip(readFileSync("src/shell/session.ts", "utf8"));
    expect(
      caller,
      "the per-entry map is inside the guard, not before it",
    ).toMatch(
      /transmits\(graph\.capabilities\)[^;]{0,400}transmitFrame\(\s*graph\.transcript\.entries\.map\(\(e\) => \(\{ scope: e\.id/,
    );
  });
});

// C22's §6j.4 ruling, I98, commitment 68 and T1.60 land in this commit; the row
// lands in the next one, with the seam and the call site it asserts. Nothing is
// waited on — the code is one commit behind the sentence that describes it.
describe("C22 §6j.4 — the seam takes the layout's width (I98)", () => {
  it.todo(
    "T1.60 (C22 I98, §6j.4, F1062): the declared box is the run's width, and a card transmits where the frame's width would refuse — not deferred on a component",
  );
});

describe("C09 §4c — the placement's identity is not the picture's (I66)", () => {
  it("T1.41 (I66): with a scope the id is a function of (scope, block id) alone, and without one it is the picture's", () => {
    // **The whole ruling in one function.** A placement id that moves with the
    // picture moves 400 placeholder cells with it, because the id is written
    // into every cell's foreground colour (F987).
    const png = (r: number) => rgbPng64(8, 8, () => [r, 0, 0]);
    const one = b.image({ id: "anim", data: png(10), height: 4, alt: "one" });
    const two = b.image({ id: "anim", data: png(200), height: 4, alt: "two" });
    const overlaid = b.image({
      id: "anim",
      data: png(10),
      height: 4,
      alt: "three",
      overlay: { values: [[1]], colormap: "viridis" },
    });
    expect(one.digest, "the fixture responds: two frames are two pictures").not.toBe(two.digest);

    // Two frames of one block, and the overlay does not move it either: the
    // scope and the block id are the whole input.
    expect(placementIdOf(one, "e1")).toBe(placementIdOf(two, "e1"));
    expect(placementIdOf(one, "e1")).toBe(placementIdOf(overlaid, "e1"));
    // A second scope, or a second block id, is a second placement.
    expect(placementIdOf(one, "e2")).not.toBe(placementIdOf(one, "e1"));
    const other = b.image({ id: "other", data: png(10), height: 4, alt: "o" });
    expect(placementIdOf(other, "e1")).not.toBe(placementIdOf(one, "e1"));

    // Every answer is a kitty id: never 0, which the terminal reads as
    // *unspecified* and would allocate for itself.
    for (const scope of ["e1", "e2", "", " ", "entry-3"]) {
      const id = placementIdOf(one, scope);
      expect(id, `scope ${JSON.stringify(scope)}`).toBeGreaterThanOrEqual(1);
      expect(id).toBeLessThanOrEqual(0xff_ff_ff);
    }

    // **With no scope it is the picture's, unchanged** — the safe and dear id
    // for a caller that has no scope to be unique within.
    expect(placementIdOf(one)).toBe(imageId(imageKey(one)));
    expect(placementIdOf(overlaid)).toBe(imageId(imageKey(overlaid)));
    expect(placementIdOf(one), "and the two arms are different questions").not.toBe(
      placementIdOf(one, "e1"),
    );
  });
});
