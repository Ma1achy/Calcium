# C25 — Patch renderer

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
| **Layer** | L1 presentation |
| **Depends on** | C04 (`Patch`, `Hunk`, `Measure`) · C09 (registers into its registry; `cells()`; tokenisation) · C10 (`resolveTone`, `resolve` for the `syntax` palette, `resolveBackground` for the diff surfaces) |
| **Consumed by** | C09's registry · S10's manifest change · any surface showing a textual change |
| **Source** | Scratchpad 5 §4 · Scratchpad 6 §2, §6, §7 · A01 D29 · A02 §2 |
| **Status** | Settled. §6's open item is closed — `Style` gains a background channel, and the decision is C10's |

---

## 1. Purpose

C25 renders a textual diff: hunks of added, removed and context lines, with line numbers, a file header, and syntax highlighting inside each line.

The existing `diff` block compares two runs' **fields** — rows of `{field, a, b, comparison}` — and it is right for S07's metric table. It is wrong for a YAML manifest, where the change is textual and the reader needs to see which lines moved. S10 currently renders a forty-line manifest as a `code` block for what is often a two-line change, and relies on the reader to spot it.

Like C11 and C12, C25 registers into C09's registry through the public mechanism rather than being privileged. Table, plot and patch being three separate components registering the same way is what makes the extension mechanism real rather than a claim.

**C25 declares no block types.** `Patch` and `Hunk` are C04's, as every block shape is — settled when `plot` moved out to C12.

**No state machine.** A pure `measure`/`render` pair over an immutable block (A02 §7).

---

## 2. Public interface

```typescript
const patchDefinition: BlockDefinition<Patch>;   // registered into C09
```

Nothing else is exported. The block shape is C04's, the registry is C09's, and a consumer producing a patch uses `b.patch(…)` from C24.

---

### The illustration

C09 §3's sixteen kinds each have one. C25 had a measurement line and no picture, and its field names commit to a git-style unified diff and to nothing else — so the renderer would have been written to a plausible reading of `Hunk` rather than to a drawing. **Five things below are decisions rather than consequences, and two of them are inferable the wrong way from the fields alone.**

```
── serving/volatility-estimator.yaml ───────────────────────────────────────────
⋯ 14 unchanged lines
@@ -18,6 +18,7 @@
18 18   spec:
19 19     selector:
20 20       matchLabels:
21    -       app: volatility-estimator
   21 +       app: volatility-estimator
   22 +       prism.fmx.io/family: volatility
22 23     replicas: 2
23 24     template:
⋯ 170 unchanged lines
```

**Twelve rows, and the formula gives twelve**: one path header, one hunk header, eight lines, and two collapse markers — one before the hunk and one after it. Drawn without a panel gutter or blank separator rows, because both belong to whoever composes the block — S10 puts it in a panel — and a figure that includes them is a figure whose row count disagrees with §2's arithmetic. That disagreement is what the surface audit spends its time on, and the cheapest place to not create it is here.

**Two corrections to this figure, both made by rendering it.** Its first draft indented every row under the header by two cells, which is decoration costing two columns on every line of the one block where the text column is what the reader came for; the rule now runs flush and so does everything below it. And its hunk header read `@@ -18,7 +18,9 @@` against lines that span six and seven — three context, one removed, two added, two context — so a reader deriving the counts from the drawn lines got different numbers from the header drawn above them. `Hunk.header` is a string the block carries verbatim and C25 computes nothing from it, which is precisely why a wrong one survives review: nothing in the renderer disagrees with it.

**The trailing collapsed region is `Patch.collapsedAfter`, and getting there took a wrong turn worth recording.** The figure's first draft drew `⋯ 31 unchanged lines` after the last hunk; `Hunk.collapsedBefore` covers the region *before* a hunk, so the tail had nowhere to live. That was first filed as a slip in the figure, on the reasoning that one figure disagreeing with a declaration is a slip and two agreeing against it is the declaration being wrong.

**The count was the wrong test.** It distinguishes HEIGHT_AUDIT's first verdict class from its fifth — both of which resolve by picking a side, and the count says which side. This is the **fourth** class, where neither side is wrong about what it describes and the resolution is to change the shape: the figure was right that a tail gets elided, and `collapsedBefore` was right about the regions it covers. Counting figures cannot tell those apart, because there is no side to pick.

And it is not a rare case. A single hunk at line 18 of a two-hundred-line file elides fourteen lines above and a hundred and seventy below — the larger number is the one that could not be stated. `collapsedAfter` hangs off `Patch` rather than `Hunk` so that the interior regions stay `collapsedBefore`'s alone and nothing double-counts the gap between two hunks; C04 §3 carries the reasoning.

### The row anatomy

Four columns, and every one of them is toned by the line's kind.

```
   ┌── oldNo ──┬── newNo ──┬─ marker ─┬── text ─────────────────────────────┐
   │        18 │        18 │          │ spec:                    ← context  │
   │        21 │           │    -     │   app: volatility-est…   ← removed  │
   │           │        21 │    +     │   app: volatility-est…   ← added    │
   └───────────┴───────────┴──────────┴─────────────────────────────────────┘
       toned       toned      toned      syntax slots, all three kinds
```

| Line kind | `oldNo` | `newNo` | marker | text | background |
|---|---|---|---|---|---|
| `context` | present, `muted` | present, `muted` | blank | syntax slots | none |
| `remove` | present, `error` | blank | `-`, `error` | **syntax slots** | `diffRemove` |
| `add` | blank | present, `ok` | `+`, `ok` | **syntax slots** | `diffAdd` |

**All three kinds are syntax-highlighted.** GitHub, VS Code and delta all do it. The one well-known renderer that does not gives its reason as keeping removed lines visually simpler beneath a red deletion background — which is a fact about the strength of *its* background, not about what a diff should look like. With a subtle background, coloured text on it reads fine, so the premise does not transfer. Only the **gutter** varies by kind; the text is code in all three cases and reads as code.

Worth recording because the palette looks like the knob and is not: authoring a strong `diffRemove` does not render coloured text *plain*, it renders it *muddy*. Those are different outcomes and only one is what someone asking for plain removed lines wants. There is no way to deliver it short of a flag, and a flag is refused for now — two code paths and double the goldens for a preference nobody has tested. **The experiment that would overturn this** is worth running rather than arguing: once C25 renders, draw a real hunk both ways at 24-bit against a subtle background. If highlighted-removed genuinely reads worse, the flag is warranted after all.

