# Scratchpad 6 — code and diff as editor surfaces

| | |
|---|---|
| **Status** | Working document. Nothing committed. |
| **Prompted by** | `patch` is git-shaped by its field names and by nothing else — no illustration pins it. `code` has no gutter, so it renders as a highlighted quotation rather than an editor view |
| **Scope** | C25 (unbuilt), C09's `code` renderer (built), C04's `Code` shape (built). §4 records a wanted editor surface, deliberately undesigned |
| **When** | After L1–L4. C25 is unbuilt so its half is free now; `code.startLine` is a small change to a built component and should wait for a reason to touch it |

---

## 1. What is already true

C25's field names commit to a git-style unified diff and nothing draws it:

```typescript
type Hunk = Readonly<{
  header: string;                        // "@@ -18,7 +18,9 @@"
  lines:  readonly Readonly<{
    kind:   "add" | "remove" | "context";
    text:   string;
    oldNo?: number;
    newNo?: number;
  }>[];
  collapsedBefore?: number;
}>;
```

Hunk headers, three line kinds, both line numbers per line, collapsed context.
Unified below 100 columns, split above — the opposite of S07's stacking call,
because a patch's content is *lines* and a split at 60 leaves 28 usable per side.

So the shape is right. What is missing is an illustration, which is the thing that
stops a renderer being written to a plausible reading of the fields. C09 §3's
sixteen kinds each have one; C25 has a measurement line and no picture.

`code` is `{ kind, id, language, text, wrap }`. Syntax highlighting via the
`syntax` palette and lowlight; no gutter, no line numbers, no current-line marker.

---

## 2. The `patch` illustration

Worth pinning exactly, because five things about it are decisions rather than
consequences.

```
▌ ── serving/volatility-estimator.yaml ─────────────────────────────────────────
▌
▌   ⋯ 14 unchanged lines
▌
▌   @@ -18,7 +18,9 @@
▌   18  18    spec:
▌   19  19      selector:
▌   20  20        matchLabels:
▌   21          -   app: volatility-estimator
▌       21    +   app: volatility-estimator
▌       22    +   prism.fmx.io/family: volatility
▌   22  23      replicas: 2
▌   23  24      template:
▌
▌   ⋯ 31 unchanged lines
```

### Row anatomy

Four columns, and every one of them is toned by the line's kind.

```
   ┌── oldNo ──┬── newNo ──┬─ marker ─┬── text ─────────────────────────────┐
   │        18 │        18 │          │ spec:                    ← context  │
   │        21 │           │    -     │   app: volatility-est…   ← removed   │
   │           │        21 │    +     │   app: volatility-est…   ← added     │
   └───────────┴───────────┴──────────┴─────────────────────────────────────┘
       toned       toned      toned      syntax on add + context
                                         plain on remove
```

| Line kind | oldNo | newNo | marker | text | background |
|---|---|---|---|---|---|
| context | present, `muted` | present, `muted` | blank | syntax slots | none |
| removed | present, `error` | blank | `-`, `error` | **syntax slots** | remove |
| added | blank | present, `ok` | `+`, `ok` | **syntax slots** | add |

**All three kinds are syntax-highlighted.** GitHub, VS Code and delta all do;
Claude Code's renderer is the outlier, and its stated reason — keeping removed lines
"visually simpler beneath the red deletion background" — is a fact about the
strength of its background rather than about diffs.

Only the *gutter* varies by kind. The text is code in all three cases and reads as
code.

**The gutter is toned, not neutral.** Numbers and markers take the line's tone, so
a removed row reads as one red unit rather than as neutral chrome beside red text.
That also makes the non-selectable-gutter question (§6) more clearly right: a
coloured number is visibly decoration, and copying it would be copying the diff
rather than the code.

**Every row therefore uses two palettes at once** — a tone in the gutter and
`syntax` slots in the text. That is the case C10 I16 was widened for, and it is now
the general case in a patch rather than an exception on some lines.

**Two number columns, not one.** Removed lines have an old number and no new one;
added lines the reverse. A single column forces a choice on every changed line and
loses the correspondence, which is the thing a diff exists to show.

**`-` and `+` in their own column**, after the numbers and before the text. Inside
the text they would shift every line by one cell relative to context and destroy
the alignment that makes a diff scannable — and under ASCII the marker column is
already 1:1 by construction, since `+` and `-` are ASCII.

