/**
 * C10 §2 — the vocabulary. Tokens, palettes, styles.
 *
 * Nothing here reads a capability or a clock. A theme is data; what a terminal
 * can do with it arrives at resolution, injected (I12).
 */

/** What a slot collapses to at 1-bit. Ten tones become three classes (§3). */
export type MonoClass = "emphasised" | "normal" | "deemphasised";

export type PaletteSpec = Readonly<{
  /** slot name → 24-bit hex, `#rrggbb`. */
  slots: Readonly<Record<string, string>>;
  carries: "meaning" | "decoration";
  monochrome: "typographic" | "foreground";
  /**
   * The typographic fallback, declared rather than inferred (I15). Required iff
   * `monochrome === "typographic"`, with one entry per slot — inferring it would
   * mean the framework knowing that `ok` is emphatic and `comment` recessive,
   * which is the app-domain knowledge C05's `ArgType` refuses.
   */
  classes?: Readonly<Record<string, MonoClass>>;
}>;

/**
 * Slot name → ANSI index, 0–15. Curated per theme (§3), never computed:
 * nearest-of-16 by RGB distance collapses `ok` and `info` onto one green, and
 * the failure is invisible in truecolour.
 *
 * This is the one thing in a theme that is not 24-bit hex, which is why it lives
 * in its own module and is SS19's single named exception (I13).
 */
export type FourBitMap = Readonly<Record<string, number>>;

export type Surfaces = Readonly<{
  bg: string;
  bgElev: string;
  bgDeep: string;
  border: string;
  borderStrong: string;
  /**
   * The line background of an added or removed patch row (C10 §4a). The first
   * text-bearing surfaces besides `bg` and `bgElev`, which is what extends §4's
   * contrast floors to them.
   *
   * **Two, not four.** A stronger pair for the precisely changed words within a
   * changed line was specified and withdrawn: `syntax.comment` and `tone.muted`
   * are recessive by design and bound how much tint a diff background may carry,
   * and the first level spends nearly all of it — six units of one channel on
   * dark `diffAdd`. Word-level emphasis is `underline`'s (C25 I10).
   */
  diffAdd: string;
  diffRemove: string;
  /**
   * The selection wash (C17 §5b, roadmap entry 23).
   *
   * **A surface rather than a palette entry, and the entry said otherwise.**
   * Roadmap 23 ruled *selection as a `carries: "meaning"` palette so C10 checks
   * the pair* — and `resolveBackground` refuses any ref that is not
   * `surface.*`, because a tone painted as a background is a tone nothing
   * measured a floor for in that role (I21). So the ruling named an operation
   * this layer does not have, which is C23 §8a A4's shape: an artefact correct
   * about the interaction it found and wrong about a mechanism it assumed.
   *
   * The guarantee it wanted is delivered by the mechanism that does exist —
   * `diffAdd`/`diffRemove`'s pairing (§4a), which checks a foreground slot
   * against a background surface at that slot's own floor. One entry in
   * `SELECTION_SLOTS`, and the same argument for its narrowness.
   */
  selection: string;
}>;

export type ThemeTokens = Readonly<{
  name: string;
  /**
   * The polarity this theme is, declared and **checked against its own
   * background** (I28).
   *
   * It is otherwise a second record of a derivable fact — `luminance(bg)`
   * answers the same question — and one nothing validated: a theme declaring
   * `light` over `#000000` loaded, resolved and cleared every floor, because I9
   * compares tones *to* `bg` and has no opinion about what `bg` is.
   *
   * Kept rather than derived because a token cannot express **intent** for a
   * mid-luminance theme, and a user asking for the dark one is asking about
   * intent. Published through `ResolvedTheme` so an app can choose an asset by
   * it — *no reader here* is not *no reader*, and C22 I68 is the reader that
   * arrived: the opening theme is chosen by matching this field against the
   * terminal's own background.
   */
  variant: "dark" | "light";
  /**
   * What sits behind the text (I25, roadmap 39).
   *
   * **A choice and never a colour**, and the value names *where the colour comes
   * from* rather than the act: `"terminal"` inherits, which preserves a
   * translucent terminal and is correct for a theme designed to sit in one;
   * `"surface"` paints `surfaces.bg`, the one surface every floor is already
   * measured against (I19).
   *
   * A colour here would be a second source of truth for that surface, so a theme
   * could paint one value and prove its floor against another — which is the
   * defect this field exists to close, arriving from the other side.
   */
  background: "terminal" | "surface";
  palettes: Readonly<Record<string, PaletteSpec>>;
  surfaces: Surfaces;
  fourBit: FourBitMap;
}>;

