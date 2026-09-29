// Roadmap 51's bar half — the styles, and the tier asserted over what
// `barStyle` RETURNS.
//
// **Over the return value and never over the table**, which is the only form
// that catches a style offered on the wrong arm — and it is what caught the
// spinner sets. A row reading `BAR_STYLES.halfblock.narrowOnly` asserts that
// somebody wrote a flag; a row measuring `barStyle(wide).on` asserts that the
// flag is consulted, and those differ exactly when the lookup is wrong.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { barStyle, barStyleNames } from "../../src/presentation/blocks/glyphs.js";

/**
 * The registry's alphabets, read rather than copied.
 *
 * **A pair written here would be a second record of the design's**, and the two
 * would drift exactly as the tree's did — which is the whole reason the row
 * exists. `spinners.test.ts` reads `spinners` the same way for the same reason.
 */
type RegisteredBar = Readonly<{ id: string; filled: string; empty: string; steps?: readonly string[]; status: string }>;
const REGISTERED: readonly RegisteredBar[] = (
  JSON.parse(readFileSync("docs/design/language/calcium-registry.json", "utf8")) as { bars: readonly RegisteredBar[] }
).bars.filter((b) => b.status === "current");
import { cells } from "../../src/presentation/text.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, measurable, visible } from "../support/render.js";
import { block } from "../../src/data/viewmodel/index.js";

const WIDE = { ...FULL_CAPS, ambiguousWidth: "wide" as const };
const NARROW = { ...FULL_CAPS, ambiguousWidth: "narrow" as const };

