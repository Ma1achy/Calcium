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

**Surfaces degrade too — every slot in `Surfaces`, and this sentence used to name five.** They are not tones, and the ladder applies to them identically: hex at 24-bit, quantised at 8-bit, curated at 4-bit, and **nothing at all at 1-bit** — no background is painted and borders are drawn with box characters alone. A component asking for a surface at 1-bit receives an empty `Style`, not black.

**It enumerated because there were five, and there are ten** (F240). `bg`, `bgElev`, `bgDeep`, `border` and `borderStrong` were the whole set when this was written; `diffAdd`, `diffRemove`, `selection`, `errorGround` and `errorInk` landed after it, two were given 4-bit indices by whoever added them and three were not. **A list is satisfied by the members it names**, so the sentence stayed true while three slots acquired no answer at that rung — and `FourBitMap` is `Readonly<Record<string, number>>`, partial over an open key, so **an unanswered slot and a deliberately unpainted one resolve identically** and nothing could be asked. The quantified reading is the intended one and is what §4d's pair is checked against; `selection`'s arm is owed on its own terms and is a different question, because a wash sits behind text it does not own where a tag brings its own ink.

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

**The conditional has fired, and the answer was *the surface is wrong*** (§4f, F632). The SVG plot arm painted its page in `bgDeep` and wrote every axis label, legend row, callout, notice and node label onto it, for long enough that C12 §3ap.7 filed a note owed to this section and nothing here moved. The page is `surfaces.bg` now, so the exclusion is true again by the route it names — a surface that carries text is not `bgDeep`.

**And the same conditional exists on the other axis, where it has also fired.** A floor is a pairing of an ink with a ground, and this section's table is written over the `meaning` palettes because those are the inks it knew about. A `decoration` palette is exempt from it — from the check over *every* surface, which is not the same as an exemption from every floor, and the difference was invisible for as long as no decoration slot was text. `categorical` is text at ten sites in both plot arms. §4g is that ruling and I35 the pairing it adds; the shape is §4a's, §4b's and §4d's — a named pairing rather than a wider list.

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

### 4c.1. The picture cell — and *text* was the wrong word

**I21's fourth admitted case was written by analogy to `wash` and the analogy does not hold.** §4c
above says the word that decides the widening is *text*, and §4g.4 leaves the picture cell owed on
exactly that word: *a cell that carries no text*, with the remedy stated as a `wash`-shaped helper
returning a blank `Span` so the rule is unforgeable rather than remembered.

**Measured, every premise of that remedy is false.** The two sites are `sankey.ts` and
`scatter3.ts`, and they are the only two constructions in `src/presentation/plot/` and
`src/presentation/image/` that set a `background` at all:

| what the owed entry said | what the tree does |
|---|---|
| the cell carries no text | **both cells always carry a glyph**, and it is load-bearing. Read off the 24-bit goldens: every background-bearing sankey cell is `▀` U+2580 (28 across the shipped set) and `sankey.ts`'s own header says the glyph "carries bar against ribbon at every depth (I17)" — it is the 1-bit carrier, the half that survives when colour does not. `plot3d`'s are `▀▁▂▃▅▆▇▌` and the braille block. A blank `Span` erases the drawing |
| both reach it through `slot(...).colour` | **neither does.** `sankey.ts` names `ColourRef`s (`cell()`, line 506) and resolves nothing; the `slot()` call is in `definition.ts`'s `sankeyRows`. `scatter3.ts` holds resolved `ColourValue`s by the time a cell is built — under the default `colourBy: "depth"` they come from a colormap, which is §4e's case already, and only under `colourBy: "series"` is the background a palette slot |
| a `pictureCell(ref)` mirroring `wash` | fits neither site: one has refs and no resolver, the other has no refs. And it cannot live in `src/presentation/theme/**`, because `Span`, `slot` and `wash` are all in `blocks/paint.ts`, which imports `../theme/index.js` — a `Span`-returning helper in `theme/` is the cycle MG1 and MG22 refuse |

**So the reason is rewritten rather than the wording tightened, and the new reason is stronger.**
A floor is a property of *ink on a ground* — one colour in front, one behind, and a reader
recovering a character out of an open set. In these cells there is no front and no behind: the
glyph is a **fill from a closed alphabet** — block elements and braille — whose *shape* is the
geometry, and the two colours are two **regions of one cell** lying side by side. Nothing is
occluding anything, so there is no pair to measure. That reason survives the glyph being
non-blank, which *carries no text* never could.

**And it is checkable, which *carries no text* was not.** The admission is a property of the
glyph, so `isPictureGlyph` is the keeper: `U+0020`, the Block Elements `U+2580`–`U+259F`, and
Braille Patterns `U+2800`–`U+28FF`. Both constructors refuse a background on anything else.

- **The brand is required on the background channel, not on the alphabet**, and that is the ruling
  rather than a convenience. `sankey.ts`'s ASCII arm draws `#`, `=` and `-`, none of them fills —
  and `cellOf` never passes a lower owner on that arm, so no ASCII cell ever carries a background.
  A brand over the alphabet would have had to admit `-`; a brand over the channel admits nothing.
- **It refuses by throwing, and what the throw leaves behind is nothing.** Both `sankeyArea` and
  `mixedRows` are pure builders over local arrays; the abandoned row is discarded with the call.
  No input the tree produces can reach it — that is what the golden read measures — so it is an
  assertion about the programmer and not a path a user takes.
- **It is a runtime keeper and not a type**, and the difference is stated because the owed entry
  promised a type. `QUADRANTS` and `foldBraille` live in `linedraw.ts` and `raster.ts`, so
  branding the glyph at its source would mean editing two files this ruling does not own; and
  `SankeyCell` is one type serving **two** kinds of cell — label cells (`{ text: ch }`, real text,
  no ref) and picture cells — so it cannot forbid text, half its inhabitants being text. The
  expressible guarantee there is a discriminated union, and `definition.ts` reads `.text`, `.ref`
  and `.background` off it. Owed, with the file named, in §4g.4.

**What the frame says that no arithmetic could.** In `plot3d-colour-series` at 24-bit, seventeen
cells carry `▀` with **fg and bg the same categorical slot** — `#3cbf9a` on `#3cbf9a`. The 1.00
figure repeated in §4f, §4g.2, I35 and §4g.4 is a claim about the *palette* (the worst pair within
`categorical`); the shipped frame's 1.00 is a different object and is **correct** — two adjacent
half-cells of one surface are one region, and a solid block is what should be drawn. A hazard read
off the palette and an intended reading in the frame print the same number.

**And one pair no document names.** The same frame draws braille outlines in `tone.muted` over a
`categorical` or colormap background — `#626262` on `#3cbf9a`. That is a **text tone as ink on a
picture background**, so it is neither `categorical × categorical` nor a foreground on a surface,
and both §4f's sweep and §4g.2's table miss it: the sweep is indexed by *text sites* and a
wireframe is not one. It is left as a reading question for C12 rather than a floor here — a cage
drawn over a shaded face is judged by whether the cage reads, and `ratio` answers a question about
recovering a character.

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
## 4e. Span attributes — set from the span, never from a slot, and lost rather than compensated where a depth cannot show them; and a span touches colour only through a named slot or the block's colormap

C04 §3am gives four text members a `spans?: readonly TextSpan[]`, and a span carries three
attributes — `bold`, `italic`, `underline` — and, since §3am.1 (2026-09-04), two members that
*name* colour without *carrying* one: `tone`, a palette slot, and `value`, a reading through the
block's `colormap`. This section is the ruling on how the attributes meet a `Style` this component
produced, and it extends the rule already written beside `Style.italic` (`theme/types.ts`): *an
attribute a renderer sets, never a palette slot's fallback*. The two colour-naming members are
ruled at the end, and the ruling is that they add nothing to this component: each is resolved by
the resolver its owner already has.

**The merge is a spread, and it touches neither colour channel.** The renderer resolves the
block's tone exactly as it does today — `tone(block.tone, theme, caps)` — and a run inside a
span paints with `{ ...toneStyle, ...spanAttrs }`. The span contributes at most three boolean
members; `colour` and `background` come from the tone and from `withBackground` and are
never read or written by the span path. So a span cannot enter `MONO`, cannot consult the
degradation ladder and cannot be the subject of a contrast floor — there is no colour for a
floor to be about. That is the whole reason it can be three fields rather than a fourth
palette family, and it is the same reason `Style.italic` could be one field (roadmap 50).

