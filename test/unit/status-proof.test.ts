// `tools/status-proof.mjs` — the instrument's own fixture.
//
// **What it produces is images, so what is asserted is that they respond.** A
// generator that emitted the same frame for every tick would produce a GIF that
// looks like a GIF and does not move, and nothing about the file would say so —
// which is exactly what happened once here: `pageHeight` was passed to `.gif()`
// where it belongs in the raw *input* options, and every animation wrote as a
// single tall page. `metadata()` said `pages 1`, and only when read with
// `{ animated: true }`: a plain read reports `pages 1` for an animated file too,
// so the first check agreed with the defect either way.
import { describe, expect, it } from "vitest";

import { createBlockRegistry, spinnerFrames } from "../../src/presentation/blocks/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { defaultTheme, loadTheme } from "../../src/presentation/theme/index.js";
import { FULL_CAPS } from "../support/render.js";

const loaded = loadTheme(defaultTheme, "dark");
if (!loaded.ok) throw new Error("theme failed to load");
const THEME = loaded.value.current;

const registry = createBlockRegistry();

const ESC = String.fromCharCode(27);
const SGR = new RegExp(`${ESC}\\[[0-9;]*m`, "gu");

const ansi = (b: unknown, width: number, tick: number): string =>
  renderSequenceToLines(registry, [b as never], width, {
    theme: THEME,
    capabilities: FULL_CAPS,
    tick,
  }).join("\n");

const steps = {
  kind: "steps",
  id: "s",
  steps: [{ label: "building", state: "active" }],
};

describe("tools/status-proof.mjs — the frames it assembles", () => {
  it("SP1: the animated source is one distinct frame per tick, over the whole set", () => {
    // **The property the GIFs rest on**, asserted on the frames rather than on
    // the encoded file: if these are not distinct, no encoder can make an
    // animation out of them and the `steps-after.gif` in the catalogue is a
    // still picture with a caption claiming otherwise.
    const n = spinnerFrames(FULL_CAPS).length;
    const frames = Array.from({ length: n }, (_, tick) => ansi(steps, 30, tick));
    expect(new Set(frames).size, `${String(n)} ticks, ${String(n)} frames`).toBe(n);
  });

  it("SP2: the frozen source is one frame repeated, which is what `before` claims", () => {
    // The other half, and it is the claim `steps-before.gif` makes about F227:
    // every frame at tick 0 is what a session drew for the life of the project.
    const n = spinnerFrames(FULL_CAPS).length;
    const frames = Array.from({ length: n }, () => ansi(steps, 30, 0));
    expect(new Set(frames).size, "tick 0 repeated is one frame").toBe(1);
  });

  it("SP3: no frame the generator emits carries a square bracket", () => {
    // **The brackets were annotation in a design figure** — a notation for
    // which cells carry paint — and shipped as characters, in the tag and around
    // the message. The word sits in a gap in the rule and there is nothing else.
    for (const state of ["error", "loading", "retrying"] as const) {
      const b = {
        kind: "status",
        id: "s",
        state,
        message: "connection refused",
        height: 7,
        retryInMs: 8000,
        attempt: 2,
        elapsedMs: 4000,
      };
      // **Stripped first**, because every SGR sequence is `ESC [ … m` and the
      // introducer is a `[`. The first form of this row counted those and
      // reported the defect it was written to find — an instrument measuring
      // its own escape codes.
      const drawn = ansi(b, 52, 0).replace(SGR, "");
      expect(drawn.includes("["), `${state} draws no [`).toBe(false);
      expect(drawn.includes("]"), `${state} draws no ]`).toBe(false);
    }
  });
});