**The gutter is toned, not neutral chrome.** Numbers and markers take the line's tone, so a removed row reads as one red unit rather than as grey numbers beside red text.

**Every row therefore uses two palettes at once** — a tone in the gutter and `syntax` slots in the text. That is the case C10 I16 was widened for, and in a patch it is the **general** case rather than an exception on some lines.

**Two number columns, not one.** A removed line has an old number and no new one; an added line the reverse. A single column forces a choice on every changed line and loses the correspondence, which is the thing a diff exists to show. This is the first of the two a reader would infer wrongly from `oldNo?`/`newNo?` being optional.

**`-` and `+` in their own column**, after the numbers and before the text. Inside the text they shift every changed line one cell relative to context and destroy the alignment that makes a diff scannable. This is the second. Under ASCII the marker column is 1:1 by construction, both glyphs being ASCII already.

**Collapsed regions are one row, and they say how many.** `⋯ 14 unchanged lines`, not a bare marker: the count is what tells a reader whether expanding is worth it, and the row is what makes measurement exact.

**Tone and syntax compose on the same line**, which is what §6 resolves.

**Expansion is a document patch, not view state.** C11 T4.7's mechanism — expanding rewrites `collapsedBefore` and patches the document, so a frozen block records its own expansion and the operation reaches a frozen entry where an action could not. There is no `expanded` flag on `Hunk`: expansion *is* the rewrite.

### Split layout, ≥ 100 columns

```
── serving/volatility-estimator.yaml ───────────────────────────────────────────
@@ -18,6 +18,7 @@
18   spec:                             │18   spec:
19     selector:                       │19     selector:
20       matchLabels:                  │20       matchLabels:
21 -       app: volatility-estimator   │21 +       app: volatility-estimator
                                       │22 +       prism.fmx.io/family: volat…
22     replicas: 2                     │23     replicas: 2
23     template:                       │24     template:
```

A removed line pairs with its corresponding added line on one row; an unmatched added line pairs with a blank on the left, and an unmatched removed line with a blank on the right. That pairing is what makes side-by-side readable — it is the whole reason split exists rather than being unified with wider columns — and it is why split needs the width: two gutters, two number columns, one separator, and the text twice.

### And pairing makes height depend on width, which I2 denied

**Ten rows here against eleven above, from the same block.** One removed line and two added ones become two paired rows instead of three stacked ones. So a patch does not measure the same at 80 and at 160, and the original I2 — "height is independent of width" — was not merely optimistic but incompatible with the layout §3 chooses by width. Each was defensible alone.

**This is the second instance of a defect class A03 §2 records with no mechanism**: two statements individually correct and jointly unsatisfiable, the first being C12's I5 and I14. The commitment/invariant audit pairs a commitment with an invariant; nothing compares invariants with one another, and it would not have found this, because both were true.

The resolution keeps the invariant that carries load and moves the one that was a convenience:

- **I1 is untouched and is the one that matters.** `measure(patch, w)` equals the rendered row count at width `w`. C14 virtualises on measured height without rendering, so I1 coming apart is a viewport that drifts; I2 coming apart is a width sweep that is slightly less cheap.
- **I2 becomes width-independence *within a layout*.** Height is constant across every width that selects the same layout, and steps exactly once, at the breakpoint, by the number of rows pairing saves. `measure` stays pure and total and takes the width it was always given.
- **Nothing wraps, and that is a separate claim** which survives intact. It was bundled into I2 and is now its own invariant, because the reason for it is alignment rather than arithmetic — and S10 cites it (`patch` does not wrap, C25 I2) for the alignment reason.

The alternative was to make split not pair — every line on its own row, blank opposite — which preserves the arithmetic and deletes the point of the layout. A split diff that stacks is a unified diff with wasted columns.

---

### Height

Exact at every width, and constant within a layout.

```
unified                                  split
1        the file header (path)           1        the file header (path)
+ Σ over hunks of (                     + Σ over hunks of (
    1      the hunk header                   1      the hunk header
  + hunk.lines.length                      + pairedRows(hunk.lines)
  + (hunk.collapsedBefore ? 1 : 0)         + (hunk.collapsedBefore ? 1 : 0)
  )                                        )
+ (block.collapsedAfter ? 1 : 0)        + (block.collapsedAfter ? 1 : 0)
```

**The tail is the block's row, not a hunk's**, and it is one row on the same terms as every `collapsedBefore` (I5). A patch with no hunks and a `collapsedAfter` is a header and a marker — two rows, and a legitimate shape: it says the file is unchanged and states how much of it there is.

`pairedRows` walks each maximal run of consecutive changed lines and emits `max(removes, adds)` rows for it, one row per unchanged line otherwise. It reads the same field `lines.length` reads, so it tokenises nothing and allocates nothing — `measure` stays as cheap in split as in unified, which is what keeps C09 I1 affordable.

**Nothing wraps.** A diff line that wraps destroys the column alignment that makes a diff readable — the `+`/`-` gutter stops lining up and the eye loses the shape of the change. Long lines truncate, exactly as `logs` do.

That is a claim about *alignment*, and it is separate from the arithmetic above. Wrapping would make height depend on the width of the content continuously; the layout breakpoint makes it depend on width in exactly one step, at a value the block declares. A sweep across the seven widths sees two values and knows which side of the breakpoint each is on — which is a weaker property than one value, and still strong enough to catch a wrap.

A collapsed region is **one row** in both layouts, carrying its own count: `⋯ 12 unchanged lines`. The count comes from the field — `collapsedBefore` on a hunk, `collapsedAfter` on the block — so measurement reads it directly rather than deriving anything.

---

## 3. Rendering

### The gutter and the two prefixes

| Line kind | Prefix | Tone |
|---|---|---|
| `add` | `+` | `ok` |
| `remove` | `-` | `error` |
| `context` | ` ` | `muted` |

**The prefix is not decoration.** D29 forbids information riding on colour alone, so `+` and `-` carry the distinction and the tone reinforces it. At 1-bit, where all colour is gone, a diff is still a diff.