**At 1-bit the collapse and the span write the same bits, and the loss is accepted.** §3's
three classes carry tone as `bold` and `dim`. A span's `bold` on an emphasised-class block
(`ok` · `warn` · `error` · `accent`) is SGR 1 on a run already inside SGR 1 — invisible, and
**not compensated**: there is no fallback onto `underline`, which C25 I10 has spoken for, and
no return to literal markers, which the view model cannot choose because a block is built
before any capability is known (C04 I85). A span's `bold` on a normal-class block shows. On a
de-emphasised block both `dim` and `bold` are written, in `sgr()`'s numeric order, and what a
terminal draws for `1;2` is the terminal's — nothing here promises a rendering, only the
bytes. The measured pair is C04 T3.67: at 1-bit an `ok` notice with and without a bold span
paints byte-identical frames, and the row exists so that a compensation added later is a
visible change rather than a quiet one.

**Italic and underline survive every depth, and the `unicode` axis does not gate them.**
`sgr()` writes attributes unconditionally and consults no depth, because an attribute is not
a colour; the ASCII rung is about glyphs, and SGR 3 costs no cells. A terminal that ignores
SGR 3 shows plain text, which is the same loss `bold` takes on the same terminal, and the
row still measures what it measured. **No typographic fallback is owed** — 11(c)'s reversal
stands (I33).

**`underline` meets `underline` nowhere, and that is by construction rather than by luck.**
C25 I10 gives word-level diff emphasis to `underline`; a markdown span may also say
`underline`. The two would be one attribute meaning two things only on a text that had both
writers, and no member has both: `Hunk.lines` carries no `spans` in the first pass (C04 I88)
and when it does, its writer is the intra-line diff and not the markdown translator. The
day a diff line can carry markdown, this paragraph is the row to reopen.

**A span touches colour only through a named slot, resolved as any tone is** (C04 I89). A
`tone` on a span is a `Tone`, and the renderer resolves it with the same `resolveTone(tone,
theme, caps)` call the block made for its own — so it walks the same ladder, takes the same
curated 4-bit index, collapses to the same `MONO` class at 1-bit and is memoised under the same
key. It **replaces** the block's resolved style for the run rather than composing with it (a run
cannot be two tones), and the span's attributes then spread on top exactly as above. Nothing here
gains an entry: no `MONO` row, no floor, no ladder arm — a span never names a colour value, it
names a slot, and C04's *a block names a palette slot; it never embeds a colour value* is now true
of a run as well. The 1-bit consequence is the one §3 already states for every tone: a
`tone: "identifier"` run is `normal` class, so on an `ok` block at 1-bit the run is the one *not*
bold — the tone collapsed and was not compensated, which is I33's accepted loss with the sign
reversed. The measured pair is C04 T2.35: at 24-bit the run's `38` is `identifier`'s and the rest
of the row is the block's; at 1-bit the run's bytes are `identifier`'s collapse and nothing else.

**And through the block's colormap, as a background, on the colormap's ladder** (C04 I90, I31). A
`value` paints the run's background from `continuousColour(COLORMAPS[block.colormap], value,
caps)` — heatmap's and image's resolver, unchanged — so it is `undefined` below 8-bit and the run
paints plain there, `48;5` at 8-bit and `48;2` at 24. This is the **second** case I21's *a
background only from a surface ref* admits, after the matrix cell (§4c): the background is the
reading and no floor is measured for the text over it, and the ruling accepts that for the same
reason it did there — a floor would delete the half of the map's range a map exists to encode
(I31). The foreground is untouched: it is the block's tone or the span's, resolved above. A span
carrying both `tone` and `value` takes its `38` from the slot and its `48` from the map, two
channels from two owners, which is `withBackground`'s composition in the one other place it
happens.


## 4h. A ramp — an ink that is a function, sampled here, on this component's ladder

C04 §3am.2 admits a `Ramp` on a span and on the bar, and C09 §5 *Ramps* supplies its argument
`t'` per cluster or per axis cell. **This section is what a sample resolves to**, and the rule is
that a ramp adds no ladder: each backing is resolved by the resolver its slot or map already has,
and the one new piece of arithmetic — a mix of two resolved slots — is stated with its rungs. The
design is `docs/notes/CALCIUM_INK_RAMPS_DESIGN.md` (Q4, Q6, Q7, Q11).

**One entry point, `rampColour(ramp, t, theme, caps)`, and it returns a `ColourValue` or
`undefined`** (I36). `undefined` means *say nothing*: the run paints as its neighbours do and
coalesces with them by reference, which is `continuousColour`'s existing answer below its floor
and is what makes a 4-bit frame byte-identical with and without a colormap ramp (I31). The
ladder, per backing:

| backing | 24-bit | 8-bit | 4-bit | 1-bit |
|---|---|---|---|---|
| slot pair — `gradient`, `step` | `mixHex(from, to, t)`: linear in sRGB between the two **resolved** hexes, the interpolation `sample` already uses between colormap stops | `nearestAnsi256` of the mix | **a step of two**: `t < 0.5` → `from`'s curated index, else `to`'s | **`from`**, resolved as the slot is — `undefined` here, so the run takes the block's collapse |
| colormap — `progress` only (C04 I107) | `sample` | `COLORMAPS_256` | `undefined` (I31) | `undefined` |
| palette | `categorical.c((i mod 8) + 1)` resolved as a slot — *i* the span's ordinal on text, the cell on the bar (C04 §3am.2) | as a slot | as a slot — the curated map separates them at 4-bit, which is `CATEGORY_COLOUR_FLOOR` | `undefined` |
| `animate` | as designed | as designed | **resolves to `none`** — C09 evaluates `t'` at `tick = 0` | `none` |

**Why a step of two and not three or four, and why `from` and not a midpoint.** The brief's §6
offered *three or four distinguishable steps at best* at 4-bit and *the midpoint* at 1-bit. At
4-bit the two ends resolve to two of the theme's sixteen curated indices; a third between them
would be a third slot's index wearing a different name, and the curated map exists so that no
tone lands on another's colour uninvited (§3). At 1-bit there is no colour, and a midpoint of two
slots is a colour this component never named — `from` is a slot with a floor the resolver has
proven, and the run reads as that slot reads. Two departures from the brief, each recorded with
its reason, which is the record the *record why a catalogue diverged* rule asks for.

**Motion below 8-bit is a rung, stated here, not discovered in a frame** (I36). Three colours
moving is a flicker and a flicker is worse than a static tone; `animate` resolves to `none` below
8-bit and C09 samples the static frame. The cadence is still declared by content (C09 I54), so
the entry re-renders to identical bytes — a recorded cost, not a defect.

**The floor is why colormaps stop at the bar** (I26, C04 I107). A slot's contrast against its
surface is proven by the resolver; a sampled colour passes through no floor, and this component
does not gain one for it — a floor would delete the half of a map's range the map exists to encode
(I31, §4e). A slot-pair mix is bounded by two proven colours and the middle is unmeasured but
between them; a colormap on text would be unbounded. The bar's `on` cells fill their cell and read
by area, which is the picture-cell case §4c.1 already rules on, so the same backing is admitted
there. The deferral's symbol is a floor-aware lift for a sampled colour, `liftToFloor(hex,
surface, slot)`, beside `floorFor` in `theme/contrast.ts`.

**The categorical cycle moves down, and it moves rather than copies** (I37). `CATEGORY_REFS` and
`refOf(index)` were C12's (`plot/marks.ts`); a `palette` ramp needs them from C09. **The design
note first said C09 could not import C12 without closing a cycle, and the row written to assert it
disproved it**: `blocks/kinds/image.ts` and `structured.ts` already import `plot/` files at run
time, MG1 and MG22 are acyclic over *files*, and `marks.ts` imports nothing of C09's — so the edge
was open. The move stands on the other reason, which was always the stronger one: **a slot table
is this component's**, two components read it now, and a ramp resolver that reached into the plot
arm for a palette would make an ink depend on a chart. `theme/categorical.ts` holds it and
`marks.ts` re-exports it so no plot call site changes; one copy, because F382 is the measured
record of what two copies of this function did — a legend swatch in one colour and the line it
named in another. The direction that *would* be a cycle is `theme/` importing `blocks/` or `plot/`,
and T2.30 asserts that one.


---

## 4f. The page a figure is painted on — the `bgDeep` exclusion's conditional, fired

§4 wrote the exclusion as a decision someone would have to take: *"if a surface ever paints text on it, that surface is wrong or the exclusion is."* A surface does. `plotToSvg` fills its page with `surface.bgDeep` and writes **every** label onto it — axis ticks and titles, the legend's rows, a line's end-of-series callout, the `n reversed` notice, the empty-figure message, and a sankey node's name over a halo of the same slot. C12 §3ap.7 recorded the debt — *"a note owed to C10, and it is not this component's to fix"* — and this is the payment.

**Both halves of the conditional went unacted-on, which is the thing worth naming.** The exclusion was not wrong and was not right; it was never asked. A sentence that names a trigger and no watcher is satisfied by nobody looking, exactly like a rule with nothing to be wrong about (A03 §2).

### 4f.1 — the measurement, before the ruling

Every slot in `tone`, `categorical` and `syntax` — the three families the framework itself resolves against (I30) — measured against `bgDeep` and against `bg`, on all three shipped themes, at its own floor. `spectrum` is out because it is declared art and lands on no page. Against `bg` **everything passes on all three**. Against `bgDeep`, dark and high-contrast pass and **light fails twelve times**:

| light slot | floor | on `bgDeep` `#e8e8e8` | on `bg` `#fafafa` |
|---|---|---|---|
| `tone.muted` | 2.5 | **2.44** | 2.86 |
| `tone.ok` | 4.5 | **4.29** | 5.04 |
| `tone.warn` | 4.5 | **4.30** | 5.04 |
| `tone.info` | 4.5 | **4.29** | 5.03 |
| `tone.accent` | 4.5 | **4.30** | 5.04 |
| `tone.identifier` | 4.5 | **4.31** | 5.06 |
| `categorical.c4` | 4.5 | **4.41** | 5.17 |
| `syntax.string` | 4.5 | **4.29** | 5.04 |
| `syntax.comment` | 3 | **2.89** | 3.39 |
| `syntax.number` | 4.5 | **4.30** | 5.04 |
| `syntax.function` | 4.5 | **4.30** | 5.04 |
| `syntax.operator` | 4.5 | **4.29** | 5.03 |

