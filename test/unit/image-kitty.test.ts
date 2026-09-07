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
import { imageId, placementRows, transmit, MAX_PLACEHOLDER_SPAN, PLACEHOLDER } from "../../src/presentation/image/kitty.js";
import { imageCells } from "../../src/presentation/blocks/kinds/image.js";
import { digestOf, type Image } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";
import { ONE_PER_KIND } from "../support/blocks.js";
import { transmitImage } from "../../src/shell/transmit-image.js";
import { b } from "../../src/shell/builders/index.js";

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
    const out = transmitImage([wide], KITTY_CAPS, new Set<string>(), 120);
    const box = imageCells(wide, 120);
    expect(box.cols, "the fixture must be wider than one cell").toBeGreaterThan(1);
    expect(out, "the escape declares the placement's columns").toContain(`,c=${String(box.cols)},`);
    expect(out).toContain(`,r=${String(box.rows)},`);

    // **And it moves with the width**, which is what makes it a computation
    // rather than a second constant.
    // A width narrow enough that the clamp bites, so the two boxes differ.
    const narrow = transmitImage([wide], KITTY_CAPS, new Set<string>(), 8);
    const small = imageCells(wide, 8);
    expect(small.cols, "the narrow width must clamp").toBeLessThan(box.cols);
    expect(narrow).toContain(`,c=${String(small.cols)},`);
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
    const sent = new Set<string>();
    const twice = [block, { ...block, id: "other" } as Image];
    const first = transmitImage(twice, KITTY_CAPS, sent, 80);
    const count = [...first.matchAll(new RegExp(`${ESC}_G`, "gu"))].length;
    expect(count, "two blocks of one image transmit once").toBe(1);
    expect(first).toContain(`i=${String(imageId(block.digest))}`);

    // **The set is session-scoped**, so a redraw sends nothing.
    expect(transmitImage(twice, KITTY_CAPS, sent, 80), "a second frame owes nothing").toBe("");

    // And at every other protocol there is nothing to send.
    expect(transmitImage(twice, FULL_CAPS, new Set<string>(), 80), "no protocol, no payload").toBe("");
  });

  it("IK8 (C09 §4c): the seam reaches an image nested inside a container", () => {
    // **The walk is structural, on `children`** — the same field the validator
    // and the animation walk read, which is the third mechanism that turns on
    // that name (C04 I73).
    const wrapped = b.mosaic({ height: 4, areas: "AB", children: [block, b.raw("x")] });
    const out = transmitImage([wrapped], KITTY_CAPS, new Set<string>(), 80);
    expect(out, "an image inside a mosaic still transmits").toContain(`${ESC}_G`);
    expect(out).toContain(`i=${String(imageId(block.digest))}`);
  });
});
