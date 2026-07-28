# C10 — Theme resolution

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` (mechanism + a default set) + app (its own tokens) |
| **Layer** | L1 presentation |
| **Depends on** | C04 (`Tone`) · `TerminalCapabilities` injected |
| **Consumed by** | C09 C11 C12 (every renderer) · L4 (`/theme`, config persistence) |
| **Source** | A01 D29, D36, F4 · A01 Appendix A.1 · A02 §2, §6 |
| **Status** | Draft |

---

## 1. Purpose

C10 turns a semantic tone into something a terminal can print. That indirection is what makes theme switching and colour degradation mechanical: `C09` asks for `ok` and gets back a style, and neither the block nor the theme knows what terminal it is on.

It also owns the promise that makes degradation safe. **No information is carried by colour alone** (D29) — so when colour disappears entirely, nothing is lost, because the semantic weight was never in the colour to begin with. C10's job at 1-bit is not to invent ten distinguishable monochrome styles; it is to collapse honestly to three and let the glyph carry the meaning.

---

## 2. Tokens

```typescript
type PaletteSpec = Readonly<{
  slots:      Readonly<Record<string, string>>;   // slot name → 24-bit hex
  carries:    "meaning" | "decoration";
  monochrome: "typographic" | "foreground";       // what 1-bit collapses to
}>;

type ThemeTokens = Readonly<{
  name:     string;
  variant:  "dark" | "light";
  palettes: Readonly<Record<string, PaletteSpec>>;
  surfaces: Readonly<{
    bg: string; bgElev: string; bgDeep: string;
    border: string; borderStrong: string;
  }>;
}>;

type ThemeSet = Readonly<{ dark: ThemeTokens; light: ThemeTokens }>;

type ColourRef = `${string}.${string}`;            // "tone.ok", "syntax.keyword", "spectrum.3"

type Style = Readonly<{
  colour?:    string;                 // already resolved to the terminal's depth
  bold?:      boolean;
  dim?:       boolean;
  inverse?:   boolean;
  underline?: boolean;
}>;