The direction is a property of each theme's own `bgDeep` and not of the slot: dark recesses (`#141414` under `#1a1a1a`) so every ratio *rises*, light recesses the other way (`#e8e8e8` under `#fafafa`) so every ratio *falls*, and high-contrast's `bgDeep` is **lighter** than its pure-black `bg` and still clears. **A surface excluded from the check is a surface whose polarity nobody constrained**, which is why one theme in three fails and the other two look like evidence that it is fine.

The slots that actually land on the page, measured under both grounds:

| what is painted on the page | dark | light | high-contrast |
|---|---|---|---|
| `tone.muted` — ticks, titles, legend, empty message | 3.02 → **2.85** | 2.44 → **2.86** | 6.44 → **7.93** |
| `tone.warn` — the `n reversed` notice | 9.12 → **8.62** | 4.30 → **5.04** | 6.42 → **7.91** |
| `tone.default` — a sankey node label on its halo | 12.43 → **11.74** | 9.25 → **10.86** | 17.04 → **21.00** |
| worst `categorical` — a callout at a line's end | 6.63 → **6.26** | 4.41 → **5.17** | 6.13 → **7.55** |
| worst tile label, where the ground is the **ink** | 6.63 → **6.26** | 4.41 → **5.17** | 6.13 → **7.55** |

### 4f.2 — the classification table: which rule owns a cell

Structural, not a trace — nothing here happens in sequence; every row is two rules that both hold at rest (A03, *index the artefact by rule interaction*).

| the cell | rule A | rule B | which owns it |
|---|---|---|---|
| the page's fill | §4 — `bgDeep` carries no text | C12 §3ak — the arm paints its own page because an SVG has nothing underneath it | **B names the need, A names the slot, and the slot was chosen without A.** The comment beside it says the arm "cannot follow `resolveBase`" — and `resolveBase` resolves `surface.bg`, so the principle was cited and the wrong slot taken |
| a sankey node label's halo | C12 I112 — the halo is the terminal's cell substitution, in the other medium | §4 — the ink's floor is measured against the surface behind it | **Both, and they agree**: the halo *is* the page, so it moves with the page and C12 I112's figures move with it. The ruling on the ink stands untouched |
| a treemap tile's label | C12 — the label is inked in the page's ground so it reads as a hole in the tile | §4 — a floor is a foreground on a surface | **Neither, today.** The ground is used as *ink* over a series fill, which is a pair no §4 pairing holds. Left owed below rather than fixed here |
| a callout at a line's end | C12 F382 — a callout takes its series' colour so both arms agree with the legend | §4 — every slot painted as text clears its floor against its ground | **B, and it is what kills arm 2**: the page carries `categorical` text, so widening `textSurfaces` binds `categorical` *and* `tone` *and* `syntax` to `bgDeep`, which is §4a's twelve-slot argument inverted |
| a separator stroke between two tiles | C12 — adjacent fills are parted by a stroke in the page's ground | §4 — surfaces are painted, not written on | **A alone.** It carries no text, so it is out of §4 either way, and it moves with the page because it *is* the page showing through |
| `figure.ts`'s violin box | C12 F389 — the box and whisker take the ground so they are not the series' colour | §4 — `bgDeep` is a surface | **A**, in the terminal arm, where `bgDeep` is a *mark ink* over a violin body. Untouched by this ruling and noted so the next reader does not read it as a page |

Two of the six cells are ones no reader checking statements one at a time reaches: the callout row is the whole cost of arm 2 and is invisible if you enumerate *slots* rather than *text sites*, and the halo row is why one constant cannot be split.

### 4f.3 — the ruling

**The page is `surface.bg`.** The exclusion in §4 stands; the surface was wrong.

**Why not the other arm.** Widening `textSurfaces` to include `bgDeep` costs twelve token changes on the light theme, and they are not twelve independent nudges: light's `ok`, `warn`, `info`, `accent`, `identifier`, `string`, `number`, `function` and `operator` all sit within 0.03 of **5.04** against `bg` — an equal-luminance set, authored that way — so clearing 4.5 against `bgDeep` means darkening the whole family, and the light theme's every surface, panel and transcript moves to satisfy a page only one arm paints. §4a's rule read forward: *do not validate a slot against a surface it never lands on.* Nine tones and nine syntax slots never land on an SVG page.

**Why not a third surface.** `surfaces.page`, distinct from both, was the obvious third answer and it is worse than either. It would have to be in `textSurfaces` anyway, so its value would be constrained to something the tokens already clear — which is `bg`. It would be a tenth surface every theme must declare and every rung must answer, and F240 records what a surface list does when it acquires a member nobody gave an index: an unanswered slot and a deliberately unpainted one resolve identically. And its only freedom — a page that deliberately differs from the transcript's ground — is the one thing the two-arm contract exists to prevent, since D11's whole claim is that the two arms draw the same figure. **A slot whose sole degree of freedom is to break the rule it was added under is not a slot.**

**What it costs, and the cost is on dark.** Every dark ratio falls by 5.5% — `muted` 3.02 → 2.85, the worst callout 6.63 → 6.26, a node label 12.43 → 11.74. Light gains 17% and high-contrast 23%, and the light `muted` failure at 2.44 is repaired at 2.86. So the trade is stated plainly: **the page gives up a ratio nothing checked for a slightly lower one that is checked on every load, on every theme, for ever.** 2.85 is `muted`'s number against `bg` — the surface it was authored against — and a figure exported from a transcript now sits on the ground the transcript sits on, which is the second thing this buys.

**No floor moves.** Nothing here is bought by lowering a number; the check is unchanged and the surface came to it.

### 4f.4 — what the ruling leaves behind

- **The exclusion still has no watcher, and now it has one for this instance only.** T2.27 asserts the page's fill is a hex some member of `textSurfaces` carries — so any future ground that is not a text surface fails, which closes the class rather than the instance. What it does not reach is a *new* text site on some *other* excluded surface; that is the same prose-matching problem A03 declines to automate.
- **`categorical` is a `decoration` palette and the page carries it as text.** A callout at a line's end takes its series' colour (F382), so `categorical.cN` is painted as a `<text>` fill — and I15 exempts a decoration palette from every floor, so C10 checks it against nothing on any surface. It clears comfortably today (worst 6.26 dark, 5.17 light, 7.55 high-contrast) and **T2.27 was the only row that asked**, because it reads the fills off the document rather than the palettes off the theme. Whether the exemption should survive a decoration slot becoming text is C10's question, and **§4g answers it**: the exemption is from the family-wide check and not from a floor, and I35's pairing binds `categorical` to both text surfaces at the meaning floor. The sweep that ruling ran found this is one of **ten** such sites and not one of two.
- **A ground used as ink is measured by nothing — and it is the row above, backwards.** A tile label is painted in the page's ground over a series fill, and no §4 pairing held `surface × categorical`. The figures are 6.26 dark, 5.17 light and 7.55 high-contrast — **the same three numbers the row above carries**, because `ratio` is symmetric and these are the same two colours in the other order. That identity sat in this table unread and is what §4g's ruling turns on: one pairing pays both, and the debt was never C12's.
- **`figure.ts` still names `surface.bgDeep`** for the violin's box and whisker, in the terminal arm, as a mark ink over a filled body. That is not a page and the exclusion is not about it — recorded because the next reader grepping the slot will find it and should not read it as a second instance of this defect.

