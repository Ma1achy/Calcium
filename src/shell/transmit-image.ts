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
import { imageId, payload, transmit } from "../presentation/image/kitty.js";
import type { Block, Image } from "../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../terminal/capabilities.js";

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
): string {
  if (capabilities.imageProtocol !== "kitty") return "";
  const found: Image[] = [];
  for (const block of blocks) imagesIn(block, found);
  let out = "";
  for (const image of found) {
    if (sent.has(image.digest)) continue;
    sent.add(image.digest);
    const bytes = Uint8Array.from(Buffer.from(image.data, "base64"));
    // The declared cell box is the placement's, and the renderer derives the
    // same numbers from the same block — so a mismatch here would be two
    // computations of one figure. `c` and `r` are advisory to kitty; the
    // placeholders are what address the cells.
    out += transmit(imageId(image.digest), payload(bytes), 1, image.height);
  }
  return out;
}