function resolve(ref: ColourRef, theme: ResolvedTheme, caps: TerminalCapabilities): Style;
function resolveTone(tone: Tone, theme: ResolvedTheme, caps: TerminalCapabilities): Style;
```

**A block names a palette slot; it never embeds a value.** That indirection is the whole point — it is what makes theme switching a swap, degradation mechanical, and contrast checkable. Scarcity was never the point, and an earlier draft forbidding all non-tone colour needed an escape hatch on its second real use, which is how you know a rule is wrong.

### The three shipped palettes

| Palette | Carries | Contrast floor | At 1-bit | Consumed by |
|---|---|---|---|---|
| `tone` | meaning | yes | typographic classes (§3) | everything semantic |
| `syntax` | meaning | yes | typographic | `code` blocks only |
| `spectrum` | decoration | none | default foreground | declared app art only |

`resolveTone` is a convenience over `resolve` for the `tone` palette, which is the overwhelmingly common case and keeps `tone: "ok"` as the ergonomic form.

**`syntax` exists because ten semantic tones are genuinely thin for highlighting.** Keyword, string, comment, number, type, function, operator and punctuation are eight distinct roles, and cramming them into `meta`/`info`/`accent`/`identifier` makes a YAML promote preview and a JSON envelope both worse. Prism renders one or the other on nearly every command.

### Adding a palette

An app may register its own. It declares `carries` and `monochrome`, and the two are constrained together:

- `carries: "meaning"` → the contrast floor applies **and** a typographic fallback is required, so nothing is lost at 1-bit.
- `carries: "decoration"` → exempt from contrast, collapses to the foreground, and **lint forbids its use outside declared art**.

That constraint is what keeps D29 true as the palette count grows: a decorative palette used to distinguish states would carry information in colour alone, and the declaration is what makes that checkable rather than a matter of discipline.

Themes are authored in 24-bit hex regardless of the terminal. Degradation happens at resolution, so a theme file is written once and works everywhere.

`theme` remains a required field of `TuiConfig` (A02 §6) — but `defaultTheme` exists so satisfying it is one line. A framework with no themes at all would make the reference app awkward for no gain; a framework that silently picks one would hide a decision the app should own.

Prism's two token sets are in A01 Appendix A.1. The light variant is **Atom One Light**, not Solarized — `j22`'s wording is wrong and Appendix A wins.

---

## 3. The degradation ladder

| Depth | Resolution |
|---|---|
| 24-bit | Hex emitted directly |
| 8-bit | Nearest entry in the 256-colour cube by perceptual distance, with the **rank order of tones preserved** |
| 4-bit | A **curated tone → ANSI mapping per theme**, not computed |
| 1-bit | No colour at all; typographic style only |

**The 4-bit rule is the one that matters.** Computing nearest-of-16 by RGB distance collapses tones onto each other — `dim` and `muted` both land on bright black, `warn` and `accent` both on yellow — and the result is a UI where distinctions silently vanish. Sixteen slots for ten tones needs a human decision, so each theme declares its own mapping and the framework validates that it is injective across the tones that must stay distinct.

At 8-bit, "rank order preserved" means that if `dim` was darker than `default` in 24-bit it remains darker after quantisation. Nearest-neighbour alone can invert a pair; the resolver corrects for it.

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

Every tone is checked against the variant's `bg` **at theme load**, not at render. A theme that fails is rejected with a named error listing the offending tones.

| Tone group | Minimum ratio |
|---|---|
| `default` `ok` `warn` `error` `info` `accent` `meta` `identifier` | 4.5 : 1 |
| `dim` | 3 : 1 |
| `muted` | 2.5 : 1 — intentionally recessive, but must remain readable |

Terminal contrast is not a perfect analogue of a browser's — background colours are the emulator's and a user may override them — so these are a floor against obviously broken themes, not an accessibility certification. That distinction is worth stating rather than implying compliance.

**User overrides are validated identically.** An override that makes `error` invisible is rejected, the base theme retained, and a notice committed. Silently accepting it would produce a session where failures cannot be seen — the single worst outcome a theme system can have.

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
- **I2** — At `colourDepth: 1`, no `Style` carries a `colour`, and no colour escape is emitted anywhere — for tones **or** surfaces.
- **I3** — Contrast is validated at load. A failing theme or override is rejected, never partially applied.
- **I4** — An invalid override leaves the current theme exactly as it was.
- **I5** — The 4-bit mapping is declared per theme and injective across tones required to stay distinct.
- **I6** — 8-bit quantisation preserves the lightness rank order of tones.
- **I7** — C10 triggers no repaint itself. It reports a change; L4 invalidates.
- **I8** — Surfaces follow the same degradation ladder as tones, and vanish entirely at 1-bit.
- **I9** — No tone resolves to the variant's own `bg`.
- **I10** — Switching is atomic; no render observes a partially applied theme.
- **I11** — The memo cache is keyed on `(tone, themeName, colourDepth)` and cleared on every switch and override.
- **I12** — C10 reads no environment; capabilities are injected (C02 I5).
- **I13** — Tokens are authored in 24-bit hex only; no theme file contains an ANSI index or a terminal-specific value.
- **I14** — A block names a palette slot and never embeds a colour value.
- **I15** — Every palette declares `carries` and `monochrome`; a `meaning` palette is contrast-validated and has a typographic fallback, a `decoration` palette is neither and is lint-restricted to declared art.
- **I16** — `syntax` is consumed only by `code` blocks; `spectrum` only by declared art.

---

## 8. Commitments

1. Tones resolve to styles; blocks never see colours.
2. Themes are authored in 24-bit hex and degrade at resolution.
3. The 4-bit mapping is curated per theme, never computed by nearest-RGB.
4. 8-bit quantisation preserves rank order.
5. At 1-bit, ten tones collapse to three typographic classes, and glyphs carry the meaning.
6. Contrast floors are validated at load; failures are rejected with named tones.
7. Overrides are validated identically; an invalid one changes nothing.
8. Switching is atomic; L4 invalidates the frame, C10 does not.
9. Surfaces degrade on the same ladder and are absent at 1-bit.
10. Resolution is memoised and the cache is cleared on any theme change.
11. `defaultTheme` ships so the required `theme` field is one line to satisfy.
12. Prism's light variant is Atom One Light; A01 Appendix A wins over `j22`.

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
- **T1.10** (I6): a token set whose 8-bit nearest neighbours would invert `dim` and `default` → resolution corrects the order.
- **T1.11**: `muted` at 2.5:1 passes; at 2.0:1 fails.
- **T1.12** (I8): at depth 1, every surface resolves to an empty `Style` — no background is painted.
- **T1.13** (I8): at depth 4, surfaces use the curated mapping, not computed nearest.

### Tier 2 — contract / interface

- **T2.1** (I1): `resolveTone` called a thousand times returns identical styles and performs no I/O.
- **T2.2** (I11): with the cache warm, results are identical to cold results for every key.
- **T2.3** (I5): for every shipped theme, the 4-bit mapping is injective across `{ok, warn, error, info, accent}` — the tones whose confusion would be misleading rather than merely dull.
- **T2.4** (I3): every shipped theme passes every contrast floor. A theme cannot ship failing its own rule.
- **T2.5** (I13): a source scan finds no ANSI index or terminal-specific value in any theme file.
- **T2.6** (I12): a source scan finds no `process.env` read in `theme/`.
- **T2.7**: every `Tone` in C04's union has an entry in every shipped theme — exhaustive over the type, so adding a tone without tokens fails the build.
- **T2.8** (I16): a source scan finds no `syntax` reference outside `code` rendering, and no `spectrum` reference outside declared art.
- **T2.9** (I14): a source scan finds no hex literal in any block-producing module.

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
- **T4.5** (with L4): `/theme light` persists to config and survives a restart.
- **T4.6** (with L4): a corrupt theme override in config → base theme retained, notice committed, session opens normally.

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
