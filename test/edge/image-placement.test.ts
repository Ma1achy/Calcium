/**
 * C09 I66 — the record of what is at each placement, and the sweep that bounds it.
 *
 * **The shipped arm was a set of digests and it only grew.** A hundred frames of
 * one animated block left a hundred entries in it and a hundred images resident
 * in the terminal (F987). The rows below are the cache's own sequence trace:
 * what a changed picture does at a stable placement, what a redraw does, what a
 * block leaving the document does, and what two entries holding one block id do.
 */
import { describe, expect, it } from "vitest";
import { b } from "../../src/shell/builders/index.js";
import { transmitFrame, type SentImages } from "../../src/shell/transmit-image.js";
import { placementIdOf } from "../../src/presentation/image/kitty.js";
import { FULL_CAPS } from "../support/render.js";
import { rgbPng64 } from "../support/png.js";
import type { Image } from "../../src/data/viewmodel/index.js";

const KITTY = { ...FULL_CAPS, imageProtocol: "kitty" as const };
const WIDTH = 24;

const png = (r: number): string => rgbPng64(16, 16, () => [r, 40, 80]);
const image = (id: string, r: number): Image =>
  b.image({ id, data: png(r), height: 4, alt: "a" }) as Image;

const frame = (sent: SentImages, scope: string, blocks: readonly Image[]): string =>
  transmitFrame([{ scope, blocks }], KITTY, sent, WIDTH);

describe("C09 §4c — the picture is cached at the placement (I66)", () => {
  it("T3.86 (I66): a changed picture re-transmits at one id, an unchanged one sends nothing, and a departed block is released", () => {
    const sent: SentImages = new Map();
    const one = image("anim", 10);
    const two = image("anim", 200);
    expect(one.digest, "the fixture responds").not.toBe(two.digest);

    // **A picture that changes at a stable placement is owed, and the record
    // still holds one entry** — this is the animation, and the whole point.
    expect(frame(sent, "e1", [one]), "the first is sent").not.toBe("");
    expect(frame(sent, "e1", [two]), "and so is the second").not.toBe("");
    expect(sent.size, "one placement, not two").toBe(1);
    expect([...sent.keys()][0]).toBe(placementIdOf(one, "e1"));

    // **A redraw of what is already there owes nothing.**
    expect(frame(sent, "e1", [two]), "nothing changed").toBe("");

    // **An overlay change alone re-transmits**, because at `kitty` the overlay
    // is composited into the pixels and the digest cannot see it.
    const overlaid = b.image({
      id: "anim",
      data: png(200),
      height: 4,
      alt: "a",
      overlay: { values: [[1]], colormap: "viridis" },
    }) as Image;
    expect(frame(sent, "e1", [overlaid]), "a second picture at one placement").not.toBe("");
    expect(sent.size, "still one placement").toBe(1);

    // **A block that leaves the document releases its placement**, on the frame
    // after — and returning re-transmits rather than drawing at a stale id.
    expect(frame(sent, "e1", []), "an empty document owes nothing").toBe("");
    expect(sent.size, "and holds nothing").toBe(0);
    expect(frame(sent, "e1", [two]), "the return is a transmission").not.toBe("");

    // **A hundred frames of one block leave one entry**, where the picture's
    // identity left a hundred. The figure this row exists for.
    const hundred: SentImages = new Map();
    for (let k = 0; k < 100; k += 1) frame(hundred, "e1", [image("anim", k)]);
    expect(hundred.size, "one placement for the whole animation").toBe(1);

    // **Two entries holding one block id are two entries in the record**, which
    // is the structural row: a block id is unique within a document and nothing
    // makes it unique across the transcript.
    const across: SentImages = new Map();
    transmitFrame(
      [
        { scope: "e1", blocks: [image("img", 10)] },
        { scope: "e2", blocks: [image("img", 250)] },
      ],
      KITTY,
      across,
      WIDTH,
    );
    expect(across.size, "two placements").toBe(2);

    // **And the sweep is the frame's, not the group's**: a block still in one
    // entry is not released because another entry no longer holds it.
    transmitFrame(
      [
        { scope: "e1", blocks: [image("img", 10)] },
        { scope: "e2", blocks: [] },
      ],
      KITTY,
      across,
      WIDTH,
    );
    expect(across.size, "only the departed one goes").toBe(1);
  });
});
