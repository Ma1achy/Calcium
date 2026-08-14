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
| `default` `ok` `warn` `error` `info` `accent` `meta` `identifier` | 4.5 : 1 |
| `dim` | 3 : 1 |
| `muted` | 2.5 : 1 — intentionally recessive, but must remain readable |
| every `syntax` slot except `comment` | 4.5 : 1 |
| `syntax.comment` | 3 : 1 — recessive is the requirement, not a compromise on it. A comment that met 4.5 would not be a comment |

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
- **`COLORFGBG` is not read, and the entry's mismatch warning is not built.** The
  entry offers it as something the declaration *enables*; it is a second feature
  with its own reader, and folding it in would make this entry's scope the
  variable one. Recorded as owed, not as done.

---

## 5. Switching

`/theme` switches variant. The change is **atomic**: the store swaps a resolved theme in one assignment, so no frame is ever half-themed.

Switching **does not call C03 directly.** C10 exposes the change; the L4 shell calls `scheduler.invalidate()` afterwards — the same orchestration pattern as `lifecycle.resume()` (A02 §4), keeping L1 unaware of L0-terminal. A repaint is required because every cell's style changes and a diff against the old frame would be meaningless.

Resolution is memoised on `(tone, themeName, colourDepth)`. `resolveTone` is called per styled span and is pure, so the cache is sound and is cleared on switch.

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
- **I21** — `Style` has exactly two colour channels, `colour` and `background`, and both are `ColourValue` or absent. `background` is set only by `resolveBackground`, and only from a `surface` ref — a palette slot never resolves into it, because a tone painted as a background is a tone nothing checked the floor for.
- **I22** — The two diff surfaces are text-bearing, and every `syntax` slot and every gutter tone (`ok`, `error`, `muted`) clears its floor against both in both variants (§4a) — **those twelve slots and no others**, asserted on the pairing rather than on its results, because a widened pairing passes on the tokens as shipped and only costs something later. There is no third or fourth: §4a measured a stronger pair for word-level emphasis and found under ten units of one channel between it and the plain pair, so word-level emphasis is `underline`'s and not a background's. `bgDeep` remains excluded because it carries no text; the criterion is text, not the word "surface".
- **I23** — A diff background is the third signal and never the only one. At 1-bit it is absent, and the marker and the toned gutter carry the distinction alone (→ C25 I13, → A01 D29).
- **I24** — A resolved colour always names its depth. There is no untagged form: `Style.colour` is absent or a `ColourValue`, never a bare string anywhere in the tree. The tag exists so a writer cannot guess, and a tag that is droppable is a tag that will be dropped.
- **I25** — **A theme's background declaration is a choice and never a colour.** `background: "terminal" | "surface"` — the value names **where the colour comes from**, the terminal or the theme's own surface, rather than naming the act — and what `surface` paints is `surfaces.bg` — the one surface every floor is already measured against (I19). A colour in this field would be a second source of truth for the same thing, so a theme could paint one value and prove its floor against another, which is roadmap 39's own defect arriving from the other side (§4c row 1). `--no-bg` overrides it for one invocation and is **session state, not an `Overrides` entry**: overrides merge into `tokens`, bump the serial and change the theme's identity, and a per-invocation switch that did any of that would be sticky by construction and would put a paint decision into every cache keyed on identity (I11, → C22 I58).
- **I26** — **The contrast floor's provability is a rung of the degradation ladder, not a property of painting.** It is provable at 24-bit; provable at 8-bit against the 256-cube's defined RGB, which obliges computing it against the **quantised** value rather than the token, because the quantised value is what is painted; **best-effort at 4-bit**, where `surface.bg` is a curated index and 0–15 are whatever the emulator's palette says; and **vacuous at 1-bit**, where no background is painted and no foreground is coloured, so the terminal's own pair is what shows and the failure this addresses cannot occur (I8, §4c rows 2–4). `--no-bg` is the **fourth clause** of that statement and the only optional one; the other three are the terminal's. There is no reverse-video rung: §4b's middle rung distinguishes a region from its surroundings, and a background is the surroundings.

---

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

### Tier 2 — contract / interface

- **T2.1** (I1): `resolveTone` called a thousand times returns identical styles and performs no I/O.
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
- **T2.14c** (I22, §4a): `surfaces` has exactly seven entries, and `diffAddStrong` and `diffRemoveStrong` are not among them. The withdrawn pair asserted absent rather than merely unmentioned — a spec that measured something out and a token file that quietly kept it is the drift this suite exists to stop.
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

### Tier 5 — e2e

- **T5.1**: golden frames for every block kind in both variants at 24-, 8-, 4- and 1-bit — thirty-two frame sets.
- **T5.2**: a real session under `TERM=xterm` (16 colours) → readable, distinct, no truecolour escapes emitted.
- **T5.3**: a real session under `TERM=dumb` → no colour escapes at all, statuses still distinguishable.
- **T5.4**: `/theme` toggled fifty times mid-session → no flicker, no half-themed frame, no memory growth.

### Tier 6 — fail-on-revert

- **T6.1** (I2): emitting a colour at depth 1 → T1.2 and T5.3 fail.
- **T6.2** (I5): replacing the curated 4-bit table with computed nearest-RGB → T2.3 fails on tone collision.
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
