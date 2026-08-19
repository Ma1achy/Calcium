/**
 * The encoding vocabularies (C12 §3c, I21).
 *
 * **A ramp is not a lookup table — it encodes a value along an axis**, and both
 * defects this component has had were a vocabulary carried into a geometry it
 * did not fit: the heatmap took the sparkline's height ramp for a density field,
 * and `sparkline` before it took the line's rule for positions. Each was correct
 * next door and each rendered.
 *
 * ```
 * position   a dot drawn AT a coordinate      NO vocabulary — the axis is the grid
 * height     how full the cell is             a Ladder, eight steps
 * density    how much ink the cell carries    a Ladder, eight steps
 * fill       how much of a RUN is covered     a Pair, repeated to a count
 * ```
 *
 * **`Ladder` deliberately does not cover `fill`.** A ladder maps one value to
 * one glyph; a fill maps one value to a *count* of two. One type over both makes
 * `filled`/`empty` a two-rung ladder, and then nothing stops a renderer indexing
 * it with a normalised value — which is the category error the whole rule exists
 * to prevent.
 *
 * **A renderer names an axis, never a ramp.** `LADDERS` is a mapped type over
 * the axis, so an entry returning the wrong one does not compile: the mismatch
 * is unspellable rather than checked.
 */
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

/** The four axes a value can be drawn along. */
export type Encoding = "position" | "height" | "density" | "fill";

/** The two that are ladders. `fill` is a Pair and `position` has no vocabulary. */
export type LadderAxis = Extract<Encoding, "height" | "density">;

/**
 * An indexed vocabulary: a value normalised into `[0, 1]` picks one step.
 *
 * **`encodes` may name more than one axis and `substitutes` says which of them
 * is a stand-in.** `RAMP_ASCII` *is* density — ASCII has only ink, which is the
 * heatmap's own axis — and it *stands in for* height on the ASCII line, where
 * ink weight is drawn for position because ASCII has no vertical sub-cell
 * resolution. Both uses are correct and only one is an equivalence, and a field
 * rather than a comment is the difference between that being enforced and being
 * remembered (C12 §3c; the comment form was D5 in the audit).
 */
export type Serves = Readonly<Record<LadderAxis, boolean>>;

export type Ladder = Readonly<{
  steps: string;
  serves: Serves;
  substitutes?: readonly LadderAxis[];
}>;

/**
 * A ladder that **serves** a particular axis — what `LADDERS` is keyed on.
 *
 * **Flags rather than a list, and the reason is `RAMP_ASCII`.** It serves two
 * axes, so `encodes: readonly E[]` cannot type it for either: a list of both is
 * not a list of one. `Record<E, true>` intersects, so one value satisfies
 * `LadderOf<"density">` and `LadderOf<"height">` at once — and a single-axis
 * ladder still fails the axis it does not serve, which is the guarantee.
 */
export type LadderOf<E extends LadderAxis> = Ladder & Readonly<{ serves: Readonly<Record<E, true>> }>;

/**
 * The `fill` vocabulary — a pair, repeated to a count, plus the absent mark.
 *
 * Not a ladder and not indexable: the run is the axis, so what a value picks is
 * *how many* rather than *which*.
 */
export type Pair = Readonly<{
  encodes: "fill";
  filled: string;
  empty: string;
  absent: string;
}>;

/**
 * The `extent` vocabulary — a run whose *length* is the whole signal.
 *
 * **A fourth encoding, and the reason it is not `fill`.** A `Pair` is a gauge:
 * a lit run against a shaded track, correct when the question is *how much of
 * this one thing's own ceiling is used* — a CPU cell, a quota. `barRow` reused
 * it for **comparison** bars, where each row is an independent quantity read
 * against its neighbours, and the shaded remainder carried no information at
 * all: every bar filled the full width and read as a percent-complete meter.
 * That is `ramp.ts`' own recorded defect class — *a vocabulary carried into a
 * geometry it did not fit* — for the third time.
 *
 * Under `extent` the remainder is **blank**, so length is the only signal, and
 * a partial glyph at the tip buys sub-cell precision the run alone cannot.
 */
