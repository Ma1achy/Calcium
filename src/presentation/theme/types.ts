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
   * The ground a focused region takes (R-STA-002, R-THM-004).
   *
   * **A text surface, and named here because it is one.** A focused region washes
   * its whole extent — head and body — so every meaning ink lands on it, which
   * puts it in `textSurfaces` and under every floor. It was absent from both for
   * as long as it was read through an index, and that is the shape the floor-scope
   * rule is about: seven inks short across two themes and sixteen of nineteen in
   * each high-contrast theme, with nothing to report it.
   *
   * **Optional, and absent means *this theme paints no focus ground***, not that
   * none was considered — focus still carries, on its mark, which is the carrier
   * that survives to one bit anyway. All ten shipped themes declare one.
   */
  focusGround?: string;
  /**
   * A meter's fill — the ground a painted bar's `on` cells take (§034, C09 I96).
   *
   * **Named here because a renderer reads it now.** Every one of the ten themes
   * has carried the slot since the registry was ported and this type declared
   * eleven of the twenty-four the projection assigns, so the value shipped,
   * quantised and contrast-checked with **no reader and no declaration** — its
   * only occurrences in `src/` were the generated keys of the quantised table.
   * §034's *the same, painted rather than drawn in glyphs* is the reader.
   *
   * **Optional, and absent means this theme's bars are drawn rather than
   * painted** — the same shape as `focusGround`, and for the same reason: the
   * glyphs are the lower rung, so a theme that omits it loses nothing a reader
   * needs. C09 I96's predicate is the ground resolving, which covers a missing
   * slot and a 1-bit terminal with one question.
   */
  meterFill?: string;
  /**
   * **The chosen affordance's ground and its matched ink — one pair, checked
   * together** (§073, C10 I51 · C09 I102).
   *
   * A focused button takes these rather than `focusGround`: the design gives the
   * chooser's pair to a *choice about to be taken*, which is why `pickInk`
   * exists as a ground-specific ink at all. It has no slot it could borrow —
   * the registry authors it `#000000` on a light ground in some themes and
   * `#ffffff` on a dark one in others, a value chosen **for** the ground and
   * meaningless away from it.
   *
   * **Declared here because both have shipped undeclared since the port.** The
   * registry assigns `bg-pick` and `c-pickInk` in all ten themes and
   * `from-registry.mjs` collects every `.bg-` slot and every `.c-*Ink`
   * generically, so the values reached `tokens.generated.ts` with this type
   * naming neither and no renderer able to read them. `focusGround` and
   * `meterFill` were each found the same way; I51 states the shape rather than
   * fixing a third in silence.
   *
   * **Optional, and absent means this theme paints no chosen ground** — the
   * button then takes its bracket rung, which is the carrier that survives one
   * bit anyway. All ten shipped themes declare both.
   */
  pick?: string;
  pickInk?: string;
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
  /**
   * **The error tag's ground and its matched ink — one pair, checked together**
   * (C10 §4d, I21, I32 · C09 §3a).
   *
   * The only painted run in a `status` box: the word `ERROR` and its two spaces,
   * sitting in a gap in the rule. Everything else in that figure — the rule, the
   * mark, the message, the border, the blanks — is unpainted and carries the
   * error tone.
   *
   * **Two members rather than a ground beside the existing foreground**, and
   * I21's own sentence is why: *a tone painted as a background is a tone nothing
   * measured a floor for.* The inverse holds too — a ground with no ink of its
   * own borrows one nobody measured against it, which is how a contrast floor
   * gets missed. So they arrive together and `errorTagPairs` checks them
   * together, at the meaning floor, because a tag that says *this failed*
   * carries meaning rather than decoration.
   *
   * **The ground *is* `tone.error`**, asserted by equality per theme (T2.14e), so
   * the tag and the message under it are one red by construction rather than by
   * two literals being kept in step by hand. That is what made the slot a pair
   * and what lowered its floor to 2.5; the trade, the cube sweep behind it and
   * the alternative it declined are C10 §4d's, not repeated here.
   *
   * **The ink is not always white, and high contrast is the case that shows
   * why.** Dark takes `#ffffff` on `#c62828` at **5.62 : 1** and light
   * `#ffffff` on `#a81f12` at **7.32**; high contrast inverts — `#3d0000` on
   * `#ff7171` at **6.55** — because its error tone is a *light* red and white on
   * it would be 2.67. A pair per theme is what lets that be a choice rather than
   * a failure.
   */
  errorGround: string;
  errorInk: string;
}>;

/**
 * One agent hue, in the three tiers the design draws it at (C10 I53, §070).
 *
 * **Three values and not one, because they are three jobs.** `ink` is the hue as
 * text — an agent's name in the strip; `ground` is the hue as a band; and `on` is
 * whichever of black or white reads **on** that band, which is a property of the
 * band and not of the hue. A single colour per hue cannot express the third, and
 * a band whose ink is guessed is the failure R-THM-003 exists to prevent.
 *
 * **Per theme, all three.** Measured over the registry's 300 tokens: `ground`
 * takes nine distinct values across the ten themes, `on` is black in some and
 * white in others, and even `ink` moves — `#3b82f6` in eight themes against
 * `#4e8ef6` in `light` and `#4e8df5` in `paper`, where a mid blue needs lifting
 * off a light ground. The generator that collected these called them
 * theme-independent and keyed them by hue name alone.
 */