**Collapsed regions are one row, and they say how many.** `⋯ 14 unchanged lines`
rather than a bare marker. The count is what tells you whether expanding is worth
it, and the row is what makes measurement exact: height is
`Σ hunk lines + headers + one per collapsed region`, plus the path header.

**Tone and syntax compose on the same line.** The line kind sets the tone —
removed `error`, added `ok`, context default — and the `syntax` palette highlights
the language *within* the text. This is the case C10 I16 was widened for, and it
is the only kind besides `code` permitted to name `syntax` slots.

**Expansion is a document patch, not view state.** C11 T4.7's precedent: expanding
rewrites `collapsedBefore` and patches the document, so a frozen block records its
own expansion and the operation reaches a frozen entry where an action could not.
No `expanded` flag on `Hunk` — expansion *is* the rewrite.

### Split layout, ≥ 100 columns

```
▌ ── serving/volatility-estimator.yaml ─────────────────────────────────────────
▌
▌   @@ -18,7 +18,9 @@
▌   18    spec:                          │  18    spec:
▌   19      selector:                    │  19      selector:
▌   20        matchLabels:               │  20        matchLabels:
▌   21 -       app: volatility-estimator │  21 +       app: volatility-estimator
▌                                        │  22 +       prism.fmx.io/family: …
▌   22      replicas: 2                  │  23      replicas: 2
```

An added line pairs with a blank on the left, a removed line with a blank on the
right. That is what makes side-by-side readable and it is why split needs the
width: two gutters, two number columns, one separator, and the text twice.

---

## 3. `code.startLine`

One field, and a number rather than a boolean.

```typescript
type Code = Readonly<{
  kind: "code"; id: string;
  language: string;
  text: string;
  wrap?: boolean;
  startLine?: number;      // present → gutter shown, numbering from here
}>;
```

A boolean numbers from 1, which is wrong for a fragment — and the fragment is the
case that matters. S08's validation errors cite `training.py:18`; showing source
without numbers means the reader counts, and showing it numbered from 1 is worse
than not numbering it at all.

```
▌   16   │ @prism.job
▌   17   │ def job() -> TrainingJob:
▌   18 → │     config=TrainingConfig(batch_size=128, mixed_precision=True)
▌   19   │     return TrainingJob(config=config, model=model)
```

**Absent means no gutter**, so every existing `code` block is unchanged — S10's
manifests, the `--json` envelopes, the tracebacks. That is why it is optional
rather than defaulted: most code blocks are quotations and a gutter on them is
noise.

**The gutter width is derived**, `cells(String(startLine + lines - 1))`, so a
fragment at 16–19 costs 2 and one at 998–1002 costs 4. Fixed-width would waste
cells at every scale but one.

**Measurement is unchanged.** A gutter narrows the text column; it does not change
the row count. `measure` still returns `lines` (or the wrapped sum) and never
tokenises — the same property that keeps C09 I1 cheap.

### The current-line marker is a separate question

`→` on line 18 above is a second field (`markLine?: number`) and probably a
different decision. It is what makes a fragment answer "which line is the error"
rather than leaving the reader to match it against the message.

Left open: it is one more field on a built component, and the case for it is
weaker than for the gutter — the error message already names the line, so the
marker saves a comparison rather than enabling one.

---

## 4. What this is not

**Not an editor.** No cursor, no editing, no selection within a code block. C14's
copy mode is how text leaves the frame, and S14 established the principle when the
config surface wanted editable rows: blocks carry no cursor, no input focus and no
validation state, and an editable one is a second line editor living inside the
render tree.

**Not an editor — but an editor is wanted, eventually.**

A code editor is a *pushed view owning an editor instance over a file*, not an
editable block, and it is downstream of L2 rather than of this scratchpad. The
text mechanics are the hard half and C17 already has them: grapheme-indexed
cursor, three character classes for word motion, kill and yank, undo with
structural coalescing.

Three things need design, and only the first is genuinely hard.

**Incremental syntax highlighting was the obstacle. It has an answer: Lezer.**

C09 tokenises static text at render and memoises on `(text, language)`. In an
editor the text changes on every keystroke, and re-tokenising a 2,000-line file per
keypress is not viable — so the question was whether a resumable parser exists for
Node. It does, and researching it corrected two things I had written here.

