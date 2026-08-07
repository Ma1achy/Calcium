# C09 — Block library

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` |
| **Layer** | L1 presentation |
| **Depends on** | C04 (types, measurement contract) · C10 (`resolveTone` — same layer, acyclic) · `terminal/escapes.ts` (`sgr`, at run time — §3) · `TerminalCapabilities` injected |
| **Consumed by** | C11 C12 (register through it) · C13 C14 (measurement) · C15 (overlays render blocks) · L4 |
| **Source** | A01 D35–D37, F1 · A02 §2, §5 · C04 §5 |
| **Status** | Draft |

---

## 1. Purpose

C09 is where a `Block` becomes rows on a screen. It owns the **registry** — the pairing of each block kind with a `measure` and a `render` — and ships fourteen default kinds; `table`, `plot` and `patch` bring the union to seventeen.

The registry lives here rather than in C04 because `render` needs theme (L1) and capabilities (L0 terminal), and a registry at L0 data would import upward and sideways. C04 owns the schema and the measurement *contract*; C09 owns the implementations that satisfy it.

The obligation that dominates every decision in this component: **`measure(block, w)` must equal the number of rows `render(block)` occupies at width `w`.** C14 virtualises on measured heights without rendering, so a divergence does not produce a wrong-looking block — it produces a viewport that drifts as the user scrolls, which is far harder to diagnose. Every kind's two halves are written as a pair and tested as a pair.

---

## 2. Public interface

```typescript
type FocusState = Readonly<{
  blockId: string;
  rowId:   string | null;             // null = the block itself is focused
}>;

type RenderContext = Readonly<{
  width:        number;
  theme:        ResolvedTheme;        // C10
  capabilities: TerminalCapabilities; // C02, injected
  focus:        FocusState | null;    // C11 / C15 use it; most kinds ignore it
  tick:         number;               // monotonic animation counter — see below
  onAction:     (a: Action) => void;
  measureChild: MeasureFn;            // Seam 1, on the render side — see below
  renderChild:  (block: Block, width: number) => ReactElement;
}>;

function cells(text: string): number;          // grapheme-aware display width
function graphemes(text: string): readonly string[];   // the cluster stream, for C17
function clusterWidth(cluster: string): number;        // one cluster's cells
function truncate(
  text: string,
  width: number,
  caps: TerminalCapabilities,
  from?: "start" | "end",          // default "end" — removes from the end, keeps the start
): string;

// The two that operate on a line that already carries SGR (§5a).
function fitStyled(text: string, width: number, reset: string): string;
function sliceCells(text: string, from: number, to: number): string;

interface BlockDefinition<B extends Block = Block> {
  kind:    string;
  measure: Measure<B>;                // contract from C04; receives measureChild
  render:  (block: B, ctx: RenderContext) => ReactElement;
}

interface BlockRegistry {
  register(def: BlockDefinition): void;
  get(kind: string): BlockDefinition | undefined;
  seal(): void;
  measure(block: Block, width: number): number;
  render(block: Block, ctx: RenderContext): ReactElement;
  measureSequence(blocks: readonly Block[], width: number): number;
  renderSequence(blocks: readonly Block[], ctx: RenderContext): ReactElement;
  readonly kinds: readonly string[];
  readonly sealed: boolean;
}

