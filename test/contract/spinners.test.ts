// Roadmap 51 — the spinner sets, their intervals, and the width rule.
//
// **The construction-time assertion the catalogue asks for.** A frame that is
// two cells where its neighbours are one reflows the row every tick, and
// neither `cells()` nor a frame-read on the machine that picked it will show it:
// the disagreement depends on locale. So it is asserted here, over every set, on
// both arms.
import { describe, expect, it } from "vitest";

import { glyphs, spinnerFrames, spinnerIntervalMs } from "../../src/presentation/blocks/index.js";
// **The table itself is not on the barrel**, and MG24 is why: its members have
// no reader in `src/` — the two functions are the seam. Imported from the module
// so the rows can walk every set rather than a list they keep themselves, which
// would be a coverage set drawn from the test's own table.
import { SPINNER_SETS } from "../../src/presentation/blocks/glyphs.js";
import { cells, hasEmojiForm } from "../../src/presentation/text.js";
import { ASCII_CAPS, FULL_CAPS } from "../support/render.js";

const WIDE_CAPS = { ...FULL_CAPS, ambiguousWidth: "wide" as const };
const NAMES = Object.keys(SPINNER_SETS);

describe("roadmap 51 — the spinner sets", () => {
  it("T2.70: every frame of every set is one cell, on the arm it is offered at", () => {
    // **Two arms rather than one refusal**, which is what C02 I9 changed. A
    // `narrowOnly` set is one cell where the terminal says narrow, and its
    // ASCII pair is what the wide arm hands back — so the assertion is over
    // what `spinnerFrames` returns rather than over the table, which is the
    // only form that catches a set offered on the wrong arm.
    const failures: string[] = [];

    for (const name of NAMES) {
      for (const caps of [FULL_CAPS, WIDE_CAPS, ASCII_CAPS]) {
        for (const frame of spinnerFrames(caps, name)) {
          const narrow = cells(frame);
          const wide = cells(frame, "wide");
          if (narrow !== 1) failures.push(`${name}: ${frame} is ${String(narrow)} cells`);
          if (caps.ambiguousWidth === "wide" && wide !== 1) {
            failures.push(`${name}: ${frame} is ${String(wide)} cells on a wide terminal`);
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("T2.71 (C09 I45): no frame has an emoji presentation, which no capability can answer", () => {
    // The second way a frame fails, and it is not the ambiguous one: an emoji
    // form is two cells wherever the font prefers it, whatever the locale says.
    // `❄` and `✳` are why `fullramp` ships shorter than it was drawn.
    //
    // **Over the derived table, not a list from memory** (F823, F833). The list
    // this row carried opened with `·`, which is Ambiguous and has no emoji
    // form, and it never held `↖ ↗ ↘ ↙` — so the `arrow` set shipped four
    // emoji bases through a green row, and `⏺︎` shipped as the head mark one
    // table over.
    const offenders: string[] = [];

    for (const name of NAMES) {
      for (const frame of SPINNER_SETS[name]?.frames ?? []) {
        for (const c of frame) {
          if (hasEmojiForm(c.codePointAt(0) ?? 0)) offenders.push(`${name}: ${frame}`);
        }
      }
    }

    expect(offenders).toEqual([]);
    // The controls: the characters the old list named for the right reason
    // are in the table, the diagonals it missed are in it — and **four of the
    // seventeen it named are not emoji bases at all**: `·` is Ambiguous, and
    // `❈ ★ ☆` are Dingbat and Miscellaneous Symbols with no variation
    // sequence. A list from memory is wrong in both directions.
    for (const c of "✳✴❄☀☁☂♠♣♥♦⚡⚠↖↗↘↙") expect(hasEmojiForm(c.codePointAt(0) ?? 0), c).toBe(true);
    for (const c of "·❈★☆") expect(hasEmojiForm(c.codePointAt(0) ?? 0), `${c} was on the list and has no emoji form`).toBe(false);
  });

  it("T2.72: the interval belongs to the set, and the product lands in the band", () => {
    // **A caller picking a 28-frame set and getting a 10-frame default makes it
    // frantic**, which is the whole reason the interval is not the caller's.
    // 800–1600 ms is the band; `fullramp` is outside it deliberately and is
    // asserted as a second category rather than exempted.
    // **The band is a spinner's, and the categories are not one population.**
    // A counter says work is being done and a spinner says time is passing, so
    // a 16-frame register at 120 ms is not a slow spinner; a two-frame toggle
    // needs ~400 ms per frame or it strobes, which no cycle length expresses.
    // Asserting one band over all three was this row's first form and it
    // reported `braille2` — correctly, that one was outside its own document's
    // band — and `binary4` and `toggle`, which were not spinners at all.
    const COUNTERS = new Set(["decimal", "hex", "binary4"]);
    const TOGGLES = new Set(["toggle"]);

    for (const name of NAMES) {
      const set = SPINNER_SETS[name];
      if (set === undefined) continue;
      const ms = spinnerIntervalMs(name);
      const cycle = set.frames.length * ms; // cells-ok — a frame count

      if (name === "fullramp") {
        expect(cycle, "a second category — present, not working").toBeGreaterThan(2000);
        continue;
      }
      if (TOGGLES.has(name)) {
        expect(ms, "two frames strobe below ~350ms").toBeGreaterThanOrEqual(350);
        continue;
      }
      if (COUNTERS.has(name)) {
        expect(ms, "a counter is read, so its frames are not a blur").toBeGreaterThanOrEqual(70);
        continue;
      }
      // **The cycle band applies to sets of six or more, and the short ones are
      // bounded per frame instead.** The document states the band as *frames ×
      // ms*, and its own worked example is a caller "picking a 28-frame set" —
      // a length problem. A four-frame turn at 520 ms is not frantic, it is a
      // fast rotation, and holding it to 700 would slow every ASCII fallback in
      // the catalogue to make an arithmetic rule come out. What actually
      // constrains a short set is the frame: too fast strobes, too slow
      // stutters.
      if (set.frames.length < 6) { // cells-ok — a frame count
        expect(ms, `${name} at ${String(ms)}ms a frame`).toBeGreaterThanOrEqual(100);
        expect(ms, `${name} at ${String(ms)}ms a frame`).toBeLessThanOrEqual(400);
        continue;
      }
      expect(cycle, `${name} cycles in ${String(cycle)}ms`).toBeGreaterThanOrEqual(700);
      expect(cycle, `${name} cycles in ${String(cycle)}ms`).toBeLessThanOrEqual(1900);
    }
  });

  it("T2.73: the ASCII pair keeps the shape of motion", () => {
    // Degradation preserves meaning rather than appearance — but a bloom
    // falling to a rotation loses more than it needs to, so the pairing is by
    // shape. Asserted on the two that would be easiest to get wrong.
    expect(spinnerFrames(ASCII_CAPS, "bloom"), "a pulse falls to a pulse").toEqual([
      ".", "o", "O", "@", "*",
    ]);
    expect(spinnerFrames(ASCII_CAPS, "braille"), "a rotation falls to a rotation").toEqual([
      "-", "\\", "|", "/",
    ]);
    expect(spinnerFrames(ASCII_CAPS, "decimal"), "a counter is already ASCII").toEqual(
      SPINNER_SETS["decimal"]?.frames,
    );
  });

  it("T2.74 (C02 I9): a narrow-only set degrades on a wide terminal, and the default does not", () => {
    // The tier, asserted from both sides. Before the capability these sets were
    // a refusal list; the field is what turns a refusal into an arm.
    expect(spinnerFrames(FULL_CAPS, "boxBounce"), "narrow keeps the blocks").toEqual([
      "▖", "▘", "▝", "▗",
    ]);
    expect(spinnerFrames(WIDE_CAPS, "boxBounce"), "wide takes the pair").toEqual([
      "-", "\\", "|", "/",
    ]);
    expect(spinnerFrames(WIDE_CAPS, "braille"), "and braille is narrow on both").toEqual(
      SPINNER_SETS["braille"]?.frames,
    );
  });

  it("T2.75 (C02 I9): the glyph set falls to ASCII on a wide terminal", () => {
    // **`▌` is the framework's own instance of the finding.** Box drawing is
    // ambiguous throughout, so on a wide terminal a panel border, a rule and a
    // progress bar are all twice the width they were measured at — and *mostly
    // ASCII dressed as Unicode* would be worse than ASCII.
    expect(glyphs(FULL_CAPS).bar, "narrow keeps the half block").toBe("▌");
    expect(glyphs(WIDE_CAPS).bar, "wide falls to the ASCII set").toBe(glyphs(ASCII_CAPS).bar);
    expect(glyphs(WIDE_CAPS)).toEqual(glyphs(ASCII_CAPS));

    // And every glyph the wide arm hands back is one cell measured as wide,
    // which is the property the fall exists for.
    for (const value of Object.values(glyphs(WIDE_CAPS))) {
      expect(cells(value, "wide"), `${value} on a wide terminal`).toBeLessThanOrEqual(1);
    }
  });
});
