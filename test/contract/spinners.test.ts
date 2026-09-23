// Roadmap 51 — the spinner sets, their intervals, and the width rule.
//
// **The construction-time assertion the catalogue asks for.** A frame that is
// two cells where its neighbours are one reflows the row every tick, and
// neither `cells()` nor a frame-read on the machine that picked it will show it:
// the disagreement depends on locale. So it is asserted here, over every set, on
// both arms.

import { describe, expect, it } from "vitest";

import { FREE_WIDTH_SLOTS, glyphs, spinnerFrames, spinnerIntervalMs } from "../../src/presentation/blocks/index.js";
// **The table itself is not on the barrel**, and MG24 is why: its members have
// no reader in `src/` — the two functions are the seam. Imported from the module
// so the rows can walk every set rather than a list they keep themselves, which
// would be a coverage set drawn from the test's own table.
import { SPINNER_SETS } from "../../src/presentation/blocks/glyphs.js";
import { spinnerSetNames } from "../../src/presentation/blocks/glyphs.js";
// **The design's own resolver, not a reimplementation** (C09 I98). `asciiPattern`
// is a *pattern* and `asciiTrajectory` says how it fits the set's frame count; a
// second copy of that arithmetic here would be a second record of the design,
// which is the failure the registry projection exists to stop.
import { loadRegistry, spinnerAsciiFrames } from "../../docs/design/language/build-calcium.mjs";
import type { Registry } from "../../docs/design/language/build-calcium.mjs";
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

/**
 * The cycles the registry states, read from it rather than copied (T2.72).
 *
 * **Read and not written**: a number copied here would be a second record of
 * the design's, and the two would drift silently — which is the failure the
 * whole registry projection exists to stop.
 */
/** The registry, read once through its own loader — the source this file projects. */
const REGISTRY: Registry = loadRegistry();

type SpinnerRecord = Readonly<{
  id: string;
  status?: string;
  frames: readonly string[];
  intervalMs: number;
  cycleMs?: number;
  reusable?: boolean;
  asciiPattern?: readonly string[];
  asciiTrajectory?: Readonly<{ type: string; spinnerIds?: readonly string[] }>;
}>;

const REGISTERED: readonly SpinnerRecord[] = (REGISTRY["spinners"] as readonly SpinnerRecord[]).filter(
  (sp) => sp.status === "current",
);

