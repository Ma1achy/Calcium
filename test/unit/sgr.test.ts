// The depth tag, read by the one thing that reads it.
//
// C10 resolves a colour to a value that names its own depth and hands it over;
// `sgr` is what turns it into a sequence (C10 §2, C09 §3). Every case here is a
// different answer to the same question, chosen by the tag rather than by
// inspecting the value — which is the whole reason C10 I18 exists, and the only
// place in the tree where that choice is made.
import { describe, expect, it } from "vitest";
import { SGR_RESET, sgr } from "../../src/terminal/escapes.js";

const ESC = String.fromCharCode(27);
const seq = (params: string): string => `${ESC}[${params}m`;

describe("sgr — the depth tag decides the sequence", () => {
  it("T1.16 (C10 I18): each depth writes its own form, chosen by the tag", () => {
    expect(sgr({ colour: { kind: "rgb", hex: "#7faecf" } })).toBe(seq("38;2;127;174;207"));
    expect(sgr({ colour: { kind: "ansi256", index: 110 } })).toBe(seq("38;5;110"));
    expect(sgr({ colour: { kind: "ansi16", index: 4 } })).toBe(seq("34"));
    expect(sgr({ colour: { kind: "ansi16", index: 12 } }), "the bright set").toBe(seq("94"));
  });

  it("T1.17 (C10 I18): the same colour at three depths is three sequences", () => {
    // The failure the tag prevents, stated as a test: a writer inspecting the
    // *value* has one answer for `#7faecf` whatever the terminal is, and the
    // one it picks is truecolour. These three are the same blue, resolved at
    // three depths, and nothing about the values says which is which except
    // the tag.
    const written = [
      sgr({ colour: { kind: "rgb", hex: "#7faecf" } }),
      sgr({ colour: { kind: "ansi256", index: 110 } }),
      sgr({ colour: { kind: "ansi16", index: 12 } }),
    ];

    expect(new Set(written).size, "three depths, three sequences").toBe(3);
  });

  it("T1.18: a four-bit colour is never written as `38;5;n`", () => {
    // A terminal at four-bit depth is one that does not necessarily understand
    // the 256-colour form at all, so the low index is not a shortcut to it.
    for (let i = 0; i < 16; i += 1) {
      expect(sgr({ colour: { kind: "ansi16", index: i } })).not.toContain("38;5;");
    }
  });

  it("T1.19: attributes are written in a stable order, and combine with colour", () => {
    expect(sgr({ bold: true })).toBe(seq("1"));
    expect(sgr({ dim: true })).toBe(seq("2"));
    expect(sgr({ underline: true })).toBe(seq("4"));
    expect(sgr({ inverse: true })).toBe(seq("7"));
    expect(sgr({ bold: true, underline: true, colour: { kind: "ansi16", index: 1 } })).toBe(
      seq("1;4;31"),
    );
  });

  it("T1.20: an empty style writes nothing, so unstyled text carries no sequence", () => {
    // C10's NO_STYLE is what a surface resolves to at 1-bit (C10 I8). If that
    // produced a sequence, a monochrome terminal would receive styling for
    // every unstyled run in the frame.
    expect(sgr({})).toBe("");
    expect(sgr({ bold: false, dim: false })).toBe("");
  });

  it("T1.21: malformed input writes something drawable rather than throwing", () => {
    // This runs in the render path. A throw here kills a frame; a wrong colour
    // is a wrong colour.
    expect(sgr({ colour: { kind: "rgb", hex: "nonsense" } })).toBe(seq("38;2;0;0;0"));
    expect(sgr({ colour: { kind: "rgb", hex: "#abc" } }), "short form").toBe(
      seq("38;2;170;187;204"),
    );
    expect(sgr({ colour: { kind: "ansi256", index: 9999 } })).toBe(seq("38;5;255"));
    expect(sgr({ colour: { kind: "ansi16", index: -3 } })).toBe(seq("30"));
    expect(sgr({ colour: { kind: "ansi256", index: Number.NaN } })).toBe(seq("38;5;0"));
  });

  it("T1.22: one reset closes everything sgr can open", () => {
    // Not five selective resets. A renderer that closed attributes one at a
    // time would leave whichever it forgot bleeding into the next block.
    expect(SGR_RESET).toBe(seq("0"));
  });
});