export type Extent = Readonly<{
  encodes: "extent";
  /**
   * Which end the run grows from — **on the vocabulary, not on the call**.
   *
   * A leftward run needs mirrored fractions, so a direction passed to the *run*
   * could be handed rightward glyphs and would draw a tip pointing the wrong
   * way: a picture that is right in every count and reversed. Carrying it here
   * makes that pairing unspellable, which is `serves`' argument one vocabulary
   * along.
   *
   * **This is not a third axis, and it was very nearly written as one.** A
   * vertical raincloud's density is a run of dot-columns — `extent` mirrored —
   * rather than a ladder of an axis called `column`. A ladder is per-cell and an
   * extent is per-run, and which shape a density needs is decided by the
   * dimension its *band* is thin in, not by the axis its values lie along
   * (C12 §3i, I21).
   */
  grows: "rightward" | "leftward";
  solid: string;
  /** Fractions of a cell, ascending. Empty where the arm has none. */
  partials: readonly string[];
  absent: string;
}>;

/**
 * The extent vocabulary for a terminal.
 *
 * **The partials are the left-eighths and not the lower-eighths.** `RAMP_UNICODE`
 * is `▁▂▃▄▅▆▇█` — a *vertical* ramp, which is what a sparkline cell needs
 * because its axis is height. A horizontal bar's tip needs `▏▎▍▌▋▊▉█`, growing
 * from the left. The two sets look interchangeable and encode different axes,
 * which is I21's whole subject.
 *
 * **The wide arm has one partial, not seven.** U+2580–U+259F are all
 * `East_Asian_Width=Ambiguous`, so on a terminal that draws them wide an
 * eighth-block tip is two cells — `pairFor`'s F176 defect exactly, and this
 * vocabulary is written after it rather than before, so it inherits the fix
 * rather than repeating it. Braille is `Neutral` throughout; `⡇` is the left
 * column filled, which is a half and the only fraction the block can express
 * horizontally.
 */
export function extentFor(caps: Caps, grows: "rightward" | "leftward" = "rightward"): Extent {
  if (caps.unicode === "ascii") {
    return Object.freeze({
      encodes: "extent", grows, solid: "#", partials: Object.freeze([]), absent: "-",
    } as const);
  }
  // **Leftward is braille at every width, and that is a limit rather than a
  // choice.** The narrow arm below uses the left-eighths `▏▎▍▌▋▊▉` — seven
  // fractions growing from the left. Unicode has no matching set growing from
  // the right: `▕` and `▐` are the only two it offers, an eighth and a half, and
  // both are `East_Asian_Width=Ambiguous`. Braille is `Neutral` throughout and
  // `⢸` is the right dot-column, the one fraction the block can express
  // sideways — the same trade the wide arm already takes, from the other side.
  if (grows === "leftward" || caps.ambiguousWidth === "wide") {
    return Object.freeze({
      encodes: "extent",
      grows,
      solid: "\u28ff",
      partials: Object.freeze([grows === "leftward" ? "\u28b8" : "\u2847"]),
      absent: "-",
    } as const);
  }
  return Object.freeze({
    encodes: "extent",
    grows,
    solid: "\u2588",
    partials: Object.freeze(["\u258f", "\u258e", "\u258d", "\u258c", "\u258b", "\u258a", "\u2589"]),
    absent: "\u2014",
  } as const);
}

/**
 * A run of `value/max` of `width` cells, with a fractional glyph at the tip.
 *
 * Returns the run only — **the caller pads**, because what follows a bar differs
 * by form (a value label, a second bar, nothing) and a vocabulary that padded
 * would be deciding that.
 */
export function extentRun(t: number, width: number, ext: Extent): string {
  const w = Math.max(0, Math.floor(width));
  if (w === 0) return "";
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const exact = clamped * w;
  const full = Math.min(w, Math.floor(exact));
  const rest = exact - full;
  const n = ext.partials.length; // cells-ok — a vocabulary length
  if (full >= w || n === 0) return ext.solid.repeat(full);
  // Round to the nearest expressible fraction; index 0 is the thinnest, so a
  // remainder below half a step draws nothing rather than a misleading sliver.
  const step = Math.round(rest * (n + 1));
  if (step === 0) return ext.solid.repeat(full);
  if (step > n) return ext.solid.repeat(Math.min(w, full + 1));
  // The tip goes on the growing end, which the vocabulary carries rather than
  // the call — a leftward run with a tip on the right is reversed and correct in
  // every count.
  return ext.grows === "leftward"
    ? ext.partials[step - 1]! + ext.solid.repeat(full)
    : ext.solid.repeat(full) + ext.partials[step - 1]!;
}