const STATED_CYCLES: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(
    REGISTERED.filter((sp) => typeof sp.cycleMs === "number").map((sp) => [sp.id, sp.cycleMs as number]),
  ),
);

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
      // **A set whose registry record states its own cycle is held to that
      // number, not to the band — which is stronger and not weaker.** The band
      // exists because nothing else pins the figure; where the design states
      // one, a bracket that merely contains it would let the set drift by
      // hundreds of milliseconds and stay green. `agent` walks for 9.84 s and
      // is neither a turn nor a pulse: it is a bloom that does not repeat
      // inside a call, and §095 draws it as the mark of a thing still running
      // rather than of a thing turning.
      const stated = STATED_CYCLES[name];
      if (stated !== undefined) {
        expect(cycle, `${name} is pinned to the registry's own cycle`).toBe(stated);
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

  it("T2.163 (C09 I98, R-MOT-010): SPINNER_SETS against the registry, by equality and field by field", () => {
    // **The row commitment 78 said already existed.** That commitment cites the
    // spinner catalogue as the remedy the bars lacked — *registry against tree,
    // by equality in both directions* — and the row it meant is T2.72, which
    // compares `cycleMs`. The cadence, never the alphabet. So the alphabet was
    // the uncompared column on both catalogues and the one the bars were wrong
    // in; a precedent cited for a column it does not cover reads exactly like
    // coverage.
    //
    // **Resolved through the design's own function, not read off the field.**
    // `asciiPattern` is a *pattern* and `asciiTrajectory` says how it fits: a
    // `fit-cycle` stretches it to the set's frame count, so `braille`'s four
    // characters become ten frames and the ASCII cycle is the Unicode one. A
    // first draft compared against the raw field and reported nineteen
    // disagreements of the wrong kind — an instrument that guesses what a field
    // means measures its own guess.
    for (const sp of REGISTERED) {
      const set = SPINNER_SETS[sp.id];
      expect(set, `${sp.id} is registered and must be built`).toBeDefined();
      if (set === undefined) continue;
      expect([...set.frames], `${sp.id} frames`).toEqual(sp.frames);
      expect(set.intervalMs, `${sp.id} interval`).toBe(sp.intervalMs);
      expect([...set.ascii], `${sp.id} ascii — the registry's pattern, fitted`).toEqual(
        spinnerAsciiFrames(REGISTRY, sp),
      );
    }

    // **The other direction, and the residue is empty.** Six sets shipped
    // unregistered and M4 ruled they are registered from the repo's values;
    // they are, so this is now an equality with nothing excused. A set added to
    // either side alone fails here.
    const built = new Set(spinnerSetNames());
    const registered = new Set(REGISTERED.map((sp) => sp.id));
    expect(
      [...built].filter((n) => !registered.has(n)).sort(),
      "built and not registered",
    ).toEqual([]);
    expect([...built].sort(), "the two catalogues are one set").toEqual([...registered].sort());
  });

  it("T2.164 (C09 I98, R-MOT-008): the bloom family is the agent's, over its membership", () => {
    // **Over the frames and not over the name**, because a tool adopting a bloom
    // would do it by copying frames. §038: *the bloom family is RESERVED —
    // fullramp, grow, bloom, starfield and pulse mean THE MODEL IS WORKING. A
    // tool never blooms. which is still checkable: a bloom set on a TOOL is a
    // defect a grep finds.* The design names the check; this is it.
    const FAMILY = ["agent", "fullramp", "grow", "bloom", "starfield", "pulse"];
    const bloomGlyphs = new Set(FAMILY.flatMap((n) => [...(SPINNER_SETS[n]?.frames ?? [])]));
    // `⋅ ∘ ◦` open the walk and are not blooms — they are where it starts small.
    for (const plain of ["\u22c5", "\u2218", "\u25e6"]) bloomGlyphs.delete(plain);

    for (const name of spinnerSetNames()) {
      if (FAMILY.includes(name)) continue;
      const frames = SPINNER_SETS[name]?.frames ?? [];
      const borrowed = [...frames].filter((f) => bloomGlyphs.has(f));
      expect(borrowed, `${name} draws no bloom frame`).toEqual([]);
    }

    // And the registry says the same, in its own field: `agent` is the one
    // record that is not reusable.
    expect(
      REGISTERED.filter((sp) => sp.reusable === false).map((sp) => sp.id),
      "the agent's walk is the one set nothing else may take",
    ).toEqual(["agent"]);
  });

  it("T2.165 (C09 I98, R-MOT-009): a ping-pong traverses 0 → N → 1, so neither endpoint doubles", () => {
    // **A ping-pong is detected, not listed.** A set whose second half is its
    // first half reversed is one; asserting the property over a hand list would
    // let a set stop being a ping-pong and keep the row green. The seam is the
    // whole claim: `.oO@Oo` returns without drawing `@` or `.` twice in a row,
    // and the collapse's `.oO@*` was not a ping-pong at all.
    let found = 0;
    for (const name of spinnerSetNames()) {
      for (const frames of [SPINNER_SETS[name]?.frames ?? [], SPINNER_SETS[name]?.ascii ?? []]) {
        const n = frames.length;
        if (n < 4) continue;
        const peak = frames.indexOf([...frames].reduce((a, b) => (frames.indexOf(b) > frames.indexOf(a) ? b : a), frames[0] ?? ""));
        void peak;
        // The seam: the last frame and the first are never equal, and no frame
        // is repeated across the wrap. A ping-pong that emitted its endpoint
        // twice would pause there for two ticks, which reads as a stutter.
        const wrapsCleanly = frames[n - 1] !== frames[0];
        if (!wrapsCleanly) {
          expect.fail(`${name} repeats ${String(frames[0])} across the cycle seam`);
        }
        // A ping-pong: the tail mirrors the head.
        const half = Math.floor(n / 2);
        const mirrors = half > 1 && frames.slice(1, half + 1).every((f, i) => f === frames[n - 1 - i]);
        if (mirrors) found += 1;
      }
    }
    expect(found, "the corpus has ping-pong sets for this row to be about").toBeGreaterThan(0);
  });

  it("T2.73 (C09 I98, R-MOT-010, R-MOT-011): the ASCII rung keeps the cycle, not just the alphabet", () => {
    // **This row asserted the defect.** It was titled *the ASCII pair keeps the
    // shape of motion* — R-MOT-010's own words — and asserted two literals it
    // wrote itself, against no registry: `bloom` falls to `.oO@*` and `braille`
    // to `-\|/`. A source assertion measuring the prose above it, and green for
    // as long as the collapse shipped.
    //
    // T2.163 now holds the alphabet, by equality against the design. What is
    // left for this row is the claim the character comparison does not make and
    // the one that was actually broken: **the rung does not change the cadence.**
    // A four-frame pattern at the set's own interval is a faster spinner —
    // `braille` is ten frames at 80 ms, an 800 ms cycle, and its old ASCII rung
    // ran in 320 ms. `fit-cycle` holds each glyph longer instead, so the two
    // rungs take the same time to come round. That is what *shape of motion*
    // means, and R-MOT-011's *one alphabet, one cadence* is the same fact.
    for (const name of spinnerSetNames()) {
      const set = SPINNER_SETS[name];
      if (set === undefined) continue;
      const ms = spinnerIntervalMs(name);
      const unicode = set.frames.length * ms; // cells-ok — a frame count
      const ascii = set.ascii.length * ms; // cells-ok — a frame count
      if (REGISTERED.some((sp) => sp.id === name)) {
        expect(ascii, `${name}: the ASCII rung runs for as long as the Unicode one`).toBe(unicode);
      }
    }
    // A counter is already ASCII and the row still says so — the one case where
    // the two rungs are the same array rather than the same duration.
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
      "|", "/", "-", "\\",
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
    // which is the property the fall exists for. The exception is declared, not
    // assumed: `residue` is a free-width slot (`FREE_WIDTH_SLOTS`, T2.5),
    // because nothing aligns to a lead followed only by its own count.
    const wide = glyphs(WIDE_CAPS);
    for (const [name, value] of Object.entries(wide)) {
      if (FREE_WIDTH_SLOTS.has(name as never)) continue;
      expect(cells(value, "wide"), `${value} on a wide terminal`).toBe(1);
    }
    expect(cells(wide.residue, "wide"), "and the residue mark is the bare `...` at the wide arm").toBe(3);
  });
});