describe("roadmap 51 — bar styles, and ambiguous width is a tier", () => {
  it("T2.90: every style draws one cell per glyph at the terminal it is offered on", () => {
    // **The property the whole tier exists for, over the returned pair.** A bar
    // is a repeat of one glyph, so a glyph of two cells is a bar of twice its
    // computed width — and `progress` subtracts the label and the percentage
    // from the row before repeating, so the overflow lands as a wrapped line
    // rather than as a visibly wide bar.
    for (const name of barStyleNames()) {
      for (const caps of [NARROW, WIDE, ASCII_CAPS]) {
        const { on, off } = barStyle(caps, name);
        const w = caps.ambiguousWidth ?? "narrow";
        expect(cells(on, w), `${name} on at ${String(caps.unicode)}/${w}`).toBe(1);
        expect(cells(off, w), `${name} off at ${String(caps.unicode)}/${w}`).toBe(1);
      }
    }
  });

  it("T2.91 (C02 I9): a wide terminal gets ASCII for six of the seven unicode styles", () => {
    // **Measured, and it corrects `CALCIUM_BARS.md`.** Its determinate table
    // reads as though `▐` were the only narrow glyph and the rest wide; they are
    // all `Ambiguous`, so all six fall. `braille` is the only unicode style that
    // survives, which is the fact the document does not state.
    const fell = barStyleNames().filter(
      (n) => barStyle(WIDE, n).on !== barStyle(NARROW, n).on,
    );

    expect(fell.sort(), "seven, and braille is not among them").toEqual(
      ["beads", "block", "halfblock", "posts", "rectangle", "slant", "squares"],
    );
    expect(barStyle(WIDE, "braille").on, "braille is width-stable").toBe("⣿");
  });

  it("T2.92: an unknown or absent name is the default, never a throw", () => {
    // A bar is decoration over a number that is already correct, so a session
    // that will not start because a style was misspelled is worse than one drawn
    // with the wrong glyph — `spinnerFrames`'s argument, and the same answer.
    expect(barStyle(NARROW, "no-such-style")).toEqual(barStyle(NARROW));
    // **The default is `block`, which is the pair that already shipped.** The
    // golden frames said so: making `halfblock` the default restyled every bar
    // in the tree, a visible change to shipped output arriving as a side effect
    // of adding a field.
    expect(barStyle(NARROW).on, "the default is what was already drawn").toBe("█");
  });

  it("T2.93: ASCII wins over the width tier, because it is the stronger refusal", () => {
    // The order of the two tests, asserted rather than described: a terminal
    // that cannot draw the glyph at all is not a terminal that draws it twice as
    // wide, so `unicode` is read first and `braille` falls here where it does
    // not fall at `wide`.
    expect(barStyle(ASCII_CAPS, "braille").on, "ASCII takes even the stable one").toBe("#");
    expect(barStyle(WIDE, "braille").on, "and width alone does not").toBe("⣿");
  });

  // **The four rows above are all about width and fallback, and that is the
  // gap.** Three characters appear in this file and all three are an `on`; no
  // row here or anywhere else in the tree has ever named an `off`. A width
  // assertion is satisfied by any one-cell glyph, so `ascii` drew `#`/`.`
  // against the registry's `#`/`-` under a file whose whole subject is this
  // table. §033's fixture is what found it.
  it("T2.158 (C09 I94, I136, R-PRG-001): the registry's bars are the tree's, by equality both ways — and the steps", () => {
    // **Equality on the names, not containment.** A subset check in either
    // direction is satisfied by the failure it exists to catch: a style the
    // registry does not register reads as covered, and a registered alphabet
    // the tree never built reads as present.
    expect([...barStyleNames()].sort(), "the names, both ways").toEqual(
      REGISTERED.map((b) => b.id).sort(),
    );

    // **Then the characters, which is what nothing asserted.** `barStyle` is
    // asked at the rung the registry's characters are drawn at — narrow and
    // full Unicode — because the fallbacks are this terminal's business and
    // not the design's.
    const tree = Object.fromEntries(
      barStyleNames().map((n) => [n, { filled: barStyle(NARROW, n).on, empty: barStyle(NARROW, n).off }]),
    );
    const design = Object.fromEntries(REGISTERED.map((b) => [b.id, { filled: b.filled, empty: b.empty }]));
    expect(tree, "every pair, character for character").toEqual(design);

    // **The pair that was wrong, named** — so a reader meeting this row knows
    // what it was written against and a revert of `BAR_ASCII` fails here by
    // name rather than inside a record comparison.
    expect(barStyle(ASCII_CAPS, "block"), "the ASCII rung's pair").toEqual({ on: "#", off: "-" });
    // And `braille`'s empty really is a space, drawn so in §033's own fixture:
    // the row compares characters and does not require two visible ones.
    expect(barStyle(NARROW, "braille").off, "braille's empty is the design's space").toBe(" ");

    // **And the steps by equality** (C09 I136, review batch 4 M16.3): a record
    // carrying `steps` is the tree's alphabet carrying the same eight, and one
    // without has none — both directions, so a step added on one side fails.
    const treeSteps = Object.fromEntries(barStyleNames().map((n) => [n, barStyle(NARROW, n).steps ?? null]));
    const designSteps = Object.fromEntries(REGISTERED.map((b) => [b.id, b.steps ?? null]));
    expect(treeSteps, "every alphabet's steps, or none").toEqual(designSteps);
    expect(designSteps["braille"], "braille carries the approved eight").toEqual(["⡀", "⡄", "⡆", "⡇", "⣇", "⣧", "⣷", "⣿"]);

    // **What this row does NOT cover, and it is a parked question rather than
    // a divergence left standing.** `BAR_STYLES` is not the tree's only record
    // of an ASCII bar pair: `pairFor` in `plot/ramp.ts` holds a second —
    // `filled "#"`, `empty "."`, `absent "-"` — and it is what a `keyValue`
    // row's `bar` draws through `valueBar`. Moving its `empty` to the
    // registry's `-` would make empty and absent the same character at that
    // rung, and §078's `R-TBL-003` is explicit that a missing number is `—`
    // and never a blank: the two marks are distinct in the design and collide
    // only because this tree degrades the em dash to a hyphen where
    // `ambiguousWidth` forbids it. **The design names no ASCII absent mark**,
    // so choosing one is a visible choice it does not specify. Until it is
    // asked, the row covers `BAR_STYLES` — which is what `R-PRG-001` is about
    // — and the second pair is named here rather than left for the next
    // reader to rediscover.
  });
});

