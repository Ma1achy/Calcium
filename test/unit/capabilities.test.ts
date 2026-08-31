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

  it("T1.7 (C02 I9, F415): image protocol, and the terminals it does not claim", () => {
    expect(caps({ TERM: "xterm", TERM_PROGRAM: "iTerm.app" }).imageProtocol).toBe("iterm2");
    expect(caps({ TERM: "xterm-kitty" }).imageProtocol).toBe("kitty");
    expect(caps({ TERM: "xterm" }).imageProtocol).toBe("none");

    // **Ghostty, on a measurement** — `tools/terminal-probe` sent the shipped
    // encoder's own transmission to Ghostty 1.3.1 and read `OK`, against
    // `EINVAL: invalid data` for a corrupted control. Before this the whole
    // protocol arm was unreachable there, and the demo said so on screen.
    expect(caps({ TERM: "xterm-ghostty" }).imageProtocol).toBe("kitty");
    // The tmux case: `TERM` is rewritten and `TERM_PROGRAM` survives.
    expect(caps({ TERM: "screen-256color", TERM_PROGRAM: "ghostty" }).imageProtocol).toBe("kitty");
    expect(caps({ TERM: "xterm", TERM_PROGRAM: "Ghostty" }).imageProtocol).toBe("kitty");

    // **The unmeasured arms, asserted as they stand rather than as assumed.**
    // Both are widely said to implement the protocol and neither has been
    // measured here, and the asymmetry decides it: a wrong `kitty` draws
    // *nothing*, a wrong `none` draws a dither. This row is what fails on the day
    // someone runs the probe in one of them and widens the rule — which is the
    // expiry being a test rather than a hope.
    expect(caps({ TERM: "xterm-256color", TERM_PROGRAM: "WezTerm" }).imageProtocol).toBe("none");
    expect(caps({ TERM: "xterm-256color", KONSOLE_VERSION: "220400" }).imageProtocol).toBe("none");

    // **The record this rule is drawn from, and writing it down corrected it.**
    // `synchronisedUpdate` has known about ghostty since v1 — but by
    // `TERM_PROGRAM`, not by `TERM`. Both rules carry an `xterm-kitty` special
    // case *and* a program list, and `imageProtocol`'s list held only iTerm: the
    // gap was ghostty missing from **both** keys, not from one. Asserted rather
    // than narrated, because the first version of this row claimed
    // `TERM=xterm-ghostty` implied a synchronised update and it does not.
    expect(caps({ TERM_PROGRAM: "ghostty" }).synchronisedUpdate).toBe(true);
    expect(caps({ TERM: "xterm-ghostty" }).synchronisedUpdate).toBe(false);
  });

  it("T1.8: alt screen needs TERM present and not dumb", () => {
    expect(caps({ TERM: "xterm" }).altScreen).toBe(true);
    expect(caps({ TERM: "dumb" }).altScreen).toBe(false);
    expect(caps({}).altScreen).toBe(false);
  });

  it("T1.11 (C02 I10): the background is COLORFGBG's last field, and only 0-15 answers", () => {
    // **The rxvt row is the one that decides the rule.** Every other value here
    // has two fields, where *last* and *second* agree — so a suite without
    // `fg;default;bg` in it tests the last-field rule against itself.
    expect(caps({ TERM: "xterm", COLORFGBG: "15;0" }).backgroundPolarity).toBe("dark");
    expect(caps({ TERM: "xterm", COLORFGBG: "0;15" }).backgroundPolarity).toBe("light");
    expect(caps({ TERM: "xterm", COLORFGBG: "0;default;15" }).backgroundPolarity).toBe("light");

    // A background that is not a number is a background that says nothing.
    expect(caps({ TERM: "xterm", COLORFGBG: "15;default" }).backgroundPolarity).toBe("unknown");
    // **And one that only *starts* as a number.** Found by the mutation pass:
    // `parseInt` reads `15x` as 15, so a rule written on it declines `default`
    // and quietly answers for a value it did not understand. The digit test is
    // the whole difference and nothing had asserted it.
    expect(caps({ TERM: "xterm", COLORFGBG: "0;15x" }).backgroundPolarity).toBe("unknown");
    expect(caps({ TERM: "xterm", COLORFGBG: "0;15.5" }).backgroundPolarity).toBe("unknown");
    // A 256-colour index: knowable, and declined — the cube is C10's and C10 is
    // a layer up (C02 I10).
    expect(caps({ TERM: "xterm", COLORFGBG: "15;235" }).backgroundPolarity).toBe("unknown");
    // No separator at all.
    expect(caps({ TERM: "xterm", COLORFGBG: "15" }).backgroundPolarity).toBe("unknown");
    // And the case the third value exists for.
    expect(caps({ TERM: "xterm" }).backgroundPolarity).toBe("unknown");
  });

  it("T1.9 (I4): every field can be overridden, including altScreen on TERM=dumb", () => {
    const overrides: TerminalCapabilities = {
      colourDepth: 24,
      unicode: "full",
      ambiguousWidth: "narrow",
      backgroundPolarity: "light",
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
      backgroundPolarity: "unknown",
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
        backgroundPolarity: "light",
        synchronisedUpdate: true,
        bracketedPaste: true,
        mouse: true,
        imageProtocol: "kitty",
        altScreen: false,
      }),
    ).toBe(false);
  });
});
