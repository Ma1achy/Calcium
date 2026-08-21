# C10 — Theme resolution

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` (mechanism + a default set) + app (its own tokens) |
| **Layer** | L1 presentation |
| **Depends on** | C04 (`Tone`) · `TerminalCapabilities` injected |
| **Consumed by** | C09 C11 C12 C25 (every renderer) · L4 (`/theme`, config persistence) |
| **Source** | A01 D29, D36, F4 · A01 Appendix A.1 · A02 §2, §6 |
| **Status** | Draft |

---

## 1. Purpose

C10 turns a semantic tone into something a terminal can print. That indirection is what makes theme switching and colour degradation mechanical: `C09` asks for `ok` and gets back a style, and neither the block nor the theme knows what terminal it is on.

It also owns the promise that makes degradation safe. **No information is carried by colour alone** (D29) — so when colour disappears entirely, nothing is lost, because the semantic weight was never in the colour to begin with. C10's job at 1-bit is not to invent ten distinguishable monochrome styles; it is to collapse honestly to three and let the glyph carry the meaning.

---

## 2. Tokens

```typescript
type MonoClass = "emphasised" | "normal" | "deemphasised";

type PaletteSpec = Readonly<{
  slots:      Readonly<Record<string, string>>;   // slot name → 24-bit hex
  carries:    "meaning" | "decoration";
  monochrome: "typographic" | "foreground";       // what 1-bit collapses to
  classes?:   Readonly<Record<string, MonoClass>>; // required iff monochrome === "typographic"
}>;

type ThemeTokens = Readonly<{
  name:     string;
  variant:  "dark" | "light";
  background: "terminal" | "surface";        // §4c — inherit, or paint `surfaces.bg`
  palettes: Readonly<Record<string, PaletteSpec>>;
  surfaces: Readonly<{
    bg: string; bgElev: string; bgDeep: string;
    border: string; borderStrong: string;
    diffAdd: string; diffRemove: string;            // §4a — text-bearing
  }>;
  fourBit:  FourBitMap;                             // the curated table, by reference
}>;

/** slot name → ANSI index, 0–15. Curated per theme (§3), never computed. */
type FourBitMap = Readonly<Record<string, number>>;

type ThemeSet = Readonly<{ dark: ThemeTokens; light: ThemeTokens }>;

type ColourRef = `${string}.${string}`;            // "tone.ok", "syntax.keyword", "spectrum.3"

type ColourValue =
  | Readonly<{ kind: "rgb";     hex: string }>     // depth 24
  | Readonly<{ kind: "ansi256"; index: number }>   // depth 8,  16–255
  | Readonly<{ kind: "ansi16";  index: number }>;  // depth 4,  0–15

type Style = Readonly<{
  colour?:     ColourValue;           // already resolved to the terminal's depth
  background?: ColourValue;           // §4a — the second channel, and the last one
  bold?:       boolean;
  dim?:        boolean;
  inverse?:    boolean;
  underline?:  boolean;
}>;

function resolve(ref: ColourRef, theme: ResolvedTheme, caps: TerminalCapabilities): Style;
function resolveTone(tone: Tone, theme: ResolvedTheme, caps: TerminalCapabilities): Style;
function resolveBackground(ref: ColourRef, theme: ResolvedTheme, caps: TerminalCapabilities): Style;
function resolveBase(theme: ResolvedTheme, caps: TerminalCapabilities): Style;   // §4c
```

**`ColourValue` is tagged rather than a bare string**, and the tag is the point. C10 cannot write an escape (that is `terminal/escapes.ts` alone), so it hands out a description of a colour and something downstream turns it into SGR. A bare `"#7faecf"` or `"12"` makes that consumer re-derive the depth by inspecting the format, and the consumer that guesses wrong emits a truecolour sequence to a 16-colour terminal — precisely what T5.2 exists to catch. Naming the depth in the value means the writer switches on a tag it cannot misread.

**The typographic fallback is declared, not inferred.** A `meaning` palette collapses to typographic classes at 1-bit (I15), and `classes` is where it says which slot lands in which. Inferring it would mean the framework knowing that `ok` is emphatic and `comment` is recessive — the same app-domain knowledge C05's `ArgType` refuses. An app registering its own `meaning` palette declares the mapping, and D29 stays true without the framework learning anyone's nouns.

**A block names a palette slot; it never embeds a value.** That indirection is the whole point — it is what makes theme switching a swap, degradation mechanical, and contrast checkable. Scarcity was never the point, and an earlier draft forbidding all non-tone colour needed an escape hatch on its second real use, which is how you know a rule is wrong.

### The three shipped palettes

| Palette | Carries | Contrast floor | At 1-bit | Consumed by |
|---|---|---|---|---|
| `tone` | meaning | yes | typographic classes (§3) | everything semantic |
| `syntax` | meaning | yes | typographic | `code` and `patch` blocks only |
| `spectrum` | decoration | none | default foreground | declared app art only |

`resolveTone` is a convenience over `resolve` for the `tone` palette, which is the overwhelmingly common case and keeps `tone: "ok"` as the ergonomic form.

**`syntax` exists because ten semantic tones are genuinely thin for highlighting.** Keyword, string, comment, number, key, type, function, operator and punctuation are nine distinct roles, and cramming them into `meta`/`info`/`accent`/`identifier` makes a YAML promote preview and a JSON envelope both worse. Prism renders one or the other on nearly every command.

`syntax.key` covers YAML and JSON keys and HTML attributes — `lowlight` emits these as `hljs-attr`, and none of the other eight fits. A manifest is mostly keys, and mapping them to `type` would be wrong in the one place highlighting matters most.

**`syntax`'s consumer list is closed, and it is two.** It was `code` alone until C25; a patch line needs syntax *inside* a line that already carries an add/remove tone, which makes `patch` the only place in the system where two palettes meet on one line. Widening the list was a deliberate decision, not a discovered permission — and it stays closed at two. **A third consumer is a spec change**, to this table, to I16, to T2.8 and to A03 SS20 together. The friction is the point: `syntax` used casually stops meaning anything, and the four-place change is what makes a third consumer argue for itself.

How a tone and a syntax slot compose on one line is **decided, and it is §4a**: `Style` gains a `background` channel, the line kind takes it, and `syntax` keeps the foreground. C25 §6 records the three options and why the other two are worse; this is where the decision lives, because it is a change to the vocabulary rather than to a renderer.

### Adding a palette

An app may register its own. It declares `carries` and `monochrome`, and the two are constrained together:

- `carries: "meaning"` → the contrast floor applies **and** a typographic fallback is required, so nothing is lost at 1-bit.
- `carries: "decoration"` → exempt from contrast, collapses to the foreground, and **lint forbids its use outside declared art**.

That constraint is what keeps D29 true as the palette count grows: a decorative palette used to distinguish states would carry information in colour alone, and the declaration is what makes that checkable rather than a matter of discipline.

Themes are authored in 24-bit hex regardless of the terminal. Degradation happens at resolution, so a theme file is written once and works everywhere.

### Where the curated 4-bit map lives

I13 forbids an ANSI index in a theme file. §3 requires a curated 4-bit map **per theme**. Both cannot hold of one file, and an earlier draft asserted both without noticing.

They separate cleanly, because they are two different things wearing one word. **`ThemeTokens` is 24-bit hex only** — that is what I13 governs and what A03 SS19 scans. The curated map is a `FourBitMap` in its own module beside it, referenced by name from the token set. A theme is then a pair: the values, authored once and portable, and the mapping of those values onto sixteen slots, which is a decision about *this* terminal depth and belongs in a file that says so.

SS19 is scoped to the directory with the map named as its one exception, not narrowed to the token files:

```
scope: "src/presentation/theme/", allow: ["src/presentation/theme/four-bit.ts"]
```

A `tokens-*.ts` scope stops seeing a new token file the day someone adds one — SS26's failure arriving through a different door. An allow-list of one named exception is auditable; a glob that might not match anything is not.

`theme` remains a required field of `TuiConfig` (A02 §6, hook **2** — hook 3 is command policy) — but `defaultTheme` exists so satisfying it is one line. A framework with no themes at all would make the reference app awkward for no gain; a framework that silently picks one would hide a decision the app should own.

Prism's token sets are in A01 Appendix A.1 — ten tones, nine `syntax` slots and `spectrum`, per variant, with the measured contrast ratio beside each value. The light variant is **Atom One Light**, not Solarized — `j22`'s wording is wrong and Appendix A wins.

**A.1's values were corrected there, not here.** They were authored from the mockup and never validated, and six light tones missed the 4.5 floor with `muted` missing 2.5 on both variants' `bgElev`. The catalogue records what moved and why; this spec records the rule it was moved to satisfy, and T2.4 is what keeps the two agreeing.

---

## 3. The degradation ladder

| Depth | Resolution |
|---|---|
| 24-bit | Hex emitted directly |
| 8-bit | Nearest entry in the 256-colour cube by perceptual distance, with the **rank order of tones preserved** |
| 4-bit | A **curated tone → ANSI mapping per theme**, not computed |
| 1-bit | No colour at all; typographic style only |

**The 4-bit rule is the one that matters.** Computing nearest-of-16 by RGB distance collapses tones onto each other — `dim` and `muted` both land on bright black, `warn` and `accent` both on yellow — and the result is a UI where distinctions silently vanish. Sixteen slots for ten tones needs a human decision, so each theme declares its own mapping and the framework validates that it is injective across the tones that must stay distinct.

At 8-bit, "rank order preserved" means that if `dim` was darker than `default` in 24-bit it remains darker after quantisation. Nearest-neighbour alone can invert a pair, so the resolver assigns luminance **levels** across the whole palette at once, minimising total perceptual distance subject to monotonicity between levels.

### Why that, and not a nearest-neighbour walk

Written down because it reads as over-engineering next to the obvious version, and the obvious version was tried twice. Both failures are here so nobody simplifies it back — **and neither would be caught by a pairwise test.**

**Constrain as you go.** Walk the palette darkest first and refuse any entry darker than the last one assigned. Rank order holds, and it cascades: `meta`'s nearest lilac in the cube sits 0.11 lighter than its token, which raises the floor for its neighbour, which raises it again, and `ok` comes out near-white with `accent` a pale cream. A greedy walk cannot trade a small loss on one slot for a large saving on the next, and that trade is the entire question.

**Exempt near-equal neighbours.** Let two slots whose source luminances are within noise of each other go unconstrained. The cascade stops, and transitivity goes with it: `info` and `identifier` are 0.030 apart — a real ranking — with two near-equal steps between them, so the pair inverts while **every adjacent comparison passes**. A test that walks neighbours cannot see this, which is why the invariant is stated over all pairs and the code is not written as a walk.

Rank order is a property of the whole set, so the set is assigned as one problem. Levels begin where luminance has risen past the noise threshold; within a level the source expresses no order and none is imposed; between levels the order is absolute. Any pair separated by more than the threshold necessarily falls in different levels, which is exactly the invariant I6 states.

**8-bit quantisation targets indices 16–255 only.** The first sixteen are whatever the emulator's own palette says they are — the same numbers a 4-bit theme deliberately curates — so quantising into them would make an 8-bit result depend on a user's terminal configuration while presenting itself as a measured nearest neighbour. 16–231 are the 6×6×6 cube and 232–255 the greyscale ramp, and both are fixed values a distance can honestly be computed against.

A palette is therefore resolved **as a set**, once per `(theme, palette, depth)`, rather than slot by slot: rank order and distinctness are properties of the set, and a per-slot nearest-neighbour cannot see either.

**Surfaces degrade too.** `bg`, `bgElev`, `bgDeep`, `border` and `borderStrong` are not tones, and the ladder applies to them identically: hex at 24-bit, quantised at 8-bit, curated at 4-bit, and **nothing at all at 1-bit** — no background is painted and borders are drawn with box characters alone. A component asking for a surface at 1-bit receives an empty `Style`, not black.

### 1-bit: three classes, not ten

There are not ten legible monochrome styles, and pretending otherwise produces a UI where `meta` and `identifier` differ by an underline nobody notices. Tones collapse to three:

| Class | Tones | Style |
|---|---|---|
| Emphasised | `ok` `warn` `error` `accent` | bold |
| Normal | `default` `info` `meta` `identifier` | none |
| De-emphasised | `dim` `muted` | dim |

This is only safe because of D29. A failed row is not red — it is `✗` *and* red, so at 1-bit it is `✗` and bold, and nothing is lost. **C10 depends on that invariant being upheld by block construction (C04 I5), and its absence would make this collapse lossy.**

---

## 4. Contrast

Every tone is checked **at theme load**, not at render. A theme that fails is rejected with a named error listing the offending tones and the ratios they achieved.

**The algorithm is WCAG 2.1's**, named here because "validated" without a named ratio is unimplementable: relative luminance over linearised sRGB, and the ratio `(L₁ + 0.05) / (L₂ + 0.05)` with the lighter value as `L₁`.

**Every tone is checked against both `bg` and `bgElev`, and must clear its floor on both.** Text lands on both: `bg` is the transcript, `bgElev` is every panel, overlay and confirm. A floor checked against one of the two surfaces text actually lands on is a floor with a gap in exactly the place nobody inspects — you would find it by squinting at a panel, which is not a test. Dark `muted` was the case in point at 2.31 on `bgElev`, and the correction in A01 A.1 is what this rule found.

**`bgDeep` is excluded, and the exclusion is stated rather than left to omission**: it sits behind dim chrome and carries no text. If a surface ever paints text on it, then either that surface is wrong or this exclusion is — and the sentence makes that a decision someone has to take rather than a gap someone discovers.

| Slot group | Minimum ratio |
|---|---|
| `default` `ok` `warn` `info` `accent` `meta` `identifier` | 4.5 : 1 |
| `dim` | 3 : 1 |
| `muted` | 2.5 : 1 — intentionally recessive, but must remain readable |
| every `syntax` slot except `comment` | 4.5 : 1 |
| `syntax.comment` | 3 : 1 — recessive is the requirement, not a compromise on it. A comment that met 4.5 would not be a comment |
| `error` | **2.5 : 1 — and it is the only floor lowered for a reason outside this table.** The slot became a *pair* when the `status` tag needed a ground (§4c), and the two halves pull opposite ways. The trade, the numbers and the alternative are in §4c and I32; it is here so the exception is visible from the table rather than discovered in it |

The measured ratio of every shipped token is recorded in A01 A.1 beside its value, on both surfaces. A ratio with no number behind it cannot be seen to have regressed, and T2.4 recomputes all of them from the tokens the framework actually ships.

Terminal contrast is not a perfect analogue of a browser's — background colours are the emulator's and a user may override them — so these are a floor against obviously broken themes, not an accessibility certification. That distinction is worth stating rather than implying compliance.

**User overrides are validated identically.** An override that makes `error` invisible is rejected, the base theme retained, and a notice committed. Silently accepting it would produce a session where failures cannot be seen — the single worst outcome a theme system can have.

---

## 4a. The background channel, and the floors that follow it

`Style` gains `background?: ColourValue` — the second colour channel and, deliberately, the last one. It is a **requirement** rather than a preference: C25 §2's row anatomy cannot be expressed without it, because on a changed diff line the foreground is spoken for by `syntax` and bold and dim are spoken for by the 1-bit tone collapse (§5). There is no channel left, and the alternatives are recorded in C25 §6.

**Two surfaces, and the second level does not fit.** This section was drafted with four — a line background per kind, and a stronger pair for the precisely changed words within a line, which is what real diff tools use for word-level emphasis. Measuring it against the floors below withdrew the stronger pair, and the numbers are in A01 A.1 beside the two that remain.

| Surface | For |
|---|---|
| `diffAdd` · `diffRemove` | the line background of an added or removed row |

**Why the second level cannot be a background.** The ceiling is set by the two recessive slots. `syntax.comment` takes 3 : 1 and `tone.muted` 2.5 : 1 by design — recessive is their requirement, not a compromise on it — and both already sit close to their floors against `bg`. So a diff background has very little luminance to move in, and the tint that fits is nearly all spent by the *first* level:

| | Plain, shipped | Most tint that still clears | Separation |
|---|---|---|---|
| dark `diffAdd` | `#002600`, tint 38 | `#002c00`, tint 44 | **6 / 255** |
| dark `diffRemove` | `#490000`, tint 73 | `#520000`, tint 82 | **9 / 255** |
| light `diffAdd` | `#d2ffd2`, tint 45 | `#b7ffb7`, tint 72 | 27 / 255 |
| light `diffRemove` | `#fff0f0`, tint 15 | `#ffe9e9`, tint 22 | **7 / 255** |

