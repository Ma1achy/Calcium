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
import { imageKey, payload, placementIdOf, transmit, transmitAnimation, transmitRgba } from "../presentation/image/kitty.js";
import { compositeOverlay } from "../presentation/image/overlay.js";
import { decodeImage } from "../presentation/image/index.js";
import { imageCells, placesAtProtocol } from "../presentation/blocks/kinds/image.js";
import type { Block, Image } from "../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../terminal/capabilities.js";
import type { Probe } from "../data/viewmodel/index.js";

/**
 * What picture is currently at each placement (C09 I66, F987).
 *
 * **A map and not a set, and keyed by the placement rather than by the picture.**
 * A set of digests answered *has this picture been sent*, which is the wrong
 * question at a stable placement: the picture is what changes there. `get(id) ===
 * key` is the whole condition — a transmission is owed where the key differs (a
 * new frame, an overlay change) and skipped where it does not.
 *
 * **Bounded by the document rather than by the session**, which the set was not:
 * a hundred frames of one block left a hundred digests in it and a hundred images
 * resident in the terminal. `transmitFrame` releases every placement whose block
 * is no longer in the document, so what the terminal holds is one image per
 * placement transmitted and not since replaced. *Document* is the transcript and
 * not the viewport, so a scroll releases nothing and re-transmits nothing.
 */
export type SentImages = Map<number, string>;

/**
 * One scope's blocks — a transcript entry, as the frame hands it over.
 *
 * The scope is optional here because a caller may legitimately have none, and an
 * absent one is the picture's identity (`placementIdOf`). It is **not** a default
 * the shell may take: a scoped seam against an unscoped frame places an image
 * nobody transmitted.
 */
/**
 * One run of one entry, at the width its blocks render at (C22 I98).
 *
 * **`width` is the layout's and not the frame's** (F1062). A card's body renders
 * four cells in, so an entry is two runs at two widths and a single number
 * beside the document cannot describe it. Optional because a caller holding no
 * layout has nothing to declare; `transmitFrame`'s own `width` is what it falls
 * back to, which is what every caller did before this field existed.
 */
export type PlacementGroup = Readonly<{ scope?: string; blocks: readonly Block[]; width?: number }>;

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
/**
 * The one condition under which `transmitImage` writes anything.
 *
 * **Exported so the caller can skip building its argument, not so it can decide
 * anything.** `transmitImage` reads it too, on its first line, so there is one
 * implementation and the two cannot drift — the alternative is a second
 * `imageProtocol !== "kitty"` in `session.ts`, which is the shape C09 I1 exists
 * to forbid.
 *
 * The argument it lets the caller skip is a `flatMap` over **every block in
 * every transcript entry**, built every frame and handed to a function that
 * returns `""` on its first line: 90 µs per frame at two thousand entries, and
 * an eight-thousand-element array of garbage with it (F889).
 */
export function transmits(capabilities: TerminalCapabilities): boolean {
  return capabilities.imageProtocol === "kitty";
}

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
  /**
   * The scope these blocks' placements are identified within (C09 I66) — the
   * transcript entry's id, and absent for a caller that has none.
   */
  scope?: string,
  /**
   * Every placement this frame addressed, for `transmitFrame`'s release sweep.
   * A single-group caller passes nothing and nothing is released: the sweep is
   * the frame seam's, because only the frame sees the whole document.
   */
  live?: Set<number>,
): string {
  if (!transmits(capabilities)) return "";
  const found: Image[] = [];
  for (const block of blocks) imagesIn(block, found);
  let out = "";
  for (const image of found) {
    // **Keyed by the picture and not by the data** (C04 I74). An overlay makes
    // the transmitted picture a function of two things, and keying on the digest
    // alone means two blocks of one image with different overlays transmit once
    // and both draw the first — the wrong picture rather than none.
    const key = imageKey(image);
    // **A picture the renderer will not place is not transmitted** (C09 I67,
    // §8b G14, F1026). `transmits(capabilities)` above is the capability half of
    // the arm and the box is the other half: past `MAX_PLACEHOLDER_SPAN` on
    // either axis the block draws half blocks and no cell addresses this id, so
    // the whole transmission went on the wire for nothing — measured through a
    // session at 80 columns, four APC escapes and 317 B for one 16x400 GIF
    // against zero placeholder cells in the frame that followed. And it is not
    // discarded: in kitty 0.41.1 an unaddressed transmission answers `OK`,
    // draws nothing and stays resident until something addresses it (F1036).
    //
    // **Before `live.add`, deliberately.** A placement that has stopped being
    // addressable — the terminal narrowed under it — is then absent from `live`
    // and released by the sweep, so it re-transmits if it becomes addressable
    // again. Claiming it here would hold a record for a placement no frame draws.
    if (!placesAtProtocol(image, capabilities, width, probe)) continue;
    // **The placement is where the picture goes and the key is what is there**
    // (C09 I66). Two derivations of one id agree only while both are pure
    // functions of the same block, so both sides take it from `placementIdOf`.
    const id = placementIdOf(image, scope);
    live?.add(id);
    if (sent.get(id) === key) continue;
    sent.set(id, key);
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
      out += transmit(id, payload(bytes), box.cols, box.rows);
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
      out += transmit(id, payload(bytes), box.cols, box.rows);
      continue;
    }
    const overlay = image.overlay;
    const composite = (px: Parameters<typeof compositeOverlay>[0]): typeof px =>
      overlay === undefined ? px : compositeOverlay(px, overlay);
    out +=
      decoded.animation === undefined
        ? transmitRgba(id, composite(decoded.pixels), box.cols, box.rows)
        : transmitAnimation(
            id,
            decoded.animation.frames.map(composite),
            decoded.animation.delays,
            box.cols,
            box.rows,
          );
  }
  return out;
}

/**
 * A frame's transmissions, and the release sweep that bounds the record.
 *
 * **One call per frame over every scope**, because the sweep needs the whole
 * document: a placement is released when its block is no longer anywhere in it,
 * and a seam that saw one entry could not tell that from a block that moved.
 *
 * **The release is on the frame after**, which is what makes C04 §3g.2's T5 hold
 * — an entry evicted while its image is on screen keeps its picture for the last
 * frame that draws it, because the placement rows go with the entry and the sweep
 * runs against the document that no longer holds it.
 */
export function transmitFrame(
  groups: readonly PlacementGroup[],
  capabilities: TerminalCapabilities,
  sent: SentImages,
  width: number,
  probe?: Probe,
): string {
  // **The guard is the sweep's as well as the transmission's.** A terminal that
  // does not speak the protocol has no placements, so there is nothing to
  // release — and sweeping a frame that transmitted nothing would empty the
  // record rather than leave it alone.
  if (!transmits(capabilities)) return ""; // the frame seam's guard (C09 I66)
  const live = new Set<number>();
  let out = "";
  for (const group of groups) {
    // **The run's width where there is one** (C22 I98, F1062). Both halves of the
    // box move with it: at 80 columns a card-nested picture was declared 80 cells
    // wide and addressed across 76, so its right 5% was never drawn; between 298
    // and 301 `placesAtProtocol` refused here while the renderer placed, and the
    // placeholders addressed a transmission that never happened.
    out += transmitImage(group.blocks, capabilities, sent, group.width ?? width, probe, group.scope, live);
  }
  for (const id of [...sent.keys()]) if (!live.has(id)) sent.delete(id);
  return out;
}