function createBlockRegistry(opts: { defaults?: boolean }): BlockRegistry;
```

`measure` on the registry is the dispatcher, and it passes **itself** as each definition's `measureChild`. That is how `panel`, `group` and a table's expanded detail measure children whose kind they do not know, without any kind importing the registry.

`measure` and `render` on the registry are the dispatching entry points. An unregistered kind resolves to the `raw` definition rather than throwing — a document referencing an unknown kind still renders, degraded.

**`measureSequence` and `renderSequence` are where `gapBefore` is applied** (C04
§3a). A block's own height never includes the gap before it, so a sequence —
a document's top level, a `panel`'s children, a `column` group's children — is
`Σ measure(b, w)` plus one row per block declaring `gapBefore`. Stated once, on
the registry, because every composer needs the same arithmetic and a composer
that inserted spacing of its own would make a document's height unknowable from
the document (C23 §2). A `row` group is not a sequence: its children sit side by
side, so a gap before one of them is ignored rather than being an error.

**`renderChild` and `measureChild` are Seam 1 on the render side, and the registry passes itself for both.** A container renders children whose kind it does not know, for the same reason it measures them, and neither may import the registry (I7). `measureChild` is on the context because a container's *frame* has to be as tall as its contents: `panel` draws a border column of `measureChild(child, w - 2)` rows beside children rendered at that width, and the title lives in the top border (S13), which is why the border is drawn rather than delegated to a box-drawing option. That makes I1 visible instead of silent in the one place a violation would otherwise hide — a `panel` whose measurer and renderer disagree draws a border that does not close. **`footer` sits in the bottom border for the same reason `title` sits in the top**, and changes nothing about measurement: the row is drawn either way, so this is a use for a row that already exists rather than a new one. S12 §2 and S13 §2 both draw it, and neither can put those keys in the frame's footer — a pushed view leaves header and footer untouched (C15 T4.4).

**Animation state arrives through `ctx.tick`.** `steps` shows a spinner, and a renderer must stay pure, so the frame index cannot come from a clock inside the block. `tick` is a monotonic counter incremented by C03's `spinner` commit; a renderer computes `frames[tick % frames.length]`. Nothing else in C09 reads it, and `measure` never does — animation must never change height.

**No block renderer reads the environment.** Capabilities arrive through `ctx`, never from `process.env` — C02's I5 extends here, and a renderer probing for itself is the bug that produces a table in ASCII beside a sparkline in Unicode.

---

## 3. The seventeen kinds

Each is a `measure`/`render` pair. The measurement column restates C04 §3 as an obligation on the implementation.

| Kind | Measure | Notes on render |
|---|---|---|
| `rule` | 1 | Label, optional meta, then a fill to `width`. **An empty label draws an unbroken line** (I21) |
| `notice` | `ceil(cells(text) / w)` | Glyph, then wrapped text; `error`/`warn` require the glyph (C04 I5) |
| `keyValue` | rows | Two columns; key column sized to the longest key, capped at 20 |
| `table` | delegated to C11 | Registered by C11, not here |
| `steps` | steps | Spinner frame while active; tick or cross when settled |
| `logs` | lines | **Never wrapped.** Timestamp and level are fixed-width; the **message** takes the residual and truncates. Predictable height is what makes a tail scroll smoothly |
| `events` | events | Timestamp, type, message on one row; message truncated |
| `plot` | delegated to C12 | Registered by C12 |
| `progress` | 1 | Label, bar, percentage; bar takes the residual width |
| `code` | lines, or wrapped lines when `wrap` | Syntax highlighting via the **`syntax` palette** (C10 §2), not tones — eight roles do not fit ten semantic slots. Truncates by default; wraps when `wrap: true` |
| `comparison` | rows + 1 | Field, a, b, comparator; three equal columns |
| `pills` | `ceil(totalCells / w)` | One logical row that may wrap |
| `tip` | `ceil(cells(text) / w)` | Dim, with fill actions |
| `panel` | children + 2 | Border, title and footer; children measured at `w - 2` |
| `group` | sum or max of children | `column` sums children measured at `w`; `row` takes the max of children measured at `floor((w - gaps) / n)`, one cell of gutter between each pair (C04 §3) |
| `raw` | lines | Pre-formatted, emitted as-is with control characters stripped |

**Every measure in this table is floored at 1** for a block that is present (C04 I17). `ceil(cells("") / w)` is 0, and an empty `notice` still renders as a row; the floor is a rule over the table rather than a clause in three of its entries. The one legitimate zero is a container with no children, which is the absence of content rather than empty content.

**Container widths are C04 §3's, not each measurer's invention** — `panel` and a table's expanded detail at `w - 2`, a `column` group at `w`, a `row` group at the equal split. A measurer that passes `w` through unchanged to a child agrees with nothing that renders, and it is the failure mode I1 cannot catch on its own, because it only shows once a child wraps.

`table`, `plot` and `patch` are declared in C04's union but registered by C11, C12 and C25. C09 owns the registry and fourteen kinds; those three are large enough to be their own components and register into the same registry as an app-defined kind would — which is the proof that the extension mechanism is real rather than privileged.

That it is three rather than one matters. A single privileged exception is indistinguishable from a special case; three components using the same public `register`, each removable by deleting its call, is the mechanism being exercised rather than described.

### What a renderer emits, and what Ink is for

**A renderer emits SGR. It never sets an Ink colour prop.** C10 resolves a tone
to a `Style` whose colour names its own depth (C10 I24), and the renderer
switches on `colour.kind` to write `38;2;r;g;b`, `38;5;n` or a 30–37 / 90–97
index. The sequence itself comes from `terminal/escapes.ts`, which A03 SS14
already names as the one module permitted an escape literal — and an SGR
sequence is an escape literal, so this follows from the rule that exists rather
than needing a new one.

Ink's `color` prop is refused for two reasons, and the second is the one worth
writing down. It re-derives the depth from the string's *format*, discarding the
tag I15 exists to carry — two answers to one question, and the wrong one wins
because it is the one Ink acts on. And the colour library behind it decides how
much colour to emit from its own environment detection, which reports **no colour
at all under a test runner**: goldens would pass in monochrome forever while
production rendered truecolour, which is a suite verifying a rendering nobody
ships. A03 SS37 makes the prop unwritable rather than discouraged.

**A container whose two halves disagree draws a frame that does not close.** That
is the reason `measureChild` is on the render context, and it is worth more than
the requirement that prompted it. `panel` draws its own border because S13 puts
the title inside it, and drawing the border means sizing the border column — from
`measureChild`, because the frame must be as tall as the contents are *measured*
to be. So the container contract checks itself: a child whose measurer and
renderer disagree by a row produces a border with a gap in it, in the frame, at
the moment it happens. Everywhere else in the system an I1 violation is silent
until a viewport drifts six screenfuls later, which is why this one is stated
here rather than left as an implementation detail — a future container that
delegated its frame to a layout engine would lose the property without anything
failing.

**This is the first runtime dependency from L1 on L0-terminal**, and it is
required rather than merely allowed. Everything at L1 has so far touched
`terminal/` through injected data and type-only imports; `presentation/blocks/*`
importing `escapes.sgr` at run time is a new edge. It is legal — A03 MG1 forbids
*upward* imports and L1 → L0 is downward — and it does not weaken the
parallel-build property, which is L0's two halves not importing each other. It is
recorded here so that a later tidying of the import is recognisable as wrong.
A03 asserts it stays the only one: nothing in `src/presentation/` imports from
`src/terminal/` beyond `escapes.js` and type-only capability imports.

**Ink paints; it does not lay text out.** C09 breaks and truncates every line
itself, through `cells()`, and hands Ink strings that already fit. Ink's own
wrapping and truncation are not usable here: its truncation marker is `…`
unconditionally, which is not the 1:1 ASCII substitution §4 requires, and a
renderer that let Ink decide where a line breaks would be measuring one layout
and rendering another.

**C09 relies on Ink's layout width agreeing with `cells()`, and the agreement is
asserted rather than assumed.** Ink still computes width for box sizing and
alignment, using its own implementation; `cells()` is ours, because a width
library would not be the implementation the measurer uses (DEPENDENCIES.md). Two
implementations of one number is exactly the drift I6 exists to prevent, and here
it cannot be removed — only pinned. T2.16 pins it over the adversarial corpus. A
divergence is a finding about **which of the two is right**, reported before it is
worked around; it is not a tolerance to widen.

### Wrapping versus truncation

The distinction is deliberate and per-kind.

**Wrapped** — `notice`, `tip`, `pills`. Prose and chips, where losing the tail loses meaning.
**Truncated** — `logs`, `events`, table cells. Structured lines where the leading text carries the information and predictable height matters more than completeness.
**Caller's choice** — `code`. A JSON dump truncates harmlessly; a YAML manifest does not, because a truncated manifest is a *different manifest* that someone will read as the real one. Only the producer knows which it is, so `wrap` is a field rather than a policy.

Nothing wraps that a viewport would rather measure cheaply.

---

## 4. Capability fallbacks

Every substitution is **1:1 by column count** (C04 §5). This is the constraint that keeps measurement honest under degradation.

| Unicode | ASCII | Cells |
|---|---|---|
| `─ │ ┌ ┐ └ ┘ ├ ┤` | `- \| + + + + + +` | 1 |
| `…` | `~` | 1 |
| `↑ ↓` | `^ v` | 1 |
| `▁▂▃▄▅▆▇█` | `.:-=+*#@` | 1 |
| Braille plot | Block plot | same grid |

### The `Glyph` vocabulary

C09 owns both renderings of every glyph a block can name (C04 §5). A block names the slot; this table is the only place either character exists.

| `Glyph` | Unicode | ASCII | Rôle |
|---|---|---|---|
| `ok` | `✓` | `+` | Succeeded, healthy, valid |
| `warn` | `▲` | `!` | A warning that does not suppress success |
| `error` | `✗` | `x` | Failed |
| `info` | `ℹ` | `i` | Informational, no judgement |
| `pending` | `◌` | `.` | Not started |
| `working` | `◐` | `%` | Starting, connecting, installing — in progress |
| `running` | `●` | `*` | Running, steady state |
| `queued` | `○` | `o` | Accepted, not yet running |
| `cancelled` | `⊘` | `/` | Stopped by request |
| `expand` | `▸` | `>` | A collapsed row |
| `collapse` | `▾` | `v` | An expanded row |
| `live` | `▌` | `\|` | The live-state gutter (D6) |
| `bullet` | `•` | `-` | A list marker with no status meaning |

**Why this is a closed union and not a string.** While the field was free, C09 emitted a block-supplied character verbatim — so the 1:1 guarantee held for the glyphs C09 chose and silently did not hold for the ones an adapter wrote. That is a guarantee that is mostly-true, and mostly-true fails only under `LANG=C`, only for the users least able to describe what they are seeing. It also drifted immediately: before tokenisation the tree carried `✗`, `✖`, `*`, `+` and `▲` in glyph positions, across five files, for three rôles.

**`working` is distinct from `running` and `pending`**, and is in the vocabulary because S11 and S15 illustrate it — `◐ connecting`, `◐ mlflow starting`, `◐ layers installing`. Three states looked like two until the surfaces were read.

**Anything outside the vocabulary is text, not a glyph.** `↗ open`, `⊘ cancel`, `⬡ pods` and `≡ logs` are action labels and footer hints — text that happens to begin with a character, never a glyph slot — and their behaviour under ASCII is the app's. That is what keeps this table's guarantee absolute rather than nearly absolute.

**No substitution may change cell count.** `…` → `...` would be three cells where the measurer assumed one, and every log line's truncation point would shift — silently, only for users with a non-UTF-8 locale.

Where no 1:1 substitution exists, the *content budget* changes at measure time instead, which requires the measurer to see capabilities. **No default kind requires this**, and adding one that does is a design decision, not an implementation detail.

Colour degradation is C10's; C09 names a palette slot and renders whatever style comes back. `code` is the only kind that names anything outside the `tone` palette.

---

### The rule is about who can substitute, and the framework exempted itself

§4 says a glyph is a **slot** and never a character, because substitution is 1:1 by
column count and **only the renderer knows the capability**. That argument is about
*where the knowledge is*, not about who owns the character — and it was written about
what a **block** carries. The framework's own authored text was never held to it.

Measured over `src/`, excluding comments (F122):

| | |
|---|---|
| string literals carrying a non-ASCII character | 164 |
| …prose punctuation only — em dash, `§`, `·` | 106 |
| …reported by SS47 | **58** |
| …of those, the glyph table itself | 43 |
| …carrying their own ASCII form already | 5 |
| …a developer's report, never a frame | 4 |
| **…drawn verbatim into a frame** | **6** |

**Four working sites are what make this a defect rather than a wish.** `text.ts`
resolves `caps.unicode === "ascii" ? "~" : "…"`, `patch/collapse.ts` carries a pair,
`patch/definition.ts` picks its rule character, `plot/ramp.ts` has a whole ASCII ramp.
The mechanism is not missing. **It is applied in four places and skipped in six**, and
a discipline holding four times in ten is what a scan is for rather than a rule.

**Three of the six bypass a function that already holds their fallback.**
`spinnerFrames(caps)` returns an ASCII set and `shell/paint.ts` hardcodes `⠋` two files
away; `GLYPH_TABLE.expand` is `["▸", ">"]` and `shell/confirm.ts` writes `▸`;
`collapse.ts` carries `["⋯", "..."]` and `paint.ts` declares its own `⋯`. For those
there was nothing to rule — there was a function nobody called. F55 filed this as
*wanting a ruling*, and half of it wanted a call.

**The other three are the ruling, and they divide by where the text is authored.**

- **The capability is in hand.** `paint.ts`'s spinner sits inside a function holding
  `deps`. One line.
- **The function is shared with the measurer.** The prompt is drawn by `commandRows`,
  which `construct.ts` also calls for `chromeRows` — so its two forms must be **1:1 by
  cell count** (I22) or `measure` and the composer describe the same row differently.
  `❯ ` and `> ` are both two cells, and `PROMPT_GUTTER.first` is that number.
- **The text is authored above the renderer.** `loading…` is built by a builder,
  `… n more` by C19, `▸` by C15's caller. These are **unsubstitutable by construction**:
  the string is fixed at L3 or L4 and the capability is known at L1. C09's answer already
  exists and is the glyph slot — so a mark in framework text is a slot, or it is ASCII.

**`…` gets no slot, and that is the interesting refusal.** I5 requires 1:1 by cell count
and the ASCII ellipsis is three cells; the pair that satisfies it is `["…", "~"]`, which
`text.ts` already uses for truncation and which reads as a marker rather than as an
elision anywhere else. So `loading…` becomes a notice carrying the `pending` glyph — the
mark it actually wanted — and `… n more` becomes ASCII. **A vocabulary that admits every
character its callers reach for stops being a vocabulary**, and the refusal is what keeps
the 1:1 rule true.

## 4a. Syntax tokenisation

C10 defines a `syntax` palette; this is where the tokens come from. `Code` is `{kind, id, language, text, wrap}` — text and a language name, no spans — so something has to turn one into the other, and it is not the adapter.

**Tokenisation happens at render, never in the adapter.** Adapters are pure and must not do work proportional to content length (C07): a manifest arriving over a transport should not be highlighted on the way in, because most documents are never scrolled to. Results are **memoised on `(text, language)`**, which is what keeps a re-render of the same block free.

**Measurement ignores syntax entirely.** Tokens change appearance, never line count, so `measure` never tokenises. This keeps I1 cheap and has a consequence worth stating: a `code` block measures identically whether or not its language is registered, so a language shipping tomorrow does not reflow yesterday's transcript.

**An unregistered language renders as plain text, not an error** — the same principle as C07's fallback adapter. A language nobody has registered is readable today and highlighted whenever someone registers it.

### `hljs` class → palette slot

`lowlight` emits a hast AST carrying highlight.js class names. The mapping is explicit rather than derived, because a derived mapping silently changes when the upstream grammar does:

| `hljs` class | Slot |
|---|---|
| `hljs-keyword` | `syntax.keyword` |
| `hljs-string` | `syntax.string` |
| `hljs-comment` | `syntax.comment` |
| `hljs-number`, `hljs-literal` | `syntax.number` |
| `hljs-attr`, `hljs-attribute` | `syntax.key` |
| `hljs-type`, `hljs-built_in` | `syntax.type` |
| `hljs-title`, `hljs-function` | `syntax.function` |
| `hljs-operator` | `syntax.operator` |
| `hljs-punctuation` | `syntax.punctuation` |
| anything else | the default tone — **never dropped** |

The fallback is a fallback, not a filter. An unmapped class renders its text in the default tone; it never renders as nothing, which is the failure mode where a grammar update makes half a file invisible.

Only the languages actually needed are registered — `createLowlight({ yaml, json })` — rather than highlight.js's full set, which is most of the package's weight and none of its value here.

---

## 5. Unicode measurement

`cells(text)` is the shared width function every measurer uses. Naïve length is wrong in five ways, all of which appear in real output:

| Input | Cells |
|---|---|
| CJK, fullwidth forms | 2 per glyph |
| Combining marks | 0 — folded into the base |
| Emoji with ZWJ sequences | 2 for the cluster, not per code point |
| Variation selectors | 0 |
| Control characters | Stripped before measuring |

Iterating code units is the defect this exists to prevent. `cells()` is grapheme-aware, shared by every kind, and tested independently, because a per-kind width calculation would be wrong in a different way in each.

**The cluster stream is exported for C17, and this is the `cells()` argument one layer down.** The editor's cursor is a grapheme index, so it needs where a cluster *ends* rather than how wide a string is — a different question with the same answer underneath. Constructing a second `Intl.Segmenter` in the editor would be two answers to "where does a cluster end", agreeing today and diverging on whichever ZWJ sequence the two Unicode versions disagree about; it is also a per-call cost on a module that already builds exactly one segmenter for the whole tree, deliberately (§5). `clusterWidth` comes with it because C17's layout walks clusters and asks each its width, which is what `cells()` does internally and cannot expose by returning a total.

Truncation is also grapheme-aware: a cut never lands inside a cluster, and a double-width glyph that would straddle the boundary is dropped rather than half-drawn.

**Wrapping is not truncation, and it had been treating an unplaceable cluster as though it were.** A cluster that does not fit the remaining width moves whole to the next row; a cluster wider than the *whole* line cannot be placed at all, and the wrap dropped it — at a usable width of 1, every CJK glyph and every emoji simply left the output. Both halves called the same function, so `measure` and `render` agreed and I1 held: the frame was arithmetically consistent and describing content it did not hold, which is the failure I1 cannot see.

It is substituted by a one-cell `?` (I19). Three answers were available and two are worse: placing it anyway overflows the row into one nobody counted, which is the alternate-screen scroll C09 exists to prevent, and a blank loses the fact that anything was there. `?` is one cell in every capability mode, which matters because `measure` receives no capabilities and so cannot choose a marker the way `truncate` does.

**How narrow this has to be, measured rather than assumed.** A cluster is at most 2 cells, so the substitution needs a usable width of exactly 1. Three of the four ways to reach it are degenerate — a 2-column terminal, a `notice` with a glyph at width 3, `panel` nesting at 2 columns a level. The fourth is not: a `row` group hands each child `floor((w − (n−1)) / n)`, floored to 1, which is 1 whenever `w ≤ 2n − 1` — sixty children at 120 columns, twenty at 40. **The boundary is child count, not terminal width.** No in-tree adapter builds a row group today, so it is latent rather than live; it is reachable through C24's public `group(direction, children)` at an ordinary terminal size as soon as an app builds one from a data list, which is R01 R4.4's reuse claim. Recorded with the figures so nobody restores the drop on the grounds that it only fires at width 1.

---

## 5a. A line that already carries SGR

`cells()` is wrong for a rendered line, and wrong in a way that looks right.
`stripControl` drops the ESC byte because it is a control character and keeps
`[38;5;241m`, which is ordinary printable text — so a themed row measures eleven
cells too wide per colour change. C22's frame padded every chrome row to eighty
*counted with the escapes*, which made the visible row about thirty-eight and
left the previous frame showing across the rest of it. `displayCells` and
`fitStyled` are that answer, and they live here rather than in C22 because this
is where display width is decided (I1, I6).

**`sliceCells` is the same question asked from the other end, and the frame
cannot composite without it.** Drawing a layer over a painted row means keeping
cells `[0, left)` of that row, writing the layer's cells, and keeping cells
`[left + width, columns)`. `fitStyled` answers the first. The third has no
expression as a `slice`: a cut by code unit lands inside an escape, `[38;5`
reaches the terminal as literal text, the SGR is never terminated, and the colour
bleeds down every row below — which is worse than the mis-measurement, because it
survives the frame.

So the tail is taken by the same grapheme walk, with two rules that are the whole
reason it is not a substring:

- **The skipped prefix's SGR is carried forward.** A style opened before `from`
  is still in effect at `from`; a tail that dropped it draws in the terminal's
  default colour, which reads as the layer having bled rather than as the base
  having lost its style.
- **A cluster straddling either boundary is dropped and its cell blanked**, never
  halved — I9's rule, applied to a window rather than to a cut. Half a
  double-width glyph is a row one cell wide, and a row wider than it was measured
  wraps into a row nobody counted.

I20's composition law is what makes the splice provably width-preserving, and it
is stated as a law rather than as three cases because the failure it prevents is
arithmetic: three pieces that each measure right and together measure `columns +
1` put the frame one cell into the next row.

---

## 6. Registry state machine

| From ↓ / call → | `register` | `seal` | `measure` / `render` |
|---|---|---|---|
| **open** | → open (T1.1) | → sealed (T1.2) | works (T3.1) |
| **sealed** | throw (T3.2) | no-op (T3.3) | works (T1.3) |

Sealing matches C05's manifest store and C07's adapter registry. A kind registered mid-session would let a block measured before registration differ from the same block measured after — drift that only appears on scrollback.

---

## 7. Invariants

- **I1** — For every registered kind, `measure(b, w)` equals the row count of `render(b, ctx)` at width `w`. The system's most load-bearing invariant.
- **I2** — `measure` is pure and total (C04 §5). No I/O, no clock, no throw on any input.
- **I3** — No renderer reads the environment. Capabilities and theme arrive through `ctx`.
- **I4** — No renderer emits a colour directly; all styling comes from `resolve` against a declared palette slot.
- **I5** — Every capability substitution is 1:1 by cell count.
- **I6** — `cells()` is the single width implementation; no kind computes width independently.
- **I7** — Container kinds measure children only through the injected `measureChild`. No kind imports the registry.
- **I8** — `measure` never reads `ctx.tick`. Animation changes appearance, never geometry.
- **I9** — Truncation never splits a grapheme cluster or leaves half a double-width glyph. **It takes the end it removes from as a parameter** — `"end"` by default, keeping the start; `"start"` keeps the tail and puts the marker at the head. Both are exactly `width` cells, both place one 1-cell marker, and neither splits a cluster: the two directions share one implementation for the same reason there is one `cells()`, because a second walk over the same grapheme stream would round differently at the boundary. Which end a column removes from is C04's `truncateFrom` (C04 I32) and the surfaces' decision; a middle truncation is not in the union — it spends its marker between two kept halves, which is different arithmetic, and it arrives with a clause here or not at all.
- **I10** — An unregistered kind renders through `raw`, never throws.
- **I11** — A renderer throwing is contained: that block renders as an error block, the rest of the frame is unaffected. Compute, so no retry (A02 §7 rule 2).
- **I12** — A sealed registry cannot be registered against.
- **I13** — Every kind in C04's union has a registered default definition. Asserted exhaustively over the type.
- **I14** — Whether a kind wraps or truncates is fixed per kind, not per block, so height stays a function of block and width. `code` is the one exception and it is explicit: the producer chooses through `wrap`, which is a field of the block and therefore visible to `measure`.
- **I15** — Renderers emit SGR through `terminal/escapes.ts`, switching on the depth tag; no renderer sets an Ink colour prop. This is the framework's only runtime L1 → L0-terminal edge, and it is deliberate: two ways of colouring a cell means two ways of degrading it, and only one of them would honour C10.
- **I16** — Ink's layout width agrees with `cells()`. C09 hands Ink pre-broken lines, so Ink's own idea of how wide a string is must match the measurer's or a line it considers too long wraps and adds a row nothing counted. Asserted (T2.16), never assumed — a silent disagreement here breaks I1 for every kind at once.
- **I17** — `gapBefore` is applied by the sequence, never by the block (C04 §3a, C04 I19). `measure` never counts it; `measureSequence` and every container do.
- **I18** — Control characters are stripped from every text field before measurement and render, by C09 and not by its callers. A far side's output cannot inject escape sequences into the frame: `\x1b[2J` cannot clear the screen, a cursor-position query cannot get its answer typed into the prompt, and a stray `\r` cannot make a measured row and a rendered row disagree. Stripping happens once, at the last point before both, so measurement and render cannot see different text.
- **I19** — Wrapping never deletes a cluster. A cluster wider than the line it must fit into is **substituted** by a one-cell `?`, never dropped: a row that silently loses a glyph is a frame that is arithmetically consistent and describing different content than it holds. Substitution rather than overflow, because a row wider than it was measured wraps into a row nobody counted — the one failure I1 exists to prevent. C17 I20 answers the same question the other way and says why: a block renders someone's data, an editor holds what the user typed.
- **I20** — A cell window over a styled line composes and preserves width: for every `0 ≤ a ≤ b`, `displayCells(sliceCells(t, 0, a)) + displayCells(sliceCells(t, a, b))` equals `displayCells(sliceCells(t, 0, b))`. The window carries the skipped prefix's SGR forward, so a tail draws in the style that was in effect where it starts, and it never splits a cluster or half-draws a double-width glyph — I9's rule over a window rather than a cut. This is what makes compositing a layer into a painted row width-preserving by construction rather than by three separate measurements happening to agree: three pieces that each measure right and together measure `columns + 1` put the frame one cell into a row nobody counted (§5a).
- **I21** — A `rule` with an empty label draws an unbroken line. The lead, the label and the fill are separated by spaces that exist to set a label apart from the line; with no label they are a two-cell gap at the left of a rule that is a boundary rather than a heading. Found by reading a frame — C19's menu edge (C19 I23) is the first unlabelled rule in the tree, and every assertion about it was about width and about the block being present, both of which held.
- **I22** — **Every non-ASCII character the framework draws is resolved against the capability, on the same terms as a block's glyph.** §4's argument is about where the knowledge lives, so it does not stop at the block schema: a mark in the framework's own text is a `Glyph` slot, or it is a pair resolved where the capability is in hand, or it is ASCII. A substitution used by a function the *measurer* also calls is 1:1 by cell count, as I5 requires of the vocabulary — the prompt is that function, and its cell count is `PROMPT_GUTTER.first`. Enforced by SS47 with a per-site allow-list, because the rule was already true of four sites and false of six, and a discipline with that record is not one a sentence fixes (F122).

---

## 8. Commitments

1. C09 owns the registry; C04 owns the schema and the measurement contract (I13).
2. Fourteen kinds ship here; `table` and `plot` register from C11 and C12 through the public mechanism (I13).
3. `measure` and `render` are written and tested as a pair, per kind (I1).
4. Wrapping versus truncation is a per-kind decision, documented in §3, except `code`, where the producer chooses via `wrap`. `code` names `syntax` slots; every other kind names `tone` slots (I14).
5. Every capability substitution is 1:1 by cell count (I5).
6. `cells()` is grapheme-aware and shared; no kind measures width for itself (I6).
7. Truncation is grapheme-aware, never leaves a half-drawn glyph, and takes the end it removes from as a parameter (I9).
8. Renderers receive capabilities and theme through context and read no environment (I3).
9. An unregistered kind degrades to `raw`; a throwing renderer is contained to its block (I10, I11).
10. The registry seals at composition end (I12).
11. Adding a kind whose measurer needs capabilities is a design decision, not an implementation detail (I2).
12. Renderers emit SGR through `terminal/escapes.ts`, switching on the depth tag; no renderer sets an Ink colour prop. This is the first runtime L1 → L0-terminal edge, and it is required rather than tolerated (I15).
13. Ink paints pre-broken lines. Its layout width must agree with `cells()`, and the agreement is asserted (T2.16), never assumed (I16).
14. No renderer emits a colour. Every style comes from `resolve` against a declared palette slot, so degradation, theme switching and the 1-bit collapse happen in one place instead of once per kind (I4). Enforced by SS17 and, for the Ink-prop route, SS37.
15. **Control characters are stripped from every text field before measurement and render** (I18). This is the only thing standing between a far side's output and the frame: a tool that emits an escape sequence cannot clear the screen, move the cursor, or query the terminal and have the reply arrive as typed input. It belongs in the summary because a reader deciding whether to trust the framework with untrusted output will not find it by reading fifteen invariants.
16. **Wrapping substitutes a cluster it cannot place rather than dropping it** (I19). It dropped, and both halves called the same function, so `measure` and `render` agreed and nothing failed — a frame arithmetically consistent and describing content it did not hold. The reach is a fact about child count rather than terminal width (§5).
17. **A line that already carries SGR is measured, fitted and windowed here, not by its caller** (I20, §5a). `displayCells` and `fitStyled` exist because `cells()` counts an escape as printable text; `sliceCells` exists because the frame cannot draw a layer over a painted row without taking a cell window out of one, and a `slice` by code unit cuts inside an escape and bleeds colour down every row below. Three answers to "how wide is this line" is I1's divergence in the one place that moves the whole frame.
18. **A `rule` with no label draws an unbroken line** (I21). The spaces around the label exist to set it apart from the fill, and with no label they are a gap in a boundary — found by reading a frame, which is the only instrument that reaches it: the block is present, the row is exactly the width, and every existing assertion holds.
19. **The framework substitutes its own marks, not only its blocks'** (I22). §4's rule is about who knows the capability, and it was written about what a block carries; six framework-authored characters reached the frame unresolved while four sites next to them did it correctly. Three of the six bypassed a function that already held their ASCII form, so half of what read as a missing mechanism was a mechanism not called (F55, F122).

---

## 9. Tests

Six tiers. Every cell of the §6 transition table is covered.

### Tier 1 — unit

- **T1.1**: `register` in open state → `get` returns it, `kinds` includes it.
- **T1.2**: `seal` → `sealed` true, existing kinds still resolve.
- **T1.3**: `measure`/`render` after seal → work normally.
- **T1.4**: each of the fourteen kinds measures its documented height on a canonical fixture — fourteen cases.
- **T1.5**: `keyValue` key column caps at 20 cells; longer keys truncate, values still align.
- **T1.6**: `logs` line longer than `w` → one row, ending in the truncation marker.
- **T1.6b**: a `code` block with `wrap: false` truncates; the same content with `wrap: true` wraps, and both measure to their rendered height.
- **T1.7**: `notice` text longer than `w` → wraps, and measurement matches the wrap count.
- **T1.8**: `panel` measures children at `w - 2`, not `w`.
- **T1.8b** (C04): a `panel` with a `footer` measures identically to one without, and renders its text in the bottom border with the border closing at the same width. Both halves, because a footer that changed the height would be a new row rather than a use of the existing one — and a height change is the failure `panel` reports as a border that does not close.
- **T1.9**: `group` in `column` sums children; in `row` takes the max.
- **T1.10** (I10): a block of unknown kind → renders via `raw`, no throw.
- **T1.11** (I18): text containing `\x1b[31m` → stripped; the frame carries no injected styling.
- **T1.12**: `steps` renders a spinner frame while active and a settled glyph after.
- **T1.13** (§5): the five ways naïve length is wrong — CJK, fullwidth, combining marks, ZWJ clusters, variation selectors — each a different wrong answer from `.length`.
- **T1.14** (I18): control characters are stripped before measuring, so a measured row and a rendered row cannot disagree.
- **T1.15**: an empty string is zero cells. The floor at 1 is a rule over the block table (§3), not a property of the width function.
- **T3.20** (I21): a `rule` with an empty label renders as an unbroken line at its full width, with a labelled rule beside it as the control. Reachable only by rendering: the block is present, `measure` says one row, and the row is exactly the width in both.
- **T1.16** (I20, §5a): `sliceCells` over a line carrying SGR — the window measures exactly `to − from` cells by `displayCells`, the escapes in the skipped prefix are re-emitted at its head, and a cut that lands mid-escape is impossible because the escape is copied whole. The failure is not a wrong width: it is `[38;5` reaching the terminal as text with the SGR never terminated, so the colour bleeds down every row below.
- **T1.16b** (I20): a double-width cluster straddling either boundary is dropped and its cell blanked, in both directions — the window is still exactly `to − from` cells and never `to − from ± 1`. Asserted at the left edge as well as the right, because the two are different code paths and only the right one resembles `truncate`.
- **T1.16c** (I20): the composition law over a styled line, for every split point — `sliceCells(t, 0, a)` and `sliceCells(t, a, b)` measure `b` together. A property over the splits rather than three chosen ones, because the case that breaks it is whichever `a` lands inside a cluster and no chosen `a` is that one by construction.

### Tier 2 — contract / interface

**The generic suite. Runs over every registered kind, including app-registered ones**, so a consumer's custom block is held to the same contract as the defaults.

- **T2.1** (I1, the headline): for every kind × the fixture corpus × widths {40, 60, 80, 100, 120, 160, 200}, `measure` equals the rendered row count. The most valuable test in the system.
- **T2.2** (I1): the same, under `unicode: "ascii"`.
- **T2.3** (I2): `measure` called a hundred times returns the same value and performs no I/O.
- **T2.4** (I2): the malformed corpus from C04 T2.3 — empty, null-ish, 10,000-character, adversarial — measures without throwing, for every kind.
- **T2.5** (I5): for every substitution in §4, `cells(unicode) === cells(ascii)`.
- **T2.6** (I13): every member of C04's `Block` union has a registered definition. **This is a composition-level test** — it runs after C11, C12 and C25 have registered, since C09 alone supplies fourteen of the seventeen.
- **T2.13** (§4a): `measure` performs no tokenisation — a spy on the tokeniser records zero calls across the fixture corpus, and a `code` block measures identically with its language registered and unregistered.
- **T2.14** (§4a): a YAML fixture produces the documented slots; every `hljs` class in the table maps to its slot, and an unmapped class renders in the default tone rather than being dropped.
- **T2.15** (§4a): a block whose `language` is unregistered renders as plain text with no error raised.
- **T2.12** (I8): for every kind, `measure` returns the same value across a hundred `tick` values.
- **T2.7** (I3): a source scan finds no `process.env` read in `blocks/`.
- **T2.8** (I4): a source scan finds no hex, ANSI or named colour in `blocks/`; `syntax` slots appear only in the `code` renderer.
- **T2.9** (I6): a source scan finds no width computation outside `cells()` — no `.length` on a display string.
- **T2.11** (I7): the module graph shows no kind importing the registry; container kinds resolve children solely through `measureChild`.
- **T2.16** (§3): over the adversarial corpus — CJK, ZWJ sequences, variation selectors, combining marks — `cells(s)` equals the width Ink lays `s` out at. The one number two implementations compute, held to agreement rather than assumed into it.
- **T2.17** (I4, §3): a source scan finds no `color=` or `backgroundColor=` prop in `src/presentation/` (A03 SS37), and no import from `src/terminal/` beyond `escapes.js` and type-only capability imports.
- **T2.18** (I17, C04 I25): a sequence measures `Σ` its blocks plus one row per `gapBefore`, and renders exactly that many; a `row` group ignores the field.
- **T2.10**: golden frames for every kind at four widths in both themes and both unicode modes.

### Tier 3 — edge cases

- **T3.1**: `measure` before `seal` → works.
- **T3.2** (I12): `register` after `seal` → throws.
- **T3.3**: `seal` twice → no-op.
- **T3.4** (I5, the classic): a `logs` line truncated under ASCII → the marker is `~`, one cell, and the row count matches Unicode's. The `...` regression, tested directly.
- **T3.5** (I9): truncating inside a ZWJ emoji sequence → the whole cluster is dropped, never split.
- **T3.6** (I9): a double-width CJK glyph straddling the boundary → dropped, and the residual cell is blank rather than half-drawn.
- **T3.7**: a combining mark immediately after the truncation point → does not orphan onto the next base.
- **T3.8**: width 1 → every kind returns ≥1 and renders something.
- **T3.9**: width 0 → treated as 1; no division by zero, no infinite loop.
- **T3.10**: text exactly `w`, `w-1`, `w+1` cells → 1, 1, 2 rows for wrapped kinds.
- **T3.11**: `panel` at width 2 → children measured at 0, clamped to 1; no negative width reaches a child.
- **T3.12**: `group` nested five deep → correct total, no stack overflow.
- **T3.30** (I22): a session at `unicode: "ascii"` draws a frame with no character above U+007F — asserted over the whole frame rather than per site, because a per-site row is a restatement of the fix and the seventh site is what this must catch. The controls are the frame at `full` still carrying `❯`, and the two forms measuring the same number of cells.
- **T3.13** (I11): a renderer that throws → that block renders as an error block; sibling blocks render normally.
- **T3.14** (I11): a *measurer* that throws → contained, block treated as height 1, logged. A throwing measurer must not break virtualisation.
- **T3.15**: `pills` whose chips exceed `w` → wraps, and the wrap count is measured correctly.
- **T3.16**: `code` containing tabs → expanded to a fixed stop before measuring, so measure and render agree.
- **T3.17**: a `notice` of 10,000 characters at width 80 → 125 rows, measured and rendered.
- **T3.18**: an app registering a kind that shadows a default → rejected, not silently overriding.

### Tier 4 — integration

- **T4.1** (with C11, C12): `table` and `plot` register through the public mechanism and satisfy the T2 suite identically to built-ins.
- **T4.2** (with C10): the same block in both themes produces identical row counts.
- **T4.3** (with C10): under `colourDepth: 1`, every tone resolves to a typographic style and status remains distinguishable by glyph alone (D29).
- **T4.4** (with C02): a `TERM=dumb` capability record drives every kind to its ASCII fallback consistently — no kind renders Unicode while another renders ASCII.
- **T4.5** (with C14): summed measured heights of a visible range equal the viewport height exactly.
- **T4.6** (with C14): expanding a table row shifts subsequent blocks by exactly the measured delta.
- **T4.7** (with C04): every document in C07's adaptation corpus measures and renders without error.

### Tier 5 — e2e

- **T5.1**: a session rendering every kind at four terminal widths, visually inspected against golden frames.
- **T5.2**: scrolling a 10,000-block transcript top to bottom → on-screen row counts match measured heights at every screenful. The drift test.
- **T5.3**: the same under `LANG=C` — ASCII throughout, no mojibake, no drift.
- **T5.4**: a real `--logs` tail at 1,000 lines/s → rows stay aligned, no reflow, no jitter.

### Tier 6 — fail-on-revert

- **T6.1** (I1): a measurer that under-counts wrapped lines by one → T2.1 fails at the wrapping width.
- **T6.2** (I5): changing the ASCII ellipsis to `...` → T2.5 and T3.4 fail.
- **T6.3** (I6): using `.length` for display width → T2.9 fails, and T3.6 fails on CJK.
- **T6.4** (I3): reading `process.env` in a renderer → T2.7 fails.
- **T6.5** (I4): emitting a colour directly → T2.8 fails.
- **T6.6** (I9): truncating by code unit → T3.5 and T3.6 fail.
- **T6.7** (I11): letting a renderer's throw propagate → T3.13 fails and the frame dies.
- **T6.8** (I11): letting a measurer's throw propagate → T3.14 fails and scrolling breaks.
- **T6.9** (I13): adding a union member without a definition → T2.6 fails at build time.
- **T6.10** (§3): wrapping `logs` instead of truncating → T5.4 shows reflow and T2.1 fails at narrow widths.
- **T6.14** (§3): ignoring `wrap` on `code` → T1.6b fails, and a YAML manifest renders truncated.
- **T6.11** (I18): passing control characters through → T1.11 fails.
- **T6.12** (I8): reading `tick` inside a measurer → T2.12 fails, and a spinner starts shifting the viewport.
- **T6.13**: a renderer calling a clock for its spinner frame → T2.7's environment scan fails, and golden frames flake.
- **T6.15** (§3): setting an Ink colour prop instead of emitting SGR → T2.17 fails, and every golden frame renders monochrome while production renders truecolour.
- **T6.17** (I17): counting `gapBefore` inside `measure` instead of at the sequence → a block measures differently in a document than in a panel, and T2.18 fails.
- **T6.16** (§3): letting Ink wrap or truncate rather than pre-breaking through `cells()` → T2.1 fails at the wrapping widths, and T3.4's ASCII marker becomes `…` again.
- **T6.18** (I20): dropping the skipped prefix's SGR from `sliceCells` → T1.16 fails, and a layer composited over a themed row leaves the row's tail drawn in the terminal's default colour, which reads as the layer having bled rather than as the base having lost its style.
- **T6.19** (I20): windowing by `slice` on code units instead of by cells → T1.16 and T1.16c fail; a frame composited from three pieces measures `columns + 1` and wraps into a row nobody counted.
- **T6.17** (I19): dropping a cluster wider than the line, as both wrappers did → T3.9d and T3.9e fail, and CJK leaves the output at a usable width of 1 with every measurement still agreeing.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| Tone → colour resolution, themes, degradation | C10 |
| Column priority, sort, expand rows | C11 |
| Braille rasterisation, axes, series scaling | C12 |
| Which blocks a verb produces | C07, and the S-series |
| Scroll state and virtualisation | C14 |
| Focus and action dispatch | C11, C15, C16 |
