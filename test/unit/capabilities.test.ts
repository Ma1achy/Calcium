// C02 tier 1 — unit. A table of env fixtures. No mocks, no terminal.
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

    // **The identification's row, and the case that earns it** (C02 I11, F418).
    // A real Ghostty or kitty sets `COLORTERM`, so this looks like an artefact of
    // our own harness stripping it — and it is not. `ssh` allocates a pty and
    // forwards `TERM`; it does not forward `COLORTERM`. The user got 24-bit
    // images and 4-bit colour from one terminal, decided by which variable
    // survived the hop.
    expect(caps({ TERM: "xterm-kitty" }).colourDepth).toBe(24);
    expect(caps({ TERM: "xterm-ghostty" }).colourDepth).toBe(24);
    // **And gated by `TMUX`**, because inside a multiplexer we are not talking to
    // the emulator we identified — `mouse`'s rule (D34) reaching a second
    // capability. Conservative by construction: this is what the rule answered
    // before the identification existed, so inside tmux nothing moved.
    expect(caps({ TERM: "xterm-kitty", TMUX: "/tmp/x" }).colourDepth).toBe(4);
    // `COLORTERM` still outranks the name — the terminal speaking for itself
    // beats us inferring, which is why the identification sits below it.
    expect(caps({ TERM: "xterm-kitty", TMUX: "/tmp/x", COLORTERM: "truecolor" }).colourDepth).toBe(24);
  });

  it("T1.12b (I11): the identification is gated once, and every reader sees the gate", () => {
    // **All three readers in one row, and that is the assertion.** The gate is a
    // single expression in `detect`; a row naming one capability passes just as
    // well against a gate applied to that one alone, which is the state this file
    // was in — 34 capability tests passed unchanged when the gate landed, because
    // nothing had ever asserted the three together inside tmux.
    const inside = caps({ TERM: "xterm-ghostty", TMUX: "/tmp/x" });
    expect(
      [inside.imageProtocol, inside.synchronisedUpdate, inside.colourDepth],
      "inside a multiplexer every reader answers as if there were no identification",
    ).toEqual(["none", false, 4]);

    // And the same environment without `TMUX`, so the row cannot pass by the
    // identification having stopped working (F432).
    const outside = caps({ TERM: "xterm-ghostty" });
    expect(
      [outside.imageProtocol, outside.synchronisedUpdate, outside.colourDepth],
      "outside it, all three follow the name",
    ).toEqual(["kitty", true, 24]);
  });

  it("T1.12c (I11): the gate is measured behaviour, not caution", () => {
    // **What tmux does with the bytes, which is why the gate is right** (F432).
    // Measured on tmux 3.5a in its own output: an unwrapped APC transmission is
    // absent and `ESC [ ? 2026 h` is absent, against a bare pty where both are
    // present. So `imageProtocol` addressed an image that never arrived and
    // `synchronisedUpdate` promised a wrapper nothing received — the record was
    // false rather than merely optimistic.
    //
    // The DCS-wrapped form *does* reach the emulator at tmux's default, so this
    // is a gate awaiting a wrapper in `escapes.ts` rather than a permanent no.
    expect(caps({ TERM: "xterm-kitty", TMUX: "/tmp/x" }).imageProtocol).toBe("none");
    expect(caps({ TERM: "xterm-kitty", TMUX: "/tmp/x" }).synchronisedUpdate).toBe(false);
    // `TERM_PROGRAM` survives the hop where `TERM` does not, which is the route
    // that made this reachable at all.
    expect(caps({ TERM: "screen-256color", TERM_PROGRAM: "ghostty" }).imageProtocol).toBe("kitty");
    expect(
      caps({ TERM: "screen-256color", TERM_PROGRAM: "ghostty", TMUX: "/tmp/x" }).imageProtocol,
    ).toBe("none");
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
    // **`false` here until the identification was single-sourced** (F418). This
    // is what `docker exec -e TERM` forwards and what `ssh` forwards, so it is
    // the common case rather than a corner: the images arrived and the frame
    // tore, every frame, because two lists answered one question and only one had
    // heard of `xterm-ghostty`.
    expect(caps({ TERM: "xterm-ghostty" }).synchronisedUpdate).toBe(true);
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

    // **This row asserted the defect as correct, and its comment is why that is
    // hard to catch** (F418). It read: *asserted rather than narrated, because
    // the first version of this row claimed `TERM=xterm-ghostty` implied a
    // synchronised update and it does not.* Every word true — a reader hunting
    // their own assumptions went to the code, found `false`, and wrote it down.
    //
    // **True about the code and false about Ghostty**, which implements
    // synchronised update and is in the program list for exactly that reason. The
    // row recorded which variable happened to be consulted, and a row that does
    // that reads exactly like a row that records a decision. It then held the
    // disagreement in place for the life of the project.
    expect(caps({ TERM_PROGRAM: "ghostty" }).synchronisedUpdate).toBe(true);
    expect(caps({ TERM: "xterm-ghostty" }).synchronisedUpdate).toBe(true);
  });

  it("T1.12 (C02 I11): the identification is one function and the capabilities read it", () => {
    // **Structural rather than by comparing answers** (F84's shape). Three lists
    // that happen to agree pass every agreement test and are still three lists —
    // and this file shipped for the life of the project with two that did not.
    // The property worth holding is the one a scan can see.
    //
    // **Comments stripped first**: the doc comments here name every emulator
    // repeatedly, and a source assertion that counts prose measures the prose
    // rather than the code.
    const src = readFileSync(join(import.meta.dirname, "../../src/terminal/capabilities.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/\/\/[^\n]*/gu, "");
    const NAMES = ["xterm-kitty", "xterm-ghostty", "iterm.app", "ghostty", "wezterm", "windowsterminal"];

    // Brace-matched bodies, so a name in a later function is not attributed to an
    // earlier one — the failure that makes a source scan agree with itself.
    const bodies = new Map<string, string>();
    for (const m of src.matchAll(/function\s+([A-Za-z0-9_]+)\s*\(/gu)) {
      let i = src.indexOf("{", m.index + m[0].length);
      if (i === -1) continue;
      let depth = 0;
      const from = i;
      for (; i < src.length; i += 1) {
        if (src[i] === "{") depth += 1;
        else if (src[i] === "}") { depth -= 1; if (depth === 0) break; }
      }
      bodies.set(m[1] ?? "", src.slice(from, i + 1));
    }

    expect(bodies.has("identifyTerminal"), "the identification exists as one function").toBe(true);
    for (const [name, body] of bodies) {
      if (!name.startsWith("detect")) continue;
      for (const emulator of NAMES) {
        expect(body.includes(emulator), `${name} names ${emulator} itself`).toBe(false);
      }
    }
    // And the control: the scan can see a name where one legitimately is, so a
    // green run above is not the corpus being empty (a fabricated violation can
    // be vacuous).
    expect(NAMES.some((n) => src.includes(n)), "the names are in the file at all").toBe(true);
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
