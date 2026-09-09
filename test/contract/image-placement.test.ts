/**
 * C09 I66 — the contract between the transmission seam and the renderer.
 *
 * **Two derivations of one id, and they agree only while both are pure functions
 * of the same input.** The seam writes `i=` into the APC escape; the renderer
 * writes the same number into the foreground colour of every placeholder cell.
 * Nothing checks that at compile time and nothing can: the failure is *nothing
 * drawn*, which is indistinguishable from a terminal that does not speak the
 * protocol. So it is checked here, on the bytes.
 *
 * **The rows are indexed by the interaction and not by the input** (F987's
 * table): a frame that changes, a picture shared by two blocks, a block id
 * shared by two scopes, and the unscoped arm that every other caller takes.
 */
import { describe, expect, it } from "vitest";
import { b } from "../../src/shell/builders/index.js";
import { transmitFrame, type SentImages } from "../../src/shell/transmit-image.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { PLACEHOLDER } from "../../src/presentation/image/kitty.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import { rgbPng64 } from "../support/png.js";
import type { Image } from "../../src/data/viewmodel/index.js";

const KITTY = { ...FULL_CAPS, imageProtocol: "kitty" as const };
const WIDTH = 24;

const png = (r: number): string => rgbPng64(16, 16, () => [r, 40, 80]);

const image = (id: string, r: number, alt = "a"): Image =>
  b.image({ id, data: png(r), height: 4, alt }) as Image;

/** Every `i=` the seam wrote, in order. */
const sentIds = (bytes: string): readonly number[] =>
  [...bytes.matchAll(/i=(\d+)/g)].map((m) => Number(m[1]));

/** Every id the renderer painted into a placeholder's foreground colour. */
function paintedIds(block: Image, scope?: string): readonly number[] {
  const rows = renderToLines(createBlockRegistry(), block, WIDTH, {
    theme: DARK_THEME,
    capabilities: KITTY,
    ...(scope === undefined ? {} : { placementScope: scope }),
  });
  const ids: number[] = [];
  for (const row of rows) {
    for (const m of row.matchAll(
      new RegExp(`\\u001b\\[38;2;(\\d+);(\\d+);(\\d+)m${PLACEHOLDER}`, "gu"),
    )) {
      ids.push((Number(m[1]) << 16) + (Number(m[2]) << 8) + Number(m[3]));
    }
  }
  return ids;
}

/** The placeholder rows alone, so two frames can be compared byte for byte. */
const placementRowsOf = (block: Image, scope?: string): readonly string[] =>
  renderToLines(createBlockRegistry(), block, WIDTH, {
    theme: DARK_THEME,
    capabilities: KITTY,
    ...(scope === undefined ? {} : { placementScope: scope }),
  }).filter((row) => row.includes(PLACEHOLDER));

describe("C09 §4c — the seam and the renderer agree on a placement (I66)", () => {
  it("T2.135 (I66): one id per placement, written by both sides, and it does not move when the picture does", () => {
    // **The fixture responds first.** Two frames of one block are two pictures,
    // or every arm below would hold for the wrong reason.
    const frame1 = image("plot", 10);
    const frame2 = image("plot", 200);
    expect(frame1.digest).not.toBe(frame2.digest);

    const sent: SentImages = new Map();
    const first = transmitFrame([{ scope: "e1", blocks: [frame1] }], KITTY, sent, WIDTH);
    const painted = paintedIds(frame1, "e1");

    expect(sentIds(first), "one transmission, one id").toHaveLength(1);
    expect(painted.length, "a placeholder per cell").toBeGreaterThan(1);
    expect(
      new Set(painted),
      "the frame carries one id and it is the one that was sent",
    ).toEqual(new Set(sentIds(first)));

    // **The frame arm.** A second picture at the same placement is a second
    // transmission at the same id, and the placeholder rows do not move — which
    // is what the row diff needs in order to skip them.
    const second = transmitFrame([{ scope: "e1", blocks: [frame2] }], KITTY, sent, WIDTH);
    expect(second, "the picture changed, so it is sent").not.toBe("");
    expect(sentIds(second), "at the same id").toEqual(sentIds(first));
    expect(placementRowsOf(frame2, "e1"), "byte-identical rows").toEqual(
      placementRowsOf(frame1, "e1"),
    );

    // **The parity arm.** Two blocks of one picture are two placements: two ids
    // and two transmissions, one per block rather than one per frame.
    const left = image("left", 10);
    const right = image("right", 10);
    expect(left.digest, "one picture").toBe(right.digest);
    const both = transmitFrame(
      [{ scope: "e2", blocks: [left, right] }],
      KITTY,
      new Map(),
      WIDTH,
    );
    expect(new Set(sentIds(both)).size, "two placements").toBe(2);
    expect(paintedIds(left, "e2")[0]).not.toBe(paintedIds(right, "e2")[0]);

    // **The two-scopes arm** — the row no sequence could reach. A block id is
    // unique within a document and not across the transcript, so the same id in
    // two entries must not be one placement.
    const a = image("img", 10);
    const c = image("img", 250);
    expect(paintedIds(a, "e1")[0]).not.toBe(paintedIds(c, "e2")[0]);
    const across = transmitFrame(
      [
        { scope: "e1", blocks: [a] },
        { scope: "e2", blocks: [c] },
      ],
      KITTY,
      new Map(),
      WIDTH,
    );
    expect(new Set(sentIds(across)).size, "two entries, two placements").toBe(2);

    // **The unscoped arm**, which every caller outside the shell takes: the
    // picture's identity on both sides, exactly as it was.
    const bare = transmitFrame([{ blocks: [frame1] }], KITTY, new Map(), WIDTH);
    expect(new Set(paintedIds(frame1)), "unscoped, and still one agreed id").toEqual(
      new Set(sentIds(bare)),
    );
    expect(paintedIds(frame1)[0], "and it is not the scoped one").not.toBe(
      paintedIds(frame1, "e1")[0],
    );
  });
});