---

## 4g. A decoration palette painted as text — the exemption's own conditional, fired (F652, F653)

§4f closed the surface and left two lines owed, one under each half of the same question: **what holds a floor when the pair is not `meaning palette × surface`?** A callout at a line's end is `categorical.cN` on the page, and a treemap tile's label is the page's own ground painted **over** a `categorical` fill. Neither is a pairing §4 holds, so both are checked by nothing on any theme.

**They are one pairing and not two, and the evidence was already in §4f.1.** `ratio(a, b)` is symmetric, so *fill on ground* and *ground on fill* are the same two colours and the same number — which is why that section's last two rows carry **identical figures on all three themes** (6.26 / 5.17 / 7.55) and why nobody read them as one row. Two findings were filed because the two sites look different; the constraint behind them does not. Re-measured here rather than carried: worst `categorical` against `bg` is **6.26** dark (`c6`), **5.17** light (`c4`), **7.55** high-contrast (`c6`); against `bgElev` **5.72**, **4.74**, **6.74**.

**Everything clears today**, so this is a ruling about what is *checked*. The question a vacuous version of it would skip is what would have to change for it to stop clearing, and whether anything would notice — and the answer is in the palette's own construction. A `categorical` palette is authored for **hue** separation, not luminance separation: the worst pair *within* it measures **1.00** on all three shipped themes (dark and high-contrast `c2`/`c3`, light `c3`/`c6`). So the family has no internal luminance discipline at all, and the only thing holding these four text sites up is that every slot happens to have been authored against `bg` by hand. Nothing says so, and I17 — the only rule the family has — forbids two slots being *equal* and permits two slots being one luminance apart from each other and from anything else.

### 4g.1 — the sweep, because two instances are the minimum for noticing a rule

**Every text site in both arms, and its ink and ground.** Indexed by *text site* rather than by slot, which is the enumeration §4f.2 found the callout with.

| where | ink | ground | a validated pair? |
|---|---|---|---|
| `svg.ts` axis ticks and titles, key ends, legend rows, empty message (nine sites) | `tone.muted` | the page, `surface.bg` | yes — §4 |
| `svg.ts` `n reversed` notice (two sites) | `tone.warn` | the page | yes — §4 |
| `svg.ts` sankey node label | `tone.default`, haloed in the page's own ground | the page | yes — §4, C12 I112 |
| `svg.ts` callout at a line's end | **`categorical.cN`** (or `tone.*`, where the series declares one) | the page | **no** — F652 |
| `svg.ts` treemap / heatmap tile label | the page's ground, **`surface.bg`** | the tile's **`categorical`** fill | **no** — F653 |
| `svg.ts` graph node label | the page's ground, **`surface.bg`** | the node rect's **`categorical`** fill | **no — a third instance** |
| `svg.ts` outline label, one slot per depth | **`categorical.cN`** | the page | **no — a fourth instance** |
| `svg.ts` label at a point, where a hierarchy label has no box | **`categorical.cN`** | the page | **no — a fifth, reachable rather than drawn today** |
| `definition.ts` the callout column | **`categorical.cN`** | the transcript's ground | **no — and it is the same figure as the SVG callout, which is what D11 requires** |
| `definition.ts` a flame or icicle frame's name inside its own bar | **`categorical.cN`** | the transcript's ground | **no** |
| `definition.ts` a pie's legend rows and a run's label, through `markedSpans` | **`categorical.cN`** | the transcript's ground | **no** |
| `sankey.ts` a node's own label | no ref — the default foreground | the transcript's ground | out of scope: unstyled |

**Ten sites, not two, and four of them are in the arm the findings did not name.** The terminal draws the same callout in the same slot, which is D11 holding — so a ruling that moved the *sites* would have to move ten of them in two arms, and a ruling that moves the *check* moves one function. That is the sweep's finding and it decides the arm below.

**And the cells that are not text, recorded so the next reader does not count them as instances.** `sankey.ts`'s half-block puts one owner's slot in the foreground and the lower owner's in the **background**, and `scatter3.ts`'s braille and quadrant cells do the same; **neither goes through `slot()`** — `sankey.ts` names refs and `definition.ts` resolves them, and `scatter3.ts` holds resolved values by the time a cell is built (§4c.1 corrects this sentence, which said both did). They are art and carry no glyph a reader reads — and the margin says how much rests on that: `categorical × categorical` is **1.00** at worst, so the cell is invisible in greyscale and legible only by hue. **The alphabet now enforces it** (§4c.1): both constructors refuse a background on a glyph outside `U+0020`, Block Elements and Braille Patterns. What is still owed is the *type* — see below.

### 4g.2 — the classification table: which rule owns a cell

Structural, not a trace: every row is two rules that hold at rest with no event between them (A03, *index the artefact by rule interaction*, and C18's shape rather than C16's — nothing here happens in sequence).

| the cell | rule A | rule B | which owns it |
|---|---|---|---|
| a callout at a line's end | I15 — a `decoration` palette is not contrast-validated, and is lint-restricted to declared art | §4 — every slot painted as text clears its floor against its ground | **B, and A is the defect.** The callout is the only thing naming that series in that arm, so it is a label and not art. I15's exemption is from the **family-wide** check and was written as an exemption from *every* floor |
| a tile label, and a graph node label | C12 — the page's ground is the ink, so the label reads as a hole in the tile | §4 — a floor is a foreground on a surface | **Both, and they are one constraint.** `ratio` is symmetric, so this is the row above with the two colours exchanged. §4f.1 measured them separately and printed the same three numbers twice |
| a `spectrum` stop | I16, SS21 — declared art, and the scan holds it there | §4g — a `decoration` slot the framework paints as text | **A, measured rather than assumed.** No `spectrum.` reference exists in `src/` outside the palette record, and binding the family would **reject the light theme**: 7 of its 9 stops sit under 4.5 against `bg`, worst 2.36. That is §4a's argument for a *named pairing* rather than a widened list, arriving from the palette's side instead of the surface's |
| a sankey half-block, a braille cell | I21 — a picture cell may take a palette ref as a background, because its glyph is a fill and the two colours are two regions of one cell | §4 — a foreground on a surface clears a floor | **A, and the reason changed under measurement** (§4c.1): the row used to read *because it carries no text*, and both shipped sites always draw a glyph — sankey's `▀` is the 1-bit carrier. The worst `categorical × categorical` pair is 1.00, and `isPictureGlyph` is what now holds the argument |
| a braille outline over a shaded face | I21 — the background is a picture cell's | §4 — `tone.muted` is a slot authored as **text**, and here it is the ink | **Neither, and that is the finding** (§4c.1). Measured in `plot3d-colour-series` at 24-bit: `#626262` on `#3cbf9a`. §4f's sweep is indexed by text *sites* and a wireframe is not one, so no row of either artefact reaches it. Left to C12 as a reading question, because `ratio` answers *can a character be recovered* and a cage is judged on whether it reads |
| a series that declares its own `tone` | F382 — a callout takes its **series'** colour, which is `tone.*` where the series names one | §4g — the pairing is over the `categorical` slots | **Both, and they agree.** A `tone.*` ink on the page is §4's own pairing already, so the new one need cover only the slots §4 cannot reach — which is why it is a pairing over a *palette* and not over a *site* |
| a `categorical` slot on `bgElev` | §4 — text lands on `bg` **and** `bgElev`, and a floor checked against one has a gap where nobody inspects | §4a — do not validate a slot against a surface it never lands on | **A, with the limit stated.** Nothing in `src/` resolves `surface.bgElev` at all today, so the second surface is a claim about where blocks land rather than a measured site. Included because the cost is nil — worst 4.74, clearing 4.5 — and because the alternative is §4's own named gap |
| a ninth `categorical` slot a theme declares | I30 — the framework's own reference set is closed and checkable | §4g — the pairing is over the slots the framework can resolve | **B, and it inherits I30's stated limit.** `refOf` returns one of eight, so a `c9` a theme declares is painted by nothing and checked by nothing — the same blind spot I30 records for a slot inside a family that exists |

Three of the seven are rows no reader checking statements one at a time reaches: the symmetry row is why two findings are one rule, the `spectrum` row is the whole cost of the widest arm, and the half-block row is the exemption this ruling must **not** close.