Three of the four have under ten units of one channel between "this line changed" and "these words changed", which is not a second level; it is the same level twice. And the direction real tools take — lighter on dark, darker on light — is the direction that breaks `comment` and `muted` outright.

**So word-level emphasis is not a background, and the channel that is actually free is `underline`.** `colour` is spoken for by syntax, `background` by the line kind, `bold` and `dim` by the 1-bit tone collapse (§5), and `inverse` would swap the two colour channels and destroy both. `underline` is unclaimed and composes with everything above it.

**And it degrades better than the thing it replaces, which is not a consolation.** A background is a surface and surfaces vanish entirely at 1-bit (I8) — that is why I23 has to insist the diff background is never the only signal. An attribute survives, because attributes are what the 1-bit collapse already uses to carry tone. So the emphasis the measurement forced is the one that still works on a monochrome terminal, and the design it replaced would have lost word-level highlighting there completely.

**Worth stating in that order**, because a later theme with more headroom will look like permission to restore the background: the budget is spent *and* underline degrades better, and the second reason does not expire when the first does. Recorded rather than decided — word-level highlighting is deferred (C25 I10), and this is the constraint whoever builds it inherits.

**The asymmetry between the two hues is real and not an authoring slip.** Luminance weights green at 0.7152 and red at 0.2126, so the same luminance budget buys a dark theme 73 units of red tint and 38 of green, and a light theme 45 units of green and 15 of red. The four values look balanced and their channel arithmetic is not.

**Degradation needs no new principle.** These are surfaces, so they follow §3's ladder and vanish entirely at 1-bit (I8). What makes losing a diff background lossless under D29 is that the `+`/`-` marker and the toned gutter both survive it — the background is the third signal, never the only one (C25 I13).

### The floors extend, and the scope is what is drawn

These are the first **text-bearing** surfaces besides `bg` and `bgElev`, so §4's rule extends to them: everything painted on them must clear its floor against them.

**The background covers the whole row, gutter included**, so the scope is the nine `syntax` slots *and* `tone.ok`, `tone.error`, `tone.muted` — the three the gutter uses. 12 slots × 2 surfaces × 2 variants, and A01 A.1 records each of the 48 measured ratios as it does for `bg` and `bgElev`.

Stated because the naive implementation is wrong in a way no test result would show. Adding these to the list `bg` and `bgElev` are in binds **every** `meaning` slot to them — and against the shipped tokens **that widened check passes**: all seven of the tones that never appear on a diff row clear their floors with room to spare, the tightest being `dim` at 4.74.

So the widening is not caught by anything failing. What it does is bind seven slots to a constraint they do not have to satisfy, so a *later* theme is rejected for a failure nobody can see and the fix will look like weakening the check. That is this section's own `bgDeep` argument in the mirror — do not validate against a surface no text meets, and do not validate a slot against a surface it never lands on. The scope of a floor is where the text goes, and it is asserted on the pairing rather than on its results because the results cannot tell the two apart.

**`bgDeep` stays excluded** for the reason §4 gives — it carries no text — and these four are included for the same reason inverted. That is the exclusion earning its keep: it was written as a decision someone would have to revisit, and this is the revisit.

**It did fail on first authoring, and the strong pair was the tight case exactly as predicted.** Not by a value being wrong — by there being no room for a second one. The plain pair moved to the values above and the strong pair does not exist, which is the check doing what it is for: it prevented a design rather than rejecting a colour.

Recorded because the prediction and the outcome are worth having side by side. The expectation was that a strong background would be too strong for syntax and would have to move; the measurement said something narrower and more useful — that the *first* background spends nearly the whole budget, so there is no second one to place.

---