/**
 * The themes a session can switch between, **keyed by name** (I27).
 *
 * `dark` and `light` are names in the shipped set rather than a closed
 * vocabulary, so `high-contrast` is a third theme and not a third variant. The
 * keys were spelling polarity only because a two-theme set had nowhere else to
 * put it — and I25 took that job when a theme began declaring the background it
 * assumes.
 *
 * **`variant` was read only inside `store.ts`** when the keys were freed —
 * each read a key into this record or part of the memo identity — and that
 * measurement is what the name-keying rests on rather than the argument for it
 * (§5a.1). **It has since expired as the doc comment below predicted it would**:
 * `shell/construct.ts` searches this record by `variant` to open the theme that
 * matches the terminal's detected polarity (C22 I68), which is one consumer and
 * is the use the field is published for.
 *
 * A `{ dark, light }` literal still satisfies this, which is what makes the
 * widening free for every app that already supplies one.
 */
export type ThemeSet = Readonly<Record<string, ThemeTokens>>;

/** `"tone.ok"`, `"syntax.keyword"`, `"surface.bgElev"`. */
export type ColourRef = `${string}.${string}`;

/**
 * A colour with its depth named. C10 cannot write an escape — that is
 * `terminal/escapes.ts` alone — so it hands out a description, and the tag is
 * what stops the consumer re-deriving the depth from the format and emitting a
 * truecolour sequence to a 16-colour terminal (§2).
 */
export type ColourValue =
  | Readonly<{ kind: "rgb"; hex: string }>
  | Readonly<{ kind: "ansi256"; index: number }>
  | Readonly<{ kind: "ansi16"; index: number }>;

export type Style = Readonly<{
  colour?: ColourValue;
  /**
   * The second colour channel, and the last one (§4a, I21). Set only by
   * `resolveBackground`, and only from a `surface` ref: a tone painted as a
   * background is a tone nothing measured a floor for in that role.
   */
  background?: ColourValue;
  bold?: boolean;
  dim?: boolean;
  /**
   * **An attribute a renderer sets, never a palette slot's fallback** — which is
   * the whole of why it can be one field (roadmap 50, reversing entry 11's
   * ruling (c) on 2026-08-15).
   *
   * 11(c) read *if inline emphasis lands, bold takes `Style.bold` and italic
   * takes `underline` or stays literal*. That decided a fallback before anything
   * needed one, and it decided it onto a channel that is already spoken for:
   * §4a's own comment says *word-level emphasis is `underline`'s* (C25 I10), so
   * a diff's word-level marker and a markdown emphasis would have been the same
   * attribute meaning two things — the class this repo refuses everywhere else.
   *
   * **It survives every depth, and for the reason `bold` does**: `sgr()` writes
   * attributes unconditionally and consults no depth, because an attribute is
   * not a colour. It does **not** join `MonoClass`, and that is the check rather
   * than an omission — `MONO` is the *typographic fallback for a palette slot*,
   * three classes deep, and a slot resolving to italic would be the framework
   * deciding that some tone is emphatic in a cursive way. That is the app-domain
   * knowledge `PaletteSpec.classes` exists to refuse.
   *
   * At ASCII, or on a terminal that ignores SGR, an italic run renders as plain
   * text. **No typographic fallback is owed** — it is the same loss `bold` takes
   * and it costs no cells, so nothing measured is wrong.
   */
  italic?: boolean;
  inverse?: boolean;
  underline?: boolean;
}>;

/** The empty style. At 1-bit a surface resolves to this — not to black (I8). */
export const NO_STYLE: Style = Object.freeze({});

/**
 * A theme that has been validated and is safe to resolve against.
 *
 * `name` is part of the memo key (I11), and it changes when overrides are
 * applied so a warm cache cannot serve a pre-override style.
 */
export type ResolvedTheme = Readonly<{
  name: string;
  variant: "dark" | "light";
  tokens: ThemeTokens;
}>;

/** A contrast or structural failure, named rather than counted (I3). */
export type ThemeError = Readonly<{
  path: string;
  message: string;
}>;