Line numbers precede the prefix: old and new in unified layout, one per side in split. A line missing its number (`oldNo` absent on an `add`) renders blank in that column rather than shifting the gutter.

### Two palettes on one line

Within a line, the `syntax` palette highlights the language — so a changed YAML line is `ok`-toned *and* `+`-prefixed *and* syntax-coloured. This is the only place in the system where two palettes meet on one line.

**C10 had to be widened for this.** Before C25, `syntax` was scoped to `code` blocks by C10 I16, tested by C10 T2.8 and enforced by A03 SS20. That scope is now a closed list of `code` and `patch`, and it stays closed: a third consumer is a spec change, and the friction is the point.

**How the two compose is settled in §6**: the line kind takes a background, the syntax palette keeps the foreground, and the gutter takes the tone.

### Layout

`layout ?? (width >= 100 ? "split" : "unified")`. An explicit `layout` on the block wins, so a surface can force unified.

**Unified is the narrow form and split is the wide one**, which is the opposite of S07's call and worth stating because it looks inconsistent. S07 stacks its comparison because its content is *values*, and both values must be visible for the comparison to mean anything. A patch's content is *lines*. A split diff at 60 columns gives 28 usable columns per side, and every line truncates — the layout that preserves the comparison at S07's granularity destroys it at this one.

### ASCII fallback

`unicode: "ascii"` replaces the collapse marker's `⋯` with `...`. **This changes the cell count**, so unlike C09's 1:1 substitution rule the collapse marker's *content budget* changes at measure time instead — the marker is a fixed one row either way, so height is unaffected and C09 I1 holds. This is the "adding a kind whose measurer needs capabilities" case C09 commitment 11 names as a design decision, and it is made here deliberately: the alternative is a three-cell `⋯` that is one cell wide, which would drift every truncation point on the row.

---

## 3a. Three levels, and both thresholds

A patch has three presentations. Two are rendering; the third is a pushed view.

```
collapsed     hunks plus collapsed context, capped        the default
expanded      the whole patch inline, however tall        the transcript scrolls it
fullscreen    all hunks in a pushed view                  when inline is too much
```

**Not a container you enter and scroll.** The tempting shape is a block you enter, which then scrolls independently, and it should not be built: nested scrolling means the reader has to know which thing the arrow keys are moving, and while they are inside the diff they cannot scroll *past* it to reach what is below. C14 has one scroll position by design. "Enter it and scroll" becomes **"expand it and scroll normally"** — the same outcome, one scroll position, and a finished diff can be paged past.

### Both thresholds are in viewport-heights, not rows

The cost of an over-tall block is paging past it to reach the transcript, and that cost is relative to the screen. Sixty rows is one page on a fifty-row terminal and three on a twenty-four-row one, so a constant would be wrong at both ends.

```
collapsed form      admit hunks while the running total ≤ 1 × viewport,
                    cutting at hunk boundaries; then
                    "and 43 more hunks · ⏎ fullscreen"

inline expansion    offered when expanded rows ≤ maxExpandHeight
                    (default 2 × viewport, configurable)
                    above that: fullscreen only
```

**The collapsed form needs its own cap, which is the easy thing to miss.** A rename across a file produces forty tiny hunks, and collapsed that is still hundreds of rows before anyone expands anything. The cut is at **hunk boundaries**: a hunk is a coherent unit, and dropping one whole is better than showing half of it.

**2× for expansion** — one page to read, one to leave. One screenful refuses a legitimate thirty-line diff; three means paging three times past something already finished with.

Both are computable before either is offered, because `measure` is pure and takes the width. Nothing has to be rendered to know whether it would fit.

**Neither is computable *here*, and that is not an omission in the build.** Both thresholds are multiples of the viewport height, and C25 cannot see a viewport: `measure` is `(block, width) → number` and `RenderContext` carries a width, a theme, capabilities, focus and a tick. There is no height in either, deliberately — the renderer is blind to the viewport so that `measure` stays pure and total (I1, I3, C09 I1), and threading a height in would make a block's geometry depend on the thing C14 derives *from* that geometry.

So I14, I15 and I16 are **specified and unbuilt**, and the record matters more than the fact: whoever implements them next will reach for `measure` first, because that is where the arithmetic lives, and widening its signature is the one change that must not be made. `maxExpandHeight` appears nowhere in the tree as of this writing.

**The likely owner is C22, at compose time.** It holds the region, and it already windows content to it. C14 is the alternative and is worse: it would make a block's *content* depend on the scroll position of the thing containing it, so the same block would measure differently depending on where it sat. Named here so it is not re-derived, and named as *likely* because the ruling has not been taken.

### What is a preference, and what is not

`maxExpandHeight` is a multiple of viewport height, default 2 — someone reading diffs all day on a tall monitor wants 4 and someone on a laptop wants 1.5, and there is no right answer to hard-code.

**Two things are not configurable: whether expansion exists, and what happens above the threshold.** The number is a reading preference; the behaviour is the contract. An option that turns off expansion makes a dropped hunk unreachable, which is D38's failure exactly, and an option that changes what happens above the threshold means two paths where one is untested.

## 3b. Fullscreen is all the hunks, not the whole file

A `Patch` carries hunks and a path. It does not carry the file — the unchanged lines are not in the block — so a whole-file view means either the block carries the file content or the view fetches it, and both are data decisions rather than rendering ones.

**Decided: fullscreen is every hunk, uncollapsed, scrollable.** What `less` gives you on a `git diff`. It needs no data the block does not already have, which is what makes it specifiable now and buildable when L2 lands.

A C15 pushed view, the third after S12 and S13, so the conventions come free: `esc` pops, arrows and `PgUp`/`PgDn` scroll, `g`/`G` seek. The diff-specific pair is **`n` and `p`, next and previous hunk** — the one motion a diff has that a list does not.

**The view owns that scroll, and C15 places the region's worth of it.** `Layer.content` is `Block[]` and this view's content is a single block, which the array carries with no special case; what it does not carry is a scroll offset, because C15 has none for views and should not grow one (C15 §4). Every motion above is this view recomputing which rows are visible and calling `update(id, { content })` — the same seam S12 uses for a fifty-thousand-line buffer. A second scroll model beside C14's is what A01 D3 spent a decision avoiding, and it would arrive here first.