### 4g.3 — the ruling

**A `decoration` palette is exempt from the family-wide check and not from a floor. A decoration slot the framework paints as text is bound by a named pairing, at the meaning floor, against both text surfaces.** `decorationTextPairs` is that pairing: the eight `categorical` slots × `textSurfaces`, at 4.5 : 1, checked at load like every other floor.

**The name is the mechanism and not the site**, deliberately. Ten sites in four figure families and two arms produce one pairing, and a name like `figureTextPairs` would have to be re-read every time a new form draws a series' name.

**It is not vacuous.** Light `c4` measures **4.74** against `bgElev` — 5% of headroom over its floor, the tightest margin in the pairing and tighter than anything §4a or §4b ships. A `categorical` family authored the way palettes usually are — for hue distance, at a comfortable mid lightness — fails this immediately, and would previously have shipped.

**Why not move the sites.** The callout's ink is F382's ruling: a callout takes its *series'* colour so the two arms and the legend agree, and that finding exists because they once did not. Repainting it `tone.muted` re-creates exactly the defect — a name in a colour the thing it names is not drawn in. And the tile label cannot take a fixed ink at all: it lands on eight different fills whose worst internal ratio is 1.00, so one ink for all of them is strictly worse than the ground it uses now. Ten sites in two arms, against one function.

**Why not drop the `decoration` skip.** Removing `carries === "decoration"`'s `continue` from `validatePalette` binds `spectrum` too, and the light theme fails **7 of its 9 stops**, worst 2.36 : 1 — a theme rejected for a failure nobody can see, on a palette whose entire content is a ramp that must have a low end (I31 measured the same thing from the colormap's side: the floor deletes 130 of 256 luminance steps, and they are the low ones). This is §4a's twelve-slot argument and §4's own `bgDeep` argument, both in the mirror: **do not validate a slot against a ground it never lands on, and do not validate a palette against a rôle it does not have.**

**Why not a third `carries` value.** An `identity` palette — named things, no meaning, but text — is the tidy answer and is F240's shape: a vocabulary member every theme must answer and every rung must map, whose only observable difference from `decoration` is this one pairing. It also re-opens `classes`, since I15 makes the 1-bit typographic fallback a property of `carries`, and a categorical slot has no meaning to collapse *to*. One pairing against one vocabulary change that touches every theme, every rung and the 1-bit ladder.

**Why not widen T2.27's exemption.** That row skips a `<text>` fill equal to the page because the ratio is 1.00 by construction, and the skip is correct — it just recorded that a rule could not see something. With the pairing in place the skip becomes a **delegation**: the row asserts that the page is a ground `decorationTextPairs` covers, and *then* skips. An exemption that names the check which does hold the case is a different object from one that names nobody.

**No floor moves, and no token moves.** The check came to the pair, as in §4f.

### 4g.4 — what the ruling leaves behind

- **A picture cell's background is held by an alphabet and not by a type** (§4c.1, and this entry replaces the one that asked for a `wash`-shaped helper — every premise of that remedy measured false). `isPictureGlyph` refuses a background on a glyph outside `U+0020`, Block Elements and Braille Patterns at both constructors, which closes *nothing enforces it*. What is still owed is compile-time refusal, and the two blockers are named rather than described: `QUADRANTS` is in `linedraw.ts` and `foldBraille` in `raster.ts`, so branding the glyph at its source is a two-file edit; and `SankeyCell` is one type serving label cells and picture cells both, so the guarantee there is a discriminated union and `definition.ts` reads `.text`, `.ref` and `.background` off it. **Grep `isPictureGlyph` when picking this up** — the runtime keeper is the condition, and it exists.
- **A picture cell's ink is a text tone and nothing measures the pair** — `#626262` on `#3cbf9a` in `plot3d-colour-series`. Neither §4f's sweep nor §4g.2's table reaches it, for the reason the table row gives. Owed to C12 as a reading question and not to C10 as a floor.
- **Half the pairing is a claim rather than a measurement.** No `surface.bgElev` reference exists in `src/`, so *text lands on both surfaces* is true of the design and unmeasured in the tree. It costs nothing today (worst 4.74) and it is recorded here rather than defended: the day a panel paints its own ground, this half stops being a claim.
- **A ninth `categorical` slot is unchecked**, exactly as I30 records for an unknown slot in a known family. The pairing is derived from the eight the framework can resolve, so it grows with `refOf` and not with a theme's ambition.
- **`svg.ts`'s `fill="${ground ?? ink}"` falls back to painting a label in the exact colour of the fill behind it** — a ratio of 1.00 by construction, and the one state this section exists to forbid. It is unreachable today, because `surface.bg` is required of a theme and `validateTokens` refuses a non-hex surface, so this is recorded rather than repaired: a fallback whose failure mode is the rule's own negation is worth a reader knowing about even when nothing can reach it.

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
- **I15** — Every palette declares `carries` and `monochrome`; a `meaning` palette is contrast-validated against every text surface and declares its typographic fallback as `classes`, one entry per slot; a `decoration` palette declares neither and is exempt from the **family-wide** check — not from a floor. **A decoration slot the framework paints as text is bound by a named pairing instead (I35, §4g)**, and one it paints as art is bound by nothing, which is what `spectrum` is and why SS21 holds it there. The clause this replaces read *lint-restricted to declared art* over the whole class, and the lint is SS21, which matches `spectrum` alone: `categorical` is the other decoration palette, the framework paints it as text at ten sites in both arms, and no rule reached any of them.
- **I16** — `syntax` is consumed only by `code` and `patch` blocks; `spectrum` only by declared art. The list is closed at two; a third consumer is a spec change to §3, I16, T2.8 and A03 SS20 together.
- **I17** — Within one palette and one variant, no two slots carry the same 24-bit value, and at 8-bit no two of `{ok, warn, error, info, accent}` resolve to the same index. A slot that renders as another slot bought nothing.
- **I18** — A `defaultTheme` ships and satisfies every contrast floor, so the one required config field is one line to fill. A framework whose only required field has no working value is a framework nobody starts.
- **I19** — Contrast is validated against `bg` and `bgElev`, the two surfaces text lands on, and never against `bgDeep`, which carries none. Validating against a surface no text meets would reject themes for a failure that cannot be seen. **The exclusion's own conditional has been fired once and answered** — see I34: the SVG arm painted text on `bgDeep`, and the ruling was that the surface was wrong, not the exclusion.
- **I20** — The shipped tokens are A01 Appendix A.1's catalogue, and T2.4 recomputes every ratio from them rather than trusting the recorded figures. The table is an assertion the suite upholds, not a record of intent.
- **I21** — `Style` has exactly two colour channels, `colour` and `background`, and both are `ColourValue` or absent. `background` is set only by `resolveBackground` from a `surface` ref, **or by `wash`, which returns a blank `Span` and never a bare `Style`** (§4c), **or by a valued span through the block's colormap** (§4e, C04 I90 — the second admitted case after the matrix cell, and like it a framework channel rather than a palette slot), **or by a picture cell, whose glyph `isPictureGlyph` admits** (§4c.1 — the fourth case, and the only one that is a palette slot). A palette slot still never resolves into it *through `resolveBackground`*: a tone painted behind *text* is a tone nothing checked the floor for. `wash` is admitted because it carries no text — the floor is a property of a foreground on a surface, and a painted matrix cell has no foreground. The `Span` return is what makes that unforgeable: there is no way to hand the colour to a glyph. **The picture cell is admitted for a different reason and it is not `wash`'s** (§4c.1): its glyph is a fill from a closed alphabet — `U+0020`, Block Elements, Braille Patterns — so the two colours are two *regions of one cell* rather than ink and ground, and there is no occluding pair to measure a floor across. `carries no text` was the wrong word and would have been false of both shipped sites, each of which always draws a glyph. What makes *this* one unforgeable is the alphabet: the two constructors that set a background refuse a glyph `isPictureGlyph` does not admit, so a text-bearing picture cell is refused rather than discouraged.
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