## 4b. The selection wash — a surface, and the ruling that named the wrong one

**Roadmap entry 23 ruled *selection as a `carries: "meaning"` palette entry, so C10 checks the foreground/background pair against the contrast floor*. The guarantee is right and the mechanism is not.** `resolveBackground` refuses any ref that is not `surface.*` (I21), because a tone painted as a background is a tone nothing measured a floor for in that role — so a palette entry cannot be a wash at all.

That is C23 §8a A4's shape: **an artefact correct about the interaction it found and wrong about a mechanism it assumed existed.** The guarantee it wanted is delivered by the mechanism that does exist, which is §4a's — a foreground slot paired with a background surface, checked at that slot's own floor.

So `surfaces.selection` is a text-bearing surface and `SELECTION_SLOTS` is its pairing. **One slot: `tone.default`.** The prompt's text is `default`; ghost text is `muted` and is drawn *after* the buffer's last cluster, so it is adjacent to a selection and never inside one.

### 4c. The wash a matrix paints, and the one word in I21 that decides it

C12 I29 makes a heatmap cell **a painted background rather than a lit glyph**, which is what
granite does and what makes a matrix read as the continuous field it is. Its own §"Painting the
cell" calls that *wiring rather than machinery*, because `Style` carries a `background`.

**That is wrong, and it is §4b's shape a second time — an artefact correct about the interaction
and wrong about a mechanism it assumed existed.** `resolveBackground` refuses every ref that is
not `surface.*` and returns `NO_STYLE`; a colormap value is not a ref at all. The channel exists
and the door to it is shut.

**The word that decides it is *text*.** I21's reason is that a tone painted as a background is a
tone nothing measured a floor for **in that role** — and a contrast floor is a property of text
*on* a surface. A painted matrix cell carries no text: it is a blank cell whose colour is the
datum. There is no foreground to be illegible against it, so there is no floor to measure, and
the constraint has nothing to constrain.

So I21 gains exactly one further way in, and its shape is the guarantee:

- **`wash(width, colour)` returns a `Span`, not a `Style`.** It builds the text itself — blank,
  of the given width — so a caller *cannot* pair a computed background with a glyph. The rule
  that makes the widening safe is unforgeable rather than remembered, which is the difference
  between this and the convention four gutters each had to honour.
- A `ColourValue` reaching the background channel any other way is still refused. `resolveBackground`
  is unchanged.

**What it does not do is make the pair checkable, and that is the trade stated.** Two adjacent
cells of similar value are told apart by the colormap's own perceptual spacing, not by anything
C10 measures — a floor between two data colours is not a floor this component has ever computed
and would be the wrong instrument if it did. C10 I31 already keeps the continuous path off
terminals below 8-bit, where a colormap is an ordering over indices whose luminance is unknown,
and that is the rung where the density ramp takes over.

**The measured figures, because they are what would tempt a widening.** On the light theme `muted` is 2.14–2.42 : 1 against every candidate wash, under its own 2.5 floor — so pairing it would reject a theme for a failure nobody can see, and the fix would look like weakening the check. §4's argument for excluding `bgDeep`, in the mirror: do not validate a slot against a surface that slot never lands on.

Shipped values, measured against `tone.default`'s 4.5 floor: dark `#264057` at **7.25**, light `#c9ddf5` at **8.18**.

**Reverse video is the 1-bit rung and it is the painter's, not the theme's.** `resolveBackground` answers `NO_STYLE` where there is no colour, so a wash alone would fall from a background straight to nothing. `inverse` needs no colour at all and is supported essentially universally, which is what stops the ladder having a hole in the middle. C22 T4.25 is that rung.

---

## 4c. The theme's own background, walked by hand — roadmap entry 39

The entry is **RULED with no code**, so the walk is where the ruling meets the
tree. It has state *and* structure, so it takes both artefacts: this section is
the **structural** half — a declaration, a surface, a colour depth and an
override all hold at rest, with no event between them — and C22 §6g is the
**event-mediated** half.

**The defect reproduces, and it is narrower than the entry says.** `surfaces.bg`
has exactly two readers, `textSurfaces` and `validatePalette`, both in
`contrast.ts`. Nothing paints it and nothing else reads it, in either variant. So
the floor is not *assumed against a guess* in some loose sense — it is computed
against a colour **that has no consumer at all**, which is the same claim with a
mechanism behind it.

### 4c.1 — the classification table: which rule owns a cell

Indexed by rule interaction. Every row is a cell where two correct statements
overlap; a row governed by one rule would be a restatement of it.

| # | The cell | Rule A | Rule B | Ruling |
|---|---|---|---|---|
| 1 | **`background: <colour>` beside `surfaces.bg`** | the theme declares what it paints | I19 measures every floor against `surfaces.bg` | **R1 — the declaration is a *choice*, not a colour.** `background: "terminal" \| "surface"`, and what `surface` paints is `surfaces.bg`. A colour here is a second source of truth for the one surface every floor is already measured against, so a theme could paint `#ffffff` and prove its floor against `#fafafa` — **this entry's own defect, entered from the other side.** Precedent one entry back: `AskOptions.placement` is a choice between placements rather than a `Placement`, for the same reason |
| 2 | paints × depth 8 | painting makes the floor provable | an 8-bit surface is the nearest **cube** entry, not the token's hex | **R2a — provable against a defined table**, and the recomputation is owed. `resolve.ts` uses indices **16–255 only**, whose RGB the standard fixes, so the painted colour is knowable — but it is not the hex, and a floor computed against the hex is once again a colour nobody paints |
| 3 | paints × depth 4 | as above | a 4-bit surface is a **curated index** (I5), and 0–15 are whatever the emulator's palette says | **R2b — not provable, and painting still fixes the bug.** `surface.bg` is index 15 on light and 0 on dark, so painting puts light's dark foregrounds on the emulator's white: right in every configuration anyone runs, provable in none. **The guarantee drops to best-effort here for a reason that is not the override** |
| 4 | paints × depth 1 | the light theme paints because it cannot work otherwise | surfaces vanish at 1-bit (I8) — **and so do foregrounds** | **R2c — vacuous, and safe.** Nothing is painted and nothing is coloured, so the frame is the terminal's own pair and the bug cannot arise. Named because §4b puts `inverse` in the middle rung and a reader will look for the analogue: **a wash is a region and reverse video separates it from its surroundings; a background *is* the surroundings, and there is nothing for it to contrast against.** There is no rung to want |
| 5 | `--no-bg` × a theme declaring `terminal` | the user overrides the theme | the theme already inherits | **R3 — a no-op, and no notice.** The warning names a consequence and a flag that changed nothing has none; a notice here is the framework talking about itself |
| 6 | `--no-bg` × the floor claim | warn and comply, and state the cost | the floor is provable when painting | **R4 — the statement has four clauses and the override is one of them**, where the entry names it as the whole. Rows 2–4 are the other three, and they are properties of the terminal rather than of anybody's preference. So the honest statement is a **rung table**, not a paint/inherit split |
| 7 | `--no-bg` × `Overrides` | an override is how a value is changed at runtime | `applyOverrides` merges into `tokens`, bumps the serial, re-validates and changes the theme's identity | **R5 — not an override.** Overrides are sticky by construction and this is per invocation. It is session state read at paint, patching no token — which also keeps it out of the theme identity, so **C22 I58's render cache needs no new axis**: the base is applied at row assembly and never enters a cached block's bytes (C22 §6g R9) |
| 8 | painting `bg` × `bgElev` | the screen has one background | `bgElev` is the second text-bearing surface (I19) | **R6 — `bg` alone.** `bgElev` has no painter either; the day it gets one is the day a block draws a panel, and painting the distinction now would draw a depth nothing else expresses |
| 9 | a painted base × **the selection wash** (entry 23) | the wash is a background over its own cells | the base is a background over **every** cell | **R7 — the wash wins for its span and the base resumes after it**, which is a fact about the **reset** and not about the padding (C22 §6g R9). This is the cell the entry's *build them together* note was reaching for, and **it is not where the note pointed** |
| 10 | a painted base × a diff row's own background | §4a paints the whole row, gutter included | the frame squares every row to the region width | **Confirms.** C25 renders at the region width, so there is no pad after a diff row for the base to land in. One line, because this row was written expecting a defect and is worth keeping as the answer |

**Row 1 is the one that would have shipped**, and nothing downstream could catch
it: a theme declaring both a background and a `bg` is internally consistent, every
floor passes, and the screen is painted a colour no floor was measured against.

### 4c.2 — the rulings

- **R1 — `background: "terminal" | "surface"`**, and `surface` paints `surfaces.bg`.
  One colour for the background, and it is the one the floors already use.
- **R2 — provability is a rung table, not a binary.** Provable at 24; provable
  against the 256-cube's defined RGB at 8, which obliges recomputing the floor
  against the quantised value; best-effort at 4, where the index is the
  emulator's; vacuous at 1, where nothing is painted and nothing is coloured.
- **R3 — a no-op override is silent.**
- **R4 — the override is one clause of four, and the only optional one.** The
  statement that ships names all four; the entry names this one as the whole.
- **R5 — `--no-bg` is session state, not an `Overrides` entry**, so the theme's
  identity and every cache keyed on it are untouched.
- **R6 — `bg` alone is painted.** `bgElev` waits for a block that draws one.
- **R7 — the wash composes with the base at the reset**, which is C22's.

### 4c.3 — what the rulings leave behind

- **The light theme's `surface` is a token change and the dark theme's is a
  decision.** Dark keeps `terminal` and keeps your transparency; that is the
  entry's ruling and it means **the shipped default paints nothing**, so every
  test that has ever run has run against the inheriting arm. The painting arm
  ships with one theme exercising it.
- **A theme declaring `paint` with a `bg` that fails no floor can still be
  wrong**, because floors constrain the *pair* and not the absolute. A theme
  whose `bg` is `#000000` on a terminal the user configured white is legible and
  jarring, and nothing here has an opinion about that. Named so it is not
  mistaken for a gap.