**Whole-file-with-changes is deferred to the editor, and they are the same component.** Both need the whole file, a scroll model independent of the transcript, and highlighting over a window rather than a fragment. Said explicitly because the alternative is two of them: a read-only file viewer with diff decoration is the smaller first target, it has its consumer in this feature, and it is the same component with editing turned off.

---

## 3c. The fullscreen view, walked by hand

Before any code, and in both shapes. §3b decided *what* fullscreen shows; this
section is what happens when that decision meets the ones already in the file.

**Two artefacts, because this component has state and structure both.** A trace
finds interactions mediated by an event — two rules that meet because something
happened in between. A table finds structural ones — two rules that both hold at
rest, with no event between them. C19 needed both and had one, and the half it was
missing was the half its defect lived in. The windowing question here is entirely
structural and the scroll-and-pop question is entirely event-mediated, so taking
either alone would have left a whole class unexamined.

Eleven rows produced **five findings**, and four of them changed a ruling rather
than confirming one.

---

### The table — what a window boundary meets

A fullscreen view shows a window of the patch, and §3b says the owner "recomputes
which rows are visible and calls `update(id, { content })`". `Layer.content` is
`Block[]`, so a window is not a list of rows — **it is a `Patch` rebuilt from a
slice of the original's lines**, and every row below is a cell where that meets a
rule this file already states.

| The boundary meets | The two rules | Ruling |
|---|---|---|
| **the path header** | a window is a contiguous slice of the rendering (§3b) · `patchHeight` always counts one header row | **The path header is sticky, and it is forced rather than chosen.** No field suppresses it, so every window carries it and the content budget is one row less than the region |
| **a hunk header** | the same · `hunkRows` always counts one header row | **Sticky per touched hunk.** A window opening mid-hunk still shows its `@@` line, and pays a row for it |
| **`Hunk.header`'s counts** | the header is carried verbatim and C25 computes nothing from it (§4) · the visible lines are a slice | **Left verbatim.** The counts describe the whole hunk while the window shows part of it, and that disagreement is correct: rewriting the header to match the slice would make C25 compute from a field whose whole point is that it does not |
| **`collapsedBefore`** | a collapsed region is one row wherever it sits (I5) · the slice | Carried **only when the window contains that row**. Re-emitted on every page it would claim the elision sits at the top of each one |
| **`collapsedAfter`** | it is the patch's last row (T1.3a) · the slice | Carried **only on the last window**. The same rule as above and the opposite failure — a tail marker on page one says the file ends there |
| **split pairing** | consecutive changed lines pair at `max(removes, adds)` (I2a) · the window cuts between lines | **The cut snaps to a run boundary.** See below — this one is measured, not reasoned |
| **`truncated`** | C15 reports `truncated` rather than clipping (C15 §4, T4.9) · the window is built to fit | The window must measure **≤ the region**, so `truncated: false` becomes the assertion that windowing happened at all. A view that pushes the whole block reports `true`, which is what T4.9 asserts today against an owner that does not yet exist |
| **a view already on the stack** | views do not nest (C15 I1) · a push is how a view arrives | C15 **throws**, and the caller is a renderer's callback. Refused by C23 instead (C23 I31) |
| **a zero-height target** | a patch with no hunks is one row (T3.1) · a view fills the region | Legitimate, and mostly blank. Not the dispatcher's to refuse: a patch with nothing to show that carries a `view` action is a producer offering something it does not have, and the offer is the producer's to withhold |

#### The pairing row is the finding, and it was measured rather than argued

Slicing a patch's lines and measuring the halves does not, in split layout, add
up to measuring the whole. The illustration's hunk — three context lines, one
removed, two added, two context — is seven rows split. Cut at every position and
sum the halves:

```
cut  0: 0 + 7 = 7      cut  5: 4 + 3 = 7
cut  1: 1 + 6 = 7      cut  6: 5 + 2 = 7
cut  2: 2 + 5 = 7      cut  7: 6 + 1 = 7
cut  3: 3 + 4 = 7      cut  8: 7 + 0 = 7
cut  4: 4 + 4 = 8   ← the run splits
```

Cut 4 falls between the removed line and the two added ones. Whole, that run is
`max(1, 2) = 2` rows; cut, it is `max(1,0) + max(0,2) = 1 + 2 = 3`. **A window
boundary inside a changed run invents a row**, so scrolling one row across it
shifts the content by two and the same line can be drawn on both pages.

Cut 5 — also inside the run — is fine, because `max(1,1) + max(0,1)` happens to
equal `max(1,2)`. That coincidence is why the general rule is not "avoid the
interior of a run" but the simpler one:

> **In split layout the window cuts only at run boundaries** — at a context line,
> or where a maximal run of changed lines begins or ends. A window may therefore
> be a row shorter than the region; it is never taller.

I2a and §3b were each correct and are jointly unsatisfiable at arbitrary cuts —
the same shape as the original I2 against §3's pairing, which is the second time
this component has produced that pattern and the reason §2 records the first.
Neither statement is wrong and no row governed by one alone would have found it.

---

### The trace — the view holding focus, and what interrupts it

| # | Sequence | Finding |
|---|---|---|
| **A1** | a view is open · `PgUp` | Fell through to `global` and scrolled the transcript beneath the view. C16 §4's guard tested modality for a question about visibility — ruled there |
| **A2** | a view is open · `Esc` | Pops. The transcript is untouched, nothing is appended, and the selection is intact (A01 D7). C23 §4's pop row already argues it; a view does not nest, so `Esc` is unambiguous |
| **A3** | at the last hunk · `n` | **Clamps, never wraps.** Wrapping to the top of a diff loses the reader's place silently, and the one motion a diff has that a list does not is the one where that costs most |
| **A4** | `G` · then `n` | **Two cursors for one position.** See below |
| **A5** | the entry is patched while its view is open | The view **rewindows from the live block**. A snapshot taken at push time would show a diff the entry no longer holds, and a patch is exactly what `expand` produces one keystroke earlier |
| **A6** | the entry is **evicted** while its view is open | **Dismissed with `anchorEvicted`.** See below |
| **A7** | a view is open · `Ctrl-C` | §5's `pushedView` rung pops it, and that is cancellation rather than dismissal. Two keys, one outcome, two reasons — and they must not share an implementation, or the ladder starts depending on the keymap |