/** Unicode: the lower-block ramp, one eighth per step. */
export const RAMP_UNICODE = "▁▂▃▄▅▆▇█";

/** ASCII: increasing ink, which is the only ordering ASCII can express. */
export const RAMP_ASCII = ".:-=+*#@";

/**
 * Braille density, for a terminal that draws ambiguous glyphs wide (C02 I9).
 *
 * **`RAMP_UNICODE` is `East_Asian_Width=Ambiguous` in all eight glyphs**, so on
 * such a terminal every step is two cells — and `sparkline` is what C11 draws
 * into a table cell, so what breaks is the column alignment of every row below
 * rather than a chart looking odd.
 *
 * Braille is the replacement because **every code point in the block is narrow**
 * — U+2800–U+28FF is `East_Asian_Width=Neutral`, not ambiguous — so this arm is
 * correct on both kinds of terminal rather than being a second guess. Eight
 * steps, like the other two, because the step count is load-bearing: a value
 * normalised into `[0, 1]` indexes one of eight, and a ramp with fewer would
 * change the vertical resolution as well as the appearance.
 *
 * It is dot density rather than height, which reads less like a bar chart and
 * is the cost of the arm. The alternative was refusing ambiguous glyphs outright
 * and taking this ramp everywhere — which would have changed the sparkline for
 * every user to fix it for some.
 *
 * **It fills from the bottom, and its first step is one dot rather than none**
 * (I16). The set that shipped began at `U+2800` — BRAILLE PATTERN BLANK — so
 * every sparkline on a wide terminal drew its *minimum* as whitespace, which the
 * right-anchor already uses to mean *fewer samples than cells*: one character,
 * two meanings, in the arm nothing renders in a golden frame. Measured rather
 * than noticed — `sparkline([0, 5], 6, wide)` came back as four spaces, then
 * `U+2800` for the zero, then `U+28FF` for the five: five blank cells and one
 * full one, where the row holds two readings. Every width and length assertion
 * passed against it, because `cells()` counts the blank as one. Found by C12's
 * heatmap walk (§6a A1), whose subject is magnitude carried by a glyph: an idle
 * row must not read as an absent one.
 *
 * The old set was also non-monotone in ink — its dot populations ran
 * `0,1,2,3,4,5,6,8`, so the last step was a double jump. This one runs `1..8`,
 * which is what an eight-step ramp claims to be.
 */
export const RAMP_BRAILLE = "\u2840\u28c0\u28c4\u28e4\u28e6\u28f6\u28f7\u28ff";

/**
 * Density, for a grid cell — the heatmap's ramp (C12 I17, §3a).
 *
 * **Not `RAMP_BRAILLE`, and the difference is what the cell is.** That one fills
 * bottom-up because a sparkline cell has a vertical axis and the glyph is a
 * column of it. **A grid cell has no vertical axis**, so a bottom-filled glyph
 * reads as a bar fragment and a matrix of them reads as rows of tiny bar charts —
 * which is a picture every count agrees with and no assertion can see.
 *
 * Dots spread across the cell instead: populations 1 to 8, monotone in ink,
 * every step narrow under both width conventions.
 *
 * **It starts at one dot rather than none** (I16). The prior art's density set
 * begins at `U+2800`, and blank is what an absent cell draws in a grid — so a
 * ramp starting there would make the minimum and absence one picture, which is
 * the collision I16 exists to refuse, arriving on a third ramp.
 *
 * **The same set on an ASCII terminal is `RAMP_ASCII`.** Density has no ASCII
 * expression beyond increasing ink, which is what that ramp already is.
 */
export const RAMP_DENSITY = "\u2804\u2814\u2816\u2836\u2837\u283f\u287f\u28ff";

/** The ladders, as values carrying the axis each one encodes (I21). */
const HEIGHT_UNICODE = Object.freeze({
  steps: RAMP_UNICODE,
  serves: Object.freeze({ height: true, density: false } as const),
});
const HEIGHT_BRAILLE = Object.freeze({
  steps: RAMP_BRAILLE,
  serves: Object.freeze({ height: true, density: false } as const),
});
const DENSITY_BRAILLE = Object.freeze({
  steps: RAMP_DENSITY,
  serves: Object.freeze({ height: false, density: true } as const),
});

