// C02 I9 — ambiguous width as a capability, and the shipped defect it fixes.
//
// **The defect was in a table, not in a chart.** `RAMP_UNICODE` is
// `East_Asian_Width=Ambiguous` in all eight glyphs and C11 draws a sparkline
// into a cell, so on a terminal that treats ambiguous as wide every column after
// it shifted — silently, on a setting the framework could not see.
//
// Three things have to hold together and each is a separate row: the capability
// is detected, `cells()` can be told, and the sparkline changes ramp rather than
// only changing its arithmetic. The third is the one that matters: measuring the
// wide ramp correctly would pad it to a width no cell can hold.
import { describe, expect, it } from "vitest";

import { detectCapabilities } from "../../src/terminal/capabilities.js";
import { cells } from "../../src/presentation/text.js";
import { RAMP_BRAILLE, RAMP_UNICODE, rampFor } from "../../src/presentation/plot/ramp.js";
import { sparkline } from "../../src/presentation/plot/index.js";
import { FULL_CAPS } from "../support/render.js";

const WIDE_CAPS = { ...FULL_CAPS, ambiguousWidth: "wide" as const };

describe("C02 I9 — the capability", () => {
  it("T2.50 (C02 I9): an East Asian language subtag detects wide, everything else narrow", () => {
    const at = (env: Record<string, string>): string =>
      detectCapabilities(env).capabilities.ambiguousWidth;

    expect(at({ LANG: "ja_JP.UTF-8" }), "Japanese").toBe("wide");
    expect(at({ LANG: "zh_CN.UTF-8" }), "Chinese").toBe("wide");
    expect(at({ LANG: "ko_KR.UTF-8" }), "Korean").toBe("wide");
    expect(at({ LANG: "en_GB.UTF-8" }), "and the default is narrow").toBe("narrow");
    expect(at({}), "an unset environment is narrow, not undefined").toBe("narrow");

    // **A prefix match and not a substring one.** `jamaica` starts with `ja` and
    // is not Japanese; a `startsWith` on the raw locale would take it.
    expect(at({ LANG: "jam_JM.UTF-8" }), "not a substring test").toBe("narrow");
  });

  it("T2.51 (C02 I9, C02 I4): POSIX precedence holds, and a declaration overrides", () => {
    // The same precedence `unicode` uses — first variable *set* wins, so a
    // C-locale `LC_ALL` suppresses a Japanese `LANG` rather than being OR-ed
    // with it.
    expect(
      detectCapabilities({ LC_ALL: "en_GB.UTF-8", LANG: "ja_JP.UTF-8" }).capabilities
        .ambiguousWidth,
      "LC_ALL wins",
    ).toBe("narrow");

    expect(
      detectCapabilities({ LANG: "ja_JP.UTF-8" }, { ambiguousWidth: "narrow" }).capabilities
        .ambiguousWidth,
      "a declaration beats detection unconditionally (C02 I4)",
    ).toBe("narrow");
  });

  it("T2.52 (C02 I9): `cells()` answers 1 or 2 for the same glyph, on the argument alone", () => {
    // **The ramp is the measured case**, because it is the one that shipped.
    for (const glyph of [...RAMP_UNICODE]) {
      expect(cells(glyph), `${glyph} narrow`).toBe(1);
      expect(cells(glyph, "wide"), `${glyph} wide`).toBe(2);
    }

    // Box drawing, which is what the finding says unlocks connected line charts.
    expect(cells("─", "wide")).toBe(2);
    // And the two that must not move: ASCII is never ambiguous, and a genuinely
    // wide glyph is 2 either way — so the argument is not a global multiplier.
    expect(cells("abc", "wide"), "the ASCII fast path is right to return early").toBe(3);
    expect(cells("漢", "narrow"), "wide is wide regardless").toBe(2);
    expect(cells("⣿", "wide"), "braille is narrow on both").toBe(1);
  });
});

describe("C02 I9 — the sparkline, which is the field's first consumer", () => {
  it("T2.53 (C02 I9): a wide session gets the braille ramp, not the block ramp", () => {
    // **Changing the ramp, not only the arithmetic.** Measuring the block ramp
    // correctly on a wide terminal pads it to twice the cells and a table column
    // cannot hold it — so the fix is the glyphs, and the measurement is what
    // makes the padding agree with them.
    expect(rampFor(FULL_CAPS), "narrow keeps the blocks").toBe(RAMP_UNICODE);
    expect(rampFor(WIDE_CAPS), "wide takes braille").toBe(RAMP_BRAILLE);
    expect(rampFor({ ...WIDE_CAPS, unicode: "ascii" }), "ASCII is the stronger constraint").toBe(
      ".:-=+*#@",
    );
  });

  it("T2.54 (C02 I9, C11): the row is exactly `width` cells on both kinds of terminal", () => {
    // The property C11 depends on, asserted against the capability rather than
    // against a fixture that happens to be narrow. Without the ramp swap this
    // row fails at 16 for a width of 8.
    const values = [1, 5, 2, 8, 3, 9, 4, 7];

    for (const caps of [FULL_CAPS, WIDE_CAPS]) {
      const drawn = sparkline(values, 8, caps);
      expect(cells(drawn, caps.ambiguousWidth), `width 8 at ${caps.ambiguousWidth}`).toBe(8);
    }
  });
});