#### A4 — `g`/`G` move a row and `n`/`p` move a hunk, and holding both is the defect

The obvious shape is a view holding an offset *and* a hunk index: `n` increments
the index, `G` sets the offset to the bottom. They then disagree. `G` leaves the
index pointing at whatever hunk the reader was on before, so `p` moves to the
hunk before *that* — a jump upward from a position the reader has scrolled away
from, with nothing on screen to explain it.

**One piece of state: the row offset.** `n` and `p` compute the next and previous
hunk's first row *from the current offset*; `g` and `G` set it directly. Nothing
can disagree because there is nothing to disagree with. This is the deltas-read-
as-state class arriving as two cursors instead of two deltas, and it is invisible
to any test that drives one motion at a time.

#### A6 — the evicted entry, and the mechanism that already exists

`Esc` pops back to the entry the view came from. If that entry has been evicted
while the view was open, there is nothing to pop back to and nothing to rewindow
from — and the next `n` would ask a block that is gone.

**C15 already has the answer and cannot reach it alone.** `DismissReason` has
`anchorEvicted` precisely for a layer whose referent has gone, and C15 I10 says
the caller supplies it because C15 subscribes to nothing and holds no entry ids.
So the view's owner watches the transcript and dismisses on eviction; `Esc` never
meets a dangling view, because the view is already gone.

Worth stating that this was found by asking rather than discovered by running:
the row exists because "a request is in flight and something else happens" is what
a trace is indexed by, and eviction is the something else that C13 does on its own
schedule.

---

**What the walk did not find, said so it is not assumed.** Nothing here decides
what a *verb's result* being a view would mean — C22 §13's row, still open. And
nothing here builds I14, I15 or I16; §3a records why they cannot live in this
component and who most likely owns them.

---

## 4. Tokenisation

C25 does not tokenise. It calls C09's tokeniser with `(line.text minus its prefix, block.language)` and receives token spans, which it resolves through C10's `syntax` palette.

Consequences that matter:

- **`measure` never tokenises.** Tokens change appearance, not line count. A patch measures identically whether or not its language is registered, which keeps C09 I1 cheap.
- An **unregistered language renders as plain text**, not an error — the same principle as C07's fallback adapter.
- Memoisation is C09's, on `(text, language)`. C25 holds no cache, and holds no state at all.

---

## 5. Invariants