/**
 * ASCII, which serves both axes and equals only one.
 *
 * **It *is* density** — ASCII has only ink, which is the heatmap's own axis —
 * **and it *stands in for* height** on the ASCII line, where ink weight is drawn
 * for position because there is no vertical sub-cell resolution to draw. The
 * cost of the stand-in, stated where it is taken: at ASCII a line and a filled
 * area are hard to tell apart.
 */
const ASCII_BOTH = Object.freeze({
  steps: RAMP_ASCII,
  serves: Object.freeze({ height: true, density: true } as const),
  substitutes: Object.freeze(["height"] as const),
});

/**
 * Axis → the ladder for these capabilities (I21).
 *
 * **A mapped type over the axis, and that is the enforcement.** An entry
 * returning a ladder of the wrong axis does not compile, so *`ladderFor
 * ("density")` returns a height ramp* is unspellable in the source rather than
 * caught by a test — the mutation that would restore this component's second
 * defect cannot be written.
 *
 * **ASCII first in both arms, because it is the stronger constraint**: a
 * terminal that cannot draw braille cannot draw blocks either, so the ambiguous
 * question only arises once unicode is available.
 */
const LADDERS: { readonly [E in LadderAxis]: (caps: Caps) => LadderOf<E> } = Object.freeze({
  height: (caps) =>
    caps.unicode === "ascii"
      ? ASCII_BOTH
      : caps.ambiguousWidth === "wide"
        ? HEIGHT_BRAILLE
        : HEIGHT_UNICODE,
  density: (caps) => (caps.unicode === "ascii" ? ASCII_BOTH : DENSITY_BRAILLE),
});

/** The capabilities a vocabulary is chosen against. Nothing here probes (C09 I3). */
type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

/** The ladder for an axis. A renderer names the axis it draws, never a ramp. */
export function ladderFor<E extends LadderAxis>(encodes: E, caps: Caps): LadderOf<E> {
  return LADDERS[encodes](caps);
}

/**
 * The `fill` pair (C12 I20, §3b).
 *
 * **Not reachable through `ladderFor`**, because a fill is not indexable: the run
 * is the axis, so a value picks *how many* rather than *which*.
 *
 * `—` is the absent mark: a run of nothing reads as *zero*, which is the one
 * thing absence is not.
 */
export function pairFor(caps: Caps): Pair {
  if (caps.unicode === "ascii") {
    return Object.freeze({ encodes: "fill", filled: "#", empty: ".", absent: "-" } as const);
  }
  // **The ambiguous-width arm, and `fill` had none** (F176). `\u2588` `\u2591` and `\u2014` are
  // all `East_Asian_Width=Ambiguous`, so on a terminal that draws them wide a
  // bar occupies twice its declared cells and `truncate` eats the end of it \u2014
  // which is the *number*, the one thing a bar exists to say. This is exactly
  // what `RAMP_UNICODE` did and what `ladderFor` swaps braille in for; the pair
  // was written after that fix and did not inherit it.
  //
  // **The golden corpus had already recorded it.** `table-value-bar` at
  // `dark-wide` has read `\u2588\u2591\u2591\u2591\u2591\u2591\u2591\u2591 \u2026` since the state landed, in a snapshot
  // that was reviewed and committed. The instrument captured the evidence and
  // the reading step was skipped, which is a finding about the habit rather
  // than about the code.
  //
  // Braille because every code point in U+2800\u2013U+28FF is `Neutral` \u2014 narrow
  // under both conventions rather than a second guess \u2014 and these two are the
  // density ladder's own ends, so the track and the fill sit on one scale. The
  // absent mark drops to ASCII `-`: the em dash is ambiguous too, and there is
  // no braille glyph that reads as *nothing was reported*.
  if (caps.ambiguousWidth === "wide") {
    return Object.freeze({ encodes: "fill", filled: "\u28ff", empty: "\u2804", absent: "-" } as const);
  }
  return Object.freeze({ encodes: "fill", filled: "\u2588", empty: "\u2591", absent: "\u2014" } as const);
}

/**
 * Ladder steps. Eight, in every arm — see `RAMP_BRAILLE`'s header.
 *
 * Load-bearing rather than tidy: a value normalised into `[0, 1]` indexes one of
 * these, so a ladder with fewer changes the resolution as well as the look.
 */
export const RAMP_STEPS = 8;
