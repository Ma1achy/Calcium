// C02 tier 1 — unit. A table of env fixtures. No mocks, no terminal.
import { describe, expect, it } from "vitest";
import {
  detectCapabilities,
  isUsable,
  type TerminalCapabilities,
} from "../../src/terminal/capabilities.js";

/** Detection alone; the warnings half is tier 2's business (T2.7). */
const caps = (
  env: NodeJS.ProcessEnv,
  overrides?: Partial<TerminalCapabilities>,
): TerminalCapabilities => detectCapabilities(env, overrides).capabilities;

describe("C02 detection", () => {
  it("T1.1: colour depth across the four rules", () => {
    expect(caps({ TERM: "xterm", COLORTERM: "truecolor" }).colourDepth).toBe(24);
    expect(caps({ TERM: "xterm-256color" }).colourDepth).toBe(8);
    expect(caps({ TERM: "xterm" }).colourDepth).toBe(4);
    expect(caps({ TERM: "dumb" }).colourDepth).toBe(1);
    expect(caps({}).colourDepth).toBe(1);
  });

  it("T1.2: COLORTERM=24bit, the less common spelling, is also 24", () => {
    expect(caps({ TERM: "xterm", COLORTERM: "24bit" }).colourDepth).toBe(24);
  });

  it("T1.3: unicode follows POSIX precedence, LC_ALL > LC_CTYPE > LANG", () => {
    expect(caps({ LANG: "en_GB.UTF-8" }).unicode).toBe("full");
    expect(caps({ LANG: "C" }).unicode).toBe("ascii");

    // LC_ALL overrides LANG, in both directions.
    expect(caps({ LC_ALL: "C", LANG: "en_GB.UTF-8" }).unicode).toBe("ascii");
    expect(caps({ LC_ALL: "en_GB.UTF-8", LANG: "C" }).unicode).toBe("full");

    // LC_CTYPE overrides LANG...
    expect(caps({ LC_CTYPE: "en_GB.UTF-8", LANG: "C" }).unicode).toBe("full");
    // ...but not LC_ALL.
    expect(caps({ LC_ALL: "C", LC_CTYPE: "en_GB.UTF-8", LANG: "en_GB.UTF-8" }).unicode).toBe(
      "ascii",
    );
  });

  it("T1.4: unicode detection is case-insensitive and the hyphen is optional", () => {
    for (const lang of ["en_GB.utf-8", "en_GB.UTF8", "en_GB.UTF-8", "en_GB.uTf8"]) {
      expect(caps({ LANG: lang }).unicode, lang).toBe("full");
    }
  });

  it("T1.5: synchronised update, by TERM_PROGRAM allowlist or kitty's TERM", () => {
    for (const program of ["iTerm.app", "WezTerm", "ghostty", "WindowsTerminal"]) {
      expect(caps({ TERM: "xterm", TERM_PROGRAM: program }).synchronisedUpdate, program).toBe(true);
    }
    expect(caps({ TERM: "xterm-kitty" }).synchronisedUpdate).toBe(true);
    expect(caps({ TERM: "xterm", TERM_PROGRAM: "Apple_Terminal" }).synchronisedUpdate).toBe(false);
  });

  it("T1.6: mouse needs a real terminal and no tmux (D34)", () => {
    expect(caps({ TERM: "xterm" }).mouse).toBe(true);
    expect(caps({ TERM: "dumb" }).mouse).toBe(false);
    expect(caps({ TERM: "xterm", TMUX: "/tmp/x" }).mouse).toBe(false);
  });

  it("T1.7: image protocol", () => {
    expect(caps({ TERM: "xterm", TERM_PROGRAM: "iTerm.app" }).imageProtocol).toBe("iterm2");
    expect(caps({ TERM: "xterm-kitty" }).imageProtocol).toBe("kitty");
    expect(caps({ TERM: "xterm" }).imageProtocol).toBe("none");
  });

  it("T1.8: alt screen needs TERM present and not dumb", () => {
    expect(caps({ TERM: "xterm" }).altScreen).toBe(true);
    expect(caps({ TERM: "dumb" }).altScreen).toBe(false);
    expect(caps({}).altScreen).toBe(false);
  });

  it("T1.9 (I4): every field can be overridden, including altScreen on TERM=dumb", () => {
    const overrides: TerminalCapabilities = {
      colourDepth: 24,
      unicode: "full",
      ambiguousWidth: "narrow",
      synchronisedUpdate: true,
      bracketedPaste: true,
      mouse: true,
      imageProtocol: "kitty",
      altScreen: true,
    };
    // TERM=dumb detects every field at its floor; the overrides must win anyway.
    expect(caps({ TERM: "dumb" }, overrides)).toEqual(overrides);
  });

  it("T1.10 (I7): isUsable tracks altScreen alone, every other field at its worst", () => {
    const worst = {
      colourDepth: 1,
      unicode: "ascii",
      ambiguousWidth: "narrow",
      synchronisedUpdate: false,
      bracketedPaste: false,
      mouse: false,
      imageProtocol: "none",
    } as const;

    expect(isUsable({ ...worst, altScreen: true })).toBe(true);
    expect(isUsable({ ...worst, altScreen: false })).toBe(false);

    // And the converse: every other field at its best cannot rescue altScreen.
    expect(
      isUsable({
        colourDepth: 24,
        unicode: "full",
        ambiguousWidth: "narrow",
        synchronisedUpdate: true,
        bracketedPaste: true,
        mouse: true,
        imageProtocol: "kitty",
        altScreen: false,
      }),
    ).toBe(false);
  });
});