- **I1** — `measure(patch, w)` equals the rendered row count at width `w`, for every block and every width. C09 I1, specialised. **This is the one that carries load**: C14 virtualises on measured height without rendering, so I1 coming apart is a viewport that drifts silently.
- **I2** — Nothing wraps. Long lines truncate, exactly as `logs` do, because a wrapped diff line destroys the gutter alignment that makes a diff readable. This is a claim about alignment, not about arithmetic (§2).
- **I2a** — Height is constant across every width that selects the same layout, and changes only at the layout breakpoint, by the number of rows pairing saves. `measure` is pure and total at every width. **The original I2 claimed width-independence outright and was incompatible with §3's split pairing** — the two were individually correct and jointly unsatisfiable, which is a defect class A03 §2 names and does not check.
- **I3** — `measure` never tokenises and never reads capabilities except for the collapse marker's content budget (§3).
- **I4** — Every `add` and `remove` line carries its prefix glyph regardless of colour depth. D29 at the source.
- **I5** — A collapsed region occupies exactly one row and states its own count, wherever it sits: `collapsedBefore` before its hunk, `collapsedAfter` below the last one. The two are the same row rendered from different fields, and a patch elides in exactly three places — before, between, after — of which the first two are one field's and the third is the other's (→ C04 §3).
- **I6** — C25 registers through C09's public `register`; it is not privileged.
- **I7** — C25 holds no state. `measure` and `render` are pure over the block.
- **I8** — C25 declares no block types. `Patch` and `Hunk` are C04's.
- **I9** — A language C09's tokeniser does not recognise renders as plain text, never as an error. A diff of an unfamiliar file type is still a diff worth reading, and refusing to render it would make the renderer's language table a gate on content.
- **I10** — Word-level intra-line highlighting is deferred, and the block shape does not foreclose it. `Hunk` carries whole lines; adding spans later is a field, not a redesign. **Its carrier is decided and is not a background**: C10 §4a measured a stronger background pair and withdrew it, so a changed span takes `underline` over the line's background (→ C10 §4a).
- **I11** — Expansion of a collapsed region patches the document (C11 T4.7's mechanism), never mutates external state. C25 itself does not expand anything — it renders whatever `collapsedBefore` says. There is no `expanded` flag: expansion *is* the rewrite.
- **I12** — Every row carries the gutter in the line's tone and the text in `syntax` slots, for all three line kinds. Only the gutter varies by kind; the text is code in every case. Two palettes on one row is the general case in a patch, not an exception on some rows (§2).
- **I12a** — In split layout the background belongs to a **side**, not to a row. A paired row changed in two directions, so one colour across it asserts the wrong change on one half — and the blank facing an unpaired addition would claim the other side gained the line too. Found by looking at a frame; no assertion in the suite disagreed with it.
- **I13** — The line background is the third signal and never the only one. At 1-bit it resolves to nothing (C10 §4's surface rule), and the marker and the toned gutter both survive — which is what makes losing it lossless under D29.
- **I14** — The collapsed form admits hunks while the running total is within one viewport, cutting at hunk boundaries and never mid-hunk, and states how many hunks it dropped. **Not C25's to satisfy** — the cap is a function of the viewport and this component cannot see one (§3a).
- **I15** — Inline expansion is offered iff the expanded row count is within `maxExpandHeight`; above it, fullscreen is the only route. Both are computable before either is offered, `measure` being pure — but not by this component, for the reason §3a gives.
- **I16** — `maxExpandHeight` is the only configurable part. Whether expansion exists, and what happens above the threshold, are not — a patch's dropped content is always reachable (D38).
- **I17** — The fullscreen view is every hunk of *this block*, uncollapsed. It never needs data the block does not carry, which is why whole-file-with-changes is a different component (§3b).
- **I18** — A window of a patch is a `Patch` rebuilt from a slice of its lines, never a list of rows. **The path header and every touched hunk's header are sticky**, because no field suppresses either — so a window carries them and pays a row for each, and its content budget is smaller than the region by exactly that. Forced by the block shape rather than chosen (§3c).
- **I19** — In split layout a window cuts **only at run boundaries** — at a context line, or where a maximal run of changed lines begins or ends. Cutting inside a run is not additive: a run of one removed and two added lines is two rows whole and three rows cut between them, so a one-row scroll shifts the content by two and a line is drawn twice. A window may be a row shorter than the region and is never taller (I2a, §3c).
- **I20** — A collapse marker appears only on the window that contains its row: `collapsedBefore` when the window reaches the region before its hunk, `collapsedAfter` only on the last one. Carried unconditionally, the first claims an elision at the top of every page and the second says the file ends on page one (I5, §3c).
- **I21** — `Hunk.header` is carried into a window verbatim, so its counts describe the whole hunk while the window shows part of it. Rewriting it to match the slice would make C25 compute from the one field it is defined not to read (§4, §3c).

---

## 6. The composition rule — resolved

**Option (a): `Style` gains a background channel, and it is C10's decision, taken in C10.** The line kind takes the background, `syntax` keeps the foreground, the gutter takes the tone, and the marker carries the distinction under D29 regardless of any of them.

It is a **requirement rather than a preference**, which is what changed: §2's row anatomy cannot be expressed without it. The foreground is spoken for by syntax on all three line kinds, and bold and dim are spoken for by the 1-bit tone collapse (C10 §5), so there is no channel left. Option (b) would make added and removed lines the same colour, and option (c) would suppress highlighting on exactly the lines a reader most wants to read.

**One level, and the second was measured out.** This section was written expecting two — a line background, and a stronger one for the precisely changed words within a line, which is what every real diff tool uses for word-level emphasis. C10 §4a measured the stronger pair against the contrast floors and there is no room for it: the recessive slots bound how much tint a diff background may carry, and the *first* level spends nearly all of it, leaving six to nine units of one channel on three of the four values.

**So word-level emphasis (I10) is `underline`, and it is a better answer than the one it replaces.** A background vanishes at 1-bit — that is C10 I8, and it is why I13 has to say the background is never the only signal. An attribute does not: attributes are already how the 1-bit collapse carries tone (C10 §5), so emphasis expressed as one degrades to *itself* rather than to nothing. A patch at one bit would have lost its word-level highlighting entirely under the design this replaces, and keeps it under this one.

**Recorded because a wider budget will look like an invitation to undo it.** Someone authoring a theme with more headroom — a lighter `bg`, a less recessive `muted` — will find room for a second background and read this section as a constraint that has lifted. It has not: the constraint produced the better answer, and restoring the background trades a signal that survives monochrome for one that does not. The order is: the tint budget is spent, *and* underline degrades better. The second reason outlives the first.

**Degradation needs no new principle.** C10 §4's surfaces already degrade to nothing at 1-bit and `resolve`'s surface path already implements it, so a diff background is a surface. What makes losing it lossless is I13.

**What does follow is a real new check**: the contrast floor extends to diff backgrounds. They are surfaces, so everything painted on them must clear its floor against them exactly as tones clear it against `bg` and `bgElev` — and because the background covers the whole row, that is the nine `syntax` slots *and* the three gutter tones, in both variants. It gives nobody a choice; it prevents a bad one, by failing at load if a theme ships a background nothing reads on. See C10 §4.

The three options, kept because the reasoning is the reason the decision holds:

| | |
|---|---|
| **(a) Add `background?` to `Style`** | Additive, and what real terminal diff tools do. Needs a degradation rule (C10 §4 already degrades surfaces to *nothing at all* at 1-bit, so the precedent exists) and changes contrast validation from fg-on-surface to fg-on-bg, which is a real change to C10 §4 |
| **(b) Prefix carries it alone; syntax owns the foreground** | Defensible under D29 — information must not ride on colour anyway — but added and removed lines end up the same colour, distinguished only by `+`/`-`. A worse diff |
| **(c) Context lines get syntax, changed lines get tone** | Coherent, and backwards: highlighting is suppressed exactly on the lines you most want to read |

Attributes are already spoken for: bold and dim are how 1-bit carries tone (C10 §5), so they cannot also carry line kind.

**The palette is not the knob, and it looked like it.** Authoring a strong `diffRemove` to get plain removed lines does not work: a strong background does not render coloured text *plain*, it renders it *muddy* — unreadable syntax rather than legible default foreground. Those are different outcomes and only one of them is what the request means. There is no clever way around a flag if the preference turns out to be real, and §2 records the experiment that would establish it.

---

## 7. Commitments

1. C25 renders textual diffs; `diff` remains the structured comparison and the two never merge (I8).
2. Nothing wraps, because a wrapped diff line destroys the alignment that makes a diff readable (I2). Height is exact at every width and constant within a layout, stepping once at the breakpoint (I1, I2a).
3. A collapsed region is one row stating its own count (I5).
4. `+` and `-` carry the distinction; tone reinforces it and never replaces it (I4).
5. Two layouts, chosen by width — unified when narrow, split when wide. The breakpoint is a §3 value, tuned against golden frames rather than promised (I2a).
6. C25 registers through C09's public mechanism and is not privileged (I6).
7. C25 declares no block types and holds no state (I7, I8).
8. Tokenisation is C09's; `measure` never tokenises (I3).
9. An unregistered language renders as plain text, not an error (I9).
10. Word-level highlighting is deferred and the block shape does not foreclose it (I10).
11. All three line kinds are syntax-highlighted; only the gutter varies by kind, and every row therefore uses two palettes at once (I12, → C10 I16). In split layout the background is a side's rather than a row's (I12a).
12. The line background is a third signal and never the only one; at 1-bit it is gone and the diff is still a diff (I13, → A01 D29).
13. The collapsed form is capped at one viewport and cuts at hunk boundaries, stating how many hunks it dropped (I14).
14. Inline expansion is offered when the expanded form fits `maxExpandHeight` and fullscreen otherwise; the number is configurable and the behaviour is not (I15, I16).
15. Fullscreen is every hunk of this block uncollapsed, never the whole file — the whole file is the editor's, and it is one component rather than two (I17).
16. A window is a rebuilt `Patch`, its path and hunk headers sticky because the shape forces them, and its collapse markers present only on the windows their rows fall in (I18, I20).
17. A window cuts at run boundaries in split layout, because pairing is not additive across an arbitrary cut (I19).
18. A window carries `Hunk.header` verbatim and never reconciles it with the lines it shows (I21).
19. The collapsed cap and the expansion threshold are specified here and are **not this component's to satisfy**: both are functions of the viewport, and a renderer that could see one would be a renderer whose `measure` is no longer pure over `(block, width)` (I14, I15, §3a).

---

## 8. Tests

Six tiers. No state machine, so no transition table (A02 §7).

### Tier 1 — unit

- **T1.1**: a single-hunk patch measures `1 + 1 + lines.length` at a unified width.
- **T1.1a** (I2a): the same patch at a split width measures `1 + 1 + pairedRows`, and `pairedRows` is `max(removes, adds)` per run of consecutive changed lines. Asserted on a hunk with one removed line and two added ones, where the two figures differ — a hunk whose runs are all one-sided would pass either arithmetic.
- **T1.2**: a three-hunk patch measures the sum across hunks plus one file header.
- **T1.3** (I5): a hunk with `collapsedBefore: 12` measures one row more than the same hunk without it, and the marker states `12`.
- **T1.4** (I5): `collapsedBefore: 1` still occupies exactly one row — a collapse of one is not expanded silently.
- **T1.3a** (I5, → C04 §3): `collapsedAfter` adds exactly one row and it is the **last** row. The region `collapsedBefore` structurally cannot reach.
- **T1.3b** (I5): a patch with no hunks and a `collapsedAfter` is two rows — a header and a marker. It says the file is unchanged and states how much of it there is, which is a legitimate thing for a patch to say.
- **T1.3c** (I5): `collapsedAfter: 0` is absent, exactly as `collapsedBefore: 0` is.
- **T1.3d** (§2): the illustration with both ends elided measures twelve, and the figure's two markers read 14 and 170. The figure and the formula checked against each other rather than each against itself.
- **T1.5**: the layout threshold at widths 99, 100 and 101 → unified, split, split.
- **T1.6**: an explicit `layout: "unified"` at width 200 stays unified.
- **T1.7** (I4): every `add` line renders `+` and every `remove` renders `-`, at all four colour depths.
- **T1.8**: a line missing `oldNo` renders a blank number column, not a shifted gutter.
- **T1.20** (I19): for the illustration's hunk at a split width, `measure` of the whole equals `measure` of the two halves summed **at every run boundary**, and differs at the one cut inside the run. Both directions asserted, because the equality alone passes for an implementation that never pairs.
- **T1.21** (I18): a window opening mid-hunk measures one path-header row plus one hunk-header row plus its slice. The sticky rows counted, not assumed — a budget computed as `region.height` produces a window one row too tall and C15 reports `truncated`.
- **T1.22** (I20): the same patch windowed at the top, the middle and the bottom — `collapsedBefore` appears once, `collapsedAfter` appears once, and neither appears on the middle window.
- **T1.23** (I21): a window of three lines from a seven-line hunk carries the hunk's original `header` string unchanged.

### Tier 2 — contract / interface

- **T2.1** (I1, the headline): for the fixture corpus × widths {40, 60, 80, 100, 120, 160, 200}, `measure` equals the rendered row count.
- **T2.2** (I2a): for every fixture, `measure` returns one value across {40, 60, 80} and one across {100, 120, 160, 200} — two values, not seven, and the step is at the declared breakpoint. A patch that wraps would give more than two.
- **T2.3** (I6): `patch` is registered via `registry.register`; removing the call removes the kind, and no built-in fallback path supplies it.
- **T2.4** (I7): `measure` called a hundred times returns the same value; no I/O, no state.
- **T2.5** (I3): `measure` performs no tokenisation — a spy on C09's tokeniser records zero calls across the corpus.
- **T2.6** (I8): C25 exports no block type; `Patch` and `Hunk` resolve to C04.

### Tier 3 — edge cases

- **T3.1**: zero hunks → the file header alone, one row. No throw.
- **T3.2**: a hunk with only `context` lines → measures normally; nothing is toned `ok` or `error`.
- **T3.3**: a 10,000-character line → truncates, occupies one row, and height is unchanged.
- **T3.4**: `language` naming an unregistered language → renders plain, no error, height identical.
- **T3.5**: `language: ""` → same as unregistered.
- **T3.6** (I2a): the same patch at widths 40 and 80 measures identically, and at 100 and 200 measures identically — the constancy is within a layout, and asserting it across the breakpoint would assert the thing that is false.
- **T3.6a** (I2, I2a): a patch of only `context` lines measures identically at 40 and at 200. With no changed lines there is nothing to pair, so the step vanishes and the two layouts agree — which is the case that would hide a wrap, and the reason T2.2 uses a corpus rather than one fixture.
- **T3.7**: a hunk whose `header` is longer than the width → truncates to one row.
- **T3.8**: `collapsedBefore: 0` → treated as absent; no marker row.
- **T3.9**: a patch where every line is `add` (a new file) → no `remove` lines, height exact, and unified and split agree because every run is one-sided.
- **T3.10** (I14): forty single-line hunks against a twenty-four-row viewport → the collapsed form stops at a hunk boundary within one viewport and states how many it dropped. No hunk is half-rendered.
- **T3.11** (I15, I16): a patch whose expanded form exceeds `maxExpandHeight` → inline expansion is not offered and fullscreen is; one whose expanded form fits → expansion is offered. Both decided without rendering either.
- **T3.12** (I16): `maxExpandHeight` at 1.5 and at 4 → the threshold moves; there is no value at which expansion stops existing.
- **T3.13** (I12): a `remove` line whose text is a YAML key → the gutter is `error`-toned and the key is `syntax.key`, on the same row. The row that would have been dropped by option (c).

### Tier 4 — integration

- **T4.1** (with C09): `patch` measures and renders through the registry dispatcher, not directly.
- **T4.2** (with C10): at `colourDepth: 1`, every line's distinction survives as prefix plus typographic style; no colour code is emitted.
- **T4.3** (with C10): the `syntax` palette resolves inside a patch line — the widened I16 in force.
- **T4.4** (with C09, ascii): `unicode: "ascii"` → the collapse marker is `...`, height unchanged, no codepoint above U+007F.
- **T4.5** (with C14): expanding a collapsed region shifts subsequent blocks by exactly the measured delta; no drift over fifty expand/collapse cycles.
- **T4.6** (with C24): `b.patch({…})` produces a block that validates and renders.
- **T4.7** (with C10, I13): at `colourDepth: 24` a changed row carries a background; at 4 it carries the curated index; at 1 it carries none, and the marker and the toned gutter are still there. The degradation ladder walked on one row.
- **T4.8** (with C10, I12): every `syntax` slot and every gutter tone clears its contrast floor against all four diff backgrounds, in both variants. C10's check, asserted from the patch side because C25 is the consumer that made the surfaces text-bearing.
- **T4.9** (with C10): the background covers the row to the full width, so a short line's padding carries it too. A background that stopped at the text would be ragged, and the row is the unit the reader sees.

### Tier 5 — e2e

- **T5.1**: S10's manifest change end to end — a two-line change renders as two changed lines plus context, not a forty-line block.
- **T5.2**: a patch at 60 columns is unified and readable; the same patch at 160 is split.
- **T5.3**: under `LANG=C`, a patch renders ASCII-only with no mojibake.

### Tier 6 — fail-on-revert

- **T6.1** (I2): making long lines wrap → T2.2 sees more than two heights across the seven widths, and the gutter stops lining up.
- **T6.1a** (I2a): making split stack rather than pair — every line its own row, blank opposite → T1.1a fails, and split becomes unified with wasted columns. The revert that looks like a simplification, because it restores the width-independence the original I2 claimed.
- **T6.8** (I12): suppressing syntax on `remove` lines → T3.13 fails. The convention this spec rejected, and the one a reader is most likely to restore from another tool.
- **T6.9** (I13): carrying the add/remove distinction on the background alone, dropping the marker → T4.2 fails at 1-bit, where the background is gone and nothing is left.
- **T6.10** (I14): capping the collapsed form by row count rather than at hunk boundaries → T3.10 fails with a half-rendered hunk.
- **T6.11** (I16): making expansion itself configurable → T3.12 fails, and a dropped hunk becomes unreachable (D38).
- **T6.20** (I19): windowing at arbitrary line offsets in split layout → T1.20 fails, and a line is drawn on two consecutive pages. **The revert that looks like a simplification**, because snapping to a run boundary reads as an optimisation and the common case — a window landing in context — passes either way.
- **T6.21** (I20): carrying `collapsedAfter` on every window → T1.22 fails, and every page claims to be the last.
- **T6.22** (I21): recomputing `Hunk.header` from the window's lines → T1.23 fails, and C25 acquires a dependency on a field §4 says it never reads.
- **T6.2** (I1): counting a collapsed region as its collapsed line count → T1.3 fails.
- **T6.15** (→ C04 §3): moving `collapsedAfter` onto `Hunk` beside `collapsedBefore` → one region gains two fields. The revert that looks symmetrical: the gap between hunk 1 and hunk 2 becomes 1's *after* and 2's *before*, so a producer has to know which describes it and a renderer has to decide which to believe. Asserted as three regions, three markers, no region described twice.
- **T6.16** (I5): counting the tail as its elided line count → T1.3a fails.
- **T6.3** (I6): making `patch` a privileged built-in → T2.3 fails.
- **T6.4** (I4): rendering the add/remove distinction with tone alone → T4.2 fails at `colourDepth: 1`.
- **T6.5** (I3): tokenising inside `measure` → T2.5 fails.
- **T6.6** (§3): flipping the layout threshold so split is the narrow form → T1.5 fails, and every line truncates at 60 columns.
- **T6.7** (C04 commitment 20): merging `patch` into `diff` behind a mode flag → T2.1 fails, because height then depends on the mode rather than the block.

---

## 9. Out of scope

| Not here | Where |
|---|---|
| The `Patch` and `Hunk` shapes | C04 |
| Producing hunks from two texts | The app. C24 exports no diff-parsing helper — a diff algorithm is not in the runtime-dependency budget |
| Tokenisation | C09 |
| The `syntax` palette and the composition rule's resolution | C10 |
| **Word-level highlighting within a changed line** | Deferred. It is where diff viewers earn their keep and also where they get slow — an intra-line diff is a second diff algorithm running per changed line. The block shape does not foreclose it: a `spans` field on a line would be additive |
| Expanding a collapsed region | C23 dispatches it; expansion patches the document (C11 T4.7's mechanism) |
| Syntax highlighting of the whole file | `code`, C09 |
| The fullscreen view's implementation | C15, when L2 lands. §3b specifies it so that it is not designed twice |
| A whole-file view with diff decoration | The editor, and it is the same component as the fullscreen view with more data (§3b) |

### Open

**`code.startLine` is not landing here.** Scratchpad 6 §3 designs it — a number rather than a boolean, absent meaning no gutter, the width derived — and its consumer is S08, which is not built. It is additive and optional so nothing breaks, but it changes golden frames for every `code` fixture that opts in, and touching a built component for no consumer is the thing the discipline exists to prevent. `markLine` is weaker again and stays open.

**`hunksFromStructuredPatch` is not landing here.** The `diff` package's `structuredPatch` output maps mechanically onto `Hunk` — split the sigil, derive the header, count from `oldStart`/`newStart` — and the inclination is that the *type conversion* is worth shipping while the *dependency* stays the app's. One function, no dependency, and unresolved: it may belong in `tui-kit/testing`, in the app, or nowhere.

**Lezer is researched and undecided.** Scratchpad 6 §4 measures it against lowlight — 856 KB against 9.5 MB, incremental by design, and a **closed** tag vocabulary of 78 tags, which is the palette-slot argument arrived at independently. Switching would rewrite C09's tokenisation section and its hljs map, change `DEPENDENCIES.md`, and re-record the goldens, and it has no consumer until either the editor or a second language exists. Recorded because the obstacle it answers — a resumable parser for Node — was the thing blocking the editor, and it is answered.