- **The foreground's own quantisation is a separate question, and the code is
  where it surfaced.** At 8-bit a tone is a cube entry too, so a complete 8-bit
  floor is quantised-against-quantised — and `validatePaintedFloors` measures the
  authored foreground against the painted background. That is this entry's claim
  exactly: painting is what makes the *background* knowable, and the foreground's
  rung predates it and is unchanged by it. Widening the check here would bind
  every theme to a constraint nothing in this entry measured, which is §4a's
  argument in the mirror. Named so the narrowness reads as a decision.
- **The failing direction only exists for some backgrounds, and the fixture had
  to be searched for.** Against `#fafafa` the nearest cube entry is *lighter*, so
  quantisation only improves contrast and the recomputation cannot fail on the
  shipped light theme. T1.19 searches for a background whose quantised value is
  darker than its token, because a fixture built on the shipped one would have
  asserted nothing while passing.
- **`COLORFGBG` is now read, and the entry's mismatch warning is still not built.**
  It is read by C02, as `backgroundPolarity`, and C22 uses it to *choose which
  theme opens* where the reader has not stated one (C02 I10, C22 I68) — which is
  a different feature from this entry's, and the one that got built. **The
  mismatch warning remains owed**, and the distinction is worth keeping sharp:
  choosing a theme by the terminal's polarity is a decision taken before any
  theme resolves, and warning that *this theme's declared background disagrees
  with your terminal* is a check on a theme already chosen — including one the
  reader chose against the detection, which is exactly the case the warning is
  for and the one the choice cannot reach. Recorded as owed, with its reader now
  in the tree.

---

## 4d. The error tag's pair, and the floor that was lowered to buy it

C09's `status` box paints one thing and one thing only: the word `ERROR`, with a space either
side, white on red. Nothing else in the box is painted — not the border, not the rule, not the
message. **That single painted run is what forced a new surface pair**, and it is the only place
in the theme where a ground and its foreground are authored together:

| Surface | For |
|---|---|
| `errorGround` · `errorInk` | the `status` tag's cells, and only those |

**Two members, minted together, checked together.** `tone.error` could not stand in as the
ground: it is authored as a *foreground for a dark page* and is the wrong brightness to sit
behind text, which is I21's rule — *a tone painted as a background is a tone nothing measured a
floor for in that role* — arriving from the other direction. And a ground shipped without its
matched ink is exactly how a contrast floor goes unmeasured, so neither may land alone.

**The pair is checked at the full 4.5 meaning floor.** A tag that says *this failed* is meaning
rather than decoration, and the place the word actually has to be read is unchanged by anything
below. Shipped: dark **5.62 : 1**, light **7.32**, high-contrast **6.55**.

### The floor on `error` is 2.5, and what that buys and costs

**The ground is `tone.error` itself** — one hex per theme, so text and box are the same red by
construction rather than by two literals being tuned toward each other, which is how they
drifted for five rounds before T2.14e existed. That makes `tone.error` answer to two
constraints at once, and on a dark page they are **incompatible**:

- to be read *on* `bgElev` it has to be light
- to hold **white** text it has to be dark

**Measured over the whole 8-bit cube at step 4 — 262,144 candidates — not over reds:**

| variant | `bgElev` | colours clearing 4.5 on the page **and** holding white at 4.5 |
|---|---|---|
| dark | `#222222` | **0** |
| light | `#f0f0f0` | **81,907** |
| high-contrast | `#121212` | **0** |

So it is not a question of finding a better red. On a dark page **no colour exists** that does
both, and the light theme escapes the conflict entirely because a light page lets a dark colour
be legible — which is why light measures **6.42–7.01** against its surfaces and needs no
exception at all.

**What 2.5 buys**: `#c62828`, which holds white at **5.62 : 1** and is the red a reader
recognises as an error. **What it costs**: the message text under the box measures **2.83 : 1**
against `bgElev` — the binding surface — with `bg` at **3.10**, `diffAdd` at **2.92** and
`diffRemove` at **2.91**. The floor is set at `muted`'s existing 2.5, so the slot is now held to
the standard of *the quietest thing that must still be readable* rather than of body text.

**And the alternative exists, which is why this is a preference honoured rather than a
constraint discovered.** High-contrast takes it: a *light* ground with *dark* ink —
`#3d0000` on `#ff7171`, which is **5.95** on the page and **6.55** in the tag, and needs no
lowered floor. The same shape would work on dark: `#ff7171` measures 5.95 against `#222222`.
What it gives up is the dark red, and a light red tag reads as a warning rather than a failure.

**Recorded in that order deliberately.** Someone meeting `error: 2.5` in `FLOORS` and lightening
the red to "fix" it would be undoing a decision, not repairing an oversight — and the numbers
above are what tell them which.

**The message text is not the only carrier**, which is what makes 2.83 a cost rather than a
defect. The `▲` mark and the painted word `ERROR` both survive it, and both survive 1-bit where
the colour does not (F34's two channels). A floor is a promise about text being readable; this
one is being kept by a quieter promise, in a box whose whole subject is already visible.

---

## 5. Switching

`/theme` switches variant. The change is **atomic**: the store swaps a resolved theme in one assignment, so no frame is ever half-themed.

Switching **does not call C03 directly.** C10 exposes the change; the L4 shell calls `scheduler.invalidate()` afterwards — the same orchestration pattern as `lifecycle.resume()` (A02 §4), keeping L1 unaware of L0-terminal. A repaint is required because every cell's style changes and a diff against the old frame would be meaningless.

Resolution is memoised on `(tone, themeName, colourDepth)`. `resolveTone` is called per styled span and is pure, so the cache is sound and is cleared on switch.

---

## 5a. More than two, walked by hand — roadmap entry 24

**The entry's premise is closed and its text still states it.** *"Two ship and `light` is
dark-on-dark"* was true until I25: `light` declares `background: "surface"` and paints
`surfaces.bg`, and the entry's second *thing to get right* — a theme declaring the background
it assumes — is that invariant. What remains is the additive half, and the type change that
lets it exist.

### 5a.1 — the fork, and it is a measurement rather than a preference

`ThemeSet` is `{ dark: ThemeTokens; light: ThemeTokens }`, so **which theme** is spelled as
**which polarity** — and not only there. The literal pair `"dark" | "light"` is written at
**nine sites**: `ThemeTokens.variant`, `ResolvedTheme.variant`, `setVariant`, `loadTheme`'s
default, `PipelineDeps.persistTheme`, `HandlerDeps.persistTheme`, `/theme`'s declared `enum`
values in `framework.ts`, the persisted-file guard in `construct.ts`, and
`testing/expect-document.ts`. A tenth is in the contrast suite, and §5a.4 is about that one.

**Every reader of `.variant` uses it as a key or as identity, and not one reads it as
polarity.** Five readers, all in `store.ts`: `identity()` builds the memo key, `resolved()`
copies it out, `setVariant` compares it to decide a no-op, and `applyOverrides` uses it twice
to index `tokens`. Outside this component there is no reader in `src/` at all, and none in
either example. Nothing in the ladder, the floors or `resolveBackground` consults it.

So the fork goes to **a named set**, and the check that would have sent it the other way —
*does any of the nine use `variant` for something a name cannot do* — comes back empty.

**The stronger form of the argument, and it is the one that survives a re-measurement.** I25
made the background a declaration, and I26 made the inheriting arm's floor *the declared
assumption* — which is `surfaces.bg`. So a theme's polarity is **derivable from its own
tokens**: `luminance(surfaces.bg)` answers it. `variant` is therefore a second record of a
fact the tokens already carry, and a second record that **nothing checks**: a theme declaring
`variant: "light"` with `bg: "#000000"` loads today, resolves, and passes every floor. I9
compares tones *to* `bg` and has no opinion about what `bg` is.

**That is a field whose meaning was absorbed by something else, and nothing noticed** — the
`bar` class, arriving in a type rather than in a glyph.

### 5a.2 — the classification table: which rule owns a cell

| # | The cell | Rule A | Rule B | Ruling |
|---|---|---|---|---|
| 1 | **`ThemeSet`'s keys beside `ThemeTokens.variant`** | the set is keyed by variant | each theme declares its own variant | **R1 — the key becomes a name.** `ThemeSet` is `Readonly<Record<string, ThemeTokens>>`, and `high-contrast` is a name rather than a third polarity. The keys were the last place polarity was spelled as a key, which is why nine sites repeat the literal |
| 2 | `variant` × `surfaces.bg` | a theme declares its polarity | polarity is `luminance(surfaces.bg)` | **R2 — declared and checked, not derived.** Dropping it loses the one thing a token cannot say: a mid-luminance theme's *intent*, which is what a user picking "the dark one" is asking about. Keeping it unchecked is the state measured above. So `validateTokens` gains the pairing, and a theme whose declaration contradicts its own background is rejected at load with both numbers named |
| 3 | `ResolvedTheme.variant` × the published surface | an app may branch on it | no consumer in this repository reads it | **R3 — it stays published and stays a `"dark" \| "light"`.** The measurement is *no reader here*, which is not *no reader*: this is a published field and an app choosing an image or an ANSI art variant is exactly what it is for. Named so that R1 does not read as permission to delete it |
| 4 | **the `/theme` enum × a manifest built before the config** | `FRAMEWORK_TOOLS` is a module-scope constant with `values: ["dark", "light"]` | the names come from `TuiConfig.theme` | **R4 — the enum is derived where the manifest is assembled, not where it is declared.** This is the cell that makes R1 more than a type change: C05's row is data and the theme names are config, so the two meet at parse time. A static list would make `/theme high-contrast` a validation error for a theme the session holds — the completion and the usage text going wrong in the same breath |
| 5 | a persisted preference × a name the set no longer has | the preference is restored at open | a theme can be removed, and older files hold `dark` | **R5 — the guard validates against the set, and `dark`/`light` keep working because they are names in the shipped set.** The migration is *nothing*, which is the fork's dividend: the two literals stay valid as keys of `defaultTheme`. A name that is not in the set takes the existing repair-at-open path — base theme retained, notice committed (C22 I40's precedent, already built) |
| 6 | two themes of the same polarity | switching invalidates the resolution cache | nothing keys on polarity | **Confirms**, and it is the fork's test: `identity()` is `name/variant#serial` and two dark themes differ in the first component, so the memo is already correct. **The identity string is where a name can now collide** — a theme named `a/b` or one containing `#` produces a key another theme could produce. R6 |
| 7 | an override × a set of N | overrides land on the active variant only, because a value chosen against a dark ground is not a value for a light one | `applyOverrides` indexes `tokens[current.variant]` | **Confirms, and the reason generalises exactly.** An override is per *theme*, and *per variant* was the two-theme spelling of that. Indexing by name is the same statement |
| 8 | `TuiConfig.theme` × the widening | an app supplies its own `ThemeSet` | the field is required (I18) | **R7 — the widening is backward-compatible for consumers**, and that is asserted rather than assumed: an app's `{ dark, light }` still satisfies a record keyed by string. So this is freeze-relevant in the *type*, and not a change any consumer has to make |
| 9 | `--no-bg` × more themes | the flag is per invocation | each theme declares its own background | **Confirms.** The flag reads `deps.theme.current.tokens.background`, which is a per-theme fact already; N themes change nothing about it |

