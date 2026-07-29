// C02 tier 3 — edge cases.
import { describe, expect, it } from "vitest";
import {
  detectCapabilities,
  isUsable,
  type TerminalCapabilities,
} from "../../src/terminal/capabilities.js";

const caps = (env: NodeJS.ProcessEnv): TerminalCapabilities =>
  detectCapabilities(env).capabilities;

describe("C02 edge cases", () => {
  it("T3.1: an entirely empty env gives a complete record at minimum values", () => {
    const { capabilities, warnings } = detectCapabilities({});

    expect(capabilities).toEqual({
      colourDepth: 1,
      unicode: "ascii",
      synchronisedUpdate: false,
      bracketedPaste: false,
      mouse: false,
      imageProtocol: "none",
      altScreen: false,
    });
    expect(isUsable(capabilities)).toBe(false);
    expect(warnings).toEqual([]);
  });

  it("T3.2: an unknown TERM still yields 8 on the 256color substring", () => {
    // Substring matching is intended, not incidental.
    expect(caps({ TERM: "foo-bar-256color" }).colourDepth).toBe(8);
  });

  it("T3.3: TERM=dumb beats COLORTERM=truecolor — which rule dominates", () => {
    const c = caps({ TERM: "dumb", COLORTERM: "truecolor" });
    expect(c.colourDepth).toBe(1);
    expect(c.altScreen).toBe(false);
    expect(c.mouse).toBe(false);
  });

  it("T3.4: an unknown override key is ignored, with no throw and no warning", () => {
    const { capabilities, warnings } = detectCapabilities({ TERM: "xterm" }, {
      colourDepth: 24,
      notACapability: true,
    } as unknown as Partial<TerminalCapabilities>);

    expect(capabilities.colourDepth).toBe(24);
    expect(Object.keys(capabilities)).toHaveLength(7);
    expect(warnings).toEqual([]);
  });

  it("T3.5: an out-of-range override is rejected, detection retained, warning returned", () => {
    // `as unknown as` because the type cannot express the invalid value — which
    // is the point: this arrives from a config file, not from a caller.
    const { capabilities, warnings } = detectCapabilities({ TERM: "xterm-256color" }, {
      colourDepth: 12,
    } as unknown as Partial<TerminalCapabilities>);

    expect(capabilities.colourDepth).toBe(8);
    expect(warnings).toHaveLength(1);
    // The warning names the field and the offending value, or it cannot be acted on.
    expect(warnings[0]).toContain("colourDepth");
    expect(warnings[0]).toContain("12");
  });

  it("T3.5b: a bad override never produces an invalid record, whatever the field", () => {
    const { capabilities, warnings } = detectCapabilities({ TERM: "xterm" }, {
      unicode: "utf8",
      imageProtocol: "png",
      mouse: "yes",
      altScreen: 1,
    } as unknown as Partial<TerminalCapabilities>);

    expect(capabilities.unicode).toBe("ascii");
    expect(capabilities.imageProtocol).toBe("none");
    expect(capabilities.mouse).toBe(true);
    expect(capabilities.altScreen).toBe(true);
    expect(warnings).toHaveLength(4);
  });

  it("T3.6: TMUX set but empty is treated as unset; mouse stays enabled", () => {
    expect(caps({ TERM: "xterm", TMUX: "" }).mouse).toBe(true);
  });

  it("T3.7: TERM_PROGRAM matches case-insensitively", () => {
    expect(caps({ TERM: "xterm", TERM_PROGRAM: "iterm.app" }).imageProtocol).toBe("iterm2");
    expect(caps({ TERM: "xterm", TERM_PROGRAM: "ITERM.APP" }).synchronisedUpdate).toBe(true);
    expect(caps({ TERM: "xterm", TERM_PROGRAM: "wezterm" }).synchronisedUpdate).toBe(true);
  });

  it("T3.8: LANG present but LC_ALL=C gives ascii — precedence, not presence", () => {
    expect(caps({ LANG: "en_GB.UTF-8", LC_ALL: "C" }).unicode).toBe("ascii");
  });

  it("T3.9: prototype-polluting keys are ignored safely", () => {
    const polluted = JSON.parse(
      '{"__proto__":{"TERM":"xterm-256color"},"TERM":"dumb"}',
    ) as NodeJS.ProcessEnv;
    expect(caps(polluted).colourDepth).toBe(1);

    // And a genuinely empty object whose prototype carries TERM reads as absent.
    const inherited = Object.create({ TERM: "xterm" }) as NodeJS.ProcessEnv;
    expect(caps(inherited).altScreen).toBe(false);

    // Nothing leaked onto Object.prototype along the way.
    expect(({} as Record<string, unknown>)["TERM"]).toBeUndefined();
  });

  it("T3.10: the dumb gate applies to TERM's rules, not TERM_PROGRAM's", () => {
    // Intent, not oversight. TERM_PROGRAM describes the emulator and TERM=dumb
    // is a statement about terminfo, so iTerm2 still supports synchronised
    // update. The case that makes it matter is an altScreen:true override — the
    // user has said detection is wrong, and gating this would hand them an alt
    // screen that tears.
    const c = caps({ TERM: "dumb", TERM_PROGRAM: "iTerm.app" });

    expect(c.synchronisedUpdate).toBe(true);
    expect(c.imageProtocol).toBe("iterm2");

    expect(c.altScreen).toBe(false);
    expect(c.bracketedPaste).toBe(false);
    expect(c.mouse).toBe(false);
    expect(c.colourDepth).toBe(1);
  });
});
