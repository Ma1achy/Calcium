// C02 tier 4 — integration.
//
// Every test here waits on a component that does not exist yet. Each names its
// blocker in a greppable form, so when C01 lands `grep "waits on C01"` finds
// everything that just became unblocked — otherwise someone has to re-read six
// specs to know what to fill in.
//
// A fake standing in for a counterparty before that counterparty's spec is
// implemented would test the fake, not the seam.
import { describe, expect, it } from "vitest";
import { detectCapabilities } from "../../src/terminal/capabilities.js";
import { createFrameScheduler } from "../../src/terminal/frame-scheduler.js";
import { resolveTone } from "../../src/presentation/theme/index.js";
import { MODES } from "../support/fake-terminal.js";
import { store, TONES } from "../support/theme.js";

describe("C02 integration", () => {
  it.todo(
    "T4.1: a TERM=dumb record drives C01 to acquire nothing beyond what is supported — no mouse, no bracketed paste sequences emitted — waits on C01",
  );
  it.todo(
    "T4.2: mouse:false from a tmux environment → no 1002/1006 bytes in acquisition or release — waits on C01",
  );
  it("T4.3 (with C10): the detected depth drives resolution, and 1-bit emits no colour", () => {
    // Driven from C02's side: the record decides and C10 obeys. "Distinct" is
    // the five tones whose confusion would mislead — `dim` and `muted` sharing a
    // grey at 4-bit costs nothing, and asserting all ten would assert a thing
    // the spec deliberately does not require.
    const sixteen = detectCapabilities({ TERM: "xterm" }).capabilities;
    const mono = detectCapabilities({ TERM: "dumb" }).capabilities;
    expect(sixteen.colourDepth).toBe(4);
    expect(mono.colourDepth).toBe(1);

    const themes = store();
    const meaning = ["ok", "warn", "error", "info", "accent"] as const;

    const indices = meaning.map((tone) => {
      const colour = resolveTone(tone, themes.current, sixteen).colour;
      expect(colour?.kind, tone).toBe("ansi16");
      return colour !== undefined && colour.kind === "ansi16" ? colour.index : -1;
    });
    expect(new Set(indices).size, "two meaning tones collapsed at 4-bit").toBe(5);

    for (const tone of TONES) {
      expect(resolveTone(tone, themes.current, mono).colour, `${tone} at depth 1`).toBeUndefined();
    }
  });
  it.todo(
    "T4.4: unicode:'ascii' → a rendered table uses + - | and a sparkline uses .:|#; no codepoint above U+007F in the output — waits on C09",
  );
  it.todo(
    "T4.5: unicode:'ascii' → the braille plot degrades to a block plot rather than emitting braille codepoints — waits on C12",
  );
  it("T4.6 (with C03): synchronisedUpdate:false → frames carry no 2026 wrapper", () => {
    // Driven from C02's side: the record decides, and C03 obeys it. Both
    // directions, because the negative alone passes when C03 wraps nothing.
    const written: string[] = [];
    function framesFor(env: Record<string, string>): string {
      written.length = 0;
      const capabilities = detectCapabilities(env).capabilities;
      const scheduler = createFrameScheduler({
        render: () => {},
        repaint: () => {},
        capabilities,
        lifecycle: { acquired: true },
        write: (s) => void written.push(s),
        schedule: () => ({ [Symbol.dispose]: () => {} }),
      });
      scheduler.commit("input");
      return written.join("");
    }

    expect(framesFor({ TERM: "xterm-256color" })).toBe("");
    expect(framesFor({ TERM: "dumb" })).toBe("");

    const wrapped = framesFor({ TERM: "xterm-kitty" });
    expect(wrapped).toContain(MODES.syncOn);
    expect(wrapped).toContain(MODES.syncOff);
  });
  it.todo(
    "T4.7: altScreen:false → the shell prints help and exits 0 without acquiring anything — waits on L4",
  );
});