describe("C09 I136 — counted work uses posts, and braille draws eighths (review batch 4 M16.3)", () => {
  /** A bar's cells alone: the row between the label's gap and the readout. */
  const barOf = (spec: Record<string, unknown>, width = 40, caps = FULL_CAPS): string => {
    const row = measurable({ theme: DARK_THEME, capabilities: caps })
      .renderToLines(block({ kind: "progress", id: "m", label: "", current: 6, total: 10, ...spec } as never), width)
      .map(visible)
      .join("");
    return row.replace(/ \S+%.*$/u, "");
  };
  const glyphsIn = (bar: string): string => [...new Set([...bar].filter((c) => c !== " "))].sort().join("");

  it("T2.226 (C09 I136, §7j): the granularity × style table, drawn", () => {
    const table: readonly (readonly [Record<string, unknown>, string])[] = [
      [{ granularity: "segmented" }, "▮▯"],
      [{ granularity: "segmented", style: "braille" }, "▮▯"],
      [{ granularity: "continuous", style: "posts" }, "░█"],
      [{ granularity: "segmented", style: "slant" }, "▰▱"],
      [{ granularity: "segmented", style: "beads" }, "•◦"],
      [{ style: "posts" }, "▮▯"],
      [{ style: "braille" }, "braille"],
      [{ granularity: "continuous", style: "braille" }, "braille"],
      [{ granularity: "continuous" }, "░█"],
      [{}, "░█"],
    ];
    for (const [spec, want] of table) {
      // Braille at 6/10 of the bar ends on a partial cell, so its row is the
      // full cell and one step: every glyph in the braille block, `⣿` among them.
      if (want === "braille") {
        const drawn = [...glyphsIn(barOf(spec))];
        expect(drawn, JSON.stringify(spec)).toContain("⣿");
        expect(drawn.every((c) => c >= "\u2840" && c <= "\u28FF"), `${JSON.stringify(spec)}: ${drawn.join("")}`).toBe(true);
      } else expect(glyphsIn(barOf(spec)), JSON.stringify(spec)).toBe([...want].sort().join(""));
      // **At the ASCII rung every row is `#`/`-`** (I94): the normalisation is
      // about which alphabet, and the rung below takes every alphabet the same.
      expect(glyphsIn(barOf(spec, 40, ASCII_CAPS)), `${JSON.stringify(spec)} at ASCII`).toBe("#-");
    }
  });

  it("T2.227 (C09 I136, §7j): the braille frames — one cell through eight steps, three cells at seven fractions, painted and ASCII whole", () => {
    // A label-less bar's cells are `width − readout − 1`; the readout is `NN%`,
    // so a width is chosen per bar length. `n` cells at `current/total`.
    const cellsAt = (n: number, current: number, total: number, extra: Record<string, unknown> = {}, caps = FULL_CAPS): string => {
      const readout = `${String(Math.round((current / total) * 100))}%`;
      const bar = barOf({ style: "braille", current, total, ...extra }, n + 1 + readout.length, caps);
      return [...bar].slice(0, n).join("");
    };
    const oneCell = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((e) => cellsAt(1, e, 8));
    expect(oneCell, "one cell through its eight steps").toEqual([" ", "⡀", "⡄", "⡆", "⡇", "⣇", "⣧", "⣷", "⣿"]);
    const threeCells = [0, 1, 8, 9, 12, 23, 24].map((e) => cellsAt(3, e, 24));
    expect(threeCells, "§7j's figure").toEqual(["   ", "⡀  ", "⣿  ", "⣿⡀ ", "⣿⡇ ", "⣿⣿⣷", "⣿⣿⣿"]);
    // **Between eighths it rounds**: every fraction above is a whole number of
    // eighths, where `round` and `floor` agree. 7/10 of 28 cells is 156.8.
    expect(cellsAt(28, 7, 10), "nineteen full cells and ⣇").toBe(`${"⣿".repeat(19)}⣇${" ".repeat(8)}`);

    // **The partial cell is an `on` cell for the ramp** (C09 I52): at 24-bit it
    // takes the ramp's sample at its own index, so it is not the off cells' ink.
    const ramped = measurable({ theme: DARK_THEME, capabilities: FULL_CAPS })
      .renderToLines(
        block({ kind: "progress", id: "m", label: "", style: "braille", current: 12, total: 24, ramp: { fill: "gradient", from: "default", to: "accent" } } as never),
        3 + 1 + 3,
      )[0]!;
    const partialAt = ramped.indexOf("⡇");
    const sgrBefore = (i: number) => (ramped.slice(0, i).match(/\u001b\[[0-9;]*m/gu) ?? []).at(-1) ?? "";
    expect(partialAt, "the partial cell is drawn").toBeGreaterThan(0);
    expect([...visible(ramped)].slice(0, 3).join(""), "and it is the last `on` cell, after the full one").toBe("⣿⡇ ");
    expect(sgrBefore(partialAt), "and ramped at its own index — a sample of the gradient").toMatch(/38;2;/u);
    expect(sgrBefore(partialAt), "not the full cell's sample").not.toBe(sgrBefore(ramped.indexOf("⣿")));

    // **Painted and ASCII stay whole-cell.** A ground cannot be an eighth.
    expect([0, 1, 8, 9, 12, 23, 24].map((e) => cellsAt(3, e, 24, {}, ASCII_CAPS)), "ASCII").toEqual(["---", "---", "#--", "#--", "##-", "###", "###"]);
    const painted = [0, 1, 9, 12, 23].map((e) => cellsAt(3, e, 24, { painted: true }));
    for (const cellsDrawn of painted) expect([...cellsDrawn].every((c) => c === " "), `painted draws spaces: ${JSON.stringify(cellsDrawn)}`).toBe(true);
  });
});
