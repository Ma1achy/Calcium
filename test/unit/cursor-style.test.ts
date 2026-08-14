// C22 §6f — the cursor's style, resolved per focus target (I63, roadmap 45).
//
// **The style keys on the target and the position on the layer**, and the two
// are not the same partition: `FOCUS_ORDER` has seven members and exactly two —
// `overlay` and `pushedView` — are layers, so a style on `Layer` covers
// two-sevenths of its subject while reading as total.
import { describe, expect, it } from "vitest";

import {
  anyBlinking,
  cursorStyleFor,
  steadyWhileTyping,
} from "../../src/shell/cursor-style.js";
import { FOCUS_ORDER } from "../../src/interaction/router/focus.js";
import { CURSOR_SHAPE, type CursorStyle } from "../../src/terminal/escapes.js";

const BEAM: CursorStyle = { shape: "beam", blink: false };
const BLOCK: CursorStyle = { shape: "block", blink: true };


describe("C22 §6f — the blink machine subtracts (C22 I64)", () => {
  it("T1.22e (C22 I64): it only ever removes blink, and a null style is untouched", () => {
    // **The mutation this row exists for is the edge firing on a target whose
    // style is `null`** — the boundary the shape half already ruled, and the
    // state machine gives it a second way to be wrong. Nothing here may invent
    // a shape in order to have something to make steady: shape and blink are
    // one wire parameter, so *steady* is unsayable without choosing a shape.
    expect(steadyWhileTyping(null, false), "nothing declared, typing").toBeNull();
    expect(steadyWhileTyping(null, true), "nothing declared, idle").toBeNull();

    // Declared blinking: steady while typing, blinking once idle.
    const blinking: CursorStyle = { shape: "beam", blink: true };
    expect(steadyWhileTyping(blinking, false), "typing").toEqual({ shape: "beam", blink: false });
    expect(steadyWhileTyping(blinking, true), "idle").toEqual(blinking);

    // **Declared steady is never made to blink**, in either phase. The
    // declaration is the app's answer and this is a refinement of it — a
    // machine that read *idle* as *blinking* would make it a hint instead.
    const steady: CursorStyle = { shape: "block", blink: false };
    expect(steadyWhileTyping(steady, false)).toEqual(steady);
    expect(steadyWhileTyping(steady, true), "still steady when idle").toEqual(steady);
  });

  it("T1.22f (C22 I64): the wake is armed only where a declared style blinks", () => {
    // The predicate the arming reads. A config with nothing blinking arms no
    // wake, so an application declaring no cursor pays no composed frame per
    // typing pause for a resolution that would emit nothing.
    expect(anyBlinking(undefined), "no config at all").toBe(false);
    expect(anyBlinking({}), "an empty one").toBe(false);
    expect(
      anyBlinking({ targets: { prompt: { shape: "beam", blink: false } } }),
      "declared, and steady",
    ).toBe(false);
    expect(
      anyBlinking({ targets: { prompt: null } }),
      "declared as the terminal's own",
    ).toBe(false);

    expect(
      anyBlinking({ targets: { prompt: { shape: "beam", blink: true } } }),
      "one blinking target is enough",
    ).toBe(true);
    expect(
      anyBlinking({ fallback: { shape: "block", blink: true } }),
      "and so is a blinking fallback",
    ).toBe(true);
  });
});

describe("C22 §6f — the style resolves per focus target (C22 I63)", () => {
  it("T1.22 (C22 I63, §6f table row 1): a target's own style, the fallback, and a declared null", () => {
    // **The entry's own example, and the row that refuses a style on `Layer`**:
    // a beam in the prompt and a block in a pushed view. The prompt has no
    // `Placed`, so a design keyed on the layer cannot express the case that
    // motivated the feature.
    const config = {
      fallback: BLOCK,
      targets: { prompt: BEAM, overlay: null },
    } as const;

    expect(cursorStyleFor("prompt", config), "its own").toEqual(BEAM);
    expect(cursorStyleFor("pushedView", config), "the fallback").toEqual(BLOCK);

    // **A declared `null` is an answer, not an absence.** `overlay: null` says
    // *leave the terminal's cursor alone here* and must not fall through to a
    // fallback that would override it — which is what `??` would have done, and
    // the difference is the whole of what a per-target override is for.
    expect(cursorStyleFor("overlay", config), "declared null wins over a fallback").toBeNull();

    // Nothing declared anywhere is the terminal's own.
    expect(cursorStyleFor("prompt", undefined)).toBeNull();
    expect(cursorStyleFor("prompt", {}), "an empty record says the same").toBeNull();
  });

  it("T1.22a (C22 I63, §6f table row 6): every target is a key, including `global`", () => {
    // A `Partial<Record<…>>` invites *which of these are real*, and the answer
    // is all seven. Driven off `FOCUS_ORDER` rather than a list written here,
    // so a target added to the union without a decision fails this row instead
    // of silently resolving to the fallback for ever.
    for (const target of FOCUS_ORDER) {
      expect(
        cursorStyleFor(target, { targets: { [target]: BEAM } }),
        `${target} is a key`,
      ).toEqual(BEAM);
    }
    expect(FOCUS_ORDER, "and there are seven of them").toHaveLength(7);
  });

  it("T1.22c (C22 I63): shape and blink are one wire parameter", () => {
    // `CSI Ps SP q` encodes both, so *make the current shape steady* is
    // unsayable and the pair travels together. Asserted on the bytes, because
    // the type would permit two independent axes and the wire does not.
    expect(CURSOR_SHAPE.set({ shape: "beam", blink: false })).toBe("\x1b[6 q");
    expect(CURSOR_SHAPE.set({ shape: "beam", blink: true })).toBe("\x1b[5 q");
    expect(CURSOR_SHAPE.set({ shape: "block", blink: false })).toBe("\x1b[2 q");
    expect(CURSOR_SHAPE.set({ shape: "underline", blink: true })).toBe("\x1b[3 q");

    // The end of the chain, and it is the terminal's *configured* default
    // rather than the negation of anything we wrote — which is why this is a
    // setting and not a `mode()` (C01 I20).
    expect(CURSOR_SHAPE.reset).toBe("\x1b[0 q");
  });
});
