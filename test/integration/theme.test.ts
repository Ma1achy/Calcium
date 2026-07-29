// C10 tier 4 — integration.
//
// Most of this tier waits on renderers that do not exist yet. Each deferral
// names its blocker in the greppable form, so `tools/enforce/todo-expiry.mjs`
// fails the day the blocker lands rather than the day someone remembers.
import { describe, expect, it } from "vitest";
import { detectCapabilities } from "../../src/terminal/capabilities.js";
import { resolveTone } from "../../src/presentation/theme/index.js";
import { caps, store, TONES } from "../support/theme.js";

describe("C10 integration", () => {
  it.todo("T4.1 (with C09): the same block in both variants produces identical row counts — waits on C09");
  it.todo("T4.2 (with C09, C02): at depth 1 a status row stays distinguishable by glyph alone — waits on C09");
  it.todo("T4.3 (with C09): at depth 4, ok/warn/error render as three distinct ANSI colours — waits on C09");
  it.todo("T4.4 (with C03, L4): a theme switch makes L4 call invalidate, and C10 never does — waits on L4");
  it.todo("T4.5 (with L4): /theme light persists to config and survives a restart — waits on L4");
  it.todo("T4.6 (with L4): a corrupt override in config → base theme retained, notice committed — waits on L4");

  it("(with C02): a detected capability record drives the ladder end to end", () => {
    // The half of T4.3 that does not need a renderer: C02 decides the depth from
    // the environment, C10 obeys it, and neither knows the other's rules.
    const dumb = detectCapabilities({ TERM: "dumb" }).capabilities;
    const truecolour = detectCapabilities({ TERM: "xterm-256color", COLORTERM: "truecolor" }).capabilities;

    expect(dumb.colourDepth).toBe(1);
    expect(truecolour.colourDepth).toBe(24);

    const current = store().current;
    for (const tone of TONES) {
      expect(resolveTone(tone, current, dumb).colour, `${tone} on TERM=dumb`).toBeUndefined();
      expect(resolveTone(tone, current, truecolour).colour?.kind).toBe("rgb");
    }
  });

  it("(with C02): the record is injected, never read — C10 works off a hand-built one", () => {
    // I12. A fabricated record with no environment behind it resolves exactly as
    // a detected one does, which is what "injected" has to mean to be worth
    // asserting.
    const current = store().current;
    expect(resolveTone("ok", current, caps(4))).toEqual(
      resolveTone("ok", current, { ...detectCapabilities({ TERM: "xterm" }).capabilities, colourDepth: 4 }),
    );
  });
});