**Row 4 is the one that would have shipped.** The type change is visible in review and the
enum is not: `/theme high-contrast` would fail validation, `/theme <Tab>` would offer two
names out of three, and every existing test would pass, because every existing test asks for
one of the two the literal names.

### 5a.3 — the sequence trace: what a session does across a change of set

| # | Sequence | What happens | What the row is for |
|---|---|---|---|
| 1 | a session opens with a persisted `dark` written by the two-theme version | it resolves, because `dark` is a name in the shipped set | **The migration is nothing, and that is a consequence of R1 rather than a coincidence.** Had the fork gone to a family-plus-polarity shape, every persisted file would have been half a key |
| 2 | a persisted name the set no longer has | base theme retained, notice committed | The path exists and is C20's repair-at-open shape (C22 I40, C22 T1.19b). What changes is the *test*: a literal-pair guard rejects a legitimate name, so the guard moves from a comparison to a membership check |
| 3 | `/theme` naming a theme that is in the config but not in the manifest's enum | validation fails before the handler runs | **The failure R4 exists to prevent**, and it is silent in a different way from most: the session holds the theme, the config named it, and the shell says the verb does not take it |
| 4 | `/theme <name>` where the name is already active | `setVariant` is a no-op and a frame is committed anyway | **Confirms, and it is the row this walk got wrong last time** (C22 §6g.3 row 2). The frame comes from the document `/theme` appends, not from the store's guard. Re-stated rather than re-derived |
| 5 | an override, then a switch, then a switch back | the override is still on the first theme and the second is untouched | Confirms §5a.2 row 7 from the other end: the store keeps *one* patched set, so the override survives a round trip, and it survives it per name rather than per polarity |
| 6 | a theme added whose `variant` contradicts its `bg` | rejected at load, both variants validated | R2's arm. **At load and not at switch**, for §5's own reason: a session that fails the moment someone types `/theme high-contrast` has validated nothing useful |

### 5a.4 — the coverage set the tests wrote for themselves

`test/contract/theme.test.ts` opens with `const VARIANTS = ["dark", "light"] as const` and
loops it for **eleven rows**, including T2.3's 4-bit injectivity and T2.4's floors — the two
the entry names as *already-decided rules every shipped theme passes*.

**It is a literal in the test file rather than the set's own keys**, so a third shipped theme
is checked by nothing and the suite stays green. That is the same defect as a hand-copied
inventory beside a `grep`: **a coverage set derived from the test covers exactly what the test
already knew about.**

**R8 — `VARIANTS` is derived from `defaultTheme`**, the way every other inventory in this tree
is derived, and the row that asserts the count asserts it against the set rather than against
a number.

### 5a.5 — the rulings

- **R1 — `ThemeSet` is a named record**, each theme declaring its own polarity.
- **R2 — `variant` is declared *and* checked** against `luminance(surfaces.bg)`, because it is
  currently a second record of a derivable fact that nothing validates.
- **R3 — `ResolvedTheme.variant` stays published**, on the strength of a measurement that says
  *no reader here* rather than *no reader*.
- **R4 — `/theme`'s `enum` values are derived where the manifest is assembled.**
- **R5 — the persisted guard is a membership test**, and the migration is nothing.
- **R6 — the memo identity is `name/variant#serial` and a name is now arbitrary**, so the
  separators are a collision surface: either the name is constrained or the key stops being a
  string join.
- **R7 — the widening is backward-compatible for consumers**, and a row asserts it.
- **R8 — the contrast suite's coverage set is derived from the theme set.**

### 5a.6 — what the rulings leave behind

- **Which themes to ship is not ruled here.** The entry names three — a high-contrast set, a
  solarised or gruvbox-alike, and a neutral low-saturation one — and each is a token catalogue
  that has to be authored against the floors, which is A01 A.1's work rather than this
  component's. What this walk delivers is a set that can hold them. **`high-contrast` is the
  first, and it is the set's first consumer** (A01 A.1): a third *theme* declaring `dark`, so
  a set keyed by variant could not have held it beside the first.
- **A theme can promise more than the floor and cannot declare it.** `FLOORS` is a module
  constant naming the minimum every theme clears, so `high-contrast`'s 7 : 1 is authored, is
  checked by one test row, and is invisible to `validateTokens` — which will accept a later
  edit dropping any of its slots to 4.5 and report a theme that passes. **A per-theme floor is
  a `ThemeTokens` field and a change to `floorFor`'s signature**, which is mechanism this
  entry did not need and the next theme with a promise will: recorded here so the second
  instance is where it is argued, rather than the first being widened on its own.
- **A theme name is a user-facing string with no rules yet.** R6 names the collision; case,
  spaces and length are unruled, and completion will show whatever is there.
- **The golden gap is filed separately and deliberately** (F163, roadmap 49). No golden test
  touches `shell/paint.ts`: `blocks`, `table`, `patch` and `plot` all go through
  `renderToLines`, so a new theme adds no golden coverage of the painting arm — and neither
  the base, the chrome, the prompt window nor the cursor sequence has ever appeared in one.
  **Not this entry's to fix**, because a golden *frame* category has more consumers than a
  theme.

---

## 6. State machine

| From ↓ / call → | `setVariant` | `applyOverrides` (valid) | `applyOverrides` (invalid) |
|---|---|---|---|
| **loaded** | → loaded, other variant, cache cleared (T1.6) | → loaded, merged, cache cleared (T1.8) | → loaded **unchanged**, errors returned (T3.4) |

There is no sealed state. Themes switch at runtime by design, which is the difference between this registry-like component and C05, C07 and C09.

---

## 7. Invariants