- **I32** — **`errorGround` and `errorInk` are one pair, minted together, checked together at the full meaning floor — and the floor on `error` is 2.5 because the slot now answers to two constraints that a dark page cannot satisfy at once.** The tag is the only painted run in C09's `status` box, and `tone.error` cannot stand in as its ground: it is authored as a foreground for a dark page, which is I21's rule from the other direction. The **ground is `tone.error` itself**, so text and box are one red by construction rather than by two literals kept in step by hand. **Measured over the whole 8-bit cube rather than over reds**: on dark and on high-contrast, **zero of 262,144** colours are both legible on `bgElev` and dark enough to hold white at 4.5; on light, **81,907** are, which is why light clears 4.5 unaided at 6.42–7.01. So 2.5 buys `#c62828` at **5.62 : 1** in the tag and costs the message text **2.83** against `bgElev` — `muted`'s standard, the quietest thing that must still be readable. **The alternative is real and is shipped**: high-contrast takes a light ground with dark ink, `#3d0000` on `#ff7171`, and needs no exception; the same would work on dark and gives up the dark red, which reads as a warning rather than a failure. **So this is a preference honoured, not a constraint discovered** — stated here because someone lightening the red to satisfy `FLOORS` would be undoing a decision rather than repairing an oversight. What keeps it honest is that the text is never the only carrier: the `▲` and the painted word both survive it, and both survive 1-bit where colour does not (§4d, F34). **And the pair has a 4-bit rung, which it was shipped without** (F240). The ground is `tone.error`'s **index** there for the same reason it is `tone.error`'s hex at 24-bit — one red by construction rather than two values kept in step — and the ink is the half that reads on it, which flips dark's from white to black because `tone.error` is a dark red at 24-bit and the bright one at four. **No ratio is claimed and none can be**: I26 rules the floor best-effort at this rung, 0-15 being the emulator's own values, so what is curated is a decision and not a measurement. **1-bit is untouched and is not the same case** — I8 leaves nothing to arrive, so the tag is distinguishable by being the one run that carries no styling, which is C09 §3a's rule and correct there alone.
- **I33** — **A span's attributes are set by the renderer from the span, never resolved from a slot; they compose with the resolved tone by spread; where a depth cannot show them they are lost and not compensated; and a span touches colour only through a named slot, resolved as any tone is, or through the block's colormap, resolved as any map is.** The merge `{ ...tone, ...spanAttrs }` writes at most `bold`, `italic`, `underline` and never `colour` or `background`; the tone it spreads onto is the block's, or the span's own `tone` resolved by the same `resolveTone` call and replacing the block's for the run (C04 I89); a `value` writes `background` through `continuousColour` and nothing below 8-bit (C04 I90, I31). So a span never enters `MONO`, the ladder or a floor **on its own account** — it names a slot or a reading, and the owner of each does the entering (§4e). At 1-bit a bold span on an emphasised-class block is absorbed — no fallback onto `underline` (C25 I10's) and no return to literal markers (C04 I85). The `unicode` axis gates glyphs and not attributes: SGR 3 is written at `ascii` exactly as at `full` (§4e, C04 §3am).
- **I34** — **A renderer that paints its own page paints it in a surface `textSurfaces` holds, and `surface.bg` is the one it has.** §4's exclusion of `bgDeep` names a trigger — *if a surface ever paints text on it* — and the SVG plot arm was that surface for as long as it has existed: page, sankey halo, tile-label ink and separator stroke all read one constant, and every axis tick, legend row, callout, notice and node label lands on it (C12 §3ap.7's note owed, F632). **Measured before the ruling, all three themes and all 27 slots against both grounds**: against `bg` everything clears; against `bgDeep` dark and high-contrast clear and **light fails twelve times**, `tone.muted` at 2.44 under its own 2.5 floor and `syntax.comment` at 2.89 under 3 — because dark's `bgDeep` recesses *away* from its tones and light's recesses *toward* them, and a surface outside the check is a surface whose polarity nobody constrained. **The surface moved, not the floor and not the check**: widening `textSurfaces` would bind `tone`, `categorical` *and* `syntax` to a page only one arm paints — `categorical` because a callout at a line's end takes its series' colour (F382) — which is §4a's twelve-slot argument inverted, and it would cost a recolouring of light's whole equal-luminance family, every slot of which sits within 0.03 of 5.04. A third surface `surfaces.page` is worse than either: it must be in `textSurfaces` anyway, so its value is constrained to `bg`; it is a tenth surface every rung must answer (F240); and its only freedom is a page that differs from the transcript's, which is what D11's two-arm agreement exists to forbid. **The cost is named rather than absorbed**: dark loses 5.5% uniformly — `muted` 3.02 → 2.85, a node label 12.43 → 11.74 — and light gains 17%, high-contrast 23%. 2.85 is `muted`'s own number against `bg`, so the page now clears a floor that is checked on every load instead of a better one that was checked never (§4f, → C12 I112, → I19).

