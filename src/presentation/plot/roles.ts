/**
 * The terminal's alphabet for a `GlyphRole` — the record §3ak.3 said existed.
 *
 * **The rung table placed *the glyph per `GlyphRole` per unicode rung* in "the
 * terminal walker's `Record`", and there was no walker and no record** (F289).
 * `GlyphRole` was read in one file, the one declaring it; the terminal reached
 * its median, mean and outlier characters inside rasterisers that had never
 * heard of the type, and the two arms agreed because the roles were extracted
 * *from* that composition. Nothing held them there.
 *
 * **Why the alphabet is here and the partition is not.** I62 says a mark names a
 * role and never a glyph, and the second arm has no characters at all — a shared
 * table of `┃` and `◌` would be one arm's alphabet in the layer above both. So
 * `GLYPH_SHAPE` is shared and character-free, and *this* is the terminal's half:
 * exhaustive over the same seven, so an eighth role is a compile error on both
 * sides rather than a silently different figure on one (I68).
 *
 * **Two rungs, not five** (§3ak.21 finding 3). Measured over every slot this
 * family reaches: `full` and `bmp` agree on all of them, and **`ascii` and
 * `full/wide` agree on all of them**, because `glyphs()` returns the ASCII set
 * for `unicode === "ascii" || ambiguousWidth === "wide"` — C02 I9's ruling. A
 * record keyed by the disagreement matrix's five capability sets would carry
 * three duplicate columns; one keyed by `unicode` alone would be **wrong at
 * `full/wide`**. So the rung is this function's argument rather than a column,
 * which is the only place it is stated once.
 */
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { glyphs } from "../blocks/glyphs.js";
import { GLYPH_SHAPE, type GlyphRole, type MarkRole } from "./figure.js";

/** Capabilities a vocabulary is chosen against. Nothing here probes (C09 I3). */
type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

/**
 * The terminal's answer per role.
 *
 * **Keyed by `MarkRole`, which is computed from `GLYPH_SHAPE`** — so the pairing
 * is the compiler's rather than a convention two files apart. A role given a
 * character here and a `span` there would be drawn twice, once as a run and once
 * as a cell; here it is a missing or an excess key.
 *
 * **`meanOnMedian` is beside the record and is not a role**: a mean landing on
 * the median is **one cell holding two marks**, so it answers *what happens when
 * two roles land together* rather than *which role is this*.
 *
 * **A dumbbell's far end used to sit beside it and is now in it** (§3ak.42,
 * F344). The note refused both for one reason — *giving either a role of its own
 * would make `GLYPH_SHAPE` describe eight things where the figure says seven* —
 * and only one of them earns it. The figure says **eight**, and has in both arms
 * all along: the far end is drawn distinguishably from the near one, which is
 * I68's subject. The refusal's alternative was `seriesIndex`, which is the
 * **colour** slot, so honouring it left a dumbbell's row with no ink of its own
 * and the second arm spending colour on the pair position.
 */
export type RoleGlyphs = Readonly<{
  /** One character per role that marks a cell — **keyed by `MarkRole`, which is derived**. */
  of: Readonly<Record<MarkRole, string>>;
  /**
   * The mean where it lands on the median — **one cell, both statements**
   * (C04 I53, C12 I33). Skipping it left a band with no mean beside two that had
   * one, so *they coincide* read as *it is missing*.
   */
  meanOnMedian: string;
}>;

/** @see RoleGlyphs */
export function roleGlyphs(caps: Caps): RoleGlyphs {
  const g = glyphs(caps);
  return {
    of: {
      point: g.filled,
      // **`◆` for a mean and `◆` for a pooled estimate, which is six characters
      // for seven roles** (F300). Legitimate and unstated until it was counted:
      // `distributionFigure` returns from the forest branch before a mean can be
      // added, so the two cannot share a figure — which is why I68 is scoped to
      // co-occurrence rather than saying *seven roles, seven shapes*.
      mean: g.diamond,
      outlier: g.dotted,
      target: g.diamond,
      // **A dumbbell's far end. A shape rather than a tone**, so the pairing
      // survives the colour floor — the same argument `candleHollow` makes one
      // form along. It moved into the record when the figure gained the role
      // (§3ak.42, F344); the character is the one it always was, which is what
      // makes this an extraction rather than a change of picture.
      paired: g.hollow,
    },
    meanOnMedian: g.diamondTee,
  };
}

/**
 * Whether this role puts a single character in a cell — **the guard that pairs
 * the two records** (I68).
 *
 * Reads `GLYPH_SHAPE` rather than testing the record for a key, so the partition
 * has one statement and the alphabet answers to it — the narrowing to `MarkRole`
 * is what lets a caller index `of` at all.
 */
export function marksACell(role: GlyphRole): role is MarkRole {
  return GLYPH_SHAPE[role] === "mark";
}
