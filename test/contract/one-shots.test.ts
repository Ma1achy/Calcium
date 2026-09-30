// C09 I120 — a one-shot is timed from its stamp on every carrier, and a finished
// one asks for nothing.
import { describe, expect, it } from "vitest";

import { RAMP_ONE_SHOTS, type Block, type Ramp, type RampAnimation } from "../../src/data/viewmodel/index.js";
import { tickIntervalOf } from "../../src/presentation/blocks/index.js";
import { TIMED_ONE_SHOTS, oneShotTicks } from "../../src/presentation/blocks/ramp.js";
import { FULL_CAPS, measurable } from "../support/render.js";

const TEXT = "arrived here";
const rampOf = (animate: RampAnimation, since?: number): Ramp => ({
  fill: "gradient",
  from: "muted",
  to: "accent",
  animate,
  ...(since === undefined ? {} : { since }),
});
const bar = (ramp: Ramp): Block => ({ kind: "progress", id: "p", label: "work", current: 8, total: 10, ramp }) as Block;
const span = (ramp: Ramp): Block =>
  ({ kind: "notice", id: "n", tone: "info", text: TEXT, spans: [{ from: 0, to: TEXT.length, ramp }] }) as Block;
const frameAt = (tick: number, block: Block): string =>
  measurable({ tick, capabilities: FULL_CAPS }).renderToLines(block, 40).join("\n");

describe("C09 I120 — one-shots on every carrier", () => {
  it("T2.181 (C09 I120): a bar reads its stamp — a stamped wipe differs mid-effect from its held frame", () => {
    for (const [name, carrier] of [["bar", bar], ["span", span]] as const) {
      // The carrier responds at all: a shimmer differs between two ticks.
      expect(frameAt(1, carrier(rampOf("shimmer"))), `${name} moves`).not.toBe(frameAt(2, carrier(rampOf("shimmer"))));
      expect(frameAt(1, carrier(rampOf("wipe", 0))), `${name} reads since`).not.toBe(frameAt(200, carrier(rampOf("wipe", 0))));
      // Held means held: two ticks past the end draw one frame.
      expect(frameAt(200, carrier(rampOf("wipe", 0))), `${name} holds`).toBe(frameAt(900, carrier(rampOf("wipe", 0))));
    }
  });

  it("T2.181 (C09 I120, C22 I132): a finished one-shot asks for no tick, at the bound and not before", () => {
    const width = 40;
    // A span's bound is its code units; a bar's is the region's width.
    for (const [name, carrier, bound] of [["span", span, TEXT.length], ["bar", bar, width]] as const) {
      for (const effect of RAMP_ONE_SHOTS) {
        const ticks = oneShotTicks(effect, bound);
        expect(ticks, effect).toBeDefined();
        const done = (ticks ?? 0) + 5;
        const block = carrier(rampOf(effect, 5));
        expect(tickIntervalOf(block, { tick: done - 1, width }), `${name} ${effect} one tick before`).not.toBeNull();
        expect(tickIntervalOf(block, { tick: done, width }), `${name} ${effect} at its end`).toBeNull();
        // I54's answer without a tick, and an unstamped one-shot has not started.
        expect(tickIntervalOf(block), `${name} ${effect} without at`).not.toBeNull();
        expect(tickIntervalOf(carrier(rampOf(effect)), { tick: 10_000, width }), `${name} ${effect} unstamped`).not.toBeNull();
      }
      // A periodic effect never finishes.
      expect(tickIntervalOf(carrier(rampOf("shimmer", undefined)), { tick: 10_000, width }), `${name} shimmer`).not.toBeNull();
    }
  });

  it("T2.181 (C09 I120, C04 I109): the duration table times exactly the one-shots, by equality", () => {
    expect([...TIMED_ONE_SHOTS].sort()).toEqual([...RAMP_ONE_SHOTS].sort());
  });
});