- **I35** — **A `decoration` slot the framework paints as text clears the meaning floor against both text surfaces, and the pairing is derived from the slots the framework can resolve.** `decorationTextPairs` is `categorical.c1`–`c8` × `textSurfaces`, at 4.5 : 1, checked at load like every other floor — a **fourth** named pairing beside §4a's diff surfaces, §4b's wash and §4d's tag, and a sibling of them rather than an entry in any. **F652 and F653 are one pairing and not two**: `ratio` is symmetric, so a callout painted in a series' slot on the page and a tile label painted in the page's ground *over* that slot are the same two colours, which is why §4f.1's last two rows print the same three figures. **The sweep is what decides the arm**: ten text sites in four figure families and both arms take a `categorical` slot as ink or as ground — the SVG callout, tile label, graph node label, outline label and unboxed hierarchy label, and the terminal's callout column, flame and icicle frame names, pie legend rows and run labels — so moving the sites means moving ten of them across a seam D11 requires to agree, and moving the check means one function. **It is not vacuous**: light `c4` measures 4.74 against `bgElev`, 5% over its floor and the tightest margin the framework ships, and the palette itself has no luminance discipline — the worst pair *within* `categorical` is **1.00** on all three themes, because a categorical palette is authored for hue. **The two wider arms are refused by measurement**: dropping `validatePalette`'s `decoration` skip binds `spectrum` and rejects the light theme on 7 of its 9 stops, worst 2.36 (I31's own measurement from the colormap's side); a third `carries` value is F240's shape and re-opens `classes` for slots with no meaning to collapse to. **What it does not reach, stated because an unrecorded limit reads as strength**: a ninth `categorical` slot a theme declares (I30's limit, inherited); a picture cell's background, where I21 admits a palette ref for a cell carrying no text and *carrying no text* is the caller's property rather than the type's — `sankey.ts` and `scatter3.ts` both reach it through `slot()`, and the worst pair there is 1.00; and `surface.bgElev`, which nothing in `src/` resolves, so half the pairing is a claim about where blocks land rather than a measured site (§4g).
- **I36** — **`rampColour(ramp, t, theme, caps)` is the one entry point for a ramp's sample; it adds no ladder, and each backing degrades on the ladder its slot or map already has: a slot pair mixes linearly in sRGB at 24-bit, quantises through `nearestAnsi256` at 8-bit, steps to two at 4-bit (`t < 0.5` → `from`, else `to`) and resolves to `from` at 1-bit; a colormap is `continuousColour` unchanged; a palette is the categorical slot; and `animate` resolves to `none` below 8-bit.** `undefined` means *say nothing* and the run paints as its neighbours do (I31). Not three steps at 4-bit and not a midpoint at 1-bit, each with its reason in §4h.
- **I37** — **`CATEGORY_REFS` and `refOf` live in `theme/categorical.ts`, one copy, re-exported by C12's `marks.ts`; a palette ramp cycles them and no data palette; and `theme/` imports nothing from `blocks/` or `plot/`.** The move is a homing — a slot table is this component's and two components read it — and not a cycle avoidance: the claimed cycle was disproved by the row written to assert it (§4h). A move and not a copy because F382 measured two copies disagreeing. C10 I16's one categorical palette is what makes `palette` a fill with no name (C04 I106, F837).

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
19. `Style` has two colour channels and no more. `background` comes only from a `surface` ref through `resolveBackground`, because the floors are measured for surfaces and not for tones in that role — or from one of the three admitted framework channels: `wash`, a valued span, and a **picture cell**, whose glyph `isPictureGlyph` admits so that a text-bearing one is refused rather than merely discouraged (I21, §4c.1).
20. The two diff surfaces are text-bearing, so the §4 floors extend to them — for the twelve slots that land on them and no others, the background covering the whole row (I22). A second, stronger level was specified, measured and withdrawn; the floors left no room for it, and `underline` is what word-level emphasis has instead (§4a). The `bgDeep` exclusion is the criterion doing its job in the other direction.
21. A diff background is a third signal that vanishes at 1-bit, where the marker and the toned gutter carry the distinction alone (I23, → A01 D29).
22. **A theme declares whether it paints, as a choice and not as a colour** — `"terminal" | "surface"`, painting `surfaces.bg` — and the user's `--no-bg` is a per-invocation session flag rather than an override, so no token changes and no cache keyed on theme identity is disturbed (I25, §4c).
23. **What painting buys the contrast floor is stated per rung of the ladder, not per branch of the declaration**: provable at 24, provable against the cube's defined RGB at 8, best-effort at 4, vacuous at 1 — and the override is one clause of four rather than the whole statement (I26, §4c).
24. **A theme set is keyed by name, and polarity is a property of a theme rather than of the set** — which is what I25 freed the keys from, and it is measured on `variant`'s five readers rather than argued (I27, §5a).
25. **`variant` is checked against `luminance(surfaces.bg)`**, and the checks every shipped theme must pass are driven by the set's own keys rather than by a list a test writes for itself (I28, §5a.4).
26. **A theme is refused for a family the framework will ask for and it does not have** — a missing palette and a collapsed one are one value at paint time, so the check is at resolve time, and it found the high-contrast theme drawing every plot series in one colour (I29, I30, F172, F179).
27. **A colormap is framework data, a second channel, and vacuous below 8-bit** — not a palette family, `decoration` because the contrast floor would delete the half of the range a map exists to encode, and nothing at 4-bit because an ordering over unknown luminances is not an ordering (I31, §6).
28. **A ground and its foreground are one thing, and a floor lowered to buy one says what it bought** (I32, §4d). The `status` tag's pair is minted and measured together at the meaning floor, because a ground without its matched ink is how a contrast floor goes unmeasured; the exception on `error` carries its figures, the cube sweep behind them and the alternative it declined, so the next reader can tell a decision from an oversight.
29. **A span's attributes are the renderer's, compose by spread, and are lost rather than compensated where a depth cannot show them; a span's colour is a slot's or a map's and never its own** (I33, §4e). Three booleans and no colour value, so no floor, no ladder and no `MONO` entry of the span's; a `tone` is resolved by `resolveTone` exactly as the block's is and replaces it for the run, a `value` by `continuousColour` as a background on the colormap's ladder; the 1-bit absorption of a bold span on an emphasised block is asserted as an identical pair so a later compensation is visible; italic is written at every depth and on every `unicode` rung.
30. **A renderer's own page is a surface `textSurfaces` holds** (I34, §4f). §4's exclusion named a trigger and nothing watched it; the SVG arm had been painting every label on `bgDeep` since it was written, and light's `muted` measured 2.44 there against a 2.5 floor no check could see. The page becomes `surface.bg`, the exclusion stays true, no floor moves, and the row that keeps it asserts the page's fill is a hex some member of `textSurfaces` carries — so the next ground that is not a text surface fails rather than waiting for someone to notice.
32. **A ramp is sampled here and adds no ladder** (I36, I37). One entry point, each backing on the rung its slot or map already has, two departures from the brief recorded with their reasons, the categorical cycle moved down once so two components share one copy (`CALCIUM_INK_RAMPS_DESIGN.md` Q7, Q11).
31. **A palette that carries no meaning still clears a floor where it is painted as text** (I35, §4g). `decoration` exempts a palette from the check over *every* surface, and it was read as exempting it from every floor — so `categorical` names a series at ten sites in two arms and was measured by nothing on any theme. The pairing is `categorical` × the text surfaces at the meaning floor, a fourth sibling of §4a, §4b and §4d rather than a widening of any; the two arms that would have covered more are refused by the light theme's `spectrum` failing 7 of 9 stops; and the two findings behind it are one pairing, because a ratio is symmetric and a ground used as ink is its own pair read backwards.

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
- **T1.34** (I34, §4f.1): for every shipped theme and every slot in `tone`, `categorical` and `syntax`, the ratio against `surfaces.bg` clears the slot's floor **and** the ratio against `surfaces.bgDeep` is reported — the twelve light slots that fail on `bgDeep` are asserted by name with their figures, so §4f.1's table is recomputed from the tokens rather than read from the document. The failing set is asserted **as a set**, not by its first member: an arm that collapses onto one slot survives a `.some()` and is what makes the table look like evidence.
- **T1.35** (I21, §4c.1): `isPictureGlyph` admits `U+0020`, every Block Element `U+2580`–`U+259F` and every Braille Pattern `U+2800`–`U+28FF`, and refuses a letter, a digit, the box-drawing and arrow glyphs, and the ASCII fill set `#`, `=`, `-` that `sankeyAlphabet` falls to — the last named because it is the case the brand would have had to admit had it been put on the alphabet instead of on the background channel.
- **T1.38** (I36): `rampColour` on a `default`→`accent` gradient at 24-bit returns `from`'s hex at `t = 0`, `to`'s at `t = 1`, and the sRGB midpoint at `0.5`, equal to `mixHex` and to what `sample` returns for a two-stop map of the same ends; at 8-bit the index is `nearestAnsi256` of the same mix; at 4-bit `0.49` is `from`'s curated index and `0.51` is `to`'s, and no `t` yields a third; at 1-bit every `t` is `undefined`; a `palette` ramp at index 9 is `categorical.c2`; a colormap ramp at 4-bit is `undefined`.
- **T1.36** (I21, §4c.1, C12): the glyph set the two shipped picture-cell constructors actually emit **in a cell that carries a background** is read off the 24-bit and 8-bit terminal goldens for `sankey-*` and `plot3d-*`, and every one of it is admitted by `isPictureGlyph`. The set is asserted as a set and its size reported: sankey's is exactly `{▀}` and `plot3d`'s is the block elements plus braille. **The row that makes the alphabet evidence rather than a stipulation** — an admission list derived from the same table the constructors read agrees with itself and passes on any addition, which is T2.20's reason one artefact along.
- **T1.37** (I21, §4c.1): **the fabricated violation, at both constructors.** A sankey cell built with a lower owner and a letter in it, and a `plot3d` mixed cell built with a background and a letter in it, are each **refused** — and the same call with the alphabet's own glyph is accepted, which is the control the refusal needs to not be vacuous. Asserted at the constructor rather than through a rendered figure, because no figure the tree can produce reaches the guard; that is the point of it.
- **T1.22** (I33): for each of `bold`, `italic`, `underline` and for each tone at depths 24, 8, 4 and 1, merging a span onto the resolved tone yields a `Style` whose `colour` and `background` are **identical** to the tone's and whose attribute is set — asserted on the pair, so a merge that routed through a slot fails on the colour and one that dropped the tone fails on the same line. **The tone arm** (C04 I89): for each pair of tones at each depth, a run whose span names the second tone paints with the second tone's `colour` — the object `resolveTone` returns, by reference — with the attribute still set on top, and the block's tone nowhere on the run.

### Tier 2 — contract / interface