export type Hue = Readonly<{
  /** The hue as text. */
  ink: string;
  /** The hue as a band. */
  ground: string;
  /** The ink that reads on that band (`R-THM-003`). */
  on: string;
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
  /**
   * The ten agent hues, by name (C10 I53, §070, §093).
   *
   * **Not a palette**, which is an indexed cycle a reader walks; this is a
   * lookup — `/colour` resolves the name a reader typed. §093 orders them
   * *blue orange cyan pink lime violet yellow green red purple*, by perceptual
   * separation rather than spectrally, because the first assignment was *five
   * identities a deuteranope cannot separate*.
   *
   * **Optional so the three hand-written lenders need not carry it**, and every
   * generated theme does; T2.53 compares all ten against the registry by
   * equality in both directions, which is what an optional member needs in
   * place of the type system.
   */
  hues?: Readonly<Record<string, Hue>>;
  surfaces: Surfaces;
  fourBit: FourBitMap;

  /**
   * **Ink composed with the ground it lands on** — `surface.<name>` to
   * `<palette>.<slot>` to the hex that pairing takes, overriding the flat slot
   * (R-THM-001, *"including composed ink-on-surface values"*).
   *
   * **A flat tone cannot clear every ground, and measuring it against one it is
   * never drawn on is measuring a pair the design does not compose.** `nord` is
   * the case: its `info` is 4.64 : 1 against `bg` and 3.74 : 1 against `bgElev`,
   * and the registry supplies `#95b5d5` for exactly that pairing, which measures
   * 4.72. Four of its tones work this way, and 71 such pairings ship across nine
   * themes. Without this the choice is a theme below its floor or a tone dulled
   * on the ground where it was already fine.
   *
   * Optional, and absent means *no pairing differs* rather than *none was
   * considered* — a theme whose flat slots clear every ground needs no entry.
   */
  composed?: Readonly<Record<string, Readonly<Record<string, string>>>>;

  /**
   * **The ratio this theme promises, when it promises more than the common
   * floor** (R-THM-002).
   *
   * `FLOORS` names the minimum *every* theme must clear, so before this field a
   * theme that promised more had no way to declare it and no way to be held to
   * it — which left `high-contrast` as a name and one contract row as the only
   * thing standing between that name and nothing. The promise is the theme's, so
   * this is where it goes: `hcDark` and `hcLight` declare `7`, every meaning ink
   * of theirs is checked against every surface they paint text on at that
   * number, and the check runs on the same path as every other floor.
   *
   * It raises floors and never lowers them. A value below a slot's own floor
   * would be a theme promising less than the framework's minimum, which is not a
   * promise, and `validateHighContrast` takes the greater of the two.
   *
   * Optional, and absent means *this theme promises the common floor* — which is
   * what nine of the ten shipped themes do.
   */
  floor?: number;

  /**
   * A band's one ink (R-THM-003): `<surface>` -> the ink everything drawn on that
   * surface takes, whatever slot it names.
   *
   * **Total, where `composed` is enumerated**, and that difference is the whole
   * reason this is a field rather than nineteen more entries in `composed`. A
   * high-contrast theme promises a ratio on every surface it paints; composing
   * ink by ink keeps the promise only for the slots somebody listed, and the
   * measured failure was exactly that — `hcDark`'s selection carried a group of
   * nine where the theme has nineteen meaning slots, and the ten it omitted fell
   * through to flat inks below the promise with nothing to report it. A band ink
   * cannot have that defect, because there is no list to be missing from.
   *
   * It costs the row its tone, paid for by moving state onto the glyph and the
   * outcome word — the one-bit rung's carrier, asked per cell.
   *
   * **Keyed by SURFACE name**, and the type says so rather than the prose alone
   * (C10 I45): a band is a ground that something is drawn on, so its name is
   * that ground's name and `validateBands` finds the ground by looking it up.
   * The first implementation found it by exclusion instead — *`focusGround` if
   * the name is `focusGround`, otherwise `selection`* — which is right for the
   * two entries that exist and silently wrong for a third. Naming the key type
   * here is what stops a band being invented that no ground answers to.
   *
   * **Left as an open record rather than keyed by `SurfaceName`, and measured.**
   * Narrowing the key type was tried: `surfaces` is a closed record, so every
   * reader that holds a band name as a `string` — `inkOn`'s public parameter,
   * and `Object.entries` inside `validateBands` — then needs a cast, and the
   * rule ends up stated in three casts instead of one. It is stated here and in
   * `validateBands`, and T2.55 is what enforces it.
   */
  bandInk?: Readonly<Record<string, string>>;
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
 *
 * **Declared in C04 and re-exported here** (F846). It was C10's until a
 * `terminal` block needed to carry a child's literal colour: C04 is L0 and
 * cannot import a presentation type, so the vocabulary moved down to the layer
 * that owns the document and every consumer kept its import. The same homing as
 * `refOf`'s (§4h), for the same reason — the type is needed below the component
 * that first declared it, and a duplicate of an identical shape is the
 * reimplemented-rule hazard rather than a second opinion.
 */
import type { ColourValue } from "../../data/viewmodel/types.js";

export type { ColourValue };

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
  /**
   * The theme this one recedes, when it is `recede`'s (I59, §047). Every ref
   * but a surface resolves as `tone.dim` resolves in it.
   */
  recedes?: ResolvedTheme;
}>;

/** A contrast or structural failure, named rather than counted (I3). */
export type ThemeError = Readonly<{
  path: string;
  message: string;
}>;