- **I1** — `resolveTone` is pure and total. Every `Tone` × every capability record yields a `Style`, never a throw.
- **I2** — At `colourDepth: 1`, no `Style` carries a `colour` **or a `background`**, and no colour escape is emitted anywhere — for tones or surfaces.
- **I3** — Contrast is validated at load. A failing theme or override is rejected, never partially applied.
- **I4** — An invalid override leaves the current theme exactly as it was.
- **I5** — The 4-bit mapping is declared per theme and injective across tones required to stay distinct.
- **I6** — 8-bit quantisation preserves the lightness rank order of tones, **over every pair** and not merely between neighbours. Two tones separated by more than the noise threshold in 24-bit do not invert at 8-bit.
- **I7** — C10 triggers no repaint itself. It reports a change; L4 invalidates.
- **I8** — Surfaces follow the same degradation ladder as tones, and vanish entirely at 1-bit.
- **I9** — No tone resolves to the variant's own `bg`.
- **I10** — Switching is atomic; no render observes a partially applied theme.
- **I11** — The memo cache is keyed on `(tone, themeName, colourDepth)` and cleared on every switch and override.
- **I12** — C10 reads no environment; capabilities are injected (C02 I5).
- **I13** — `ThemeTokens` is authored in 24-bit hex only; no token file contains an ANSI index or a terminal-specific value. The curated 4-bit map is not token data and lives in its own module (§2), which is SS19's single named exception.
- **I14** — A block names a palette slot and never embeds a colour value.
- **I15** — Every palette declares `carries` and `monochrome`; a `meaning` palette is contrast-validated and declares its typographic fallback as `classes`, one entry per slot, a `decoration` palette does neither and is lint-restricted to declared art.
- **I16** — `syntax` is consumed only by `code` and `patch` blocks; `spectrum` only by declared art. The list is closed at two; a third consumer is a spec change to §3, I16, T2.8 and A03 SS20 together.
- **I17** — Within one palette and one variant, no two slots carry the same 24-bit value, and at 8-bit no two of `{ok, warn, error, info, accent}` resolve to the same index. A slot that renders as another slot bought nothing.
- **I18** — A `defaultTheme` ships and satisfies every contrast floor, so the one required config field is one line to fill. A framework whose only required field has no working value is a framework nobody starts.
- **I19** — Contrast is validated against `bg` and `bgElev`, the two surfaces text lands on, and never against `bgDeep`, which carries none. Validating against a surface no text meets would reject themes for a failure that cannot be seen.
- **I20** — The shipped tokens are A01 Appendix A.1's catalogue, and T2.4 recomputes every ratio from them rather than trusting the recorded figures. The table is an assertion the suite upholds, not a record of intent.
- **I21** — `Style` has exactly two colour channels, `colour` and `background`, and both are `ColourValue` or absent. `background` is set only by `resolveBackground` from a `surface` ref, **or by `wash`, which returns a blank `Span` and never a bare `Style`** (§4c). A palette slot still never resolves into it: a tone painted behind *text* is a tone nothing checked the floor for. `wash` is admitted because it carries no text — the floor is a property of a foreground on a surface, and a painted matrix cell has no foreground. The `Span` return is what makes that unforgeable: there is no way to hand the colour to a glyph.
- **I22** — The two diff surfaces are text-bearing, and every `syntax` slot and every gutter tone (`ok`, `error`, `muted`) clears its floor against both in both variants (§4a) — **those twelve slots and no others**, asserted on the pairing rather than on its results, because a widened pairing passes on the tokens as shipped and only costs something later. There is no third or fourth: §4a measured a stronger pair for word-level emphasis and found under ten units of one channel between it and the plain pair, so word-level emphasis is `underline`'s and not a background's. `bgDeep` remains excluded because it carries no text; the criterion is text, not the word "surface".
- **I23** — A diff background is the third signal and never the only one. At 1-bit it is absent, and the marker and the toned gutter carry the distinction alone (→ C25 I13, → A01 D29).
- **I24** — A resolved colour always names its depth. There is no untagged form: `Style.colour` is absent or a `ColourValue`, never a bare string anywhere in the tree. The tag exists so a writer cannot guess, and a tag that is droppable is a tag that will be dropped.
- **I25** — **A theme's background declaration is a choice and never a colour.** `background: "terminal" | "surface"` — the value names **where the colour comes from**, the terminal or the theme's own surface, rather than naming the act — and what `surface` paints is `surfaces.bg` — the one surface every floor is already measured against (I19). A colour in this field would be a second source of truth for the same thing, so a theme could paint one value and prove its floor against another, which is roadmap 39's own defect arriving from the other side (§4c row 1). `--no-bg` overrides it for one invocation and is **session state, not an `Overrides` entry**: overrides merge into `tokens`, bump the serial and change the theme's identity, and a per-invocation switch that did any of that would be sticky by construction and would put a paint decision into every cache keyed on identity (I11, → C22 I58).
- **I26** — **The contrast floor's provability is a rung of the degradation ladder, not a property of painting.** It is provable at 24-bit; provable at 8-bit against the 256-cube's defined RGB, which obliges computing it against the **quantised** value rather than the token, because the quantised value is what is painted; **best-effort at 4-bit**, where `surface.bg` is a curated index and 0–15 are whatever the emulator's palette says; and **vacuous at 1-bit**, where no background is painted and no foreground is coloured, so the terminal's own pair is what shows and the failure this addresses cannot occur (I8, §4c rows 2–4). `--no-bg` is the **fourth clause** of that statement and the only optional one; the other three are the terminal's. There is no reverse-video rung: §4b's middle rung distinguishes a region from its surroundings, and a background is the surroundings.
- **I27** — **A theme set is keyed by name and a theme declares its own polarity.** `ThemeSet` is `Readonly<Record<string, ThemeTokens>>`; `dark` and `light` are names in the shipped set rather than a closed vocabulary, so `high-contrast` is a third theme and not a third variant. The keys carried polarity only because a two-theme set had nowhere else to put it, and I25 is what took that job — a theme now declares the background it assumes, which is the fact the keys were standing in for (§5a.1). **Nothing reads `variant` as polarity**: its five readers are all in `store.ts`, each a key into the set or part of the memo identity, and no consumer in `src/` reads it at all — which is the measurement the fork rests on rather than the argument for it. **That measurement has since expired, in the direction this sentence predicted**: `construct.ts` reads `variant` to choose the opening theme from the terminal's detected polarity (C22 I68), so there is now one consumer and it is the use the next clause published the field for. The sentence stays true of `store.ts` and stops being true of the tree, which is why it is corrected here rather than deleted — the fork's evidence was the count at the time and not a claim about the future. `ResolvedTheme.variant` stays published, because *no reader here* is not *no reader* and choosing an asset by polarity is what a published field is for. The persisted preference needs no migration, since the two literals remain valid names, and the guard restoring it becomes a membership test against the set (C10 §5a.3 rows 1–2, → C22 I40).
- **I28** — **`variant` is declared and checked against the theme's own background.** It is otherwise a second record of a derivable fact — `luminance(surfaces.bg)` answers the same question — and one nothing validates: a theme declaring `light` over `bg: "#000000"` loads, resolves and clears every floor today, because I9 compares tones *to* `bg` and has no opinion about what `bg` is (§5a.1). It is kept rather than derived because a token cannot express *intent* for a mid-luminance theme, and a user asking for the dark one is asking about intent. **Two consequences follow the name-keying and both are asserted rather than assumed**: `/theme`'s `enum` values are derived where the manifest is assembled and never declared at module scope, or a theme the session holds becomes a validation error the shell reports as a verb that does not take it; and the memo identity `name/variant#serial` is a string join over a now-arbitrary name, so its separators are a collision surface (§5a.2 rows 4 and 6).
- **I29** — **`Tone` has a value, so a theme can be checked against it.** The union is a type and `resolveTheme` runs at run time, so *every tone has a slot* was unassertable — a tone added to C04 without a theme slot resolved to no style and rendered as the default foreground. `TONES` is derived from a `satisfies Record<Tone, true>` for `GLYPH_MEMBERS`'s reason: a `Set<Tone>` type-checks with a member missing, because an element type constrains what may go in and says nothing about what must.
- **I30** — **Every family the framework resolves against is required of a theme, and the check is at resolve time.** `resolve` returns `NO_STYLE` when a palette is missing **and** when a decoration palette collapses at 1-bit, so *this reference does not exist* and *this reference means nothing here* are one value to every caller — a span in the default foreground, legible, plausible and not what the block asked for (FINDINGS F172). No caller can tell them apart and none should have to: **the set of references the framework itself can produce is closed**, so it is checkable once, against the theme, where C10 already refuses a palette whose slots render as one another. **It found one on its first run**: the high-contrast theme declared no `categorical` palette at all, so every multi-series plot drew eight series in one colour on the theme a reader chooses when they most need to tell things apart (F179). **What it does not reach, stated because an unrecorded limit reads as strength**: an app writing a slot that does not exist *within a family that does* is still silent, because `ColourRef` is `` `${string}.${string}` `` and published. What this closes is a family that is not there at all, which is what the first thing written against a new palette hits.
- **I31** — **A continuous colormap is framework data chosen by name, it is a second channel and never the carrier, and below 8-bit it says nothing.** **Not a palette family**, which the plan asked for and the shape refuses: a `PaletteSpec` is a closed set of named rôles a *theme* authors, and a colormap is a function from a normalised value to a colour — viridis is viridis on every theme, so a theme chooses which map and never what is in it. That also means `ColourRef` never reaches one, so F172's *a family that is not there* cannot arise here. **`decoration` rather than `meaning`, measured rather than assumed**: the contrast floor deletes 130 of 256 luminance steps against `#1a1a1a` and they are exactly the low ones, so a map clearing 4.5 : 1 at every step has no low end and is not that map — 4 of 9 sampled viridis stops clear it on the dark theme and 4 on the light, and *which* half fails flips with polarity. The legibility guarantee comes from the other channel instead: density has eight steps at every depth (F34). **Below 8-bit it is vacuous, not coarse**, and that rests on I26 rather than on judgement — at 4-bit `0–15 are whatever the emulator's palette says`, and a sequential map's entire content is an *ordering*, so an ordering over indices whose luminances are unknown is sixteen colours in an arbitrary sequence wearing viridis's name. **So 1-bit is unchanged by construction rather than by a fallback**: colour is already gone one rung above it. **An unknown name is refused at construction**, because a name that paints nothing is indistinguishable from a correct block at one bit.

---

- **I32** — **`errorGround` and `errorInk` are one pair, minted together, checked together at the full meaning floor — and the floor on `error` is 2.5 because the slot now answers to two constraints that a dark page cannot satisfy at once.** The tag is the only painted run in C09's `status` box, and `tone.error` cannot stand in as its ground: it is authored as a foreground for a dark page, which is I21's rule from the other direction. The **ground is `tone.error` itself**, so text and box are one red by construction rather than by two literals kept in step by hand. **Measured over the whole 8-bit cube rather than over reds**: on dark and on high-contrast, **zero of 262,144** colours are both legible on `bgElev` and dark enough to hold white at 4.5; on light, **81,907** are, which is why light clears 4.5 unaided at 6.42–7.01. So 2.5 buys `#c62828` at **5.62 : 1** in the tag and costs the message text **2.83** against `bgElev` — `muted`'s standard, the quietest thing that must still be readable. **The alternative is real and is shipped**: high-contrast takes a light ground with dark ink, `#3d0000` on `#ff7171`, and needs no exception; the same would work on dark and gives up the dark red, which reads as a warning rather than a failure. **So this is a preference honoured, not a constraint discovered** — stated here because someone lightening the red to satisfy `FLOORS` would be undoing a decision rather than repairing an oversight. What keeps it honest is that the text is never the only carrier: the `▲` and the painted word both survive it, and both survive 1-bit where colour does not (§4d, F34).


## 8. Commitments