**First correction: highlight.js does expose continuation state.** `highlight()`
takes a `continuation` parameter and Gerrit uses it for line-by-line highlighting.
So "lowlight cannot do it" was wrong. But highlightjs#2259 records that
line-by-line continuation breaks some constructs — C++ raw strings among them — so
it is a partial answer with known holes rather than a solution.

**Second correction, and the better answer: [Lezer](https://lezer.codemirror.net).**
CodeMirror's parser system, and its stated design goal is this exact use case — "an
editor system, which keeps a syntax tree of the edited document, and uses it for
things like syntax highlighting and smart indentation". It is standalone and
zero-dependency; Lezer runs with or without the rest of CodeMirror.

Measured, not assumed — `@lezer/yaml` + `@lezer/json` + `@lezer/highlight`:

| | lowlight (today) | Lezer (yaml + json) |
|---|---|---|
| Packages | 6 | 5 |
| Installed size | 9.5 MB | **856 KB** |
| Vulnerabilities | 0 | 0 |
| Incremental | no | **yes, by design** |
| Error-tolerant | no | **yes** |
| Tag vocabulary | open strings (`hljs-attr`, …) | **closed, 78 tags** |
| Languages | hundreds, bundled | one package each |

### The closed vocabulary matters more than the incrementality

Lezer's reference manual gives the reason in our own words: *"CodeMirror uses a
mostly closed vocabulary of syntax tags (as opposed to traditional open
string-based systems, which make it hard for highlighting themes to cover all the
tokens produced by the various languages)."*

That is the palette-slot argument — name a slot, do not embed a value — arrived at
independently for the same reason. And it is exactly the problem C09's hljs map
works around: ten rows plus an "anything else → default tone" fallback, because the
class names are an open set nobody controls.

Under Lezer the nine slots map from a fixed set, checked rather than hoped:

```
syntax.keyword      ← keyword, controlKeyword, moduleKeyword, operatorKeyword,
                      definitionKeyword
syntax.string       ← string, character, docString
syntax.comment      ← comment, lineComment, blockComment, docComment
syntax.number       ← number, integer, float, bool, null, literal, atom
syntax.key          ← propertyName, attributeName, labelName
syntax.type         ← typeName, className, namespace, tagName, annotation
syntax.function     ← macroName, variableName
syntax.operator     ← operator, logicOperator, arithmeticOperator,
                      compareOperator, definitionOperator
syntax.punctuation  ← punctuation, bracket, paren, brace, separator, meta
```

`propertyName` is worth noticing: it is the ninth slot we added for YAML keys,
present natively rather than mapped from `hljs-attr` because nothing else fitted.
38 of the 78 tags are unmapped, which is fine — the vocabulary is closed, so an
unmapped tag is a known gap rather than an unknown string.

Verified on real YAML:

```
"replicas"    → tok-propertyName tok-definition
":"           → tok-punctuation
"# a comment" → tok-comment
```

### What it costs, and what it changes

**This is a replacement, not an addition.** If Lezer serves both the static `code`
block and the editor, lowlight leaves and the runtime dependency count is
unchanged. That is a better outcome than the fourth dependency I assumed this would
need.

**The trade is language coverage.** lowlight brings hundreds of languages through
highlight.js; Lezer needs a package per language. For what this project actually
renders — YAML manifests, JSON envelopes, Python source in validation errors, diff
text — that is three or four packages and still smaller than lowlight. For an
editor over arbitrary files it is a real limitation, and it is the argument for
deciding what the editor is *for* before choosing.

**Not decided here.** Switching means rewriting C09's tokenisation section and its
hljs map, changing DEPENDENCIES.md, and re-recording the goldens — work with no
consumer until either the editor or a second language exists. But the obstacle this
section opened with is answered: a resumable parser for Node exists, it is smaller
than what is installed, and its tag model is the one this project already chose.

**tree-sitter** is the other candidate and was not measured. It is incremental and
error-tolerant, and it is WASM or native bindings — heavier for a Node CLI, and
`lezer-parser` maintains an `import-tree-sitter` tool, so its grammars are reachable
from Lezer if a language is missing.

**Whether C17 is reused or forked.****Whether C17 is reused or forked.** Reuse means adding a scroll model to a
component whose spec says it has none and whose measurement contract is
prompt-shaped (`displayRows(width, gutter)`). Fork means two editors and the drift
that follows. Neither is obviously right, and **L2 will answer it incidentally** —
C13 and C14's scroll machinery is being built now and may generalise.

**What it is for — answered in §7.** A read-only file viewer with diff decoration is
the first target: smaller than a general text editor, with an immediate consumer in
the fullscreen patch feature, and the same component with editing turned off. An
editor over model code is the same surface later; an editor over a promote manifest
is a third and smaller thing again.

**Not word-level diff highlighting.** Highlighting the changed span *within* a
changed line is where diff viewers earn their reputation and where they get slow.
The `Hunk` shape does not foreclose it — a line could carry spans — and C25 §out
of scope already defers it with that reason.

**Not syntax-aware diffing.** Hunks arrive from a diff parser or from the far side
already structured. Producing them from two texts is the app's problem, which is
what keeps a diff algorithm out of the three-runtime-dependency budget.

---

## 5. Cost, and why the halves are timed differently

| | Change | Cost |
|---|---|---|
| C25's illustration | Spec only, in an unbuilt component | Free now, and it is what stops the renderer being written to a guess |
| Split-layout illustration | Spec only | Free now |
| `code.startLine` | C04 shape, C09 renderer, C24 export, tests | Small, but it touches a built component and a shipped golden set |
| `markLine` | The same again | Open — the case is weaker |

**C25's half should land whenever C25's spec is next opened.** An unbuilt component
costs nothing to illustrate and the illustration is load-bearing: without it, five
of the decisions in §2 are things a reader would have to infer from field names,
and at least two — two number columns, and the marker in its own column — are
inferable the wrong way.

**`startLine` should wait for a reason to touch C09.** It is additive and optional,
so nothing breaks, but it changes golden frames for every `code` fixture that opts
in and there is no consumer asking for it yet. S08 is the consumer, and S08 is not
built.

---

## 6. A known-good reference: Claude Code's renderer

Worth reading, because it is the same problem solved by a different architecture and
it settles one open question here. Its stack is `highlight.js` for colour, the
`diff` npm package for hunks and word ranges, and a custom ANSI renderer. Its Rust
predecessor used `syntect`/`bat` and the `similar` crate.

Four things in it are worth taking. Two are not.

### Take: `diff`'s `structuredPatch` — and reconsider the scope boundary

§4 says producing hunks from two texts is the app's problem, which keeps a diff
algorithm out of the dependency budget. That is defensible for a far side that
already emits structured patches. It is wrong for the case that motivated this
scratchpad: rendering a promote manifest against what is deployed, where the app has
two strings and needs hunks.

Measured: `diff` v9 is **601 KB, zero dependencies, zero vulnerabilities**, and its
output is nearly C25's `Hunk`:

```
{ oldStart: 1, oldLines: 3, newStart: 1, newLines: 4,
  lines: [" spec:", "-  replicas: 2", "+  replicas: 3", "   image: …",
          "+  family: volatility"] }
```

The mapping to `Hunk` is mechanical — split the sigil, derive the header, count
line numbers from `oldStart`/`newStart`. **The open question is whether that
adapter belongs in `tui-kit/testing`, in the app, or nowhere.** My inclination is
that the *type conversion* is a small utility worth shipping and the *dependency*
stays the app's — so `tui-kit` exports `hunksFromStructuredPatch` shaped to the
`diff` package's output without depending on it. One function, no dependency, and
the app installs `diff` if it wants two-string diffing.

### Take: `diffArrays` over word/whitespace/punctuation runs

The concrete technique for the word-level highlighting §4 defers. Tokenise each
paired line into word runs, whitespace runs and individual punctuation characters;
`diffArrays` the two token arrays; the resulting ranges get the stronger emphasis.
Better than a character diff, which produces noise on any renaming.

### Take: the 40% threshold

**The best idea in it.** When more than 40% of a paired line's content changed,
abandon intra-line highlighting and render whole-line add/remove instead —
otherwise two mostly-unrelated lines become a mosaic of alternating emphasis that
is harder to read than no emphasis at all.

That is a heuristic nobody would derive from first principles and everybody would
need. If word-level highlighting is ever built here, this comes with it.

### Take: the non-selectable gutter

Its gutter is wrapped so that copying from the terminal excludes line numbers and
`+`/`-` markers — you get the code, not the decoration. C14's copy mode has no
concept of a non-selectable region, and this is the case that wants one. Filed as a
C14 question rather than a C25 one.

### Do not take: its colour model

It maps hljs scopes onto Monokai and GitHub approximations, with separate mappings
for truecolour, 256 and basic ANSI. That is C10's job, done three times by hand.
The palette-slot model plus one degradation ladder is the same outcome factored
once — and it is why its "separate mappings per depth" is a cost we do not pay.

### Do not take: lazy-loading 190 grammars

It defers `require('highlight.js')` because registering every grammar is a real
startup and memory cost. That cost is the argument against the dependency, not an
argument for loading it late — and it is the strongest evidence for §4's Lezer
comparison, where a language is a 13–130 KB package rather than a share of a 5 MB
bundle.

### And it settles the composition question

C25 §6 holds three options for how a line's tone and its syntax slot compose, and
option (a) — add `background` to `Style` — was the one I leaned toward while noting
it needs a degradation rule.

This reference uses backgrounds throughout: green and red *line* backgrounds, and
**darker backgrounds around the precisely changed words**. That is the two-level
emphasis word highlighting needs, and foreground alone cannot express it — the
foreground is already carrying syntax.

So option (a) — `background` on `Style` — and it is now a requirement rather than a
preference: the row anatomy above cannot be expressed without it. Foreground is
spoken for by syntax on added lines, and bold and dim are spoken for by the 1-bit
tone collapse.

The degradation rule has its precedent in C10 §4: surfaces degrade to nothing at
1-bit, and a diff background is a surface. What makes losing it lossless under D29
is that the `+`/`-` marker and the toned gutter both survive — the background is the
third signal, not the only one.

Two levels are needed, not one: a line background for add/remove, and a **stronger**
background for the precisely changed words within a line. That is what word-level
highlighting requires, and it is why one background channel with a single value per
line is insufficient — the span carries its own.

Its choice not to syntax-highlight deleted lines is **rejected**, and the reasoning
is worth recording because I initially adopted it and then argued myself out of it
badly.

The reason it gives is that removed lines stay "visually simpler beneath the red
deletion background". That is a statement about *its* background being strong enough
to muddy syntax colours, not about what a diff should look like. With a subtle
background, coloured text on it reads fine — so the premise does not transfer.

**A correction to something I claimed while reasoning about this.** I suggested the
palette could serve as the knob: author a strong remove background and get plain
removed lines. That is wrong. A strong background does not render coloured text
*plain*, it renders it *muddy* — unreadable syntax, not legible default foreground.
Those are different outcomes and only one is what someone wanting plain lines is
asking for. The palette cannot deliver this, and there is no clever way around a
flag if the preference turns out to be real.

**What does follow: the contrast floor extends to diff backgrounds.** They are
surfaces, so syntax slots must clear their floor against them exactly as tones clear
it against `bg` and `bgElev` (C10 §4). That does not give anyone a choice — it
prevents a bad one, by failing at load if a theme ships a background nothing reads
on. New check, existing machinery.

**And the experiment that would overturn this**, worth running rather than reasoning
about: once C25 renders, take a real hunk and draw it both ways at 24-bit with a
subtle background. If highlighted-removed genuinely reads worse, it is not a
background problem and a flag is warranted after all. Five minutes, and better than
either position argued from an armchair.

**Not a configuration option, at least not now.** Two code paths, double the patch
goldens on top of 4 widths × 2 themes × 2 unicode modes, and the thing this project
keeps finding — an option nobody flips is an option nobody tests. Cheap to add later
if the experiment says so; expensive now for a preference untested.

---

## 7. Three levels, and where they stop

A patch has three presentations. Two already work; the third is a pushed view.

```
collapsed     hunks plus collapsed context                  the default
expanded      the whole patch inline, however tall          the transcript scrolls it
fullscreen    all hunks in a pushed view                    when inline is too much
```

**Collapsed and expanded already work.** `collapsedBefore` gives the elided regions
with counts, and expansion is a document patch (C11 T4.7) — it rewrites
`collapsedBefore`, the block gets taller, and a frozen block records its own
expansion. The `+3 / −2` summary is the rule header.

### Not a container you enter and scroll

The tempting shape is a block you enter, which then scrolls independently. It should
not be built.

Nested scrolling in a terminal means the user has to know which thing the arrow keys
are moving, and while they are inside the diff they cannot scroll *past* it to see
what is below. Every terminal app that does this is irritating to use, and C14 has
one scroll position by design.

"Enter it and scroll" becomes **"expand it and scroll normally"** — same outcome, one
scroll position, and you can page past a finished diff to the rest of the transcript.

### Two thresholds, in viewport-heights

Rendered rows relative to viewport height, because the cost of an over-tall block is
paging past it to reach the transcript, and that cost is relative to the screen. A
60-row diff is one page on a 50-row terminal and three on a 24-row one — so a
constant would be wrong at both ends.

```
collapsed form     admit hunks while running total ≤ 1 × viewport
                   then "and 43 more hunks · ⏎ fullscreen"

inline expansion    offered when expanded rows ≤ maxExpandHeight (default 2 × viewport)
                    above that: fullscreen only
```

**2× for expansion**: one page to read, one to leave. One screenful refuses a
legitimate 30-line diff; three means paging three times past something you have
finished with.

**The collapsed form needs its own cap**, which is easy to miss. A rename across a
file produces forty tiny hunks — collapsed that is still 250 rows, before anyone
expands anything. Cut at **hunk boundaries** while the running total fits one
screenful: a hunk is a coherent unit and dropping one is better than splitting it.

Both are computable before either is offered, since `measure` is pure and takes
width.

**Configurable, because the right value is a preference.** `maxExpandHeight` as a
multiple of viewport height, default 2, on the block or on the theme — someone
reading diffs all day on a tall monitor wants 4, someone on a laptop wants 1.5.

Note what this does *not* configure: whether expansion exists, or what happens above
the threshold. The number is a preference; the behaviour is not.

### Fullscreen shows the whole patch, not the whole file

A `Patch` carries hunks and a path. It does not carry the file — the unchanged lines
are not in the block. So a whole-file view means either the block carries the file
content or the view fetches it, and that is a data decision rather than a rendering
one.

**Decided: fullscreen is all the hunks, uncollapsed, scrollable.** What `less` gives
you on a `git diff`. It needs no data the block does not already have.

A C15 pushed view, the third after S12 and S13, so the pattern exists and the
conventions come free — `esc` pops, arrows and `PgUp`/`PgDn` scroll, `g`/`G` seek,
and the diff-specific pair `n`/`p` for next and previous hunk.

**Whole-file-with-changes is deferred to the editor**, and they are the same
component: both need the whole file, a scroll model independent of the transcript,
and windowed highlighting. Building two would be perverse.

That also answers the question §4 left open about what the editor is *for*. A
**read-only file viewer with diff decoration** is a much smaller first target than a
general text editor, it has an immediate consumer in this feature, and it is the same
component with editing turned off. That is the order to build it in.

---

## 8. Open

**Q1 — does `patch` need the file header row at all?** S10 renders one patch per
file and names the file in its own rule. Two headers for one file is noise; but a
patch appearing anywhere else has no context without it. Leaning: the header is
part of the block, and S10 drops its rule rather than the block dropping its
header — the block should be complete on its own.

**Q2 — what does `patch` do with a binary or unreadable file?** Git says
`Binary files differ`. The block has no representation for "there is a change and
it cannot be shown as lines". Probably a `notice`, produced by whoever builds the
patch rather than by C25 — but it is unstated.

**Q3 — `markLine`, or leave the reader to match the message?** §3's open question.

**Q4 — where does `maxExpandHeight` live?** On the block, so a surface can set it
per patch, or on the theme, so it is one preference for the session. Leaning theme:
it is a reading preference rather than a property of a particular diff, and a
surface setting it per patch would be guessing on the user's behalf.

**Q5 — does the collapsed-form cap need its own configuration?** §7 fixes it at one
viewport. Probably not — it is the *summary*, and a summary longer than a screen has
stopped summarising. But it is the same class of number as `maxExpandHeight` and
someone will ask.

**Q6 — do the two number columns collapse below some width?** At 60 columns, two
gutters plus a marker column is 7 cells of 60 before any text. A single column
showing the new number, with removed lines blank, would recover 3. That trades the
correspondence for text width, and I do not know which wins at 60 — the
illustration should be drawn at 60 before deciding.
