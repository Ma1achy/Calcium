/**
 * `transmitImage` — the seam the kitty arm waited on (C09 I36, §4c · C04 I73).
 *
 * **Why this is L4 and not a renderer change.** Ink strips APC escapes: an
 * `ESC _G` inside a `Text` node renders to the empty string, measured twice
 * (F249, and again in this repository's own harness). So the transmission never
 * goes through Ink — it is written to the stream directly, at the composition
 * root, and only the *placeholders* travel through Ink as ordinary text.
 *
 * **Three properties made that safe, and each was measured before it was built
 * on:**
 *
 *   1  the shell composes and writes the frame itself, so Ink is not in the
 *      byte path at all — `composeFrame` returns bytes and `session` writes them
 *   2  the diff baseline is `result.lines` and the write is `result.write`,
 *      separate records, so a prefix on the bytes cannot desynchronise the diff
 *   3  every frame reaches an **absolute** address before any row content —
 *      `HOME` or `cursorTo(i, 0)` — so a cursor the escape might have moved is
 *      corrected by the next byte written
 *
 * **The blind spot, stated rather than assumed**: whether the escape moves the
 * terminal's cursor is the protocol's guarantee — `U=1` creates a *virtual*
 * placement rather than drawing at the cursor — and it is not measurable here.
 * Property 3 is why the arm survives either answer. The first real-terminal test
 * is where it is checked, beside the plane-16 width guarantee.
 */
import { imageId, imageKey, payload, transmit, transmitAnimation, transmitRgba } from "../presentation/image/kitty.js";
import { compositeOverlay } from "../presentation/image/overlay.js";
import { decodeImage } from "../presentation/image/index.js";
import { imageCells } from "../presentation/blocks/kinds/image.js";
import type { Block, Image } from "../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../terminal/capabilities.js";
import type { Probe } from "../data/viewmodel/index.js";

/**
 * Which digests this session has already sent.
 *
 * **Session-scoped and never document-scoped**, because the id space belongs to
 * the terminal: an entry evicted from the transcript does not un-send its image,
 * and a document redrawn does not need to re-send one.
 */
export type SentImages = Set<string>;

/** Every image in a block tree, in the order they will be placed. */
function imagesIn(block: Block, out: Image[]): void {
  if (block.kind === "image") out.push(block);
  const kids = (block as { children?: readonly Block[] }).children;
  if (kids !== undefined) for (const child of kids) imagesIn(child, out);
}

/**
 * The transmission bytes owed by a frame, or `""`.
 *
 * **Keyed by digest, so the same image twice transmits once** — C04 I73 §3g.2's
 * identity doing the work it exists for, and what makes duplication free without
 * anything holding a table of placements.
 *
 * **A resume into the *same* terminal is the one residue.** The id is derived
 * from the digest into 24 bits, so a collision is unlikely rather than
 * impossible — and the failure is **the wrong image drawn rather than nothing
 * drawn**, which is the harder one to notice: nothing drawn sends a reader to
 * the image, and the wrong one sends them nowhere. Re-transmitting is correct
 * and idempotent, since `a=T` replaces at that id, so the collision is all that
 * remains and its expiry is the third diacritic — which widens the space to 32
 * bits and is the same symbol `placementRows` bounds itself by.
 */
export function transmitImage(
  blocks: readonly Block[],
  capabilities: TerminalCapabilities,
  sent: SentImages,
  /**
   * The frame's width, because the declared cell box is a **render-time** fact
   * (F380).
   *
   * The three call sites below passed a literal `1` for the columns, under a
   * comment saying *the renderer derives the same numbers from the same block*.
   * It does not: the renderer derives them from the block **and the width**, via
   * `imageCells`, and there is no second computation to disagree with — there
   * was one computation and one constant.
   */
  width: number,
  /** C28's seam (I30) — `imageCells` decodes, and the decode map has no cap. */
  probe?: Probe,
): string {
  if (capabilities.imageProtocol !== "kitty") return "";
  const found: Image[] = [];
  for (const block of blocks) imagesIn(block, found);
  let out = "";
  for (const image of found) {
    // **Keyed by the picture and not by the data** (C04 I74). An overlay makes
    // the transmitted picture a function of two things, and keying on the digest
    // alone means two blocks of one image with different overlays transmit once
    // and both draw the first — the wrong picture rather than none.
    const key = imageKey(image);
    if (sent.has(key)) continue;
    sent.add(key);
    const bytes = Uint8Array.from(Buffer.from(image.data, "base64"));
    // **The declared cell box is the placement's, and now it is computed the
    // same way** (F380). `imageCells` is the renderer's own function, called
    // with the frame's width, so the transmission and the placement cannot
    // disagree about the box.
    //
    // **The comment here used to say `c` and `r` are advisory to kitty; the
    // placeholders are what address the cells.** That is a claim with no
    // record, and it is false: `c` sizes the virtual placement, so a placeholder
    // addressing column 40 of an image declared one column wide falls outside
    // it. Measured in a real kitty — one APC emitted with `c=1,r=14`, 784
    // placeholders spanning 56 columns, and **nothing drawn**, which is the
    // failure this file's own header warns about arriving through the box
    // rather than through a missing transmission.
    const box = imageCells(image, width, probe);
    // **A PNG with no overlay is the bytes unchanged**, which needs no decoder
    // at all — the terminal's reads formats ours refuses (C09 §8b G7).
    const isPng = image.data.startsWith("iVBORw0KGgo");
    if (image.overlay === undefined && isPng) {
      out += transmit(imageId(key), payload(bytes), box.cols, box.rows);
      continue;
    }
    // **Every other case needs pixels, and this is the only place they exist
    // for the protocol arm** (C04 §3h.2, C09 I39): the renderer draws
    // placeholders at `kitty` and never looks at one. A GIF is decoded here
    // because kitty reads no GIF — `f=100` is PNG — so its frames go as raw
    // RGBA, all of them once, and the terminal runs the animation
    // (`transmitAnimation`). An overlay is composited into every frame.
    //
    // **A picture that does not decode falls through to the plain bytes.** For
    // a PNG that is the terminal's own decoder getting a chance ours did not
    // take; for a GIF it is nothing drawn, which is §4c's loud failure and the
    // same one a corrupt PNG already has. The renderer's fault box is what the
    // reader gets on every rasterising arm either way.
    const decoded = decodeImage(bytes);
    if (!decoded.ok) {
      out += transmit(imageId(key), payload(bytes), box.cols, box.rows);
      continue;
    }
    const overlay = image.overlay;
    const composite = (px: Parameters<typeof compositeOverlay>[0]): typeof px =>
      overlay === undefined ? px : compositeOverlay(px, overlay);
    out +=
      decoded.animation === undefined
        ? transmitRgba(imageId(key), composite(decoded.pixels), box.cols, box.rows)
        : transmitAnimation(
            imageId(key),
            decoded.animation.frames.map(composite),
            decoded.animation.delays,
            box.cols,
            box.rows,
          );
  }
  return out;
}