1. Tones resolve to styles; blocks never see colours (I14, I1).
2. Themes are authored in 24-bit hex and degrade at resolution (I13).
3. The 4-bit mapping is curated per theme, never computed by nearest-RGB (I5).
4. 8-bit quantisation preserves rank order (I6).
5. At 1-bit, ten tones collapse to three typographic classes, and glyphs carry the meaning (I2, I15).
6. Contrast floors are validated at load; failures are rejected with named tones (I3).
7. Overrides are validated identically; an invalid one changes nothing (I4).
8. Switching is atomic; L4 invalidates the frame, C10 does not (I10, I7).
9. Surfaces degrade on the same ladder and are absent at 1-bit (I8).
10. Resolution is memoised and the cache is cleared on any theme change (I11).
11. `defaultTheme` ships so the required `theme` field is one line to satisfy (I18).
12. C10 resolves whatever tokens it is given; the shipped catalogue and the Atom One Light decision are A01 Appendix A's, which is also where a correction to them belongs (→ A01 A.1).
13. Contrast is validated against `bg` and `bgElev` — both surfaces text lands on. `bgDeep` is excluded because it carries none (I19).
14. No two slots of one palette render as one another: distinct in hex, and distinct at 8-bit for the five tones whose confusion would mislead (I17).
15. C10 reads no environment. Capabilities arrive injected, so the same tokens and the same capability record resolve identically on any machine (I12, → C02 I5). Enforced by SS11.
16. The `syntax` and `spectrum` palettes have closed consumer lists — `code` and `patch` for one, declared art for the other. A third consumer is a spec change in four places rather than a permission, because a palette used casually stops carrying what it declares (I16). Enforced by SS20 and SS21; C25 is the one widening, and it went through the spec.
17. A resolved colour always names its depth. There is no untagged form and no bare string, so a 4-bit index and a 24-bit hex can never be confused at a call site that has already forgotten which it asked for (I24). Enforced by SS36.
18. The shipped tokens are the catalogue in A01 A.1, and T2.4 recomputes its ratios rather than trusting them (I20).
19. `Style` has two colour channels and no more. `background` comes only from a `surface` ref through `resolveBackground`, because the floors are measured for surfaces and not for tones in that role (I21).
20. The two diff surfaces are text-bearing, so the §4 floors extend to them — for the twelve slots that land on them and no others, the background covering the whole row (I22). A second, stronger level was specified, measured and withdrawn; the floors left no room for it, and `underline` is what word-level emphasis has instead (§4a). The `bgDeep` exclusion is the criterion doing its job in the other direction.
21. A diff background is a third signal that vanishes at 1-bit, where the marker and the toned gutter carry the distinction alone (I23, → A01 D29).
22. **A theme declares whether it paints, as a choice and not as a colour** — `"terminal" | "surface"`, painting `surfaces.bg` — and the user's `--no-bg` is a per-invocation session flag rather than an override, so no token changes and no cache keyed on theme identity is disturbed (I25, §4c).
23. **What painting buys the contrast floor is stated per rung of the ladder, not per branch of the declaration**: provable at 24, provable against the cube's defined RGB at 8, best-effort at 4, vacuous at 1 — and the override is one clause of four rather than the whole statement (I26, §4c).
24. **A theme set is keyed by name, and polarity is a property of a theme rather than of the set** — which is what I25 freed the keys from, and it is measured on `variant`'s five readers rather than argued (I27, §5a).
25. **`variant` is checked against `luminance(surfaces.bg)`**, and the checks every shipped theme must pass are driven by the set's own keys rather than by a list a test writes for itself (I28, §5a.4).
26. **A theme is refused for a family the framework will ask for and it does not have** — a missing palette and a collapsed one are one value at paint time, so the check is at resolve time, and it found the high-contrast theme drawing every plot series in one colour (I29, I30, F172, F179).
27. **A colormap is framework data, a second channel, and vacuous below 8-bit** — not a palette family, `decoration` because the contrast floor would delete the half of the range a map exists to encode, and nothing at 4-bit because an ordering over unknown luminances is not an ordering (I31, §6).
28. **A ground and its foreground are one thing, and a floor lowered to buy one says what it bought** (I32, §4d). The `status` tag's pair is minted and measured together at the meaning floor, because a ground without its matched ink is how a contrast floor goes unmeasured; the exception on `error` carries its figures, the cube sweep behind them and the alternative it declined, so the next reader can tell a decision from an oversight.

---

## 9. Tests

Six tiers. Every cell of the §6 transition table is covered.

### Tier 1 — unit

- **T1.1** (I1): every `Tone` × every `colourDepth` → a `Style`, no throw. Forty cases.
- **T1.2** (I2): at depth 1, no returned `Style` has `colour`.
- **T1.3**: at depth 1, tones map to the three §3 classes exactly.
- **T1.4**: at depth 24, the returned colour is the token's hex verbatim.
- **T1.5** (I5): at depth 4, the curated mapping is used — asserted against the theme's declared table, not against a computed nearest.
- **T1.6**: `setVariant` swaps the variant and clears the cache.
- **T1.7** (I3): a theme whose `error` fails 4.5:1 → `loadTheme` returns errors naming `error`, no theme produced.
- **T1.8**: a valid override merges and clears the cache.
- **T1.9** (I9): a theme where a tone equals `bg` → rejected at load.
- **T1.10** (I6): rank order holds over **every pair** of tones separated by more than the noise threshold, not over adjacent ones. Asserted as all pairs deliberately: a neighbour-wise assertion passes against a neighbour-wise implementation that inverts `info` and `identifier`, which is the bug §3 records.
- **T1.11**: `muted` at 2.5:1 passes; at 2.0:1 fails.
- **T1.12** (I8): at depth 1, every surface resolves to an empty `Style` — no background is painted.
- **T1.13** (I8): at depth 4, surfaces use the curated mapping, not computed nearest.
- **T1.14** (I21): `resolveBackground` on a `surface` ref returns a `Style` whose `background` is set and whose `colour` is absent; `resolve` on the same ref returns the mirror image. The two functions differ in which channel they fill and in nothing else.
- **T1.15** (I21): `resolveBackground` on a palette ref — `tone.ok`, `syntax.keyword` — returns the empty `Style`. A tone cannot be painted as a background, because no floor was ever measured for it in that role.
- **T1.16** (I2, I23): at depth 1, `resolveBackground` on both diff surfaces returns the empty `Style`. The degradation that makes I23 lossless.
- **T1.17** (I25): a theme declaring `surface` resolves its base to `surface.bg` and to nothing else — asserted by changing `bg` and watching the base follow it. The row that fails the day the declaration carries a colour of its own, which is the only way the two can disagree.
- **T1.18** (I26): the base over all four depths, in one row, because the claim is a ladder and not four claims: the token's hex at 24, a cube index in **16–255** at 8, the theme's own curated index at 4 — asserted against the declared table, not a computed nearest, which is T1.13's argument for this surface — and the empty `Style` at 1.
- **T1.19** (I26): at 8-bit, the floor recomputed against the **quantised** base rather than the token, for every slot `textSurfaces` pairs with `bg`. Asserted as a recomputation and not as a result: against the shipped tokens both numbers clear, so a row comparing outcomes would agree with the wrong one.
- **T1.20** (I28): a theme declaring `light` over a dark `bg` is rejected at load, with both the declaration and the measured luminance in the message. **The state that is legal today**, so the row is a new refusal rather than a restatement.
- **T1.21** (I27): a set of three loads, `names` is every key in declaration order, and switching between two themes of the **same** polarity is a switch — the case a variant-keyed store could not express. An unknown name **throws** and says what the set holds, because a silent no-op reports a change that did not happen.
- **T1.21a** (I27): a set with no `dark` in it opens on its first key, and an empty set is refused. The literal default would be a name this component requires of every app's set; the empty case is the one failure a token check cannot see, because it is about the collection.

### Tier 2 — contract / interface

- **T2.1** (I1): `resolveTone` called a thousand times returns identical styles and performs no I/O.
- **T2.22** (I27): `/theme`'s declared `enum` values equal the theme set's keys, for a set of three. Asserted against the set rather than against a list, because a list here is the defect one layer over (§5a.4).
- **T2.23** (I28, §5a.4): the contrast suite's coverage set is **derived**, asserted on the source. **A value comparison here is vacuous and the mutation pass proved it**: `["dark", "light"]` equals `Object.keys(defaultTheme)` for exactly as long as the shipped set has two members, so the row passed against the defect it was written for and would have begun failing at the moment it was meant to protect. The limit is stated in the row — it reads one file.
- **T2.24** (roadmap 24, A01 A.1): `high-contrast` clears **7 : 1** on every `meaning` slot against both grounds, `muted` is named separately because a passing sweep does not say which slot was in question, and the three greys stay ordered — quieter than `dim`, quieter than `default`. **The only thing standing between the name and a claim**, since the framework holds every theme to the minimum and has no way to be told about a promise.
- **T2.2** (I11): with the cache warm, results are identical to cold results for every key.
- **T2.3** (I5): for every shipped theme, the 4-bit mapping is injective across `{ok, warn, error, info, accent}` — the tones whose confusion would be misleading rather than merely dull.
- **T2.4** (I3): every shipped theme passes every contrast floor, on `bg` **and** `bgElev`, recomputing the ratio from the shipped token rather than reading A01 A.1's recorded figure. A theme cannot ship failing its own rule, and the catalogue is an assertion this test upholds rather than a record of what someone intended.
- **T2.5** (I13): a source scan over `theme/` finds no ANSI index or terminal-specific value, with `four-bit.ts` as the one named exception (A03 SS19) — and the rule is shown to fire against a fabricated violation, not only to pass against the tree.
- **T2.6** (I12): a source scan finds no `process.env` read in `theme/`.
- **T2.7**: every `Tone` in C04's union has an entry in every shipped theme — exhaustive over the type, so adding a tone without tokens fails the build.
- **T2.8** (I16): a source scan finds no `syntax` reference outside `code` and `patch` rendering, and no `spectrum` reference outside declared art.
- **T2.9** (I14): a source scan finds no hex literal in any block-producing module.
- **T2.13** (§2): the `syntax` palette has exactly nine slots — keyword, string, comment, number, key, type, function, operator, punctuation — in every shipped theme. Adding a tenth without tokens fails the build, the same shape as T2.7.
- **T2.14** (§2, I15): every `syntax` slot passes its §4 floor in both variants and against **both surfaces**, `syntax` being a `meaning` palette. `comment` is checked at 3 : 1 with the rest at 4.5.
- **T2.14a** (I22, §4a): every `syntax` slot and each of `tone.ok`, `tone.error`, `tone.muted` passes its floor against both diff surfaces, in both variants — 48 ratios, recomputed from the shipped tokens rather than read from A01 A.1. The same shape as T2.4 and for the same reason.
- **T2.14f** (I32, §4d): **the tag's own check fires, by fabricated violation.** The mutation pass asked for this row — removing the floor comparison from `validateErrorTag` survived every other assertion about the pair, which is a check that cannot fire dressed as one that passes. Two arms: an ink set to its own ground is caught and named by `path`, and a ground that does not resolve produces **no pair** rather than a half-pair measured against a default. The second is how it was first written — reading foregrounds from `tokens.palettes` where this one lives in `surfaces`, and `continue`ing on the miss.
- **T2.14c** (I22, §4a, §4d): `surfaces` has exactly **ten** entries — eight, plus the tag's pair (§4d) — and `diffAddStrong` and `diffRemoveStrong` are not among them. The withdrawn pair asserted absent rather than merely unmentioned: a spec that measured something out and a token file that quietly kept it is the drift this suite exists to stop. **The count is the row's whole subject**, so it moves whenever a surface does and is the reason the pair could not land as one member.
- **T2.14e** (I32, §4d): **the tag's ground *is* `tone.error`, asserted by equality in every theme.** Two hex literals in two files, tuned toward each other by eye, drifted for five rounds and no assertion about either could see it — a red is correct on its own and wrong beside another. Equality is the only form that catches it, and it is what makes *text and box are one red* true by construction rather than by care.
- **T2.14b** (I22): the diff surfaces are checked against **exactly** those twelve slots and no others. Asserted on the pairing itself rather than on its results: widening the check to every `meaning` slot would fail on tones that never land on a diff background, and narrowing it to `syntax` alone would leave the gutter unchecked on the surface it is drawn on.
- **T2.20** (I21): over every ref × every depth, a returned `background` is absent or a `ColourValue` — the T2.18 assertion for the second channel, with the kinds written out literally for the same reason.
- **T2.16** (I17): per palette, per variant, no two slots share a 24-bit value. This is the test that caught `key`/`number` and, less obviously, light `number`/`type` — the second was created by the contrast correction itself, so nothing but recomputation could have found it.
- **T2.18** (I24): over every ref × every depth, a returned `colour` is absent or an object whose `kind` is one of exactly `rgb`, `ansi256`, `ansi16` — never a string. The kinds are compared against a list **written out literally in the test**, the same shape as C05 T1.7c: a list derived from the type agrees with itself and passes on any addition.
- **T2.19** (I24): a source scan finds no string literal assigned to a `colour` field anywhere in `src/` (A03 SS36). Types stop this inside the tree; the scan is what stops it arriving through a cast, which is how a tag gets dropped in practice.
- **T2.17** (I17): at depth 8, `{ok, warn, error, info, accent}` resolve to five distinct values, per variant. I17's 24-bit half and T2.3's 4-bit half both miss this: two tones distinct in hex can quantise onto one 256-colour index, and that failure is invisible in truecolour — which is where every value was authored and every golden will be reviewed. `dim`, `muted` and `default` collapsing at low depth is acceptable and is deliberately not asserted.
- **T2.15** (§3): at depth 1, every `syntax` slot collapses to a typographic class and emits no colour code — including `syntax.key`.