- **T2.1** (I1): `resolveTone` called a thousand times returns identical styles and performs no I/O.
- **T2.22** (I27): `/theme`'s declared `enum` values equal the theme set's keys, for a set of three. Asserted against the set rather than against a list, because a list here is the defect one layer over (§5a.4).
- **T2.23** (I28, §5a.4): the contrast suite's coverage set is **derived**, asserted on the source. **A value comparison here is vacuous and the mutation pass proved it**: `["dark", "light"]` equals `Object.keys(defaultTheme)` for exactly as long as the shipped set has two members, so the row passed against the defect it was written for and would have begun failing at the moment it was meant to protect. The limit is stated in the row — it reads one file.
- **T2.24** (roadmap 24, A01 A.1): `high-contrast` clears **7 : 1** on every `meaning` slot against both grounds, `muted` is named separately because a passing sweep does not say which slot was in question, and the three greys stay ordered — quieter than `dim`, quieter than `default`. **The only thing standing between the name and a claim**, since the framework holds every theme to the minimum and has no way to be told about a promise.
- **T2.2** (I11): with the cache warm, results are identical to cold results for every key.
- **T2.3** (I5): for every shipped theme, the 4-bit mapping is injective across `{ok, warn, error, info, accent}` — the tones whose confusion would be misleading rather than merely dull.
- **T2.27** (I34, §4f.3): the SVG arm's page rect carries a fill equal to a hex **some member of `textSurfaces` holds**, on all three shipped themes — asserted against `textSurfaces(tokens)` rather than against `#1a1a1a`, so it is the property and not the value. Paired with the second half, because one without the other is satisfied by a page nobody paints: every `<text>` fill the arm emits is a slot whose floor clears against that same page hex.
- **T2.30** (I37): `refOf` and `CATEGORY_REFS` are exported from `theme/categorical.ts` and `plot/marks.ts` exports the **same** references — identity, not equality; `theme/**` imports nothing at run time from `blocks/**` or `plot/**`, read from comment-stripped sources. **The row's first draft asserted `blocks/**` imports nothing from `plot/**`, and it failed on `kinds/image.ts` — the measurement that corrected §4h's reason.**
- **T2.28** (I34, §4f.2): the page, the sankey halo, the tile-label ink and the inter-tile separator stroke are **one hex** in the emitted document. Four sites and one constant, asserted as an equality across the four rather than four assertions against a literal — the halo is the page showing through, and a change that moved one of them would leave a visible dark rim no byte-compare can name.
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
- **T2.29** (I35, §4g.3): the decoration pairing is **exactly** the eight `categorical` slots against exactly the two members of `textSurfaces`, in every shipped theme, asserted by equality on the pairing rather than on its results — T2.14b's form, and for its reason: the widened alternatives pass or fail on grounds the results cannot show. `spectrum` is asserted **absent** from it, since a palette measured out of the pairing and quietly kept in it is the drift T2.14c exists to stop.
- **T2.29a** (I35, §4g.1): every pair the pairing names clears 4.5 : 1, recomputed from the shipped tokens rather than read from A01 A.1 — 48 ratios, the same shape as T2.4 and T2.14a. The tightest is named separately (light `c4` on `bgElev`, 4.74), because a passing sweep does not say which slot was in question.
- **T2.29b** (I35, §4g.2, → C12): every `<text>` fill the SVG arm emits is a slot **either** `textSurfaces` pairs at §4's floor **or** `decorationTextPairs` pairs at its own — asserted over the catalogue, which is the generalising cell of §4g.2's table and the row that would have found the outline label, the graph node label and the unboxed hierarchy label had it existed. It replaces T2.27's page-coloured exemption with a delegation: a fill equal to the page is skipped only after the page is shown to be a ground the pairing covers.
- **T2.14b** (I22): the diff surfaces are checked against **exactly** those twelve slots and no others. Asserted on the pairing itself rather than on its results: widening the check to every `meaning` slot would fail on tones that never land on a diff background, and narrowing it to `syntax` alone would leave the gutter unchecked on the surface it is drawn on.
- **T2.20** (I21): over every ref × every depth, a returned `background` is absent or a `ColourValue` — the T2.18 assertion for the second channel, with the kinds written out literally for the same reason.
- **T2.16** (I17): per palette, per variant, no two slots share a 24-bit value. This is the test that caught `key`/`number` and, less obviously, light `number`/`type` — the second was created by the contrast correction itself, so nothing but recomputation could have found it.
- **T2.18** (I24): over every ref × every depth, a returned `colour` is absent or an object whose `kind` is one of exactly `rgb`, `ansi256`, `ansi16` — never a string. The kinds are compared against a list **written out literally in the test**, the same shape as C05 T1.7c: a list derived from the type agrees with itself and passes on any addition.
- **T2.19** (I24): a source scan finds no string literal assigned to a `colour` field anywhere in `src/` (A03 SS36). Types stop this inside the tree; the scan is what stops it arriving through a cast, which is how a tag gets dropped in practice.
- **T2.17** (I17): at depth 8, `{ok, warn, error, info, accent}` resolve to five distinct values, per variant. I17's 24-bit half and T2.3's 4-bit half both miss this: two tones distinct in hex can quantise onto one 256-colour index, and that failure is invisible in truecolour — which is where every value was authored and every golden will be reviewed. `dim`, `muted` and `default` collapsing at low depth is acceptable and is deliberately not asserted.
- **T2.15** (§3): at depth 1, every `syntax` slot collapses to a typographic class and emits no colour code — including `syntax.key`.
- **T2.26** (I33, I31, C04 I89, C04 I90): at depth 1 a `tone: "identifier"` run on an `ok` notice paints with **no** SGR 1 where the rest of the row has it — the tone's collapse, uncompensated; at depth 4 a valued run writes no `48` and the row's bytes equal the unvalued row's; at depth 8 it writes `48;5;<n>` where `n` is `continuousColour`'s index for the same value, and at 24 `48;2` with `sample`'s hex — the same resolver a heatmap cell went through, asserted by calling it.
- **T2.25** (I33): at depth 1, `ok` with a bold span resolves to exactly `{ bold: true }` — the same object the tone alone gives — `default` with a bold span to `{ bold: true }`, and `muted` with a bold span to `{ dim: true, bold: true }`, painted as `1;2` in `sgr()`'s numeric order.

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
- **T3.35** (I36, C09 I53): a `shimmer` span rendered at 4-bit over ticks 0–4 is five byte-identical frames, each two colours; the same block at 24-bit is five distinct frames; at 1-bit the five frames equal the block toned `from`.
- **T3.34** (I34, §4f.1): a theme whose `bgDeep` is authored *toward* its tones rather than away from them loads and passes every floor — the light theme is that case at 2.44 for `muted` — because `bgDeep` is not checked and must not be. The row exists so that a later widening of `textSurfaces` fails here first, where the reason is written down, rather than in the token files where it reads as a bad colour.
- **T3.11** (I33): `unicode: "ascii"` with an italic span still paints SGR `3` — the attribute is not on the glyph axis — and the painted row's `cells()` equals the plain row's.

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
- **T6.86** (I34, §4f.3): reverting the SVG arm's page to `surface.bgDeep` → **T2.27 fails**, because `bgDeep` is not a member of `textSurfaces` — the property fails whatever hex the theme happens to hold, which is the class rather than the instance. T2.28 stays green under the same revert, since all four sites move together, and that is the row saying the two are asking different questions.
- **T6.87** (I34, §4f.2): moving the sankey halo, the tile-label ink or the separator stroke onto a slot of its own while the page stays `bg` → **T2.28 fails**. The halo is the page showing through a glyph; a second constant is a rim that a byte-compare golden records and cannot object to.
- **T6.88** (I35, §4g.3): restoring `validatePalette`'s blanket `decoration` exemption — that is, deleting the pairing rather than the `continue` — → **T2.29 fails**, and nothing else does. Every shipped ratio clears, so the revert is invisible in results and visible only in the pairing, which is T6.17's shape one palette over.
- **T6.89** (I35, §4g.3): taking the wide arm instead — dropping the `carries === "decoration"` skip so the family is checked against every surface → **T2.4 fails on the light theme**, on 7 of `spectrum`'s 9 stops, worst 2.36. The revert that looks like the simpler rule, and the measurement is the whole argument against it.
- **T6.93** (I36): a third band at 4-bit → T1.38's *no third index* row fails; a midpoint at 1-bit → T1.38's 1-bit row returns a value and C09 T3.71's byte-identity fails; motion surviving 4-bit → T3.35's five frames differ.
- **T6.94** (I37): a second `refOf` inside `blocks/ramp.ts` → T2.30's identity row fails; `theme/ramp.ts` importing the cycle from `plot/marks.ts` → T2.30's direction row names the file.
- **T6.91** (I21, §4c.1): widening `isPictureGlyph` to admit any non-alphanumeric — the shape a reader reaches for when the ASCII arm's `-` is noticed → **T1.35 fails on `#`, `=` and `-`**, and the brand slides from the background channel back onto the alphabet, which is the ruling §4c.1 turns on.
- **T6.92** (I21, §4c.1): dropping the refusal at either constructor — `sankey.ts`'s `cell` or `scatter3.ts`'s `span` — and keeping `isPictureGlyph` exported → **T1.37 fails on that site alone**, and every golden stays byte-identical. This is the revert that is invisible in results: no input the tree produces reaches the guard, so the whole of its value is that a *later* caller cannot get a word into a painted cell, and a green suite is exactly what a removed guard looks like.
- **T6.90** (I35, §4g.1, → C12): repainting the callout in `tone.muted` so both arms take a furniture slot → **T2.29b passes** and C12's own agreement rows fail, which is F382 arriving again: a name in a colour the thing it names is not drawn in. Recorded here because this is the revert §4g.3 refuses, and the row that catches it is not this component's.
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
- **T6.84** (I33): resolving a span attribute through `resolve` or a slot → T1.22 fails on `colour`; gating italic on `caps.unicode` → T3.11 fails; adding an `underline` fallback for an absorbed 1-bit bold → C04 T3.67's identical pair fails, which is the row that says the absorption is a ruling and not an oversight.
- **T6.85** (I33, C04 I89, C04 I90): composing a span's tone *with* the block's (`{ ...block, ...spanTone }`) rather than replacing it → T1.22's tone arm still passes on `colour` and **T2.26 fails at 1-bit**, where the `ok` block's `bold` survives under the `identifier` run — the row that shows composition and replacement differ only where a tone carries an attribute; painting a valued background at 4-bit through `nearestAnsi16` or a fixed index → T2.26's 4-bit pair fails, and C09 T3.66's 4-bit identity with it; a valued background written through `withBackground` from a surface ref → T2.26's 8-bit arm fails on the index.

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