### Tier 3 — edge cases

- **T3.1**: an override naming an unknown tone → ignored, no throw.
- **T3.2**: an override with a malformed hex (`#GGG`, `red`, empty) → rejected with a named error.
- **T3.3**: an override changing `bg` such that previously-valid tones now fail → rejected as a set, not partially applied.
- **T3.4** (I4): after a rejected override, `current` is reference-identical to what it was.
- **T3.5** (I10): a switch during a render → the render completes on one theme; the next frame uses the other. No frame mixes them.
- **T3.6**: switching to the variant already active → no-op, cache retained.
- **T3.7**: a theme with identical `dark` and `light` variants → loads; switching is a visual no-op but does not error.
- **T3.8**: `colourDepth` changing at runtime via a config override → the cache is keyed on depth, so results change without a stale hit.
- **T3.9**: a tone token with an alpha channel (`#rrggbbaa`) → rejected; terminals have no alpha.
- **T3.10**: contrast computed against a `bg` the emulator will actually override → documented as a floor, not a guarantee; the test asserts the check runs, not that the user's terminal complies.

### Tier 4 — integration

- **T4.1** (with C09): the same block in both variants produces identical row counts (colour never changes geometry).
- **T4.2** (with C09, C02): at depth 1, a rendered status row remains distinguishable by glyph alone — the D29 property, tested end to end.
- **T4.3** (with C09): at depth 4, `ok`, `warn` and `error` render as three visibly distinct ANSI colours in every shipped theme.
- **T4.4** (with C03, L4): a theme switch causes **L4** to call `invalidate()`, producing a full repaint. A spy asserts C10 itself never calls the scheduler (I7).
- **T4.5** (with C22, → C22 I40): `/theme light` persists and survives a restart. **The persistence is C22's**, not C10's: this component is a pure function over tokens, and a store reaching a disk from L1 is A03 MG23's neighbourhood. The row lives here because the *behaviour* is a theme behaviour, and it is asserted against two real sessions over one `stateDir` (C22 T1.19).
- **T4.6** (with C22, → C22 I40): a corrupt persisted variant → base theme retained, notice committed, session opens normally. C20's repair-at-open precedent one component up; the notice is the half that stops "absent" and "corrupt" looking the same (C22 T1.19b).
- **T4.35** (I27, with C23): `/theme high-contrast` on a three-theme session switches, and commits no usage notice. **The handler, the enum and the store on one path**, and the mutation pass is why it is not a store-level row: reading the variant against two literals passes every row that asks for one of those two names, which is every row that existed.
- **T4.36** (I27, → C22 I40): a persisted `high-contrast` is restored, and a persisted name the set does not hold leaves the opening theme in place. **The only shape that separates a membership test from a literal pair**, since both names a literal knows are in the shipped set.

### Tier 5 — e2e

- **T5.1**: golden frames for every block kind in both variants at 24-, 8-, 4- and 1-bit — thirty-two frame sets.
- **T5.2**: a real session under `TERM=xterm` (16 colours) → readable, distinct, no truecolour escapes emitted.
- **T5.3**: a real session under `TERM=dumb` → no colour escapes at all, statuses still distinguishable.
- **T5.4**: `/theme` toggled fifty times mid-session → no flicker, no half-themed frame, no memory growth.

### Tier 6 — fail-on-revert

- **T6.1** (I2): emitting a colour at depth 1 → T1.2 and T5.3 fail.
- **T6.2** (I5): replacing the curated 4-bit table with computed nearest-RGB → T2.3 fails on tone collision.
- **T6.81** (I32, §4d): skipping `validateErrorTag`'s floor comparison → T2.14f fails. The pair ships unmeasured, which is where a ground authored without its ink always ends up: both halves look considered and neither was compared to the other.
- **T6.82** (I32, §4d): reading the tag's ground from anywhere but `surfaces` → T2.14f fails, and the pair comes back empty rather than wrong — the failure mode that reads as coverage.
- **T6.83** (I32, §4d): moving `errorGround` off `tone.error` → T2.14e fails. Two hex literals in two files, tuned toward each other by eye, drifted four times in one sitting and no assertion about either colour could see it.
- **T6.3** (I3): validating contrast at render instead of load → T1.7 fails, and a broken theme reaches the screen.
- **T6.4** (I4): applying an override before validating → T3.4 fails.
- **T6.5** (I11): keying the cache on tone alone → T3.8 returns a stale style after a depth change.
- **T6.6** (I10): swapping tokens field-by-field rather than atomically → T3.5 fails.
- **T6.7** (D29): collapsing 1-bit tones to fewer than three classes, or relying on colour for a status → T4.2 fails.
- **T6.8** (I6): dropping the rank-order correction → T1.10 fails.
- **T6.9** (I13): putting an ANSI index in a theme file → T2.5 fails.
- **T6.10** (I7): C10 calling the scheduler directly → T4.4's spy fails, and L1 gains a dependency on L0-terminal.
- **T6.11** (I8): painting a background at 1-bit → T1.12 fails.
- **T6.12** (§4): validating against `bg` alone → T2.4 fails on `muted`, which measured 2.31 on `bgElev` before the correction. The revert is invisible in the transcript and shows up only inside a panel.
- **T6.13** (I17): giving two slots the same value — the state `key` and `number` shipped in, and the state light `number` and `type` fell into when both were corrected to the floor → T2.16 fails, naming the pair.
- **T6.14** (I17): dropping the 8-bit distinctness check → T2.17 fails. Nothing in a truecolour terminal would have shown it.
- **T6.15** (I6): rewriting the 8-bit assignment as a neighbour-wise walk → T1.10 fails on `info` and `identifier`, **while every adjacent comparison still passes**. This is the revert that looks like a simplification, and §3 records both attempts that produced it.
- **T6.16** (I24): making `Style.colour` a bare string, or adding an untagged form beside the union → T2.18 fails, and the writer downstream is back to guessing the depth from the format.
- **T6.17** (I22): adding the diff surfaces to the list `bg` and `bgElev` are in, instead of pairing them with the twelve slots that land on them → T2.14b fails. **And nothing else does**, which is the point of the test: the widened check *passes* on the shipped tokens, all seven of the never-on-a-diff-row tones clearing with room to spare and `dim` tightest at 4.74. So the revert is invisible in results and visible only in the pairing, and what it costs is a later theme rejected for a failure nobody can see.
- **T6.18** (I22): checking the diff surfaces against `syntax` alone → T2.14b fails, and the gutter is unchecked on the surface it is drawn on.
- **T6.19** (I21): letting `resolveBackground` accept a palette ref → T1.15 fails, and a tone is painted as a background with no floor measured for it.
- **T6.20** (I2, I23): emitting a diff background at depth 1 → T1.16 fails, and the one signal a monochrome terminal cannot show becomes the one carrying the meaning.
- **T6.21** (I25): widening the declaration to `"terminal" | <colour>` and painting that colour → T1.17 fails. **The revert every reader will propose**, because a colour reads as more expressive than a choice; what it buys is a theme that paints one value and proves its floor against another.
- **T6.22** (I26): computing the 8-bit floor against the token's hex rather than against the quantised base → T1.19 fails. **Nothing else does**: both numbers clear on the shipped tokens, so this is invisible in results and visible only in which value the check was handed — I22's shape, one surface along.
- **T6.23** (I25): applying `--no-bg` through `applyOverrides` → T1.17's identity assertion fails, the theme's serial moves, and a per-invocation flag becomes sticky in every cache keyed on identity.
- **T6.24** (I27): declaring `/theme`'s `enum` values at module scope again → T2.22 fails, and a theme the session holds becomes a validation error. **The revert review cannot see**: the type change is visible in a diff and the enum is not, and every existing test asks for one of the two names a literal already has.
- **T6.25** (I28): dropping the `variant`-against-`bg` pairing → T1.20 passes on a theme that lies about itself, and the field goes back to being a second record nothing checks.
- **T6.26** (I28, §5a.4): restoring `VARIANTS` as a literal in the contrast suite → T2.23 fails. **Nothing else does**, which is the point: a third theme ships unchecked and eleven rows stay green.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| Which tone a block uses | C04 construction, C09 rendering |
| Glyph substitution under ASCII | C09 |
| Detecting colour depth | C02 |
| Persisting the chosen variant | L4, via app config |
| Prism's specific token values | `prism-tui`, seeded from A01 Appendix A.1 |
| Additional themes beyond the shipped pair | Phase 1B |
