# C14 — Viewport

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` |
| **Layer** | L2 viewport |
| **Depends on** | C13 `TranscriptView` (entries, `Change`, `rev` — never the store, C13 I19) · C09 (`measureSequence` via the registry) |
| **Consumed by** | L4 (renders the visible range) · C16 (scroll keys) · C15 (overlays sit above it) |
| **Source** | A01 D1, D2, D34, D40 · A02 §2, §4, §7 · the Ink plan, phases 3–4 |
| **Status** | Draft |

---

## 1. Purpose

Alt-screen means the terminal's own scrollback is gone (D2). C14 is what replaces it: scroll state, the decision about which entries are visible, and the cached heights that make that decision cheap at a hundred thousand blocks.

Everything upstream earns its keep here. Measured height equals rendered height (C09 I1), so C14 can decide visibility without rendering. Heights depend on width alone — not theme, not colour depth, not unicode mode, because C10 and C09 guarantee geometry is identical across all of them — so the cache key is small and switching a theme costs nothing. C13's `rev` says when a cached height is stale.

The failure to design against is drift: a viewport whose arithmetic disagrees with what is drawn does not look broken, it feels broken — content jumps as you scroll past it, and the cause is three components away.

---

## 2. Scroll model

**The unit is a display row, not an entry.** Entries range from a one-row notice to a five-hundred-row log tail, and scrolling by entry would jump wildly. `topRow` is an absolute row offset into the concatenated transcript.

```typescript
type ScrollState = Readonly<{
  topRow:         number;
  viewportHeight: number;
  totalRows:      number;
  followTail:     boolean;
}>;

type Anchor = Readonly<{ id: EntryId; rowOffset: number }>;   // row within that entry

type VisibleRange = Readonly<{
  entries:   readonly Readonly<{ id: EntryId; skipRows: number; takeRows: number;
                                 live: boolean }>[];
  topRow:    number;
  atTop:     boolean;
  atBottom:  boolean;
}>;
```

`live` is carried per entry so the frame can draw the **live gutter** (`▌`, D6) beside the live block's rows without re-consulting C13 per row. **C14 marks; S01 draws.** The live gutter is frame chrome, not block content — putting it in a block would make it part of every measurement and every theme. **Superseded as a drawing by ruling 68 (review batch 4, M11 item 1)**: no live gutter was ever drawn — liveness is the spinner (`R-GLY-003`, M4) — and the column it described belongs to the selection rail (§6d, I57, I58). `live` is still carried; nothing in the frame reads it for a mark.

**"The live gutter", never "the marker".** C13's eviction marker is an ordinary entry that costs the rows it measures (I13); this costs none. Calling both of them the marker left T1.17 reading as a claim about the eviction one, distinguishable only by which invariant it cited — which is precisely the citation defect class the audit records, arriving through a name rather than a number.

`skipRows` lets an entry be partially visible at either edge — a 500-row log block scrolled halfway is one entry with `skipRows: 250`.

**`visible()` is answered from a memo between movements** (I30). The range is a pure function of the entries, the top row, the region's height and the live entry, and each of those moves only through a path this component owns — a scroll, a content change, a resize, a clear — every one of which ends in `#setTop`, I2's clamp. So the clamp is where the memo is dropped, and a caller asking twice with nothing moved is handed the same frozen object. **Why** (F1198): C23's refresh driver asks *is this host on screen* once per live part per sweep, and L4 answers it from this range; at two hundred parts ticking every 16 ms that was twelve thousand range computations a second and a tenth of a core, for a yes-or-no that changes only when the viewport does. `stats` reports the memo's hits and misses beside the height cache's (I27's rule).

### Movement

| Input | Effect |
|---|---|
| Input | Effect | Bound |
|---|---|---|
| `PageUp` / `PageDown` | `viewportHeight − 1` rows, so one line of context carries over | `global` |
| `⌃Home` | `topRow = 0` | `global` |
| `⌃End` | Bottom, and `followTail` back on | `global` |
| Wheel | Three rows, when mouse is enabled | not a key |
| `↑` / `↓` | One row | **nothing** — see below |

C14 exposes these as operations; the keys that invoke them are C16's, and C16 I23 now names all of them. **This table said `Home` and `End` and it was wrong in a way nothing could see**: the prompt binds both to the line's start and end and resolves ahead of `global` at every moment it has focus, so the two operations had callers in L4 that no keystroke could reach. The document's extremes are `⌃Home` and `⌃End`, which is the distinction every editor draws.

**`↑`/`↓` is the same shape and is left as found rather than picked.** They are the prompt's history bindings for exactly the reason `Home` was the prompt's, so a one-row scroll has no key. `⌃↑`/`⌃↓` is the consistent answer and nothing has ruled it, `scrollBy` has a live caller in the wheel so the operation is not dead, and inventing a binding while recording that inventing bindings is how this went wrong would be its own defect. Named here so the next ruling has a subject.

### A region row resolves to an entry here

```typescript
entryAtRow(row: number): Readonly<{ id: EntryId; rowOffset: number }> | null;
```

A mouse click arrives as a position and has to become a target. C16 §4 routes mouse events by position rather than by focus, and the middle step — a region row becoming the entry drawn there — is scroll arithmetic, which §2 and §11 both place here.

It was specified nowhere until C16's spec pass, while C16's dependency line already claimed to consume it. The alternative was C16 walking `visible()` and accumulating `takeRows` itself, which works and puts the viewport's arithmetic in the router: two components computing where a row is, agreeing until one of them learns about `gapBefore` or the live gutter and the other does not.

**It returns `rowOffset` as well as `id`**, for the same reason `Anchor` carries one (I6). An entry alone answers "which block was clicked" and not "which row of it", and the row is what C11 needs to resolve a row action. Returning the id alone would push the second lookup back to the caller, which is where this started.

`null` for a row outside the viewport's occupied rows. **The rows are the viewport's own, addressed from its top; a short transcript leaves unoccupied rows, and the frame draws them *above* the content** — `paint.ts` bottom-aligns the transcript so it grows towards the prompt, and L4's `entryAtRegionRow` subtracts that alignment from the region row before asking here, reading it from the one exported function the composer paints with (`blankRowsAbove(regionHeight, rows)`, C22). The blank rows are the region's and not the transcript's: a click on them is a click on nothing, and `entryAtRow` never learns how the region was aligned. This sentence said *below* for as long as it existed while the frame said above (F755); the two agree exactly when the transcript fills the region, which is every long session and no short one.

**Pure, and no cursor of its own.** `entryAtRow` reads the index and the current scroll, and stores nothing. Native selection's row cursor is §6's; this is a query.

---

## 3. Follow-tail

`followTail` is on while the viewport is at the bottom. New content scrolls into view; the user watches a log without touching anything.

```
scroll up by any amount        → followTail off
scroll to bottom               → followTail on
End                            → followTail on
new content while following    → topRow tracks the bottom
new content while detached     → topRow unchanged, content grows below
```

**Content growing above the viewport must not move it.** A frozen streaming entry (C13 §2) that gains rows while the user reads something further down would otherwise shove the view. The anchor is what prevents it: when detached, `topRow` is recomputed from `(anchorId, rowOffset)` after any height change, so the same content stays on the same screen row. Only the rows *below* move.

This is the Ink plan's "Page Up does not jump when a streaming message grows", and it is the single most noticeable correctness property in the component.

---

## 4. The height index

Deciding what is visible needs a prefix sum over entry heights. A linear walk is O(n) per frame and dies at a hundred thousand entries.

**An entry's height is `measureSequence(entry.doc.blocks, width)`, and it is now equal to `Σ measure(b, w)`.** It was not: the two differed by one row per block declaring `gapBefore`, which C09 I17 applied at the sequence and never at the block, and a surface like S07 declares spacing on most of its blocks — so the natural summation was short on nearly every entry. **That gap closed when the spacing moved inside the block** (C04 §3a, C09 I80): `sequenceHeight` is a fold of `measureChild` and nothing else.

**Name the function anyway, and the reason changed rather than went away.** It is no longer *the summation is wrong*; it is that `measureSequence` is the seam carrying the memo and the containment (C09 I11, C09 I26a), so a caller that folds by hand gets the right number today and loses both the moment a kind's measure throws. The old symptom — §1's drift, invisible because it looks like nothing — is what the equality removed; the remaining cost of hand-folding is ordinary and visible.

**A Fenwick tree over per-entry heights.** Append is O(log n), patch is O(log n) on the delta, and the "which entry contains row R" query is O(log n). Eviction from the front is handled by an offset rather than a rebuild.

**The offset is right for one eviction and wrong for a session.** C13's cap evicts continuously, so an offset that never compacts grows the array with *total appends ever* while the live entry count stays under the cap — a terminal left open all day is the normal case, not the extreme one. So the offset carries the common case and the array is **rebuilt when the evicted prefix exceeds the live entry count**:

```
on evict(n):
  frontOffset += n
  if frontOffset > liveCount: rebuild()
```

That keeps the array within twice the live count, and the rebuild is amortised O(1) per append because `frontOffset` evictions must accumulate to trigger one O(n) pass. The trigger is a property of the structure rather than a tuned constant, which is what stops it needing revisiting whenever the cap or a typical entry size changes.

The index is derived state, maintained **incrementally** on append, patch and eviction, and **rebuilt wholesale only on a width change** — because a width change invalidates every height at once and an incremental path would be slower than a rebuild.

### The cache

```
cache: Map<EntryId, { rev, width, height }>       // one slot per entry

read(id, rev, width):
  slot = cache.get(id)
  slot !== undefined && slot.rev === rev && slot.width === width
    ? slot.height
    : miss
```

**`(entryId, rev, width)` is a validity predicate, not a map key**, and saying so is what stops the wrong implementation being written. Read as a composite map key it describes a table holding one entry per revision — so a `--watch` at a thousand lines a second accumulates a thousand slots for one entry, which is the leak T3.18 exists to catch and T5.3 runs straight into. There is never a use for a previous revision's height: the moment `rev` moves, the old value is wrong.

One slot per entry makes that structural. A patch overwrites, an `evict` deletes by id, a width change clears — C13's `Change` variants map onto the three operations directly, with no key enumeration and no eviction policy of its own. T3.18 then holds by construction rather than by a line in the table below that someone must remember to implement.

**Theme and capabilities are deliberately absent from the key.** C09 §4 guarantees capability substitutions are 1:1 by cell count, and C10 T4.1 asserts geometry is identical across themes and colour depths. So a theme switch invalidates the *frame* (C03) but not a single cached height, and a `LANG=C` session measures identically to a UTF-8 one. That is a real payoff from constraints imposed three components upstream.

Invalidation:

| Event | Effect |
|---|---|
| `append` | Measure one entry; push onto the index |
| `patch` | `rev` changed → remeasure that entry, **overwrite its slot**, update the index by the delta |
| `settle` | **Remeasure that entry, exactly as `patch` does.** A bare `settle(id)` changes nothing and its cached height is returned unchanged, so sharing the arm costs a lookup; `settle(id, doc)` replaces the document and moves `rev`, which is a content change by any reading |
| `evict` | Delete those ids; advance the front offset, and rebuild if it now exceeds the live count |
| `clear` | Drop everything |
| Width change | Drop everything, rebuild the index |

**The `settle` row said "Nothing" and was true when it was written.** C13's `settle(id)` ended a stream and left the document alone, so there was nothing to remeasure. `settle(id, doc)` arrived later — C13 §settle, ruled while C23 was being built — and it *replaces* the document and moves `rev`. The row was not re-read, and the consequence is the failure the paragraph below already describes: the app route appends a pending entry with no blocks, measures it at zero, settles it with the real document, and the height stays zero. `totalRows` of 0, an empty visible range, and a blank screen with an entry sitting in the store.

**Found the same way as last time — by reading a frame.** Every unit test of every piece passed: C13 settles correctly, C14's cache invalidates on `rev` correctly, C09 measures correctly. Nothing compared the transition. That is the second instance of this exact symptom in this component, and the first is described immediately below.

**The table reads as though each `Change` arrives at a store that changed only in that way, and C13 does not work like that.** One `transcript.append()` emits `append` **and then** `evict`, so when the `append` row above runs, the entry list has *already* lost its front and gained the eviction marker at its head. "Measure one entry; push onto the index" is correct only when nothing was evicted alongside, and the `evict` that follows is then repairing an index that desynchronised one row earlier.

So the index **tracks the ids it currently mirrors** and diffs them against `entries`, rather than inferring the shape of the change from its kind. A pure tail append stays O(1) and a front eviction O(k) — the only two shapes C13 produces — and anything else rebuilds, which is correct at any cost and unreachable today. The failure this prevents is not a wrong number: it is `totalRows` of 0 and a blank screen with three entries in the transcript, which every assertion about anchors and clamping reports as a pass. **It was found by reading a frame, not by an assertion disagreeing.**

**The post-conditions in I3 and I9 hold per public operation on the store, not per emitted change.** Between the `append` and the `evict` of a single call, the cache legitimately holds slots for entries that have just left. Asserting inside a `Change` callback would be asserting against a half-applied operation.

C13's granular `Change` (I12) is what makes this incremental. A bare "something changed" would force a full remeasure on every log line, which at a thousand lines a second is the difference between working and not.

**No overscan in v1.** Rendering beyond the viewport is a browser optimisation whose benefit assumes partial DOM updates; here every frame is composed whole and A02 §7's budgets are met without it. It is a measurable addition later, not a default.

---

### 4a. One block's rows on the render path — bounded, with a residue

**Ruled 2026-09-03, measured first.** D40 caps *blocks per document* (C13 §4); nothing capped
*rows in one block*, and the transcript's render path — `session.ts` calling
`registry.windowSequence(entry.doc.blocks, width, from, to)` — pays for every kind that
declares no `window` (C09 I25) by painting the whole block and dropping rows. Measured
against `dist/`, one block, a 40-row window at width 100:

| kind | lines | `windowSequence` keeps | paint |
|---|---|---|---|
| `code` | 2 000 | 2 000 of 2 000 | 1 406 ms |
| `code` | 20 000 | 20 000 of 20 000 | 11 360 ms |
| `raw` | 2 000 | 2 000 of 2 000 | 941 ms |
| `raw` | 20 000 | 20 000 of 20 000 | 6 880 ms |
| `logs` | 2 000 | 40 of 2 000 | 21 ms |
| `logs` | 20 000 | 40 of 20 000 | 30 ms |

`measure` is cheap at every size (≤ 12 ms) and so is the window arithmetic; the cost is the
paint, and it is linear in the block rather than in the region. A 2 000-line `code` result —
a `--json` inspection of a long list, a file shown whole — costs seventy times the frame budget
**on every frame** the entry is on screen, and roadmap 46 rules that the app may not wrap it in
a `scroll` in the transcript. So the bound has to come from the seam that already exists.

**The ruling: every kind whose rows are its lines declares a `window`, and the render path
draws at most the region's rows of any block plus its residue.** Four kinds do — `logs`,
`patch`, `table`, `keyValue` — and two do not: `code` and `raw`. Neither needs a new block
kind or a registry-side cap; each gains a `window` of the shape `logs` already has, with one
pin (I23).

**The pin is what makes `code` different from `logs`, and it is the rule interaction to
write down.** A `code` block's tokens can span lines — a block comment is one token across
four — so a slice that carried only the sliced *text* would re-tokenise from its first line
and draw a comment's tail as code. The same class as `table`'s `presorted`: the slice must
pin what the whole block derived. The window therefore keeps `text` whole (the same string,
no copy) and sets a `lineRange: [first, last]` the renderer and `measure` both honour, so
tokenisation runs over the whole text and only the rows in range are produced. `lineRange` is
view state and arrives from no far side (C04 I67), exactly as `presorted` does. `raw` has no
tokens and needs no pin; its window slices lines. **Units are source lines, not rows**: a
wrapped line is one unit, so a window never opens in the middle of a wrapped line, and the
residue is paid in `skipRows`/`dropRows` as C09 I26 requires.

**What this does not do.** It does not cap what an adapter may put in one block — a
2 000-line `code` block is still 2 000 rows to scroll through, which is roadmap 46's
territory and, since §4b landed, the row cap's — and it does not touch the first measure of a
new entry, which is a property of `codeRows` and already cheap. It bounds the paint, which is
the whole of what lagged.

**Owner.** The definitions live in `presentation/blocks/kinds/code.ts` and `simple.ts` (C09);
this section states the bound the viewport relies on, and C09 I25 and C09 I26's rows check the
windows generically. **Both landed on the day this was written**, and I23 is true for every kind
whose rows are its lines. Measured again with the same probe against `dist/`, on a quieter
machine than the table above (its `logs` row re-measured 14 ms here against 21 ms there, so the
before/after pairs are read on one machine):

| kind | lines | `windowSequence` keeps | paint, before | first paint, after | steady-state paint, after |
|---|---|---|---|---|---|
| `code` | 2 000 | 40 of 2 000 (was 2 000) | 934 ms → 2 000 rows | 146 ms → 40 rows | **34 ms** |
| `code` | 20 000 | 40 of 20 000 (was 20 000) | 7 624 ms → 20 000 rows | 773 ms → 40 rows | **38 ms** |
| `raw` | 2 000 | 40 of 2 000 (was 2 000) | 578 ms → 2 000 rows | 19 ms → 40 rows | **7 ms** |
| `raw` | 20 000 | 40 of 20 000 (was 20 000) | 5 814 ms → 20 000 rows | 17 ms → 40 rows | **12 ms** |
| `logs` | 20 000 | 40 of 20 000 | 14 ms | 14 ms | 19 ms |

**Two columns after, because `code` pays once.** The first paint of a `code` block tokenises the
whole text — the pin keeps it whole, so the memo key is the same string on every frame after — and
that cost is the block's, paid on entry and never on scroll; `tokenLines`' cut is memoised on the
token array for the same reason (measured: 64 ms steady-state at 20 000 lines before it was, 38
after). What remains linear in the document is a control-strip and a split over the text per
frame, ~20 ms at 20 000 lines, which is the residue the heading names. **T1.18 asserts the rows
produced rather than the milliseconds** — a CPU-fraction assertion measures the host, and the row
count is the property the paint is linear in; the figures here are the record.

---

### 4b. The cap — rows one block may occupy, and the marker that says what was cut

**Ruled 2026-09-04, measured first.** §4a bounds what one *frame* paints of a block; nothing
bounded the block. A 50 000-row `logs` result is still 50 000 rows to scroll through, and every
path with no window — a `panel`'s children, a pushed view's content, the conformance suite's
whole render — paints all of them. The roadmap's *and a bound, because a fix is not a guarantee*
suggested 2 000 rows with a visible marker, and named the whole-block `measure` as the cost.
Measured against `dist/`, one block at width 100, before anything was built:

| kind | rows | `measure`, whole | paint, whole | paint of `window [0, 500)` | `[0, 1 000)` | `[0, 2 000)` | `[0, 5 000)` |
|---|---|---|---|---|---|---|---|
| `logs` | 2 000 | 0.1 ms | 804 ms | 165 ms | 279 ms | 506 ms | — |
| `logs` | 50 000 | 0.2 ms | — | 163 ms | 323 ms | 566 ms | 1 478 ms |
| `raw` | 50 000 | 20.5 ms | — | 157 ms | 238 ms | 454 ms | 1 122 ms |
| `code` | 50 000 | 17.7 ms | — | **1 696 ms** first, 196 ms after | 361 ms | 699 ms | 1 568 ms |
| `table` | 50 000 | 0.6 ms | — | 131 ms | 210 ms | 400 ms | 940 ms |

(`code`'s 20 000-row whole paint was 7 339 ms and `table`'s 3 872 ms; the 50 000-row whole paints
were not taken.)

**Three things the figures say, and the first one corrects the premise.** The whole-block
`measure` is not the cost: 0.6 ms for a 50 000-row `table`, 0.2 ms for `logs`, and ~20 ms for
`raw` and `code`, which is one split of the text. **A cap cannot bound it anyway** — the marker
has to say *of 50 000 rows*, and knowing the total is the whole of what `measure` does — so the
sentence that motivated the cap names a cost the cap does not touch and that does not need
touching. Second, **paint is ~0.25 ms a row for every kind and linear with no knee**; nothing in
the table picks a number, because halving the cap halves the cost at every size. Third,
**`code`'s first paint tokenises the whole text whatever the window** — 1 696 ms at 50 000 rows
for a 500-row window — because the window keeps `text` whole for the pin (§4a, C09 I25a). The
cap through the window seam inherits that: the parse stays linear in the block. At `from === 0`
the pin is unnecessary — nothing precedes the slice — so a `code` window opening at the first
line could cut its text and tokenise only what it keeps; that is C09's to land and is recorded
here rather than built around.

**The ruling.** `TuiConfig.maxBlockRows`, default **2 000**, is the most rows one block may
occupy. The default is a reading-length policy and not a figure the table produced: fifty
screens of forty rows, and the number `MAX_ROWS` already gives the fallback adapter — one number
in the tree rather than two that drift. It is the app's to raise, per session; a per-block
override is **not** in scope, because a cap an adapter can lift per block is a cap on nothing.

**A capped block draws its first rows and one marker row in `muted`** — `… 2,000 of 50,000 rows`
(`~` on an ASCII terminal, `truncate`'s own pair) — D40's shape (C13 I14) one axis over. The
marker is a row: `measure` counts it, the window sees it, and a reader scrolling to the block's
foot reads what was cut rather than a block that happens to end. The alternative, a silent cut,
is the empty-block class again.

**It lives in one place, generic over `BlockDefinition`**: the registry's own `measure`, `render`,
`elementsOf` and `windowSequence` (C09 §2b) resolve a block to its *capped form* before the
definition sees it. The capped form is the definition's own `window(block, w, 0, cap)`, so **no
kind implements the cap** and every kind that can be windowed is capped by the same code; the
form carries `capped: { shown, total }` as view state, on `lineRange`'s argument (C04 I82) —
written by the framework and refused from a far side. `shown` is `measure(window.block)` and not
`cap`, because a window is a unit boundary: a `table` whose 2 000th row is expanded keeps the
whole row (C09 I26's `dropRows`) and the marker says `2,003 of 50,001`, which is true. **Both
numbers are display rows** — the unit `measure` counts and the reader scrolls — so a table's
marker counts its header and its expanded details, not its data rows; the cap is on what a block
*occupies*, and a kind's own unit is the window's business.

**What is inside the cap and what is out, and it is one predicate.** The cap applies to exactly
the kinds that declare `window` — `logs`, `raw`, `code`, `patch`, `table`, `keyValue` — because a
kind's `window` is its statement that its rows are its lines. The kinds atomic by ruling are
outside it by the same absence: `plot` (C12 I1 — reducing its data changes nothing about its
height), `image` (a picture has an aspect, not lines), `scroll` (C04 §3c — its height is
declared), `panel` and `group` (their height is their children's, and each child is capped
through the child seam), `mosaic`, and every single-row kind. **No list of kinds is consulted**,
which is what keeps the predicate right when a twentieth kind arrives: a kind that declares
`window` is capped on the day it does.

**The window and the cap compose, and the marker travels with the piece that reaches it.**
`windowSequence` windows the *capped* block: rows `[from, to)` below the marker are the
definition's window over the capped form with `capped` stripped, so a window in the middle of a
capped block is byte-identical to one over the uncapped block; a window whose `to` reaches the
marker row carries `capped` onto the piece, and the piece measures its definition's rows plus
one. A window over the marker row alone takes the last content row and charges it to `skipRows`,
because no kind's window returns zero rows (C09 §2a, C11 I20). The field is attached *after* the
definition's window and never before it — `patch`'s window builds a fresh block and would drop
it, and a field a kind can lose is not view state.

#### The walk — indexed by rule interaction

| cell | the rules that meet | ruling |
|---|---|---|
| cap × window inside the capped rows | I23 · I24 | The piece is the definition's window over the capped form, `capped` stripped; rows are the uncapped block's rows at the same offsets |
| cap × window reaching the marker | I24 · I25 | The piece carries `capped`; `measure(piece) = definition.measure + 1`; the consumer's `takeRows` reaches the marker |
| cap × window over the marker alone | I25 · C11 I20 | `window(shown − 1, shown)` and `skipRows + 1`: one content row paid as slack, then the marker |
| cap × an expanded row at the boundary | I24 · C09 I26 | The unit is kept whole and `shown` says so; the marker reads `2,003 of 50,001` rather than a number the frame does not show |
| cap × `minHeight` floor | I24 · C09 I33 | Cap first, floor after: `max(shown + 1, floor)`. A floored block is not windowed and is still capped — the capped form is what `windowSequence` keeps whole |
| cap × D40's eviction marker | I24 · C13 I14 | Two axes, two markers, no interaction: D40 counts blocks per session and this counts rows per block. A session at both caps shows both, and the D40 notice is one row and never itself capped |
| cap × a block exactly at the cap | I24 | `total ≤ cap` → no marker and the **same block reference**, so nothing downstream can tell the cap exists |
| cap × `collapsedBefore` in a patch | I24 · C25 I18 | Collapsed regions are rows of the patch's own window; the path and hunk headers the window forces are inside `shown`; the fresh block `windowRows` builds is why `capped` is re-attached by the registry |
| cap × a container's child | I24 · C09 I7 | `panel`'s children reach the registry through `measureChild`/`renderChild`, so a 50 000-row `logs` inside a `panel` is capped where the panel's own paint could not be windowed |
| cap × `scroll`'s content | I24 · C04 §3c | The child is capped; `contentHeight` reads the capped height through the same seam, so the offset arithmetic and the drawn rows agree |
| cap × a piece re-entering the registry | I24 | A block already carrying `capped` is never re-capped: its definition's rows plus one, and its window strips or carries the field as above |
| cap × a throwing `measure` (C09 I11) | I24 · C09 I11 | The capped form needs the whole measure and never exists for a block whose measurer threw; containment is unchanged and the error block is drawn at the committed height |
| cap × `elements` (C26) | I24 · C26 I8 | Elements are declared over the capped form: nothing beyond the cap can be focused, and the marker row declares none |
| cap × the height cache (I3) and the lines cache (C22 I58) | I24 · I3 | The cap is a registry constant for the session; no key changes |

**Read as frames, three cells**: a `logs` block one row over the cap (two thousand lines and the
marker, no third state); a `table` whose boundary row is expanded (the marker names the rows the
frame shows); and a window opening at row 1 998 of a 2 000-cap block (two content rows, then the
marker, and the rows are the uncapped block's 1 998 and 1 999).

**Owner.** The registry is C09's and holds the code (C09 §2b); this section holds the bound the
viewport relies on, and I24–I26 state it. `TuiConfig.maxBlockRows` is C24's shape and C22's
plumbing.

## 5. Resize

Width changes invalidate every cached height, because wrapping changes. Height changes do not.

```
on resize:
  0  if neither width nor height changed: return, emitting nothing
  1  capture the anchor before anything else
  2  if width changed: drop the cache, rebuild the index
  3  recompute viewportHeight from the same snapshot (C01 SIGWINCH, D31)
  4  restore topRow from the anchor
  5  clamp to [0, max(0, totalRows − viewportHeight)]
  6  if followTail: snap to the bottom instead
```

**Step 0 is a property of `resize`, not an accommodation for a caller** (I21). A resize to the size already held has no work in it, and the steps below are not inert: 1 and 4 capture and restore an anchor, and the emit at the end tells L4 something moved. A caller that hands over the same size therefore gets a `Change` reporting a move that did not happen, and L4's answer to a change is to compose a frame — so an unchanging size becomes a frame per call.

There is already a caller that does this without meaning to. **A `SIGWINCH` is a notification that the size *may* have changed**, and a terminal delivers one for events that leave the reported size identical — a font change, a pane re-layout that ends where it began, a multiplexer redrawing. C01 hands the snapshot on without comparing it to the last (C01 §Signals: C01 holds no viewport state to compare against), so the comparison has to be here, and it belongs here anyway: this is the component that knows what size it is.

The guard is stated separately from anything that relies on it. A guard justified by its caller is removed when the caller changes, and this one is worth having with no caller at all.

Step 1 before step 2 matters: the anchor is an entry id and a row offset within it, and after remeasuring at a new width that row offset may exceed the entry's new height. It clamps to the entry's last row rather than spilling into the next entry, so the anchor degrades gracefully rather than drifting.

**The height C14 is given is the transcript region's, not the terminal's** (I22). They differ by the frame's chrome — a header row, a footer row, and a prompt whose height varies with what is typed (S01 §3) — and C14 cannot derive one from the other, because it holds no geometry above itself and the prompt's height is not a function of anything it knows. So the caller must hand over the region's height, and the caller that knows it is the one that composed the frame.

Handing over the terminal's is the near-miss, and it is silent in both directions. `#maxTop()` is `totalRows − viewportHeight`, so a viewport that believes it is taller stops scrolling early by exactly the chrome: the last rows of the document are unreachable by `End`, `PageDown` or `↓`, all three stopping at the same row. And the surplus rows it selects are discarded by whoever paints, so nothing downstream ever sees a count it did not expect. Every invariant here still holds — `visible()` sums to `viewportHeight` exactly (I10) — because they all compare the viewport with itself.

Dragging an edge continuously must produce continuously correct frames, never a blank one (C02 §5, D31).

---

## 6. Native selection

> **This section was two modes, and that is why it could be built and unbuilt at
> once.** The note here used to read *unbuilt as of 2026-07-31* and cite five
> absent rows, while C22 T4.30–T4.32c assert the mode working end to end at a
> real session. Both were true, of different halves.
>
> The first two paragraphs are the **native handoff**: mouse is on by default, the
> terminal's own selection wants the emulator's modifier, and the app stops
> reading the selection because the terminal is doing it. That is `⌥⇧C`,
> `R-SEL-001`, and it ships — `#setNativeSelection` in `src/shell/session.ts:1343`.
>
> The bullets under it are a **different mode**: *entering shows a row cursor*,
> *movement keys extend a row-range selection*, *yank writes the selected rows'
> text through an injected clipboard writer*. A cursor and a selection are the one
> thing the handoff is defined by not having — C16 §5a A5 says so in as many
> words, *the terminal's native selection, which the app does not see* — so these
> bullets have contradicted A5 since both were written, and neither document
> could see it while one name covered both. That mode is `⌥⇧V`,
> `selection.semantic`, and it is §6a below.
>
> **The five absent rows were all of the second half**, which is the check that
> settles the split rather than asserting it: T1.13, T1.14, T1.15, T3.14 and T5.6
> each name a cursor, a movement or a yank, and not one of them names mouse
> tracking. They re-home onto §6a and stay deferred there — a deferral is tracked
> and expires (`tools/enforce/todo-expiry.mjs`), while an absent test is
> indistinguishable from a component that had nothing to say.
>
> C16 takes `nativeSelection` as a boolean input and `exitNativeSelection` as an
> injected call, and `semanticSelection` the same way. That is a seam standing in
> for something **unbuilt**, which is legitimate, as distinct from a seam standing
> in for something unspecified — the distinction that put `entryAtRow` in §2
> rather than in C16's constructor.

Mouse is on by default (D34), which takes the terminal's own text selection — the way people copy a UUID today. While the app captures the mouse, the terminal's native selection needs the emulator's modifier — shift-drag on most, option-drag on iTerm2 — and which modifier is the emulator's to say, not this framework's. Native selection is therefore not optional (A01 S30): it is the framework's answer rather than a documented bypass, and C16 owns its entry and its exit.

- Entry is by a key binding C16 owns. Native selection is its own **focus target** at the `copy` rung — it takes every key, but a confirm raised over it still wins (A02 §2).
- Entering **freezes the screen and nothing else**: `#setNativeSelection` commits, flushes, suspends the scheduler and turns mouse tracking off. The far side is not frozen (C16 §5b B4); the catching-up frame arrives on exit.
- There is **no cursor and no selection here**, and that is the mode rather than a gap in it. The reader is dragging with the emulator, and what they take never reaches this process.
- `Shift`-drag remains documented as the native-selection bypass on terminals that honour it.

---

## 6a. Semantic copy mode

`⌥⇧V`, `selection.semantic` — the registry's *enter Calcium copy mode*, and the
one the fifteen `R-SEL-*` rules are about. It is what §6's bullets were describing
under the other mode's name.

**Two modes at one rung, and that is the shape rather than a collision.** `RUNG_OF`
maps both `nativeSelection` and `semanticSelection` to `copy`, and they are separate
targets because their `escape` rows disagree: the handoff leaves on one press, and
this mode's first press clears a selection if there is one (`R-SEL-005`). That is
the pattern M5 bought when it separated *target* from *rung*, arriving with its
second instance — the first was `panel` beside `pushedView`, and the view is gone.

### What freezes, and the three things that do not

`R-SEL-009`: the frame freezes, and exactly three things still redraw — **the mode
label in the footer, the selection as it extends, and the count**. Not the spinners,
not the elapsed counts, not arriving content.

**This is a different mechanism from §6's, and taking the handoff's would be wrong
in a way that reads as reuse.** `#setNativeSelection` suspends the *scheduler*,
which is total by construction: nothing is written, which is exactly right when the
reader's selection lives in the terminal's own buffer and any write destroys it.
Here the selection is the app's, and three facts about it have to keep moving or the
reader cannot see what they are taking — *a frozen owner that consumes everything is
the one rung whose state the reader cannot otherwise see*, which is the rule's own
reason. A suspended scheduler cannot draw them, so the mode holds the **content**
still and lets the frame commit: arriving entries are buffered (`R-SEL-010`) and the
footer says so while they are, which is a statement about what the transcript shows
and not about whether a frame is written.

**So the freeze is C13's and C14's, not C03's**, and the invariant to hold is that
the rows under the caret do not move while the mode is up. A scheduler suspension
would satisfy that too, and would also freeze the three things the rule requires to
move — which is the reading that makes the two mechanisms look interchangeable.

### The caret, and why it is not C26's focus

The caret is an entry plus an element address, and the anchor is a second one — the
same pair `StoredFocus` holds at `liveBlock` (`focus.ts:366`), with one difference
that decides the model: **C26's pair lives inside one entry and this one does not.**
`extendRow` takes an `entryId` and refuses a changed one, because a focus that
wandered between entries is F764's defect. A copy-mode selection crosses entries by
construction — `A` takes all loaded ones (`R-SEL-008`) — so the pair is the mode's,
and C26's focus is what the caret is *seeded from* on entry and what is *restored* on
exit.

A block is atomic in it (`R-SEL-003`): an extend that reaches a block takes the whole
block and continues past it, and this holds **continuously and not only at release**
(`R-SEL-015`) — so the count is always the size of what a copy right now would take,
and never a size no copy could produce.

### What `y` takes, and where it lands

`R-SEL-004` gives the join: **document order, entries separated by a blank line**,
each block its own source through C09 §7a's `copy`, and *a block's content is not
re-indented to match its rendered inset — the inset is rendering*. That last clause
is why the join reads `copy` rather than composing painted rows: the inset, the
gutter, the rail and the residue marks are all things this component drew, and none
of them was typed by anyone.

**The blank line is the entry separator and nothing else may produce one**, which is
what makes C09 I86's default omission rather than `""`. A selection of three entries
has two blank lines in it, and a reader pasting it can tell where one command's
output ended — a property that survives only if no block inside an entry can forge
the same mark.

**One clipboard** (`R-SEL-011`, C17 §5a). `y` fills the same buffer `⌃k` fills and
`⌃y` yanks, which is the reduction §1 of `CALCIUM_SELECTION_DESIGN.md` argued for
from the other side. The system clipboard and OSC 52 are the rule's two mechanisms,
and **both are built** (ruling 72, I61): the kill buffer first, always, then OSC 52
where C02 says the terminal takes it, then a platform tool where C21 finds one that
reaches the reader. **A file is never a destination the copy chooses** — it is an
action the reader takes, offered only where no route took the text (*corrected
2026-09-29*, §6e's classification table). *Corrected on review batch 4 (M10 item 1):* this
paragraph deferred the refusal on *the same parked word the label is* — and the label
was ruled on 2026-09-24 (questions 4 and 35), four days before the deferral was
re-read. The condition was met in the section below it. The rule's last sentence —
*if neither is available the mode states it and offers a file instead* — is the
footer's `no clipboard` and `⏎ to file` (§6e's table), and the offer is taken only by
the press it names, because the mode's statement
surface is the footer and a notice on every `y` is noise on the key a reader presses
most. §6e's *Where the copy goes* walks the order.

### The label, the count and the next press

**Amended 2026-09-24 (questions 4 and 35 ruled).** This section parked the label
on a word the design did not supply, and the ruling supplied it: **semantic copy
mode reads `copy`, native handoff reads `native`** — fixture 044's own word for
`⌥⇧C`. `ChromeContext.copy` carries the mode (`CopyState`), so the owner line and
the header read the same fact rather than the rung, which both modes share: the
header draws `COPY` or `NATIVE`, and native's owner line is fixture 044's
`mouse tracking off · the terminal owns the mouse` rather than the semantic
mode's `↑↓ extend`, which in native mode names keys that reach nothing.

**The count is drawn, and its form is ruled**: `418 chars · 9 rows · 2 entries`,
one chip, taken over **the copy text** — what `⏎` would put on the clipboard
right now — rather than over the block set (I38). `chars` counts code points of
that text including its line breaks, the `wc -m` reading of a paste; `rows` its
lines; `entries` the entries contributing text. One is singular. No selection is
no count, rather than a count of zero on the frames that are most of them.

### Leaving

`R-SEL-005`, and it is two presses rather than one: `esc` clears the selection if
there is one, and a second `esc` leaves the mode. **A selection is state within a
rung, not a rung of its own**, so this does not violate esc popping exactly one rung
— and the footer says which press is next, which is the part that keeps the two
presses from reading as a dropped keystroke.

**Amended (review batch 4, M10 items 5 and 6; ruling 71).** *A selection exists*
is one predicate, `hasSelection` — the rectangle is up, or the block set is not
empty — and `escape()` and the footer's `esc` label both read it (I59). The label
read `size === null`, which is a different fact: a selection of a `rule` alone
copies nothing, so the footer said `esc out` over the press that cleared.

**`⏎` is the other way out, and it copies on the way** (R-BLK-838's *leaves by
esc, or a copy*). `y` copies and stays. Both go through one copy path and both
say where the text went; with nothing to copy both stay and say so — `⏎` leaving
on an empty selection would discard the mode for nothing.

## 6b. The freeze — a held view over a record that keeps moving

`R-SEL-009` and `R-SEL-010`, walked before anything was built. The component has
state (the mode's lifetime) and structure (which reader sees the record and which
sees the view), so it takes **both** artefact shapes: a trace for the rules that
meet because something happened in between, and a table for the two that hold at
rest. Taking the trace alone because a mode is obviously a state machine is how the
structural half goes unexamined, and the structural half is where the finding was.

**The ruling the whole section rests on: the record keeps taking writes and the
*view* is held.** §6a already says the freeze is C13's and C14's rather than C03's;
this says which of the two, and the answer is neither — it is a hold the shell puts
between them.

**Why not a queue at the store**, which is what *buffered* first suggests. C13's
`patch` returns an outcome and C23 branches on it — `outcome.ok`, and three arms on
`outcome.reason`, one of which kills the child. A queue would have to answer before
it applied, so it would have to **fabricate a verdict it cannot know**: a malformed
patch accepted optimistically leaves the entry unsettleable and the child alive,
which is C23 §8a A2's arm reached by a decision nobody took. A deferral that returns
a value is not a deferral. The record therefore takes everything, in order, at the
moment it arrives, exactly as it does with no mode up.

### The trace

| # | with the mode up | and then | the two rules that meet | ruling |
|---|---|---|---|---|
| A1 | selection empty | an entry arrives | `R-SEL-009` *the frame freezes* · C13's record is the record | the record takes it and the view does not. The buffer is the difference between them, which is a subtraction rather than a queue |
| A2 | anything | a live entry is patched and its height changes | `R-SEL-009` · C14's height index, rebuilt from the record | the held view needs **its own heights**, so entries and index are captured together. An index rebuilt from the record under a held document is the half-applied store F-defect one component over |
| A3 | caret on the last held entry | the caret moves up | `R-SEL-009` *nothing else moves* · the caret must stay on screen | **the scroll moves and the document does not.** Freezing `visible()` outright walks the caret off the screen and makes the mode unusable; the hold is over content, and scroll is not content |
| A4 | anything | a resize | `R-SEL-009` · C03 I13, *stale, never unknown* | the held document re-lays at the new width. Heights are width-dependent (I8), so width invalidates the held index exactly as it invalidates the live one — the hold is over **content**, not over geometry, and the same sentence answers A3 and A4 |
| A5 | content buffered | the mode exits | `R-SEL-010` | drop the hold, one commit. Where it lands is follow-tail's (§3), unchanged — a reader who scrolled up stays where they were |
| A6 | an entry **in the selection** is patched | `y` | `R-SEL-003`/`R-SEL-004` · the record moved | **`y` takes the held blocks.** What the reader saw is what they copy; a copy carrying text that arrived after the freeze is a copy of something that was never on the screen, and the reader has no way to know it happened |
| A7 | anything | the live entry settles | `R-SEL-009` · C23 I9 | the settle lands on the record and not on the view. The held view keeps the pre-settle rendering, which is a *rendering* difference — the entry is final in the record the whole time, so nothing downstream sees a document that cannot exist |

**A6 is the row that pays for the whole ruling.** Every other row is satisfied by a
frame that merely does not redraw; A6 is not, because `y` is not a frame. A hold
implemented in the paint path alone would freeze the screen correctly and copy the
record, and the two would disagree by exactly the content the freeze exists to keep
out of the reader's way.

### The table — who reads the record, who reads the view

| reader | which | why |
|---|---|---|
| `visibleRows` | **view** | it is the frame |
| the height index behind `visible()` | **view** | heights must agree with what is drawn (A2) |
| `copySelectedEntries` / `y`, and `copyAndLeaveSemanticSelection` / `⏎` | **view** | A6 — one copy path under both (I47, I59) |
| `selectAllLoadedEntries` | **view** | `R-SEL-008`'s *the window is not the record* is this sentence already, written about `A` |
| `actions.ts`, `execution.ts`, `refresh.ts` reading `transcript.entries` | **record** | none of them draw, and one of them is what is arriving |
| the footer's buffered notice | **the difference** | the only subject that needs both |

The last row is the finding. Everything else here reads one side; the notice is the
one thing that can only be written by something holding both, and it is also the
only observable the mode has for the hold — without it a held view and a broken
render are the same picture.

### The count — which writes are arrivals (review batch 4, M10 item 8)

The notice shipped as `record.length − held.length`, and a length answers only for
appends into a record nothing leaves. **Walked as a classification table**, because
which writes arrive is a fact at rest about what each C13 operation does to an
entry's record — and the finding is where two correct statements about one write
overlap: *C13 replaces an entry's object on every write* and *an append changes the
previous live entry too*.

| write while held | what C13 does to the record (`store.ts`, `cap.ts`) | by length | by identity | **by `id`, `rev`, `streaming`** |
|---|---|---|---|---|
| an append | a new entry, **and** the previous live one replaced by `{ ...e, live: false }` | 1 | **2** | 1 |
| a patch to a held live entry | the entry replaced, `rev + 1` | **0** | 1 | 1 |
| a second patch to it | replaced again, `rev + 2` | 0 | 1 | 1 |
| a malformed patch | nothing — `rev` does not move (C13 I13) | 0 | 0 | 0 |
| a bare `settle` | replaced, `rev` unchanged, `streaming: false` | 0 | 1 | 1 |
| a `settle` with a document | replaced, `rev + 1`, `streaming: false` | 0 | 1 | 1 |
| an append that evicts one entry, the first eviction | a new entry, one gone, **the marker added** at the head | **0** | 3 | 2 |
| an append that evicts one entry, the marker already held | a new entry, one gone, **the marker rebuilt** at `rev` 0 | **0** | 3 | 1 |
| any write, a marker held | the sweep rebuilds the marker on every write (`cap.ts`) | — | +1 | +0 |

**The rule is C13's own two statements about an entry**: `rev` moves iff its
document changed (C13 I13), and `streaming` ends at `settle`. An entry is waiting
when the held view has no entry with its id, or holds it at another `rev` or another
`streaming`. Object identity is the wrong axis — both of the rows it gets wrong are
the store doing what it should (the live flag, the marker's rebuild) — and length is
wrong in the direction R-SEL-010 exists to prevent: a patch arriving and an eviction
cancelling an arrival both read as *nothing is waiting*.

**The marker is an ordinary entry here too** (C13 I14): the first eviction during a
hold adds a notice the held view does not show, and it counts once. An entry the
record dropped and the view still holds is not counted — nothing arrived. The limit
is stated rather than hidden: a marker whose count changes stays at `rev` 0, so a
second eviction adds nothing to the number, because C13 does not say the marker's
document changed.

### What still moves, and it is not in the document

`R-SEL-009`'s *not the spinners, not the elapsed counts* is two different mechanisms
and the hold only answers one of them. **Elapsed counts are content**: `refresh`
recomputes a duration into the record, and a held view does not show it — no code is
needed. **Spinners are not**: the frame index is `RenderContext.tick`, a counter on
the session that no document carries, so a held document still draws a turning
spinner. The ticker is therefore stopped explicitly while the mode is up — `#tick`
does not advance, orbits do not turn, animated images do not step — and that is the
one thing in this section that is a statement about C22 rather than about C14.

Three things redraw and the rule names them: the mode label, the selection, the
count. All three change only on a key, so a commit at `input` is the whole of it and
no other reason needs to reach the terminal.

## 6c. The caret, the anchor, and the granularity that makes atomicity a rule

`R-SEL-003`, and the section exists because the rule is **vacuous at the wrong
granularity**. *A block is atomic in a selection: you take all of it or none of
it* forbids nothing if the selection's unit is already the block — the type
satisfies it and no mutation can violate it, which is A03 §2's class arriving
through a data model rather than through wording. The rule only bites when the
**caret is finer than the thing selected**.

So the two are split, and the split is the ruling:

- **The caret is an entry plus a display row**, entry-local.
- **The selection's unit is the block.**

An extend therefore maps a *row range* to a *block set* by **touching**, not by
containment — and that is the rule, executable: a range reaching row 5 of a
ten-row table takes the whole table, and the caret carries on to row 6. Reaching
is the predicate, the block is what comes back, and a range that covers half a
block and a range that covers all of it give the same answer.

**Why the row is the entry's own and not the viewport's.** A viewport row is not
an address — it moves when anything above it changes height, which is the same
argument C14 I6 makes about the anchor, and the freeze does not remove it because
the caret survives a resize and a resize re-lays the held document (I31). An
entry id plus an entry-local row is stable under every movement the mode allows.

**The anchor is a second caret and is set where the extend began.** With no
extend in flight there is no anchor; the first `⇧↑` or `⇧↓` plants it at the
caret and every subsequent one re-derives the whole range from the pair, so a
reader who over-shoots and comes back gets the selection they would have got by
going there directly. `R-SEL-015` says the same thing about a drag — *the count
is always the size of what return would copy right now* — and this is that
sentence with a keyboard instead of a mouse.

### What moves, and what the registry gave

`⇧↑` and `⇧↓` are the registry's `selection.up` and `selection.down`, already
bound at `prompt` and `liveBlock`; they take a third target here. **Plain `↑`
and `↓` move the caret without changing the selection**, which is the pair the
mode needs and the registry does not name — a mode whose only vertical key
extends cannot put the caret anywhere without selecting on the way.

**Amended (review batch 4, M10 items 2 and 3; rulings 36, 70): `⇧←` and `⇧→`
are bound here and act only in the rectangle** (§6e *The way in*, I60). At block
granularity they still do nothing, for the reason below, and the footer names
them only while the rectangle is up. The paragraph as it stood:

**`⇧←` and `⇧→` are not bound here yet, and the footer stops claiming them.**
`selection.left` and `selection.right` are horizontal, and at block granularity
there is no horizontal extent: the horizontal axis belongs to `R-SEL-007`'s
rectangular selection, which copies **cells rather than source** and is a
different thing to select. The owner line said `←→↑↓ extend` and now says
`↑↓ extend`, because a footer naming a key that does nothing is worse than one
naming fewer keys — it is C16 I19's second keymap, disagreeing with the first.

### The count is blocks

`R-SEL-015`: *the count is always the size of what return would copy right now*.
That is the blocks, not the entries, and the two differ exactly when an extend
stops inside an entry — which is most of them. A count of entries would report a
half-taken entry as a whole one, which is the number being wrong in the direction
the rule was written to prevent.

### `a` and `A` are unchanged in meaning and changed in unit

`R-SEL-008` still reads *the entry under the caret* and *all loaded entries*;
what they put in the set is now every block of those entries. The rule's own
sentence is untouched and nothing about the keys moves.

## 6d. The selection's ground — one row per block, painted outside the cache

`R-SEL-006` and `R-SEL-003`'s third clause, which are one mechanism: *selection
owns the ground and focus keeps its mark*, and *the block takes the selection
ground on its frame or its first row, never on every cell of its body*.

**The shell paints it, not the kinds, and the rule says so.** A kind washing its
own body is exactly what the third clause forbids, and asking twenty-six kinds to
each decline correctly is a rule enforced twenty-six times. The shell already
knows every block's entry-local rows — the same spans the caret moves over
(§6c) — so it washes **one row per selected block**, at the block's first row,
across the full width.

**And *frame or first row* is one rule rather than two arms.** A bordered block's
first row **is** its frame: `panel`, `status` and every container that draws a box
open with the top border, so washing the first row satisfies both readings and no
kind is consulted about which it has.

### Painted after the cache is written, and that is the ruling

The render cache keys on nine axes and the selection is none of them. Two ways
out, and only one survives being written down:

- **A tenth axis.** Correct, and it busts the whole entry's slot on every
  keystroke in the mode — which is exactly what C22 I103 split `tick` out to stop,
  one rung coarser: there the cost was one glyph, here it is an entry per key.
- **Outside the cache.** The wash is a transformation of the finished lines, so
  it is applied to the copy that goes on screen and never to the copy that is
  stored. The cache holds the entry as it renders, the frame shows it selected,
  and the two cannot disagree because the second is a function of the first.

The second, and the invariant is that **nothing selection-dependent is ever
written into a cache slot**. A wash baked in would serve a selected frame to a
later unselected read, which is the *correct frame, previous state* symptom C22
I71 names as the one whose report says *it froze*.

### The precedence falls out of the order rather than being asserted

`R-SEL-006`'s table — at rest nothing; focused takes `focusGround` and its mark;
selected takes `selectionGround` and no mark; both takes `selectionGround` and
**keeps** the focus mark — is four rows, and three of them are already what the
tree does. The fourth is the only one this section decides, and washing over the
rendered line is what makes it true: the mark is already in the text, the wash
changes the ground under it, and *selection wins the ground while focus keeps its
mark* is the order of the two operations rather than a case in a table.

Selection winning over a **diff** ground is the same sentence: `patch` inks its
own rows and the wash lands over them, with the `+` and `−` marks carrying the
diff exactly as the rule says they must.

### 1-bit needs no new rung

`selectionStyle` already answers `inverse` where `resolveBackground` has no
colour (C09 §paint) — *an attribute survives the depth where a colour does not* —
and the focus mark `▸` survives with it. So at 1-bit a selected row is reverse
video and a focused one is a mark, which is `R-SEL-006`'s last sentence with
nothing added: **neither fact rests on colour alone.**

### The rail — column 0, and selection's second carrier (I57, I58; rulings 41, 68)

The ground was selection's only carrier, and `inverse` at 1-bit is the same
channel at a rung where colour is gone rather than a second one. `R-THM-005`
names the second: **the `▌` selection rail**, a mark in the gutter's domain.
Ruling 41 put it in *the live gutter's column*; ruling 68 measured that no such
column existed — nothing drew a live gutter and nothing reserved a column, and
SF1's `● help` stood in column 0 — and ruled that **the frame reserves column 0 of
the transcript region on every row**. The cost is stated: every composed-session
frame moves one column right.

**The classification table** — which rows take the rail, and in what (read off the
frame at every rung, not derived from prose):

| row | column 0 | the rest of the row | at 1-bit | ASCII |
|---|---|---|---|---|
| the first row of a selected block (semantic copy mode) | `▌` in `accent` on the selection ground | washed (I39) | `▌` upright, **not** inverted; the row inverts from column 1 | `\|` |
| a selected block's other rows, and a wrapped continuation | blank (`R-SEL-016`, `R-SEL-003`) | unwashed | blank | blank |
| the first row of a selected element (`focus.selected`, drawn by the block) | `▌`, the same cell | the block's own ground | the same | `\|` |
| selected **and** focused (a table row with `▸`) | `▌` | `▸` stays in the block's lead; selection wins the ground | the same | `\|`, `>` |
| a banded theme (`hcDark`, `hcLight`) | `▌` in the band's ink on the band (C10 I45, I53) | the band | no band at 1-bit (C10 I66) | `\|` |
| an unselected row, a command echo, a blank row | blank | — | blank | blank |
| the prompt's selection | none — `▌` is the caret there (ruling 69's exception) | the prompt's own | — | — |
| native copy mode | none: nothing is selected semantically | — | — | — |

**The sequence trace** — enter semantic copy mode, `⇧↓` twice, resize while
frozen, `esc`, `esc`:

| # | event | rules meeting | column 0 after |
|---|---|---|---|
| 1 | `⌥⇧V` | the freeze (I31), the caret seeded, nothing selected | blank on every row |
| 2 | `⇧↓` | I37 re-derives the set; I39 washes each block's first row | `▌` on the one selected block's first row |
| 3 | `⇧↓` | the same | `▌` on both first rows, and on nothing between |
| 4 | a resize while frozen | the held document re-laid at the new width (I31); the spans recomputed | `▌` on the first rows **at the new width**, from the new spans — never from the old row numbers |
| 5 | `esc` | the first press clears (C16 I51) | blank everywhere; the frame is still held |
| 6 | `esc` | the second leaves | blank; the live frame |

**What the walk found before any code, all structural** (two rules that hold at rest):

1. **The region's width was also the prompt's.** `#paintDeps` lays the prompt out
   at `frame.region.width`, and `composeFrame` counts the prompt's rows at the
   region's content width. Reserving the column by narrowing the region alone
   narrows the prompt by one as well, and at a wrap boundary the paint's own
   check — *composed from N rows, painting N+1* — throws. So the prompt keeps the
   content width (`columns − CONTENT_MARGIN_R`) and the transcript takes one less.
2. **Five element lookups laid out at `overlayRegion().width`** on the strength of
   `frame.ts` making it identical to the transcript's. The reservation ends the
   identity, so each reads the transcript's width by name.
3. **The pointer translated the row and not the column.** Every mouse row was
   `e.row − region.top`, and every column was `e.col` as it arrived — correct only
   while the region started at column 0. A click must subtract `region.left` once,
   at the top of the pointer path, or every hit lands one column off.
4. **The wash cannot carry the rail.** `washRow` re-opens `selectionStyle` after
   every sequence (I52), and at 1-bit that is `inverse` — which turns `▌` into a
   right-half block. The rail is drawn beside the washed row, never inside it.
5. **Element selection is a block's ground and the frame's rail.** A table row in
   `focus.selected` is washed by C11 with no knowledge of the frame, so its rail is
   the frame's, placed from the entry's elements (`elementsOfEntry`), on the
   element's first row.
6. **A command echo no longer lines up with the prompt.** `❯ /help` in the
   transcript moves to column 1 while the prompt's `❯` stays at column 0. The cost
   of ruling 68, stated rather than repaired.

---

## 6e. The rectangle — cells, clipped to the block it started in

`R-SEL-007`: *A rectangular selection copies cells, not source, and says so in
the mode label. It is the single exception to copy taking the source, and it is
explicit rather than silent. A rectangular selection never crosses a block
boundary; it clips to the region it started in.*

### Two clauses land here and the third is parked, on a seam that is already parked

The rule has three claims and they do not have the same standing in the registry.

| The claim | What the design supplies | Here |
|---|---|---|
| it copies **cells**, not source | the mechanism, completely | built |
| it **never crosses a block boundary** and clips to where it started | the mechanism, completely | built |
| it **says so in the mode label** | the requirement, and no words | **built** — question 5's words (I55, I60) |
| the **way in** — a chord, a verb, a binding | **nothing.** The registry names no rectangular action and no rectangular binding | **built** — `⌃V`, ruling 36 (I60) |

**The label is not a second parked question.** §6a recorded that there was no
mode-label seam at all — `ChromeContext.owner` is the *rung*, and both copy modes
map to `copy`. **Amended 2026-09-24**: the seam is `ChromeContext.copy` (I55) and
question 5 ruled the word, `RECT 12×4 · cells, not source`; what remains is the
**way in**, parked as 36, because a label with no state to be drawn in is drawn by
nothing.

**And the chord being absent is a fact about the registry, not an omission here.**
`R-SEL-008` gives `a` and `A` in prose; `R-SEL-007` gives nothing of the kind, and
neither the actions nor the bindings hold a rectangular row. Inventing one is
exactly what the goal parks.

**What that leaves is not a fragment.** The two clauses that land are the whole of
the rule's *mechanism*, and they are the half a chord cannot decide: a rectangle
that crossed a block would still cross it whichever key opened it. So the model is
built and tested now, and the verb is one line when the chord arrives — which is
why `CellRect`, `rectBetween` and `cellTextOf` are named in `UNCONSUMED_MEMBERS`
against that MR rather than held back until it.

### The clip is to the block the **anchor** is in, and that is what makes it a rule

*Clips to the region it started in* names the anchor's block and no other. The
head is free to travel — into the block above, into the next entry, past the end
of the transcript — and the rectangle does not follow it; the head's row is
clamped into the anchor's block's rows before a rectangle exists.

**A containment test would read as this and is not this.** *Both ends inside one
block* is satisfiable by refusing: a head that has left gives no rectangle, so the
selection disappears as the reader extends and comes back when they return. The
rule says the opposite — the rectangle **clips**, so extending past the block's
last row selects to the last row and stays there. The two differ on every extend
that leaves, and the difference is visible in the count.

The head can also be in another **entry**, and then its row is not a coordinate in
the anchor's space at all. The direction is taken from the transcript's order —
an entry later in the document clamps to the block's last row, an earlier one to
its first. An order that resolves neither entry clamps to the anchor's own row,
which is *clips to where it started* taken to its limit and is never a rectangle
somewhere the reader was not.

### Cells are what the frame drew, and the copy carries none of the ink

*Copies cells* is the rendered line, windowed by column — `sliceCells`, which is
the same walk `paint` uses to window a row, so a cluster straddling either edge is
blanked rather than halved and a copy is never a row one cell wide. **A substring
is the thing it is not**, and a painted line is what makes the two differ: three
characters from column 2 of a line whose ink opens at column 0 are three bytes of
the escape.

**And the SGR comes off**, because a clipboard is text: a paste into an editor of
`\x1b[38;5;203m` is the rendering arriving where the content was asked for.

**The order of those two is not the rule, and it reads as though it is.** An
earlier draft of this section said the strip must come *after* the slice, on the
reasoning that widths taken over unstyled text are widths the frame never drew.
Measured rather than argued, the two orders give the same string: `sliceCells`
already skips escapes when it counts cells, so stripping first changes no width
and moves no edge. A sentence about the order would forbid nothing while reading
as though it forbade the defect, which is A03 §2's class arriving in prose. What
can be wrong is **the input** — a copy taken over the block's source rather than
over the frame's line is the defect, and it is `R-SEL-004`'s exception inverted.

**This is the single exception `R-SEL-004` names.** Every other copy takes the
source — prose unwrapped, code with its own indentation, a patch as a unified diff
— and this one takes the picture, which is why the rule requires it to be said out
loud rather than left for the reader to discover in a paste.

### The way in, the keys, and the walk (review batch 4, M10 items 2, 5, 6, 7)

**Ruling 36 supplied the chord and ruling 70 its reach.** `⌃V` toggles the
rectangle in semantic copy mode; `⇧←` and `⇧→` extend its columns from the
anchor, clamped to the block, and do nothing at block granularity; there is no
character caret over prose. **`⌃V` is a target-local keycap and not a registry
binding**, as `a`, `A` and `y` are at this target: R-SEL-008 gives those bare
keys in prose and the keymap holds them without a registry record, and the
registry still names no rectangular action. Tie-break 4 — the repo ships
copy mode's keycaps that way.

**The state is one field, and rectangle mode is that field being set.** The
selection gains `rect: { anchor, head } | null`, two cursors (a caret with a
column). `⌃V` seeds it at the caret, at the first column of the caret's block;
`⌃V` again sets it to `null` and the block set is as it was before (ruling 71,
D-M10-4), because it was never touched. Rectangle mode is `rect !== null`, so
there is no flag that can disagree with it.

**The block's columns are the span's, and the clamp is in `rectBetween`.** A
span carries the columns its run lays the block at — `run.indent` to
`run.indent + run.width` — and the rectangle's columns are clamped into the
anchor's block's columns when the rectangle is derived, the way its rows are.
So a card body's gutter is never cells of the block, and a resize that narrows
the block narrows a stored rectangle rather than leaving it pointing past the
edge. A span with no columns clamps none, which is the pure model's case.

**The head is stored with its column clamped and its row free**, and the
asymmetry is I42's rather than a second rule: a head's row may be in another
block or entry, and I42 clips it there; a column past the block's edge is past
the entry's too, so storing it would only make coming back cost presses the
reader cannot see.

**The keys in rectangle mode.** `⇧↑⇧↓⇧←⇧→` move the head and leave the
anchor; a plain arrow moves both, a 1×1 rectangle — which is how the anchor gets
anywhere but the block's first column without the pointer. A press plants both
at the pointer's cell and a drag moves the head, the row by I42's clip and the
column by the pointer's own. `a` and `A` are block verbs and leave the
rectangle, discarding it. `esc` clears (§ *Leaving*, I59).

**The copy is `cellTextOf` over the entry's lines at the transcript's width**,
rendered through the frame's own per-entry options — focus, scroll offsets,
cameras, cursors, frames, series — so the cells are the ones drawn. The wash
covers exactly those cells, one ground over the rectangle, and the rail leads
its first row (I58's *first row of the selection*).

#### The walk — a sequence trace

Indexed by the events where two rules meet. `now` is the tree before this
round.

| # | event | rules meeting | now | ruled |
|---|---|---|---|---|
| 1 | `A`, then `⇧↑` | R-SEL-008 *says what it did* · I37 re-derive | nothing said | `all loaded entries` is **derived by equality** with every span, so the re-derived smaller set drops it. A stored flag would still be set. |
| 2 | only a `rule` selected, `esc` | I55's label · `escape()` | the label read `size === null` and said `out`; `esc` cleared | the label reads `hasSelection`, the predicate `escape()` branches on |
| 3 | `⏎` over a selection | §103 · R-BLK-838 *leaves by esc, or a copy* | copied and stayed | copies, **leaves**, and a toast says where the text went (I59) |
| 4 | `y` over a selection | — | copied, said nothing | copies, **stays**, toast (I59) |
| 5 | `⏎` or `y`, nothing selected | R-SEL-011 *never silent* · `⏎` leaves | returned silently | **stays**, toast `nothing selected` (ruling 71) |
| 6 | a selection of a `rule` alone, `y` | R-SEL-011 · I38's copy text | returned silently | stays, toast `the selection copies no text` |
| 7 | `⌃V` | ruling 36 | unbound | rectangle at the caret, first column of its block; the footer reads `RECT 1×1` and `cells, not source` |
| 8 | `⌃V` on a row no block covers | I42's one refusal | — | the mode is up and the rectangle resolves to nothing: `RECT` with no size, no count, `esc clear` (the mode is state to clear) |
| 9 | `⇧→` ×40 in a 12-column block | ruling 70 clamp · I37 re-derive | — | clamped at the block's last column; one `⇧←` moves back one column |
| 10 | `⇧↓` past the block's last row | I42 clip · I37 | — | the head travels, the rectangle clips; coming back is I37's re-derivation |
| 11 | `A` with the rectangle up, then `⌃V` off | R-SEL-008 · ruling 71 | — | `A` discards the rectangle and selects every block; `⌃V` from there is a fresh rectangle |
| 12 | blocks selected, `⌃V`, `y` | two selections, one rung (R-SEL-005) | — | the rectangle's cells are copied and counted; the blocks are kept, unwashed and uncounted, and return on `⌃V` |
| 13 | resize with the rectangle up | I31 re-lay · the column clamp | — | the columns are clamped against the re-laid spans; the cells are re-read from the new lines |
| 14 | a drag in rectangle mode, held past the bottom | I49's tick extend | ticks called the block `extendTo` | a tick moves the rectangle's head to the edge row at the drag's last column |
| 15 | `⇧↓` or `↓` with the caret on the viewport's last row | R-SEL-012's last sentence · I32 | the caret left the screen | the viewport scrolls by the overshoot (I37 amended) |
| 16 | `↑` at the transcript's first row | the clamp in `step` | stays | stays, and nothing scrolls |
| 17 | `⌃c` | C16 I62 | refused | unchanged |

**Two findings from the trace.** Row 2 is the one M10 item 5 named, and it is
the vacuity class in a footer: the label and the behaviour each read a correct
predicate, and they are different predicates. Row 14 is new: the autoscroll's
tick extended the **block** selection whatever the mode, so a rectangle drag
held past the edge would have scrolled and selected blocks the reader was not
drawing.

#### The footer — a classification table

Structural: every cell is a state at rest. Mode × selection × the waiting count.
`w×h` is the resolved rectangle; `×` is `x` at ASCII.

| mode | selection | owner line, in order |
|---|---|---|
| native | — | `native` · `mouse tracking off` · `the terminal owns the mouse` · `esc out` · `the screen is frozen` |
| blocks | none | `copy` · `⇧↑⇧↓ extend` · `⏎ copy` · `esc out` · `the screen is frozen` · `⌃V rect` |
| blocks | some | … `esc clear` · the count · `the screen is frozen` · `⌃V rect` |
| blocks | only blocks that copy nothing | … `esc clear` · **no count** · `the screen is frozen` · `⌃V rect` |
| blocks | every span (`A`) | … `esc clear` · the count · `the screen is frozen` · `all loaded entries` · `⌃V rect` |
| blocks | every span, the transcript empty | as *none*: `all` over an empty set is not said |
| rect | unresolved | `copy` · `RECT` · `cells, not source` · `⇧↑⇧↓⇧←⇧→ extend` · `⏎ copy` · `esc clear` · `the screen is frozen` · `⌃V blocks` |
| rect | resolved | `copy` · `RECT w×h` · `cells, not source` · … `esc clear` · the count over the cells · `the screen is frozen` · `⌃V blocks` |
| rect | blocks also selected underneath | as *rect*: never `all loaded entries`, and the count is the rectangle's |
| any semantic | waiting > 0 | … `N waiting` straight after `the screen is frozen` |
| any semantic | no route for this copy — C02 `none` and no tool; or `osc52`, no tool and the selection's text past the cap; or the latest copy's tool failed or went silent and the selection's text is that copy's (I61, §6e's classification table) | `⏎ to file` in place of `⏎ copy`, and the reason last of the facts — `no clipboard`, `too large for the terminal`, `pbcopy failed` or `pbcopy did not answer` — after `the screen is frozen` and `N waiting`. *Amended on landing:* it stood before the key it qualifies, and at 100 columns in the rectangle it shed the count — the rank paragraph below, a third time. `⏎ to file` already says where the text goes when the line is too narrow for both |

The table found one row the trace did not: **the rectangle over a full block
set** (row 9 of the table). `all loaded entries` computed from the block set
alone draws beside a rectangle whose copy is twelve cells.

**The order is a rank, because the line sheds from the right** (§103). The
first draft put `⌃V rect` before `esc` and `all loaded entries` after the count,
and at 100 columns a session with one entry selected — which `A` and `a` both
are there — shed `the screen is frozen`, and a waiting count would have gone
with it. Measured in T4.41's session, the line read `copy  ⇧↑⇧↓ extend  ⏎ copy
⌃V rect  esc clear  38 chars · 4 rows · 1 entry  all loaded entries` and
stopped. The count, the frozen screen and the waiting notice are `R-SEL-009`'s
and `R-SEL-010`'s; `all loaded entries` and the toggle are not, so they come
last and go first.

#### Where the copy goes — a sequence trace

*(review batch 4, M10 item 1; ruling 72, C21 §2b, C01 I25, C02 I18, C17 I31)* C21's
walk classifies what each layer hands up — which capability, which tool, which
payload. **The order is L4's, and L4 is the only layer with a clock**, so the rows
where a copy meets something that happens *after* it are this walk's. Event-mediated,
so a trace; the structural cells are C21's W1–W18 and are not restated.

| # | state | event | the rules that meet | ruling |
|---|---|---|---|---|
| 1 | any | a copy with text | C17 I31 *one clipboard* × a second destination | **the kill buffer first**, with the same text, in every row below. `⌃y` yanks what the clipboard received |
| 2 | `osc52`, within the cap | `y` | *OSC 52 first* × its success cannot be observed | `clipboardWrite(text)` on the writer, and the toast reads `sent to the terminal's clipboard` — never *copied* |
| 3 | `osc52`, past the cap, a tool found | `y` | C21 W2 — `null` is one mechanism declining | the tool, as row 4 |
| 4 | `none`, a tool found | `y` | a tool answers later × *never silent* | the toast reads `copying with pbcopy` at once; the answer replaces it |
| 5 | a tool pending | it exits `0` | an observable success | `copied via pbcopy` |
| 6 | a tool pending | it fails — a code, a signal, a spawn error | C21 W10, W11 | **nothing is written**: `pbcopy failed (exited with code 1) — the kill buffer holds it`, and the file is offered for that copy (classification rows K7–K9) |
| 7 | a tool pending | the deadline, `COPY_DEADLINE_MS` | C21 W18 — C21 has no timer | **nothing is written**: `pbcopy did not answer — the kill buffer holds it`, and the file is offered as row 6. **2 000 ms and unmeasured**; a tool that answers at all answers in milliseconds |
| 8 | the deadline fired | the tool exits `0` late | one copy, one sentence | **dropped.** The toast already named where the text is sure to be — the kill buffer — and a second sentence would contradict the first. The offer stands: offering a save writes nothing |
| 9 | a tool pending | a second copy | two answers × one toast line | **the second supersedes the first**: the first's deadline is disposed and its answer, when it comes, is dropped. Without this the first copy's `copied` lands over the second's `copying…` and names the wrong text |
| 10 | a tool pending | the session stops | the deadline × stop | the deadline is disposed with the toast's; the tool is detached (C21 I2) and runs to its end, and nothing is said, because nothing can be drawn |
| 11 | `none`, no tool | `⏎` | *states it and offers a file* | the footer already read `no clipboard` and `⏎ to file` before the press; `⏎` is the offer taken, and writes `<stateDir>/copy.txt` resolved against the working directory, replacing the last, toasted `saved to <absolute path>` |
| 11a | `none`, no tool | `y` | *offers a file* × *never write a file the reader did not ask for* | **nothing is written**: `no clipboard here — the kill buffer holds it`. `y` is undrawn and the offer is `⏎`'s (classification row K13) |
| 12 | the offer taken | the write rejects | *never silent* × the kill buffer | `<absolute path> could not be written — the kill buffer holds it`, which row 1 makes true |
| 13 | `osc52`, past the cap, no tool | `y` | C21 W3 | **nothing is written**: `too large for the terminal's clipboard — the kill buffer holds it`, and the footer already offered `⏎ to file` for this text (K3) |
| 14 | `⏎` left the mode | a tool answers | the mode's end × the answer | the toast is the session's, not the mode's, so it is drawn |

**The walk found row 9**, which no layer below could: C21 resolves each write on its
own exit and is right to, and two correct answers to two copies arrive in an order
nothing controls. It also found that rows 6, 7 and 13 wrote a file the reader was not
offered at rest, and **ruled that acceptable — which was wrong.** *Corrected
2026-09-29 by the person:* **never write a file the reader did not ask for.** Where a
route exists the copy takes it and says where it went; the file is offered only where
no route exists, and pressing the offer is the only thing that writes it. OSC 52's
success cannot be detected, so a copy sent by it counts as done, not failed. The old
paragraph read *the reader asked for a copy, the file is the destination the rule names
when the clipboard fails* — true of the rule's text and not of the reader: a copy is
not a request for a file, and the rule says *offers*. F1425.

#### Where the copy goes — a classification table

*(the person's correction, 2026-09-29; the orchestrator's ruling on the tool that
fails)* The trace above indexes events; the correction is **structural** — which
route exists × the payload × how the tool answered × whether the reader takes the
offer — and three of its rules meet at rest with no event between them: *OSC 52
counts as done*, *offer only where no route exists*, and *the offer is taken, never
assumed*. So a table. "Offered" is the footer's `⏎ to file` in place of `⏎ copy`;
"file" is whether `copy.txt` exists after the row. Columns not named are any value.

| # | route | payload | tool answers | reader | the rules that meet | toast | offered | file |
|---|---|---|---|---|---|---|---|---|
| K1 | OSC 52 only | within | — | `y` / `⏎` | *OSC 52 counts as done* × *no success is observable* | `sent to the terminal's clipboard` | no | no |
| K2 | OSC 52 and a tool | within | — (never run) | `y` / `⏎` | *OSC 52 first* × a tool whose success *is* observable | `sent to …` — the tool is not a check on OSC 52, and running it too would be a second clipboard | no | no |
| K3 | OSC 52 only | past the cap | — | at rest | the cap × *offer only where no route exists* | — | **yes, for this text**: `too large for the terminal`. The offer is a property of the selection's text, so an extend across the cap moves the label and the press both, because both read one function | no |
| K4 | OSC 52 only | past the cap | — | `⏎` | the offer × the key that names it | `saved to <absolute path>` | — | **yes** |
| K5 | a tool (with or without OSC 52 past the cap) | any | exit `0` | `y` / `⏎` | an observable success | `copying with pbcopy`, then `copied via pbcopy` | no | no |
| K6 | a tool | any | pending | at rest | a route exists × its answer is not yet in | `copying with pbcopy` | **no** — a pending copy has not failed, so `⏎` is still a copy, and pressing it supersedes (trace row 9) | no |
| K7 | a tool | any | non-zero, a signal, a spawn error | `y`, then at rest | *a route exists* × *that route did not take this copy* | `pbcopy failed (exited with code 1) — the kill buffer holds it` | **yes, while the selection's text is that copy's**: `pbcopy failed` | **no** |
| K8 | a tool | any | silent past `COPY_DEADLINE_MS` | `y`, then at rest | as K7 × C21 has no timer | `pbcopy did not answer — the kill buffer holds it` | yes, as K7: `pbcopy did not answer` | **no** |
| K9 | K7 or K8 standing | same text | — | `⏎` | the offer × `⏎` otherwise copying | `saved to <absolute path>` — the offer taken, **not** a retry | — | **yes** |
| K10 | K7 or K8 standing | the selection extended | — | at rest | *for that copy* × a different text | — | **no** — the offer was for that copy; `⏎` is a copy again | no |
| K11 | K7 or K8 standing | same text | — | `y` | *for that copy* × a new copy | the tool again, from `copying with` | withdrawn at the press; returns only if this copy fails too | no |
| K12 | a tool | any | fails or goes silent after **`⏎` left the mode** | — | the offer × a mode that is gone | as K7 / K8 | **no surface to draw it on**: the footer is the mode's. It stands for the text, so re-entering the mode over the same selection draws it; no key outside the mode reaches it, and the registry has no save action to bind — reported, not invented | no |
| K13 | none (`none`, no tool) | any | — | `y` | *offers a file* × *never write a file the reader did not ask for* | `no clipboard here — the kill buffer holds it` | yes, at rest before the press: `no clipboard` | **no** — `y` is undrawn and is not the offer |
| K14 | none | any | — | `⏎` | the offer taken | `saved to <absolute path>` | — | **yes** |
| K15 | K4, K9 or K14 | — | — | the write rejects | *never silent* × C17 I31 | `<absolute path> could not be written — the kill buffer holds it` | unchanged | no |
| K16 | any | — | — | `stateDir` relative (the default `.calcium`) | *states the full path* × a relative default | the path is resolved against the session's working directory: `saved to /work/.calcium/copy.txt`, never `saved to .calcium/copy.txt` | — | — |

**What the table found.** Three things the trace could not reach, because each is two
rules holding at once rather than an event between them:

- **K3's offer is a property of the text, not of the session.** The old footer asked
  `hasClipboard` — true wherever OSC 52 exists — so a selection past the cap with no
  tool drew `⏎ copy`, and the press then wrote a file under the label `copy`. The offer
  and the press now read one function over the selection's text (F1429).
- **K12 has no surface.** The per-copy offer lives in the mode's footer, and `⏎`
  leaves the mode before a tool can answer. Nothing in the registry is a save action,
  so the row states the failure and where the text is (the kill buffer), and the gap is
  reported rather than bound (F1426); ruling 83 keeps it unbound.
- **K16: the default `stateDir` is relative**, so the old toast read `saved to
  .calcium/copy.txt` — a path the reader cannot open from anywhere but the working
  directory. The person's form is *the full path*. F1427.

---

## 6f. The drag — a gesture belongs to where it started

`R-SEL-012`, `R-SEL-013` and `R-SEL-014`, which are the pointer half of semantic
copy mode. Two of the three resolve against nothing in the tree; the third is
three-quarters already built, for a reason worth writing down.

### What the tree already does, measured rather than assumed

| The clause | The tree |
|---|---|
| `R-SEL-012` — the container that scrolls under a drag is the anchor's, for the whole gesture | **absent.** `routeMouse` has no `copy` rung: a press inside the region goes to `liveBlock`, so a drag in the mode moves *focus* |
| `R-SEL-013` — three bands, held-and-still still scrolls, stops at the container's end | **absent.** `autoscroll` appears nowhere in `src/` |
| `R-SEL-014` — a container the drag passes through **does not scroll** | **absent**, with `R-SEL-012`: nothing scrolls under a drag at all |
| `R-SEL-014` — a container the drag passes through is **taken whole** | **already true.** `blocksTouched` is an intersection and never a containment test (I36) |
| `R-SEL-014` — a child of a passed-through container is **never addressable** | **already true, and measured.** `elementsOfEntry` keys a container's block-level elements on the *container's* id: a `scroll` holding two `text` children yields two block-level elements, both `blockId: "box"`, and none for either child. The span set has no key a child could be selected by |
| `R-SEL-014` — dragging through a bounded block takes **all** its rows, not the ones on screen | **already true.** The copy is `copySequence` over the block (§6a); the window is the renderer's and never reaches the clipboard |

### The three that are already true are one fact, not three coincidences

**The selection's unit is the block and a block's address is the block** (I36,
I38). A child inside a container has no key, so it cannot be selected; a window
is not a source, so the rendered rows never reach the copy; an intersection takes
what it touches, so a container crossed is a container taken. `R-SEL-014` reads
as four new constraints and is one old one, seen from four sides.

That is worth stating because a reader checking the rule against the tree finds
nothing named after it and would reasonably conclude it is unbuilt. What is
unbuilt is the clause about **scrolling**, and it is unbuilt because no drag
scrolls anything yet.

### The container is chosen at the press and never again

`R-SEL-012`'s sentence is *the one place the pointer does not decide*, and the
three-way table it sits in is the argument: the **wheel** takes the innermost
scrollable under the pointer, the **arrows** take the scrollable you are inside,
and a **drag** takes the scrollable the anchor is in — for the whole gesture.

**Recomputing per motion report is the defect, and it reads as responsiveness.**
A drag that leaves a box and re-resolved would start scrolling the transcript the
moment the pointer crossed the border, which moves the box out from under the
reader mid-gesture and is indistinguishable from the selection jumping. The
anchor binds a gesture to a container the way press-arms binds one to an element
(C16 I45, `R-PTR-005`), and it is the same mechanism: an identity taken at the
press and held until the release.

**A keyboard extend at an edge scrolls the same container**, which is the clause
that stops the rule being about the mouse. The container is the mode's, not the
gesture's — the gesture only chooses it.

### Three bands, and what can be wrong about them

| Past the container's rect | One row per |
|---|---|
| inside, or on the edge | nothing |
| up to one cell | 120 ms |
| more than one, up to four | 60 ms |
| more than four | 30 ms |

Horizontal autoscroll takes the same bands on columns. *Three, because two is too
coarse to control and a continuous ramp is impossible to stop where you meant.*

**The boundaries are the arithmetic and the continuation is the rule.** A terminal
reports motion when the pointer changes cell and not while it sits still, so an
autoscroll driven by motion reports stops the instant the reader holds the pointer
where they want it — which is exactly when they are waiting for it to keep going.
So the scroll is a **ticker**, armed while the button is held and the pointer is
outside, and it survives a pointer that has stopped moving. That is the clause a
band table cannot express and the one a fixture must construct.

**It stops on release, on `esc`, and at the container's end** — where it stops
rather than rubber-banding, there being nothing to rubber-band against in a cell
grid. **The selection extends to the container's end and does not spill into the
parent**, which is `R-SEL-014` again: the parent is a container the drag is not
in, so it is taken whole rather than entered.

### Where the ticker lives

`session.ts`, because it is the one file that may read a clock (A03 SS1) and the
one that already owns `#tick`. It is a second periodic thing beside the spinner's
and it is not the spinner's: §6b I35 **stops** the spinner ticker for the whole
mode, so a drag reusing it would have to restart the thing the freeze exists to
stop. Two tickers, one stopped and one armed, is the honest shape.

---

## 7. State machine

| From ↓ / call → | scroll up | scroll to bottom / `End` | `enterCopy` | `exitCopy` |
|---|---|---|---|---|
| **following** | → detached (T1.6) | → following (T3.2) | → copying (T1.13) | — |
| **detached** | → detached (T1.5) | → following (T1.7) | → copying (T1.13) | — |
| **copying** | moves the cursor, not the view (T3.14) | — | no-op | → previous mode (T1.14) |

**`enterCopy` here is §6a's, and the table always was.** *Scroll up moves the cursor,
not the view* is a statement about a mode that has a cursor, which the handoff does
not — so this is the semantic mode's state machine and it was filed under the other
one's name with the rest of §6's bullets. The handoff has no row of its own to add:
it freezes the screen and leaves `followTail` exactly where it found it, because
nothing it does touches the viewport at all.

The mode remembers whether it was following, so leaving it resumes the tail rather
than stranding the user.

---

## 8. Invariants

- **I1** — Measured heights are the sole basis for visibility; C14 never renders to decide. An entry's height is `measureSequence(doc.blocks, width)`, which equals `Σ measure(b, w)` since a block carries its own space (C09 I17, C09 I80) — the seam is required for the memo and the containment it shares, not for a different answer.
- **I2** — `topRow` is always in `[0, max(0, totalRows − viewportHeight)]`.
- **I3** — A cached height is valid iff its entry's `rev` and the current `width` both match the ones it was measured at. Theme, colour depth and unicode mode are excluded by construction. **This is a validity predicate over one slot per entry, not a composite map key**, so the cache holds at most one height per entry and a stale revision has nowhere to accumulate: after any number of patches, `cache.size ≤ entries.length`.
- **I4** — Content growing above the viewport never moves the visible rows while detached.
- **I5** — `followTail` is on iff the viewport is at the bottom — `atTail(topRow, maxTop)`, derived from where the viewport ended up and never from which way the reader scrolled. `atTail` is C14's one export of the comparison, and the shell's tail helpers (C04 I97) read it rather than holding a copy, so `>=` cannot drift to `>` in one of the three places that ask.
- **I6** — The anchor is an `EntryId` plus a row offset, never an index, so eviction cannot shift it.
- **I7** — A row offset exceeding its entry's height after remeasure clamps to that entry's last row, never spilling into the next.
- **I8** — Width changes invalidate the whole cache; height changes invalidate nothing.
- **I9** — Visibility queries are O(log n) in entry count, and the index does not grow with the session. Stated as a post-condition rather than as a rule about when a method runs, for the reason C13 I15 is: **after any operation, `index.length ≤ 2 × entries.length`.** The front offset carries the common eviction and the array is rebuilt once the evicted prefix exceeds the live count, which is amortised O(1) per append.
- **I10** — Summed `takeRows` over a visible range equals `min(viewportHeight, totalRows)`, exactly.
- **I11** — C14 reads no clock and performs no I/O; the clipboard writer is injected.
- **I12** — C14 imports nothing from `terminal/`; dimensions arrive as data, and C14 never calls the frame scheduler. L4 orchestrates.
- **I13** — The eviction marker is an ordinary entry (C13 I14); C14 holds no special case for it.
- **I14** — **Semantic copy mode** restores the prior follow state on exit. It said *native selection* and named the mode that cannot move the viewport and therefore has no follow state to restore (§6a); the rule is unchanged and its subject is corrected.
- **I15** — Cache invalidation is incremental, driven by C13's granular `Change`. An append invalidates nothing already measured; a patch invalidates one entry through its `rev`. Dropping the cache on every change would make the Fenwick tree pointless.
- **I16** — There is no overscan in v1. Rows outside the viewport are not measured or rendered ahead, and adding it is a measurable change against M-T3's baseline rather than a default nobody chose.
- **I17** — A page movement is exactly `viewportHeight − 1` rows, in both directions. The overlap is the point: a full-height page turn leaves a reader with no anchor in what they just read, and the off-by-one is the difference between the two.
- **I18** — `VisibleRange` carries `live` per entry; the gutter marker is frame chrome and never enters a block or a measurement. **The gutter it names is superseded as a drawing** (ruling 68): no live gutter is drawn, liveness is the spinner, and the column is the selection rail's (I57, I58). `live` stays on `VisibleRange`.
- **I19** — `entryAtRow` is pure and total: it reads the index and the current scroll, stores nothing, and returns `null` for any row the transcript does not occupy. It is the **only** place a region row becomes an entry — C16 routes mouse events by position and does not recompute the mapping, because two components computing where a row is will agree until one of them learns about a height change and the other does not. **The region row reaches it through one translation** — `paint.ts`'s `blankRowsAbove`, the bottom alignment the composer draws with — which L4 reads from the exported function rather than restating, so the painted row and the clicked row cannot drift apart separately (F755).
- **I20** — **Chrome that occupies rows enters the height; chrome that occupies columns does not.** I57's reserved column — once I18's live gutter, now the selection rail — is the second kind, and that is *why* it may stay out of every measurement — not because it is chrome. The command line each entry is drawn with is the first kind: it is not a block, so it is never adapter output and never counts toward C13's cap, but it takes a row and may wrap, so an entry's height is `chromeRows(entry, width) + measureSequence(entry.doc.blocks, width)`. `chromeRows` is injected beside `measureSequence` and defaults to none, so C14 still knows nothing about what the chrome says. **Composing the two in different places is the whole hazard**: the composer draws `chrome ++ blocks` and the index measures `blocks`, and a viewport that is arithmetically self-consistent then describes a document it is not showing.
- **I21** — `resize` to the size already held is a no-op: nothing is captured, nothing is restored, and **no `Change` is emitted**. The emit is the load-bearing half — a change reports that the view moved, and a view that did not move must not report one, whatever the caller intended by the call. C01 delivers a `SIGWINCH` whenever the size *may* have changed and holds no previous size to compare against, so this component is the first one that can tell.
- **I22** — The height **and the width** handed to `resize` are the **transcript region's**, not the terminal's. C14 holds no geometry above itself and cannot derive one from the other — the difference includes the prompt, whose height varies with what is typed — so the caller composing the frame owns the value (C22 I34). The failure is silent in both directions: too tall and `#maxTop()` leaves the document's last rows unreachable by any key, while the surplus rows `visible()` selects are discarded by the paint, so no count downstream is ever surprised. I10 holds throughout, because it compares the viewport with itself. **The width is the same sentence and landed later** (→ C22 I109, F1227): the region is one column narrower than the terminal, because `APPEARANCE.md` §15 rule 8 stops content one column before the right edge, and C14 cannot derive that number any more than it can derive the height — the margin is a decision about the frame's look, taken where the three rule rows and the chrome are exempted from it. The failure is silent in this direction too and in the safe sense C09 names: measured a column wide, every wrapping block answers one row too few and the paint pads the surplus column, so the frame is short rather than overrun. Both axes are therefore one rule — **the caller composing the frame owns the region's geometry** — and the two used to be one number and one guess.
- **I23** — **The render path draws at most the region's rows of any one block, plus a residue.** Every kind whose rows are its lines declares a `window` (C09 I25) — `logs`, `patch`, `table`, `keyValue`, and `code` and `raw` since §4a landed — and a window that must pin what the whole block derived carries the pin as view state (`presorted`, `lineRange`). Kinds that are atomic by ruling (`plot`, C12 I1; `scroll`, C04 §3c) are the stated exceptions and are bounded by their own height. A frame's paint cost is then linear in the region, not in the document, which is the property D40 was mistaken for providing.
- **I24** — **One block occupies at most `maxBlockRows` rows plus one marker row, and the marker says what was cut.** The registry resolves every block to its capped form before any definition sees it — `window(block, w, 0, cap)` with `capped: { shown, total }` attached — so `measure` counts `shown + 1`, `render` draws `shown` rows and then `… shown of total rows` in `muted`, and no kind implements the cap. `shown` is the window's own rows and not `cap`, because a window is a unit boundary and the marker must name the rows on screen. A block whose rows are within the cap is returned by reference, unchanged. Default 2 000, the app's to raise per session and never per block (§4b, C09 §2b).
- **I25** — **The window and the cap compose: a window over a capped block windows the capped rows, and the marker travels with the piece that reaches it.** `windowSequence` windows the capped form; a range below the marker yields the definition's window with `capped` stripped — byte-identical to the same range of the uncapped block — and a range whose `to` reaches the marker row carries `capped` onto the piece. The field is attached after the definition's window, never before, because a kind's window may build a fresh block and drop it. C09 I26's identity holds for every window of a capped block with the marker counted as one row.
- **I26** — **The cap applies to exactly the kinds that declare `window`, and no list of kinds is consulted.** A kind's `window` is its statement that its rows are its lines; the kinds atomic by ruling — `plot` (C12 I1), `image`, `scroll` (C04 §3c), `panel`, `group`, `mosaic` and the single-row kinds — are outside the cap by the same absence that makes them unwindowable, and a container's children are capped individually through the child seam. A kind that declares `window` is capped on the day it does.
- **I27** — **`stats` reports the cache's hits and its misses by reason, and the reason is the axis the comparison rejected first.** `HeightCache.get`'s three-way test already distinguishes `absent`, `rev` and `width`; publishing which one rejected costs nothing and turns a size into a hit rate. The shape joins the three members `stats` already has: `hits: number` and `misses: Readonly<Record<"absent" | "rev" | "width" | "nothing-changed", number>>`. A size says how much is held; only a hit rate says whether holding it was worth anything (F863).
- **I28** — **`nothing-changed` is a value comparison, never an axis.** A miss where no axis moved cannot occur — a slot agreeing on `rev` and `width` **is** a hit — so the counter is *the recomputed height equalled the height the miss discarded*, which is wasted work reporting itself. Counting it as a fourth axis would be a member that can never be non-zero (→ C28 I8).
- **I29** — **The measure seam is told *whose* blocks these are.** `measureSequence` takes the entry's id beside the blocks and the width, as `chromeRows` already takes the entry itself — C14 reads neither and passes both, so this adds nothing C14 can be wrong about. What it buys is at the other end: block ids are unique within a document (C04 I14) and a transcript holds many, so a measurer handed only `(blocks, width)` cannot tell one entry's `table#t1` from another's. Measured — with the height cache warm the shell attributes every element from its own render loop and this path opens nothing; on a miss it opens the whole entry, and three unattributed calls in three frames on a four-entry fixture become every entry on a resize, which is the axis this component exists to make cheap (C28 I42, F892). **Optional, and the default is the shipped behaviour**: a caller that omits it measures exactly as before, so this is not a second way to measure.
- **I30** — **`visible()` returns the same frozen range until the viewport moves, and every movement drops it at the clamp.** The memo is invalidated in `#setTop` and nowhere else, because every path that changes what is visible — a scroll, `#afterContent` after any content change, `resize` on either arm, `clear` — ends there (I2). A second call with nothing moved is the first call's object by identity; a call after a scroll, an append or a resize is a fresh one. `stats.visibleMemo` counts the hits and the misses. **Why** (F1198): the range was recomputed per question — a `locate`, a walk, an object per entry — and C23 asks the question per live part per sweep; 200 parts at 16 ms were twelve thousand computations a second, 585 ms of a six-second profile, for an answer that moves only with the viewport (→ I2, I9, I27, C23 I46).

- **I31** — **While semantic copy mode is up the frame draws a document held at the moment of entry, and the record keeps taking every write.** The hold is entries *and* the heights measured over them, captured together (§6b A2), because an index rebuilt from a record the view no longer shows describes a document nobody is looking at. The record is never queued and never answers a write it has not applied: C13's `patch` returns an outcome C23 branches on, so a deferral there would have to fabricate a verdict (§6b). **Width invalidates the held index and nothing else does** — the hold is over content, not over geometry, which is the same sentence I8 makes about the live one.
- **I32** — **Scroll moves under the hold; the document does not.** The caret is what pulls the viewport, so a hold that froze `visible()` would walk the caret off the screen and make the mode unusable (§6b A3). `topRow`, `followTail` and the anchor all behave exactly as they do with no mode up, over the held heights rather than the live ones — so I2's clamp is against the held total and moves only when the held document does, which is never while the mode is up.
- **I33** — **What `y` takes is the held document, not the record** (§6b A6). This is the row a paint-path freeze cannot satisfy, because `y` is not a frame: the screen would be right and the clipboard would carry content that was never on it. `copyTextOf`'s `loaded` argument is therefore the held entries, and `A` selects the held ones for the same reason `R-SEL-008` gives about the window and the record.
- **I34** — **The footer states the difference while it is non-zero, and the hold is dropped by one commit on exit.** The buffered notice (`R-SEL-010`) is the only subject that reads both sides, and the only observable the hold has: without it a held view and a render that has stopped working are the same picture. On exit the hold is dropped and a single `commit("input")` draws the record — an ordinary frame, not a repaint, for C03 I14's reason: nothing on the terminal became unknown. **Amended (review batch 4, M10 item 8): the difference is counted by entry, not by length** (§6b, *The count*). An entry of the record is waiting when the held view has no entry with its `id`, or holds that entry at a different `rev` or a different `streaming` — C13's statements that its document changed (C13 I13) and that it ended. A length reads 0 for a patch to a held entry and for an eviction that cancels an append; object identity reads an append as two, because C13 replaces the previous live entry's record, and counts the marker on every write. The marker is an ordinary entry (C13 I14) and counts when the hold did not have it.
- **I35** — **The ticker stops with the mode and the document does not carry it.** Elapsed counts are content and a held view already holds them; the spinner's frame index is `RenderContext.tick`, a counter on the session that no document carries, so a held document still draws a turning spinner unless the ticker is stopped. `#tick`, orbit angles and animated image frames do not advance while the mode is up, which is `R-SEL-009`'s *not the spinners* and is the one clause here that constrains C22 rather than C14.

- **I36** — **The caret is an entry plus an entry-local display row, and the selection's unit is the block.** The split is what makes `R-SEL-003` a rule rather than a property of the type: a selection whose unit is already the block satisfies *all of it or none of it* by construction, and nothing can be written that violates it (A03 §2). An extend maps a row range to a block set by **intersection** — every block whose entry-local rows meet the range, taken whole — so a range covering one row of a table and a range covering all of them give the same answer, and the caret continues past the block it took. The row is the entry's own and never the viewport's, for the reason I6 gives about the anchor: a viewport row moves when anything above it changes height, and an entry-local row survives a resize, which the mode must, because a resize re-lays the held document (I31).
- **I37** — **The anchor is a second caret, planted where the extend began, and the range is re-derived from the pair on every step.** With no extend in flight there is no anchor; an extend that over-shoots and comes back gives the selection that going there directly would have given, which is `R-SEL-015`'s *the count is always the size of what return would copy right now* stated for a keyboard. A plain arrow moves the caret and touches neither the anchor nor the selection — without that pair the caret cannot be placed anywhere without selecting on the way. **Amended (review batch 4, M10 item 7; R-SEL-012, I44): a keyboard move that takes the caret off the viewport scrolls the viewport by the overshoot**, so the caret is on screen after every arrow, plain or shifted, at block granularity and in the rectangle. The container is the viewport: a box is one atomic block to the keyboard (I36), so the caret never stands inside a box's scroll. A caret whose entry is off screen entirely — one row past the last visible entry — is brought on by single rows until it is. The transcript's own ends clamp the caret (`step`) and nothing scrolls. → T3.14
- **I38** — **The selection's unit is blocks, and the count is taken over what they copy.** `R-SEL-015` counts what a copy would take, and an entry-level count reports a half-taken entry as a whole one — the number wrong in exactly the direction the rule exists to prevent. **Amended 2026-09-24 (question 35)**: the *drawn* count is not the block count but the size of `copyTextOf` over the held view — chars, rows, entries (I55) — so a block that copies nothing adds nothing, and the number is the size of the paste rather than of a set the reader never sees. `a` and `A` are unchanged in meaning and changed in unit: they put every block of their entries into the set, and `R-SEL-008`'s sentence is untouched.

- **I39** — **The selection's ground is painted by the shell, one row per selected block, at the block's first row and across the full width.** A kind washing its own body is what `R-SEL-003`'s third clause forbids, and a rule delegated to twenty-six kinds is a rule enforced twenty-six times. *Frame or first row* is one arm rather than two: a bordered block's first row **is** its frame, so no kind is consulted about which it has. The spans are the ones the caret moves over (I36), so what is washed and what an extend took cannot disagree.
- **I40** — **Nothing selection-dependent is ever written into a render-cache slot.** The cache keys on nine axes and the selection is none of them; a wash baked into the stored lines would serve a selected frame to a later unselected read, which is C22 I71's *correct frame, previous state* — the symptom whose report says *it froze*. A tenth axis would be correct and would bust an entry's whole slot on every keystroke in the mode, one rung coarser than the cost C22 I103 split `tick` out to avoid. So the wash is a transformation of the finished lines, applied to the copy that goes on screen and never to the copy that is stored.
- **I41** — **`R-SEL-006`'s precedence is the order of two operations, not a case in a table.** The mark is already in the rendered text and the wash changes the ground under it, so *selection wins the ground while focus keeps its mark* is true by construction — including over a diff ground, where `patch`'s own inks are what the wash lands on and the `+`/`−` marks carry the diff. At 1-bit `selectionStyle` answers `inverse` and the focus mark survives, so neither fact rests on colour alone and no new rung is added.

- **I42** — **A rectangular selection is a cell rectangle inside one block, and the block is the anchor's.** `R-SEL-007`'s *never crosses a block boundary* is enforced by **clipping the head**, not by refusing when the head has left: a containment test reads as the same rule and behaves as its opposite, making the selection vanish while the reader extends and reappear when they come back. The head's row is clamped into the anchor's block before a rectangle exists, and a head in another entry takes its direction from the transcript's order rather than from a row that means nothing in the anchor's space.
- **I43** — **A rectangular copy is the rendered cells, and it carries no escape.** It is the single exception `R-SEL-004` names to copy taking the source, so its input is the line the **frame drew** and its window is `sliceCells` — a straddling cluster blanked rather than halved (C09 I9), which a substring cannot do and which only a painted line makes visible. The clipboard is text: an escape sequence in it is the rendering arriving where the content was asked for. **The order of the slice and the strip is not part of this**, and it reads as though it is: `sliceCells` already skips escapes when it counts cells, so both orders give the same string and a rule about the order would forbid nothing while reading as though it forbade the defect (A03 §2, §6e). The two clauses that can be violated are the input and the window.

- **I44** — **A drag's container is chosen at the press and held for the whole gesture.** `R-SEL-012`'s *the one place the pointer does not decide*: the wheel takes the innermost scrollable under the pointer and a drag takes the scrollable the **anchor** is in, so a pointer that leaves the box does not hand the gesture to the transcript. Re-resolving per motion report reads as responsiveness and moves the box out from under the reader mid-gesture, which is indistinguishable from the selection jumping. It is `R-PTR-005`'s mechanism on a container instead of an element — an identity taken at the press and held to the release — and a keyboard extend at an edge scrolls the same one, which is what stops the rule being about the mouse.
- **I45** — **Autoscroll is a ticker, not a response to motion.** `R-SEL-013`'s bands are 120 ms, 60 ms and 30 ms per row for one cell past the rect, up to four, and more than four, on columns as on rows. The **arithmetic is the boundaries and the rule is the continuation**: a terminal reports motion when the pointer changes cell and not while it sits still, so an autoscroll driven by motion reports stops exactly when the reader is holding still and waiting for it. It is armed while the button is held and the pointer is outside, and it stops on release, on `esc`, and at the container's end — where it stops rather than rubber-banding, there being nothing in a cell grid to rubber-band against.
- **I46** — **A container the drag passes through is taken whole and never scrolls**, and three of `R-SEL-014`'s four clauses are I36 and I38 seen from another side. A child inside a container has no span key, so it cannot be addressed; the copy is the block's source and never the rendered window; an intersection takes what it touches. What is new is *does not scroll*, and it follows from I44: the gesture's container is the anchor's, so every other one is scenery. The selection extends to the container's end and does not spill into the parent, which is the same sentence — the parent is a container the drag is not in.
- **I47** — **`⏎` copies in semantic copy mode, and it is `y`'s action** (`R-SEL-015`, `R-SEL-009`, §103). §103 draws the rung's footer as `copy ←→↑↓ extend ⏎ copy esc out`, and `R-SEL-015` defines the count as *the size of what return would copy right now* — so return is the mode's copy key by the design's own definition. The footer already said `⏎ copy` and nothing was bound: a chip naming a key that does nothing is C16 I19's second keymap disagreeing with the first. **Amended (review batch 4, M10 item 6, I59): `⏎` copies and leaves, so it is a second action over the same copy** — `copyAndLeaveSemanticSelection` runs `copySelectedEntries`' own path and then the exit, and the path is what A6 needed to be one: a return that copied through another path could copy the record. The sentence it replaces, as it stood: *The same action, not a second one: `copySelectedEntries` reads the held view (A6), and a return that copied through another path could copy the record.* → T1.47
- **I48** — **The drag gesture ends on `esc` and on leaving the mode, and the autoscroll with it** (`R-SEL-013`, `R-SEL-005`, C16 I51). *Stops on release, on esc, or at the container's end* — release and the end were built, and `esc` and `⌃c` changed the mode while the gesture and its ticker lived on: with the pointer held outside the container the transcript kept scrolling after the reader pressed the key that means *stop*, and after `⌃c` it scrolled the live transcript the mode had just handed back. Every `esc` ends the gesture, the one that only clears as well as the one that leaves, because the rule names the key and not the outcome; the selection clear and the mode's exit are C16 I51's and unchanged. **Amended in review batch 2 (C16 I62, ruling 59): `⌃c` no longer leaves the mode — it is refused, consumed with nothing run — so it ends nothing, and a drag held through it keeps its autoscroll.** R-SEL-013 names *release, esc, or the container's end*, and `⌃c` was never one of them; it ended the gesture only because it left the mode. → T4.37b
- **I49** — **An autoscroll tick extends the selection to the container's edge row** (`R-SEL-013`, `R-SEL-015`). *The selection extends to the container's end*: with the pointer held still outside, each row the tick scrolls into view joins the selection as though the pointer had moved onto it, so the caret is placed at the container's last row scrolling down and its first scrolling up, through the same `extendTo` a pointer move takes — all-or-none included. Measured before: a press, a drag below the transcript and 400 ms of ticks scrolled the view and selected nothing, so `y` copied an empty string. → T4.37c
- **I50** — **A drag anchored in a box never selects outside it** (`R-SEL-013`, `R-SEL-014`). *The selection extends to the container's end and does not spill into the parent*: the drag's container is fixed at the press (I44), and every caret it extends to is first clamped into that container — to the box's first row when the pointer is above it or in an earlier entry, to its last row when below or in a later one. A drag anchored in the viewport is unclamped, which is I46's *passed through, taken whole*. Found by reading: `#semanticDrag` handed the pointer's caret to `extendTo` whatever the container, so a drag begun inside a box and moved onto the prose beneath selected the prose. → T1.48, T4.37d
- **I51** — **I36's *every block* is every block, in either direction** (`R-SEL-003`, `R-SEL-004`, `R-SEL-015`). Two readings of I36 had drifted from it, and both were measured in a session on 2026-09-24. **The span set was the navigation elements'**: `#selectionSpans` took block-level elements only, so a block with none — `raw`, `text`, `code`, prose of every kind — had no span and could never join a selection, while `R-SEL-004` says how each of them copies. A top-level block with no block-level element in its rows now takes a span of its **content** rows (its measure less its padding, so the wash of I39 lands on text and not on a `gapBefore` row); a block that has elements keeps theirs, so no selectable block changes key and nothing is copied twice. **And the two ends were ordered by entry only**: with both in one entry, `blocksTouched` kept press-then-pointer order, so an upward drag clipped low at the press and high at the pointer and selected nothing. Within one entry the ends are ordered by row. → T1.49, T4.37e
- **I52** — **The wash is re-opened after every SGR sequence in the row, not laid once under it** (`R-SEL-003`, `R-STA-002`). A finished line is a run of styled spans each closed by `SGR_RESET`, so a wash opened once before the line lasted to the first inner reset and no further — measured on 2026-09-24 over a muted border, a plain run and a bold toned word: the ground covered the border and stopped, at colour and at 1-bit alike, leaving the rest of the row and its pad on the terminal default. And a span that opens a ground of its own (a focused row's `focusGround`, a surface) displaced the wash over its cells, which is the precedence inverted: copy selection sits above focus and above a structural surface. So the selection's opening sequence follows **every** SGR sequence in the row — a reset or an opening — and the row's text, marks, inks and weights are left as they were. At 1-bit the re-opened sequence is SGR 7, so inverse is not lost at an inner reset either. This is `based`'s mechanism with the precedence reversed: a base re-asserts only after a return to the terminal default because anything above it may displace it; the selection is the top ground and re-asserts after everything. → T1.40d
- **I53** — **On a banded theme the wash carries the band's ink as well as its ground** (`R-THM-005`, C10 I45). A band's ink is total: everything drawn on it takes that one ink, whatever slot it names. The wash laid the ground and left the row's page inks in place. Measured on 2026-09-24: every page tone sat on the selection band at **1.25–1.68 : 1** in both high-contrast themes (`hcDark` `#efc51c` under `default #ffffff` 1.66; `hcLight` `#46176d` under `accent #5b00a8` 1.25), where the theme promises 7 : 1. The wash's opening sequence now carries the band's ink, resolved through the one path every renderer uses (`tone(…, "selection")`, which `inkOn` answers from `bandInk` first). Because I52 re-opens the wash after every sequence, no inner ink survives to a printed cell on the band. A theme with no selection band is untouched: its rows keep their inks and take the ground alone, as before. → T1.40e
- **I54** — **Under a banded selection, a call head draws its state's own mark** (`R-THM-005`, C09 I45, C14 I53). The band's ink is total, so a head under it has spent its tone exactly as a focused one has (C09 I45's per-cell rule). The head is resolved at render, though, and the wash is laid after the cache (I40), so the renderer never learned that the head was washed: it drew `●` in the band's one ink for every state. **`RenderContext.washed`** carries the ids of the entry's blocks under the selection, **and only where the selection is painted as a band at this depth** (C10 I66) — so at 1 bit, where no band is painted and every head already takes its state's mark, it is absent and keys nothing. It keys the cache slot as an axis only when present, so a theme without a band pays nothing and keeps I40's reasoning intact: the tenth axis I40 refused is taken on exactly the themes where the picture depends on it. The wash itself stays outside the cache; only the resolution of the head's glyph moves inside. → T1.75b, T4.37f, T4.37h
- **I55** — **The copy rung's footer says which mode, how much, and what the next `esc` does** (`R-SEL-005`, `R-SEL-009`, `R-SEL-015`, questions 4 and 35). `ChromeContext.copy` is `{ mode: "native" }` or `{ mode: "semantic", size }`, where `size` is `null` with nothing selected and otherwise `{ chars, rows, entries }` over the copy text (I38). Semantic mode's owner line is `copy`, `↑↓ extend`, `⏎ copy`, then **`esc clear` while a selection exists and `esc out` when none does** — the first press clears and the second leaves (C16 I51), and a footer saying `esc out` over a selection labels the clearing press as the leaving one — then the count as **one chip**, its three parts joined by the resolved separator (`glyphs(caps).separator`, C09 I49), so it reads as ruled and sheds as a unit; the pill's own gap is two spaces and would draw `418 chars  9 rows  2 entries` — then `the screen is frozen` and `N waiting`. Native mode's is `native`, `mouse tracking off`, `the terminal owns the mouse`, `esc out`, `the screen is frozen`. The header draws `COPY` or `NATIVE` by the same field. Absent `copy`, a `copy` rung reads as semantic mode with no selection, which is what a chrome composed without a session graph can know. **Amended (review batch 4, M10 items 2 and 5): the semantic state carries `clears`, `all` and `rect` beside `size`, and the owner line is §6e's classification table.** `clears` is `hasSelection` (I59) and decides `esc clear` against `esc out` — never `size`, which is `null` over a selection that copies nothing. `all` is *every span of the held view is in the block set, and there is at least one*, derived by equality on every frame and `false` while the rectangle is up; it draws `all loaded entries` after `the screen is frozen` and the waiting notice (`R-SEL-008`'s *says what it did*). `rect` is `null` at block granularity and `{ columns, rows }` in the rectangle — zero by zero where it resolves to nothing — and draws `RECT w×h` (or `RECT`) and `cells, not source` after `copy`, the extend chip's four keys, and the count over the cells. `⌃V rect` or `⌃V blocks` names the toggle by where it goes, **last**, so it is the first chip the line sheds (§6e, *The order is a rank*). → T1.50, T1.51, T1.80, T4.37g
- **I56** — *(M9 item 3, L10, → C22 I110, C24 I41)* **While L4 keeps an entry whole, an append below it does not move it.** `keepWhole(id)` returns a `Disposable`. While it is held, a viewport following the tail follows it only as far as the held entry's first row: where the tail would carry that row off the top, the viewport stops with it on the top row, **detaches**, and anchors there — so I5 holds, because a viewport short of the bottom is not following, and I4 and I6 keep it there through every later append. **The reader moving the viewport ends the hold for it** — a scroll, a page, the top or the bottom — because a hold that pulled a reader back after they had scrolled past it would be fighting them. **The release returns a viewport the hold detached, and the reader has not moved, to the tail**: the detach was the hold's and not the reader's, so ending it gives back what the reader had. A held id the store no longer holds is inert. L4 holds a child surface's entry for as long as the child is attached, sized so that it fits (C24 I41): a full-size child is exactly the region, so any entry appended under it — a settlement, a notice — would otherwise scroll its top rows off the screen while it holds the keyboard.
- **I57** — *(ruling 68, ruling 41, `R-THM-005`, `R-SEL-016`, C22 I109; review batch 4 M11 item 1)* **The frame reserves column 0 of the transcript region on every row, and no measurement includes it.** `Composed.region` is the transcript's box: `left` is `1`, and `width` is the terminal's less `CONTENT_MARGIN_R` and less that column, floored at 1 (`transcriptWidth`). The transcript is resized to that width, and every block in it is measured, windowed, rendered, hit-tested and copied at it. Every element lookup L4 makes for the transcript reads it by name. The pointer's column is translated by `region.left` once, where its row is translated by `region.top`, so a press on column 0 is on no element. **Two things keep the content width** (`regionWidth`, one column wider): the prompt, whose rows the frame composes at that width, and the layer region (C22 I28), which floats over the whole region including the rail's column. Column 0 is blank on every row the rail does not take (I58), including a continuation row, a command echo and the blank rows above a short transcript. **Why a whole column and not a cell borrowed from the row's lead**: the lead's first cell is the call head's state mark, which carries lifecycle at 1-bit (C10 §4k.5), and a rail drawn over it would spend one carrier to add another. **Cost, stated (ruling 68):** every composed-session frame moves one column right, and a command echo no longer lines up with the prompt's `❯`. → T1.77, T4.39, T6.28
- **I58** — *(ruling 68, `R-THM-005`, `R-SEL-003`, `R-SEL-006`, `R-SEL-016`, ruling 69)* **The rail is selection's second carrier, drawn by the frame in column 0 beside every selected row's first row, at every rung.** A row takes the rail if it is the first row of a block in the semantic copy selection (the rows I39 washes), or the first row of an element in `focus.selected`. No other row does: not a continuation, not a selected block's body, not the prompt's selection, whose `▌` is its caret (ruling 69's exception), and nothing in native copy mode. **The glyph is the registry's** (`selection-rail`, `▌`, ASCII `|`, collision domain `gutter`), read through `glyphs(caps).rail`. **Its ink is `accent` resolved against the selection ground**, so on a banded theme it is the band's ink (C10 I45, I53). **Its ground is the selection ground where that ground is a background, and never `inverse`**: at 1-bit the row inverts from column 1 and the rail stays upright, because an inverted `▌` is a right-half block. It is drawn beside the washed row, never inside the wash, since the wash re-opens `inverse` after every sequence (I52). **No block draws it and no block knows it**: it is not in the render cache (I40), and the rows C09 renders are byte-identical with and without it. → T1.77, T3.25, T4.39, T6.29
- **I59** — *(review batch 4, M10 items 5 and 6; ruling 71, `R-SEL-005`, `R-SEL-011`, R-BLK-838)* **One predicate says a selection exists, and `⏎` leaves by copying.** `hasSelection(mode)` is *the rectangle is up, or the block set is not empty*; `escape()` clears on it and leaves without it, and the footer's `esc clear` / `esc out` is the same call — two predicates each correct alone disagreed over a selection that copies no text (§6e trace row 2). `⏎` copies and leaves the mode; `y` and the registry's `copy` copy and stay; each raises a toast naming where the text went. **An empty copy is never silent and never leaves**: nothing selected toasts `nothing selected`, a selection whose copy is empty toasts `the selection copies no text`, the mode stays up, and nothing is written to any buffer — `copyText("")` is not called. → T1.80, T3.15, T4.40
- **I60** — *(review batch 4, M10 item 2; rulings 36, 70, 71, `R-SEL-007`)* **`⌃V` toggles the rectangle, and rectangle mode is `rect !== null`.** On, it seeds anchor and head at the caret's row and the first column of the caret's block; off, it discards the rectangle and leaves the block set as it was. `⇧←`/`⇧→` move the head's column and `⇧↑`/`⇧↓` its row, the anchor fixed; a plain arrow moves both; a press plants both at the pointer's cell and a drag moves the head, and an autoscroll tick moves the head to the edge row at the drag's last column. At block granularity `⇧←`/`⇧→` do nothing. **The column is clamped to the anchor's block** — its span's columns, the run's indent to the run's edge — both when the head is stored and when `rectBetween` derives the rectangle, so a resize narrowing the block narrows the rectangle. While it is up the copy, the count, the wash and the rail are the rectangle's: `cellTextOf` over the entry's lines rendered with the frame's per-entry options, the wash over exactly its cells, the rail on its first row; the block set is neither washed nor counted. `a` and `A` discard it. `CellRect`, `rectBetween` and `cellTextOf` are consumed, and their allow-list entries are removed. → T1.79, T4.41
- **I61** — *(review batch 4, M10 item 1; ruling 72, `R-SEL-011`, → C01 I25, C02 I18, C21 I20, C17 I31)* **A copy goes to the kill buffer, then to one clipboard by the person's order, and says where it went in words that are true.** The kill buffer takes the text first, every time (C17 I31). Then: OSC 52 when C02's `clipboard` is `osc52` and `clipboardWrite` returns bytes, toasted `sent to the terminal's clipboard` and **never** *copied*, because nothing comes back — and counted as done, never as failed; otherwise the tool `findClipboardTool` found, toasted `copying with <tool>` and then `copied via <tool>` on its exit `0`. **A copy never writes a file** *(corrected 2026-09-29 by the person — it wrote `<stateDir>/copy.txt` when the tool failed or went silent, and past the cap with no tool)*: where no route takes the text the toast says why and that the kill buffer holds it — `no clipboard here`, `too large for the terminal's clipboard`, `<tool> failed (<reason>)`, `<tool> did not answer`. **The file is offered, and written only when the reader takes the offer**: the footer reads `⏎ to file` in place of `⏎ copy` exactly when no route exists for the selection's text, or the latest copy's tool failed or went silent and the selection's text is that copy's; `⏎` then writes `<stateDir>/copy.txt`, resolved against the working directory, and toasts `saved to <absolute path>`. `y` is never the offer. Where a route exists and has not failed for this text, nothing offers a file (§6e's classification table). **One copy speaks once**: a copy supersedes an earlier one still pending, whose deadline is disposed and whose answer is dropped, and an answer after the deadline is dropped. The footer states the reason at rest, after the waiting notice — `no clipboard`, `too large for the terminal`, `<tool> failed`, `<tool> did not answer` — beside the offer it qualifies (§6e's footer table). The routing, the wording and the pending copy are one module, `shell/clipboard.ts`; C14 performs none of it (I11). **The session disposes the copier on stop**, alongside the toast's timer, so a pending copy's deadline does not hold the process open for a session that has gone. → T1.81, T1.82, T3.26, T3.27, T4.43, T4.44, T4.45, T5.6

---

## 9. Commitments

1. Scrolling is by display row, never by entry (I1).
2. Page movement is `viewportHeight − 1`, so a line of context carries over (I17).
3. `followTail` is on at the bottom, off on any upward scroll, and restored by `End` (I5).
4. Content growing above a detached viewport never moves the visible rows (I4).
5. The anchor is an entry id plus a row offset, immune to eviction and index shifts (I6).
6. A cached height is valid iff `rev` and `width` match; theme and capabilities are excluded. One slot per entry, so a stale revision cannot accumulate (I3).
7. Cache invalidation is incremental, driven by C13's granular `Change` (I15).
8. The height index is a Fenwick tree; visibility is O(log n), and the index stays within twice the live entry count rather than growing with the session (I9).
9. Width changes drop the cache; height changes do not (I8).
10. The anchor is captured before remeasure and clamps within its entry (I7).
11. No overscan in v1; it is a measurable addition, not a default (I16).
12. Native selection is mandatory because mouse is on by default (§6); semantic copy mode is the framework's own selection beside it (§6a), and the clipboard writer is injected (I11).
13. Summed visible rows equal the viewport height exactly (I10).
14. C14 never calls C03; scrolling reports a change and L4 commits (I12).
15. The eviction marker is an ordinary entry and needs no special handling (I13).
16. `VisibleRange` marks the live entry (I18); the frame reserves column 0 of the transcript region and draws the selection rail there, and no measurement includes it (I57, I58).
17. An entry's height is `measureSequence`, and a block's own spacing is inside each `measure` rather than added between them (I1, → C09 I17, → C09 I80).
18. A region row resolves to an entry and a row within it here, once, and C16 does not recompute the mapping (I19).
19. Row-occupying chrome is measured and column-occupying chrome is not; the command line is the first and the reserved rail column is the second (I20, I57).
20. A resize to the size already held does nothing and emits nothing (I21).
21. The height and the width `resize` is given are the transcript region's, and the caller that composed the frame owns both (I22).
22. One block's rows on the render path are bounded by the region plus a residue, through the window seam and not through a cap on content (I23, §4a).
23. One block occupies at most `maxBlockRows` rows plus a marker row that names what was cut; the cap is the registry's, generic over `BlockDefinition`, and no kind implements it (I24, §4b).
24. A window over a capped block windows the capped rows, and the marker travels with the piece that reaches it (I25, §4b).
25. The cap applies to exactly the kinds that declare `window`; atomic kinds are outside it by the same absence, and a container's children are capped through the child seam (I26, §4b).
25a. **A seam carries the identity of the thing it is asked about** (I29). `chromeRows` takes the entry and `measureSequence` takes its id; C14 reads neither, and a measurer that wants to attribute what it measured cannot recover the identity from the blocks.
26. **A cache that publishes its size publishes its hit rate and its miss reasons** (I27, I28). The comparisons already happen; which one rejected is free, and the value comparison that says a miss was pointless costs one more. A size cannot say whether the cache is working.
27. **A pure function of the component's own state is answered once per state** (I30, F1198). `visible()` is memoised at the one point every movement passes through, so a caller asking it per part per sweep pays the walk once per movement; the memo publishes its rate beside the height cache's.

28. **The freeze is a held view over a record that keeps moving** (I31, §6b). Semantic copy mode holds the document the frame draws and buffers nothing: the store takes every write at the moment it arrives, and what the reader is spared is the *view* of it. A queue at the store would have to answer a write before applying it, and C13's `patch` returns a verdict C23 branches on.
29. **Scroll runs under the hold and `y` reads it** (I32, I33). The caret pulls the viewport as it always did, over the held heights; the clipboard takes what was on the screen, which is the one requirement a paint-path freeze cannot meet.
30. **The buffered notice is the hold's only observable, and it is the one reader of both sides** (I34). Without it a held view is indistinguishable from a render that has stopped.
31. **A counter the document does not carry must be stopped by hand** (I35). Elapsed counts are content and freeze with the view; the spinner's tick is not, and would keep turning under a perfectly held document.

32. **A rule needs a granularity it can be violated at** (I36, §6c). Atomicity is a constraint because the caret is a row and the selection is a block; with both at the block it would be a property of the type, satisfied by everything and asserted by nothing.
33. **The anchor makes an extend re-derivable rather than incremental** (I37). Over-shooting and coming back gives what going there directly gives, and a plain arrow moves without selecting.
34. **The count is what a copy would take** (I38), which is blocks — an entry count lies about a half-taken entry, and lies in the direction the rule was written against.

35. **A rule about where a ground goes belongs to whoever knows the geometry** (I39). The shell holds every block's rows already; delegating the third clause to the kinds would be the same rule written twenty-six times.
36. **A cache may not hold anything its key cannot express** (I40). The wash is applied to the frame and never to the stored lines, so no slot can serve a state it was not keyed for.
37. **Precedence expressed as an order needs no table** (I41). Painting the ground under text that already carries the mark makes *selection wins the ground, focus keeps its mark* true by construction, at every colour depth.

38. **A boundary rule is kept by clipping, not by refusing** (I42, §6e). *Never crosses a block* and *both ends inside one block* read as one sentence and differ on every extend that leaves: one selects to the edge and stays, the other empties and comes back.
39. **The one copy that takes the picture says so** (I43, §6e). Cells rather than source is `R-SEL-004`'s single exception, and the rule requires it to be explicit — so the mechanism lands here and the words land with the mode-label seam §6a parks. **And a clause was dropped before it shipped**: *the strip comes after the slice* was measured, found to name a distinction that does not exist, and replaced by the two that do.

40. **A gesture belongs to where it started** (I44, §6f). The anchor binds a drag to a container as press-arms binds it to an element; recomputing under the pointer is the defect that reads as responsiveness.
41. **A periodic effect the reader is waiting on cannot be driven by their input** (I45, §6f). A pointer held still sends nothing, so autoscroll is a ticker — and it is a second one, because the freeze stopped the first.
42. **A rule can be already satisfied by a decision taken elsewhere** (I46, §6f). Three of `R-SEL-014`'s four clauses are the block being the selection's unit, seen from three sides; reading the tree for the rule's own name finds nothing and concludes wrongly.
43. **The top ground re-asserts after every sequence, a lower one only after a reset** (I52). The difference between the wash and `based` is the whole of the precedence: each ground yields to exactly what sits above it.
44. **An entry L4 keeps whole is not scrolled off by what is appended under it** (I56). The hold limits following; the reader's own movement ends it, and its release gives back the tail it took.

---

## 10. Tests

Six tiers. Every cell of the §7 transition table is covered.

### Tier 1 — unit

- **T1.21** (I27): one `get` on an empty cache, one after a `set`, one after the `rev` moved and one after the width did → `hits` is 1 and `misses` is `{absent: 1, rev: 1, width: 1, "nothing-changed": 0}`. Each reason is asserted by name, not by a total, because a total is satisfied by redistribution.
- **T1.22** (I28): a `rev` bump that recomputes the **same** height → `misses.rev` is 1 **and** `misses["nothing-changed"]` is 1; the same bump recomputing a different height leaves the second at 0. The two counters are not exclusive: the axis says what invalidated, the value comparison says whether it needed to.
- **T1.23** (I30): two `visible()` calls with nothing moved → the same object by identity and `stats.visibleMemo` reads one miss, one hit; after an `append` to a transcript that fits the region — the top row stays at 0 and the rows change under it — after `scrollBy(-1)`, after an `append` while following the tail, and after `resize` to a shorter region → a fresh object each time whose `topRow` and entries are the moved state's, and the miss count is seven, one per call after a movement.

Fake heights, no rendering.

- **T1.1** (I10): a transcript of known heights at a given `topRow` → the visible range's `takeRows` sum to `viewportHeight` exactly.
- **T1.2**: an entry straddling the top edge → `skipRows` set, `takeRows` reduced.
- **T1.3**: an entry straddling both edges (taller than the viewport) → one entry, `skipRows` and `takeRows` both correct.
- **T1.4**: `totalRows < viewportHeight` → `topRow` 0, `atTop` and `atBottom` both true.
- **T1.5**: scroll up by 5 from detached → `topRow` decreases by 5, still detached.
- **T1.6** (I5): scroll up by 1 while following → `followTail` off.
- **T1.7**: `End` from detached → bottom, `followTail` on.
- **T1.8**: `PageDown` moves `viewportHeight − 1`.
- **T1.9** (I2): scroll up past the top and down past the bottom → clamped, no negative `topRow`.
- **T1.10** (I4): an entry above the viewport grows by 20 rows while detached → visible content is unchanged; `topRow` increased by 20.
- **T1.11**: the same while following → the viewport tracks the bottom.
- **T1.12** (I3): a theme change → zero cache entries invalidated.
- **T1.13** (§6a): `enterCopy` from following and from detached → both enter copying.
- **T1.14** (I14, §6a): `exitCopy` restores the prior follow state, both ways.
- **T1.15** (§6a): semantic copy mode entered over a panel → keys route to the mode, not to the panel. **Re-aimed off the pushed view** (R-EXA-082, F1254): the row is about a mode at the `copy` rung outranking a substate, and the view was only the substate it named.
- **T1.16** (I18): exactly one visible entry reports `live: true`, and it is C13's `liveId`; a transcript with no live entry reports none.
- **T1.17** (I18): measured heights are identical with and without the **live gutter** — it costs no rows. *Not the eviction marker, which is an ordinary entry and costs exactly the rows it measures (I13, C13 I14). Two different things were called "the marker" in one spec, and only the citation distinguished them.*
- **T1.18** (I23): a 2 000-line `code` block and a 2 000-line `raw` block, windowed at `[0, 40)` through `windowSequence` → each windowed block measures at most `40 + skipRows + dropRows`, and the painted rows are the same forty the whole rendering would have put there (C09 I25). A block comment opening above the window and closing inside it → the rows inside are still drawn in the comment slot (the `lineRange` pin).
- **T1.19** (I24): with `maxBlockRows: 10`, a 25-line `logs` block measures 11 and renders ten lines and the row `… 10 of 25 rows`; a 10-line block measures 10, renders no marker, and `windowSequence` hands back the **same block reference**; the same for `raw`, `code`, `keyValue`, `patch` and `table` — six kinds, one code path. A `plot` and a `panel` of the same nominal size are untouched, and the panel's 25-line child is capped inside it (I26).
- **T1.20** (I24, I25): the marker is a row the window sees — `windowSequence` over a 25-line `logs` block capped at 10, at `[9, 11)`, yields a piece measuring 2 with `skipRows` 0 (line 9, then the marker); at `[10, 11)` a piece measuring 2 with `skipRows` 1, whose kept row is the marker alone; at `[3, 7)` a piece with no marker and no `capped` field whose rows equal the uncapped block's 3–6 byte for byte. **Read as frames**: the row text is asserted, not the count.

- **T1.30** (I31, §6b A1, A2): the mode is entered over three entries; a fourth is appended and the live one is patched twice → the held entries are the three, by identity, and the held heights are the heights measured before the patches. The record answers four the whole time, so the row is the **difference** and not a store that stopped working.
- **T1.31** (I31, §6b A4): a resize while the mode is up → the held document re-measures at the new width and is still the same three entries. Width invalidates the held index and the arriving fourth entry still does not appear, which is the pair that says the hold is over content and not over geometry.
- **T1.32** (I32, §6b A3): with the mode up and the caret moved to an entry above the window, `visible()` moves and the held entry list does not. Asserted as a scroll that happened **and** a document that did not, because either alone is satisfied by the mode doing nothing.
- **T1.33** (I33, §6b A6): an entry is appended, held, then patched with different blocks → `copyTextOf` over the **held** entries and over the **record** give different text, through the real `copySequence`. That is the expression `#copySelectedEntries` evaluates, with the registry the session uses.
  **The row was unreachable until the code moved, and the mutation pass is what said so.** The choice began as a `?? transcript.entries` repeated in the three readers, and a mutation on any one copy could not be seen by a row that computed the same expression itself — A03 §2's vacuity class arriving through duplication rather than through wording. It has one owner now, `Graph.documentEntries`, which is the seam this row reads and the line the mutation changes. **And the row must read it after the patch**: C13 rebuilds the entries array on every write, so a reference captured at freeze time holds the old blocks whichever document it came from, and the first draft could not tell the two apart. Anchor in `tools/mutate/runs/c14-freeze.mjs`.
  **What no harness here can still do**: drive a far-side patch through a *real* session — `LocalHandler` returns one document and never streams — so the session's own call to `documentEntries` is covered by T4.34's wiring and by this row's seam rather than end to end.
- **T1.34** (I34): content arrives while the mode is up → the buffered count is the number of entries the record has and the view does not, and it is zero before anything arrives. On exit the hold is dropped, the record's entries draw, and the count is zero again.

- **T1.36** (I36, §6c): a range covering one row of a ten-row table and a range covering all ten give the same block set — the table, whole. A range between two blocks takes both and the one it only touches; a range inside a single block takes that block and nothing else. **The vacuity control is in the row**: the same ranges against a layout of one-row blocks give different sets, so the fixture can tell a touching rule from a containing one.
- **T1.37b** (I36): the caret's row is entry-local — the same caret over a document with a taller entry above it names the same block, where a viewport row would name a different one.
- **T1.38b** (I37): `⇧↓` three times then `⇧↑` twice gives the block set of `⇧↓` once, by equality and not by size; a plain `↓` between them moves the caret and leaves both the anchor and the set alone; and the anchor is planted by the first extend, not by entering the mode. **The caret starts two rows above a block boundary, and the mutation pass is why**: with it at the top of a ten-row block every step of the row stays inside that block, so the set never changes and both *accumulate rather than re-derive* and *a plain arrow that also extends* survive against a fixture that cannot see them. A corpus chosen for a property may not have it.
- **T1.39** (I38): the count is the blocks, so an extend stopping inside a two-block entry reads 1 where an entry count would read 1 and a whole-entry extend reads 2 where it would still read 1 — the pair, because either alone agrees with the wrong rule.


- **T1.40** (I39): a two-block entry with both blocks selected → the rows taking the ground are exactly the two blocks' first rows, and none of the other four. A body-wide wash and a first-row wash are both *some rows are styled*, so the claim is the **set**, not a count. A block whose first row is above the window contributes none. **The spans hold two entries and the second is not decoration**: with one entry's blocks alone the membership test is false for everything and the entry filter is never reached, which is the fixture the mutation dropping it survived against — both entries' first blocks start at row 0, so a dropped filter is invisible without the pair.
  **Why here and not at the session** (I40's own limit): the harness's screen model replays the frame into a grid and drops every SGR, so a read one layer up can see a row *move* and cannot see a *ground* — which is the same reason `session-paint.test.ts` reads `paint()`'s return rather than the modelled screen. The arithmetic is therefore a pure function beside `washRow`, and both halves are artefacts.
- **T1.40c** (I40): the wash returns a new array and leaves the one it was given byte-for-byte unchanged, and an empty selection is the identity. **That is I40's whole claim at the mechanism**: the caller has already written those lines into the cache, so *the copy that goes on screen is not the copy that is stored* is a property of the function rather than a discipline at the call site.
- **T1.40b** (I41): `washRow` over a row already carrying a mark → the mark is still in the text and the ground is the selection's, which is *selection wins the ground while focus keeps its mark* as the order of two operations. At 1-bit the same call emits SGR 7 rather than a background, so neither fact rests on colour alone.

- **T1.42** (I42, §6e): an anchor inside a three-row block and a head two rows past its last → the rectangle's rows end at the block's last row and the rectangle still exists. Extending further changes nothing, and bringing the head back inside gives the smaller rectangle again — asserted as a **clip**, since a containment test answers `null` for the same two heads and every assertion about the returned rows would be vacuous. The head in a later entry clamps to the last row, in an earlier entry to the first; an anchor in no block at all is `null`, which is the one refusal.
- **T1.43** (I43, §6e): a rectangle over rendered lines carrying SGR → the text is the windowed cells, has no escape byte in it, and a double-width cluster straddling the right edge is a blank rather than half a glyph. **The control is a painted line and a substring taken from it**: the same columns as a `slice` give three bytes of the escape rather than the cells, so the fixture can tell a cell window from a byte window — which the order of the strip cannot, both orders being the same string.

- **T1.44** (I44, §6f): a press inside a `scroll` box, then motion out of it and over the transcript → the container the gesture scrolls is still the box, and it stays the box for every later report including one back inside. **The control is the wheel in the same fixture**: the same position under a wheel takes the innermost scrollable under the pointer, so the row can tell *the anchor decides* from *the pointer decides* rather than asserting one against nothing.
- **T1.45** (I45, §6f): the band for 0, 1, 2, 4, 5 and 40 cells past → nothing, 120, 60, 60, 30, 30, which pins both boundaries rather than the middle of each band. Then the continuation: with the button held and **no further motion reports**, the clock advanced by 300 ms scrolls the container by rows at the band's rate — the assertion no band table can make, and the defect a motion-driven implementation passes every other row of this file with.
- **T1.46** (I46, §6f): a drag anchored in the transcript passing through a `scroll` box → the box's blocks are in the selection whole, the box's own offset is unchanged, and the copy carries the block's every row rather than the ones the window showed. Each of the three is a different clause of `R-SEL-014` and only the second is new, which the row says so a later reader does not take the other two for coverage of code this MR wrote.
- **T1.47** (I47, R-SEL-015): at `semanticSelection`, `⏎` resolves to `copyAndLeaveSemanticSelection` and `y` to `copySelectedEntries` — **amended** (I59): it resolved to `y`'s action while `⏎` stayed — and `⏎` resolves to nothing at `nativeSelection`, which is native handoff's rung and copies through the terminal. `docs/KEYS.md` regenerates with the row.
- **T1.48** (I50, R-SEL-013): `clampToContainer` — inside the box a caret is unchanged; above it, below it, and in an earlier and a later entry it lands on the box's first or last row; a viewport drag is never clamped. The control is the unclamped `blocksTouched` from the same carets, which reaches the prose.
- **T1.49** (I51, R-SEL-015): `blocksTouched` from a lower caret to a higher one in the **same** entry takes the blocks between them — the same set as the downward pair. The control is the two-entry upward pair, which was already ordered.
- **T1.40d** (I52, R-SEL-003): `washRow` over a row of three spans — a toned border, a plain run, a bold toned word — and an inner span carrying its own ground → every visible cell and the pad sit under the selection's ground: the wash's opening sequence follows each SGR sequence in the row, and no inner ground sequence is the last one before a printed cell. The same at 1-bit with SGR 7. The control is an unstyled row, which one opening already covers.
- **T1.40e** (I53, R-THM-005): `washRow` over a toned row in `hcDark` and `hcLight` → the wash's opening sequence carries the band ink, and every printed cell is governed by it; the ink clears the theme's declared floor against the selection band. The control is `dark`, which has no band: the opening carries a ground and no ink.
- **T4.37f** (I54, R-THM-005): a session on `hcDark` with a failed call head → selected in semantic copy mode, the head's first cell is the state's own mark; after esc it is `●` again, so the axis responds both ways. The control is `dark`: selected or not, `●`.
- **T4.37h** (I54, C10 I66): T4.37f's session in `hcDark` at `colourDepth: 1` — the failed head selected in semantic copy mode, then the selection cleared with `esc` → the render cache records **no** `focus` miss, because at 1 bit the selection changes nothing the entry renders; the head reads `✗` throughout. The control is the same session at 24 bits, where the selection and its clearing each miss on `focus` and the head reads `●`, `✗`, `●`. It is the only row that observes the 1-bit half of C10 I66: the head mark is the same either way, so a frame cannot tell.
- **T1.50** (I55, R-SEL-005, R-SEL-009; **amended** for `clears`, `all` and `rect`, and for `⌃V rect`): `ownerLine` on the copy rung — semantic with no size reads `esc out` and no count; with a size, `esc clear` and the one count chip `418 chars · 9 rows · 2 entries`, `:` at ASCII; native reads `native` and `the terminal owns the mouse` and neither `↑↓ extend` nor a count. The header reads `COPY` or `NATIVE` by the same field. At ASCII every chip is ASCII.
- **T1.51** (I38, I55, R-SEL-015): `sizeOf` over a held view — two entries, one selecting a block that copies nothing — counts code points of the copy text with its line breaks, its lines, and only the entries contributing text; one of each is singular; an empty selection is `null`.
- **T4.37g** (I55, R-SEL-005, R-SEL-009): a session in semantic copy mode, `a` pressed → the footer carries the count and `esc clear`; `esc` → the count is gone and it reads `esc out`, still in the mode; `esc` again → the mode is left. The control is the frame before `a`, which reads `esc out` and no count.
- **T1.76** (I56, I5, I6): a viewport of 10 rows following a transcript whose last entry is 10 rows high, that entry held → an append of 3 rows leaves `topRow` on the held entry's first row, `followTail` false and the anchor `{ id, 0 }`; two more appends do not move it; the release returns it to the tail with `followTail` true. The same append with nothing held moves `topRow` by 3 — the control. A scroll while held, then the release → the viewport stays where the reader put it; an append first, when the held entry is short enough that the tail keeps it whole → the viewport follows the tail and the hold never acts.
- **T1.77** (I57, I58, I39): `railRowsOf` over a transcript window equals `washedRowsOf`'s rows unioned with each `focus.selected` element's first row, **as a set** — a selected block of three rows gives one row, a block whose first row is above the window gives none, and a selected table row inside a card body gives that row's first row in entry space less the window's start. Every other row's column 0 is a blank. The control: with nothing selected the set is empty and every row is blank-led.
- **T1.78** (I34, §6b *The count*): `waitingEntries(record, held)` over a real C13 store with a cap of a few blocks, frozen by copying its `entries`, for every row of §6b's table — an append is 1 and not 2, a patch to a held live entry is 1 and a second patch to it still 1, a malformed patch 0, a bare settle 1, a settle with a document 1, an append evicting an entry is 2 on the first eviction (the entry and the marker) and 1 once the marker is held, and a write with a marker held adds nothing for the marker. The control: the length difference, computed over the same two lists, is 0 in the patch and eviction rows, so the fixture reaches the cells length gets wrong. **The wiring**, because the function can be right while the footer still subtracts: through a graph, `bufferedEntries` after a patch to the held live entry is 1.
- **T1.79** (I60, I42, rulings 36, 70, 71): the rectangle's model over spans that carry columns — `⌃V` seeds anchor and head at the caret and the block's first column; `⇧→` forty times stops at the block's last column and one `⇧←` moves back one; `⇧↓` past the block clips and the rectangle survives; a plain arrow moves a 1×1; `⌃V` off leaves the block set it found, by equality; `esc` clears both; `a` and `A` discard it; and `rectBetween` over spans narrowed by a resize clamps a stored column. The control is T1.42's spans, which carry no columns and clamp none.
- **T1.80** (I55, I59, §6e's footer table): `ownerLine` for every row of the classification table, asserted as the whole line — including *only blocks that copy nothing*, which reads `esc clear` with no count, *every span* with `all loaded entries`, *the empty transcript* without it, and *the rectangle over a full block set* without it. And `hasSelection` against `escape()` over the same states: `esc clear` exactly where `escape()` keeps the mode.
- **T1.81** (I61, §6e *Where the copy goes*, C21 W1–W4; **amended 2026-09-29**): `routeCopy` over each capability × tool × payload cell — `osc52` within → the bytes `clipboardWrite` builds; `osc52` past the cap with a tool → the tool; without → **no route**, *too large*; `none` with a tool → the tool; without → no route, *no clipboard* — and `copyToast` over every outcome: only a tool's `ok` says *copied* (`copied via pbcopy`), OSC 52's says *sent*, and no outcome of a copy says *saved* — only the offer taken does, with an absolute path.
- **T1.82** (I61, §6e classification table K1–K3, K7, K8, K10, K13, K16): `fileOffer` over the table's at-rest cells — OSC 52 within, with a tool or not → none; OSC 52 past the cap and no tool → *too large*; a tool → none; no route → *no clipboard*; after a failed or silent copy → that reason for that copy's text and none for another text; after a later copy of any text → none. OSC 52 is never an offer. And `copyFilePath` resolves a relative `stateDir` against the working directory to an absolute path, leaving an absolute one as it is.

### Tier 2 — contract / interface

- **T2.1** (I10): over a fuzz corpus of transcripts and scroll positions, summed visible rows always equal `min(viewportHeight, totalRows)`.
- **T2.2** (I9): visibility query time grows logarithmically from 100 to 100,000 entries.
- **T2.3** (I3): validity depends on exactly `entryId`, `rev` and `width` — asserted on the predicate, so adding theme silently is caught.
- **T2.3b** (I3, the post-condition): after any number of patches, appends and evictions, `cache.size ≤ entries.length`. A composite map key passes T2.3 and fails this. Checked after each *operation*, never inside a `Change` callback — one `append()` emits two changes and the store is half-applied between them.
- **T2.8** (I9, the post-condition): after any operation, `index.length ≤ 2 × entries.length`, over a session that appends and evicts continuously without ever resizing.
- **T2.10** (I1, I6): after an `append` that evicts, the index still mirrors `entries` exactly — same length, same order, same total. The regression guard for a handler that assumed an `append` is a pure tail push, whose symptom was an empty viewport over a non-empty transcript.
- **T2.9** (I1, C09 I17, C09 I80): an entry's height equals `measureSequence(doc.blocks, width)`, and for a document whose blocks declare padding it equals `Σ measure(b, w)` — the fold and the seam agree, and the padded blocks are what makes the agreement worth asserting. The row it replaces required the two to *differ* by the gap count, which was the whole of its evidence that the right function had been called; that evidence is gone with the difference, so the row now carries the equality and the **height against the frame** — `measureSequence` equals the rendered row count for the same document, which no summation can satisfy by accident.
- **T2.4** (I11): a source scan finds no clock, no `fs`, no clipboard shell-out in `viewport/`.
- **T2.5** (I12): the module graph shows no import from `terminal/`.
- **T2.6** (I1): a spy on the block registry proves `render` is never called during a visibility query.
- **T2.7**: every `Change` variant from C13 has a documented cache effect — exhaustive over the union.
- **T2.11** (I19): over the same fuzz corpus as T2.1, `entryAtRow` agrees with `visible()` for every occupied row — the entry it names is the one whose `skipRows`/`takeRows` span covers that row, and the `rowOffset` it returns lands inside that entry's height. Asserted against `visible()` rather than against a hand-rolled walk, or the test reimplements the thing it checks and the two agree by construction.
- **T2.12** (I19): `entryAtRow` performs no mutation — a thousand calls leave `scroll`, `anchor` and `stats` identical.
- **T2.13** (I25, C09 I26): over every `[from, to)` of a capped `logs` and a capped `table`, `measure(piece) − skipRows − dropRows === to − from` with the marker counted, and the rows kept equal the capped rendering's rows at those offsets — the identity and the frame, because containment is not correctness.
- **T2.14** (I24): `createBlockRegistry({ maxBlockRows })` refuses `0`, a negative, a fraction and `NaN` at construction, and `createTui` refuses the same values as a `ConfigError` naming `maxBlockRows` before anything is built.

- **T2.16** (I13): the eviction marker is measured, counted in `totalRows` and drawn at the head like any other entry — and, over `src/viewport/viewport/`, C14 never names `MARKER_ID`, `isMarker` or the id itself. The behavioural half alone would pass beside a branch that rendered it specially, which is the thing the invariant forbids; the marker is C13's (C13 I14) and C14 holding a second opinion about it is how the two come to disagree.
- **T2.17** (I16): a counting `measureSequence` over a document three times the viewport's height records **nothing** on a scroll — the entries the window can reach were already in the index and none beyond it is pulled in to be ready. **Adding overscan is a measurable change against M-T3's baseline rather than a default nobody chose**, and this is the row that makes it measurable.
### Tier 3 — edge cases

- **T3.1**: empty transcript → empty range, `topRow` 0, no throw.
- **T3.1b** (I19): `entryAtRow` on an empty transcript, on a negative row, and on a row below the last entry in a short transcript → `null` in all three, never the last entry. A click on blank space beneath the transcript is not a click on the thing above it.
- **T3.1c** (I19): a row inside an entry that begins above the viewport's top edge → the entry is named and `rowOffset` accounts for the `skipRows` already scrolled past, rather than counting from the viewport's first row.
- **T3.2**: scroll to bottom while already following → no-op.
- **T3.3**: `viewportHeight` of 0 → empty range, no division by zero.
- **T3.4**: `viewportHeight` of 1 → exactly one row visible.
- **T3.5**: a single entry taller than the entire viewport → scrolls within itself correctly at every offset.
- **T3.5b**: the rows the range selects are the rows C09 draws, at **every** offset — two six-row entries in a four-row viewport, stepped one row at a time, with each entry's real render sliced by its own `skipRows`/`takeRows` and compared against the whole transcript's rows at `topRow`. **The drift test in miniature, and the reason the walk is a scheduled step**: a range that is arithmetically self-consistent can still select rows that are not the ones on screen, and every assertion about the numbers agrees while it does. T4.1 is the same question at seven widths with C09 in the loop; this is the cheap edge-tier form of it.

  **Listed here because it was not** (F570). The row has existed in `test/edge/viewport.test.ts` since the tier was built and C14 named no `T3.5b`, so its number resolved against nothing — which is how the same number came to be used twice for two different rows, the older of which this is. T6.15 in `test/revert/overlay.test.ts` names `T3.5b` too, and that one is C15's; the two are distinguished by their files and by their invariants, not by their numbers.
- **T3.6**: an entry measuring 0 rows (empty `group`) → skipped without consuming a row and without breaking the index.
- **T3.7** (I7): width shrinks so the anchored entry is now shorter than its row offset → clamps to that entry's last row, never spills.
- **T3.8** (I6): the anchored entry is evicted → the anchor falls forward to the oldest surviving entry, and the viewport does not jump to the top.
- **T3.9**: eviction of 400 rows while detached → visible content is unchanged.
- **T3.10**: eviction while following → still at the bottom.
- **T3.11**: rapid resize between two widths fifty times → final state is correct for the final width; no accumulated drift.
- **T3.12** (I8): a height-only resize → no cache entry is invalidated.
- **T3.12c** (§5 step 6): a viewport **following the tail**, resized shorter → it is still at the tail, and the transcript's last row is still the last visible row. Step 6 was written in §5 and had no mechanism: `resize` went to `#restoreFromAnchor`, which for a follower (`anchor === null`) only clamps `topRow` into the new bounds, so shrinking the region slid the tail off the bottom one row per row lost. Invisible while `resize` fired only on `SIGWINCH` — one event deep, and it reads as the terminal's doing.
- **T3.12b** (I21): a resize to the width and height already held → **no `Change` is emitted**, and `scroll`, `anchor` and `stats` are identical afterwards. Asserted from a *detached* viewport with a captured anchor, because from a tail-following one at the top of a short transcript the capture-and-restore is a round trip to the same value and the row passes with the guard removed — the state that distinguishes the two readings is the one that has something to lose.
- **T3.13**: a patch that shrinks an entry below the current `topRow`'s dependence → `topRow` clamps rather than exceeding `totalRows`.
- **T3.14** (§6a, I37 amended): through a session with more rows than the viewport — `↓` and `⇧↓` from the top keep the view still while the caret is on screen, and the press that takes the caret past the last row scrolls it by one, both plain and shifted; `↑` back to the top scrolls it back; at the transcript's first row `↑` scrolls nothing. The view is read off the screen's rows, so the row is about what is on screen; the caret has no mark of its own until it selects.
- **T3.15** (I59, **amended**): `y` and `⏎` with nothing selected → the kill buffer is untouched, the mode is still up, and the toast reads `nothing selected`; a selection of a `rule` alone → `the selection copies no text`, the same two facts. It read *clipboard untouched, no throw*, which a silent return satisfies.
- **T3.16**: yank of rows containing tone spans and gutter markers → clipboard receives plain text only.
- **T3.17**: 100,000 entries, scroll from top to bottom by page → every query within budget, no leak.
- **T3.18**: a streaming entry patched a thousand times → the cache holds one live key for it, not a thousand.
- **T3.19** (I23): a window opening in the middle of a wrapped source line → the whole line is kept and the surplus is charged to `skipRows`; a window of one row over a block whose every line wraps to three → one unit, `skipRows + dropRows === 2`.

- **T3.20** (I24, C09 I26): a `table` whose row at the boundary is expanded to a three-row detail → the unit is kept whole, `shown` is `cap + 2` rows past the header, and the marker names `shown`, not `cap`. Asserted on the marker's text against the rows above it.
- **T3.21** (I24, C09 I33): a capped block carrying `minHeight` above `shown + 1` measures the floor and below it measures `shown + 1`; in both cases `windowSequence` keeps it whole and the marker is drawn.
- **T3.22** (I24, C13 I14): a transcript at the session block cap whose surviving entry holds a capped block → two markers on screen, D40's notice above and the row cap's beneath the block, and evicting further changes neither.
- **T3.23** (I24, C25 I18): a `patch` over the cap → the piece is a valid `Patch` carrying its path header and `collapsedBefore` markers inside `shown`, and the registry's `capped` survives `windowRows` building a fresh block.
- **T3.24** (I24, C09 I11): a kind whose `measure` throws on a block over the cap → contained exactly as before, one row, the fault reported once for `measure`; the cap adds no second report.
- **T3.25** (I58, I53, C10 I45, C10 I66): a selected block's first row at 24-bit, 8-bit, 4-bit, 1-bit with Unicode and 1-bit ASCII, on `dark` and on `hcDark`. Column 0 is `▌` (`|` in ASCII); its ink is `accent` against the selection ground, and the band's ink on `hcDark` above 1-bit; it never carries `inverse`, and at 1-bit the row's cells from column 1 do. The cell is the rail's alone: no block span reaches column 0.
- **T3.26** (I61, trace rows 7–10; **amended 2026-09-29**): a copier over a tool that never answers → the deadline toasts `did not answer — the kill buffer holds it` and writes nothing; a late `ok` after it says nothing; a second copy while the first is pending → the first's answer is dropped and only the second speaks; `dispose` → the deadline never fires.
- **T3.27** (I61, §6e classification table K4, K7–K9, K11, K13–K15, trace rows 6, 11a, 13): **no copy writes a file** — a failed tool, a silent one, no route, and past the cap with no tool each leave the file system untouched and toast the reason with `the kill buffer holds it`; `save(text)` writes the text to the path and toasts `saved to <path>`; a rejected write toasts `<path> could not be written — the kill buffer holds it`; a later copy withdraws a failed copy's offer.

### Tier 4 — integration

- **T4.37** (I44, I45, §6f): a real session, `⌥⇧V`, a press inside the transcript and a motion far below it → the view moves, and it **keeps** moving when the clock alone advances with no further report. That is the claim no model-level row can make: the chain is C16's mouse table, the mode's rung, the row-to-caret translation and the ticker, and each half passes on its own with the seam between them unbuilt. **The control is the same two reports with no mode up**, which scroll nothing — so a moved view is the drag's doing rather than a session that drifts. The release stops it, and a further 600 ms moves nothing.
- **T4.37b** (I48, R-SEL-013): T4.37's session, the drag armed and scrolling with the pointer still — then `esc`, and the view holds across 600 ms. *Its second half, the same with `⌃c`, is retired* (C16 I62): `⌃c` is refused in the mode and leaves nothing. The control is T4.37's own: the same drag, with no key, keeps scrolling.
- **T4.37c** (I49, R-SEL-013): a press in the transcript, the pointer dragged below it and held still for 400 ms, release, `y` — **one copy, exactly the entries from the press to the edge the ticks reached**, read at the editor's `copyText` rather than from the prompt, and its block set is every entry in that range in order. The control is a drag that stays inside the transcript in **its own session**, which copies exactly the entries it crossed and fewer than the subject. *Both halves corrected on review batch 4 (M10 item 4):* the row read a yank in the prompt, which is capped at fifteen rows and elides its head, so it saw the last entry's tail whatever was copied above; and its control ran second in the same session, where a copy of nothing leaves the kill buffer alone and `⌃U` had just killed the subject's yank into it — measured, the control's text was the subject's, character for character.
- **T4.37d** (I50, R-SEL-013): through a session — a press inside a scroll box, the pointer moved onto the prose below it in the same entry, release, `y`, `esc` twice, `⌃Y`: the prompt holds the box's text and not the prose's. The control drags from the prose to the prose, which copies it, so its absence above is the clamp's.
- **T4.37e** (I51, R-SEL-003, R-SEL-004): through a session, one fresh session per copy — prose, a scroll box, prose; a drag from the lede to the tail copies all three, and so does the same drag upward. The control is the card head alone, which was selectable before either repair.
- **T4.34** (I35): the mode is entered with a spinner on screen → its cell is the same glyph across every wake while the mode is up, and it moves again after the exit. Sampled past the set's own cadence, as T4.35 is, so the row is about the ticker being stopped rather than about two cadences aliasing.
- **T4.1** (with C09): summed measured heights of a visible range equal the rows actually rendered, at seven widths. **The drift test.**
- **T4.2** (with C09, C11): expanding a table row shifts subsequent entries by exactly the measured delta.
- **T4.3** (with C13): each `Change` variant produces exactly the documented invalidation, asserted by cache-size deltas.
- **T4.4** (with C13): a `merge` patch on a `--watch` leaves `topRow` unmoved and any expanded row expanded.
- **T4.5** (with C10): switching theme mid-scroll → no remeasure, no movement, only a repaint.
- **T4.6** (with C02, C09): a `unicode: "ascii"` session measures identically to UTF-8 at every width.
- **T4.7** (with C01): a `SIGWINCH` snapshot drives one resize; the anchor is captured before the cache is dropped.
- **T4.8** (with C03, L4): a scroll causes **L4** to issue one `commit("input")` — immediate, never coalesced. A spy asserts C14 never calls the scheduler itself, matching the C01 and C10 orchestration pattern. **Driven through L4's read loop rather than by dispatching to the handler**, because the commit is the loop's (C22 I27): a test that dispatched directly would assert the mechanism it happened to find, and it passed while the handler and the loop would both have committed.
- **T4.38** (I56, C22 I110, C24 I41): a real session at 60×20 with `CALCIUM_NOTIFY=bell` — `/slow` runs, a child rendering exactly its `SurfaceContext.height` rows attaches, the reader leaves, `/slow` settles and the reader returns, so two entries append under the child (the local route appends a settled document, and the return appends its notice) → the frame still shows the child's command row, both borders and every body row; after the detach the frame reaches the tail and shows the return's notice.
- **T4.39** (I57, I58, C22 I109): a real session at 80 columns — every transcript row's column 0 is blank and `● help` stands in column 1; `⌥⇧V` then `⇧↓` puts `▌` in column 0 of the selected block's first row and nowhere else, the head mark still in column 1; the viewport's width is 78 and the prompt's content width 79; a press on the column a block's element begins at, plus one, focuses it, and a press on column 0 focuses nothing. The measured heights are equal to a session that never entered the mode.
- **T4.40** (I59, I47, R-BLK-838): a real session — `a` then `⏎` → the kill buffer holds the entry, the mode is left, and the toast names the destination; `a` then `y` → the same text, the mode still up, a toast; the control is `⏎` with nothing selected, which stays up and toasts `nothing selected`.
- **T4.41** (I60, I43, I55): a real session over a block of known cells — `⌃V`, `⇧→` ×3, `⇧↓` → the footer reads `RECT 4×2` and `cells, not source`, the rows are washed over four cells and the rail leads the first; `y` → the kill buffer holds those eight cells as two lines with no escape; `⌃V` → the footer is block mode's again with the earlier block count restored.
- **T4.42** (I60, I49, §6e trace row 14): a real session over a block taller than the region — `⌃V`, a press on a cell, the pointer dragged four cells right and far below the region and held → the view scrolls, and `y` copies one text whose every line is the same four cells and which has more lines than the pointer crossed: only the ticks' extend can take the rows scrolled in after it left.
- **T4.43** (I61, C17 I31): three real sessions. `clipboard: "osc52"` declared → the terminal receives `ESC ] 52 ; c ; <base64> BEL` of exactly the copied text, the toast reads `sent to the terminal's clipboard`, and `⌃y` yanks the same text. A `PATH` holding a `pbcopy` that writes its stdin to a file → that file holds the text and the toast reads `copied to the clipboard by pbcopy`. Neither → the footer reads `no clipboard` and `⏎ to file`, `y` writes nothing and toasts `no clipboard here — the kill buffer holds it`, and `⏎` writes `/state/copy.txt` with the text and toasts `saved to /state/copy.txt`. In the OSC 52 and tool sessions the footer never offers a file.

### Tier 5 — e2e

- **T4.45** (I61, §6e classification table K7, K9, K10, K16): a real session whose `pbcopy` exits `1`, with a relative `stateDir` → `y` toasts `pbcopy failed (exited with code 1) — the kill buffer holds it`, no `copy.txt` exists, and the footer reads `⏎ to file` and `pbcopy failed`; an extend withdraws the offer and a shrink back restores it; `⏎` writes the file at `<cwd>/<stateDir>/copy.txt` and toasts that absolute path.

- **T5.1**: a 10,000-block transcript scrolled top to bottom → on-screen rows match measured heights at every screenful.
- **T5.2**: Page Down through 10,000 blocks → under 50 ms per page (A02 §7).
- **T5.3**: a live `--logs` tail at 1,000 lines/s while scrolled up reading → the view does not move.
- **T5.4**: the same, then `End` → snaps to the bottom and resumes following.
- **T5.5**: dragging the terminal edge from 160 to 60 and back while scrolled to the middle → the same content is on screen at both ends, no blank frames.
- **T4.44** (I61, review batch 4; **amended 2026-09-29**): a real session whose `pbcopy` takes the text and does not exit for three seconds, with an injected `schedule` that records each timer → `y` toasts `copying with pbcopy` and arms one timer at `COPY_DEADLINE_MS`; the session stops, and that timer has been disposed. *It read* past `COPY_DEADLINE_MS` `<stateDir>/copy.txt` does not exist — *a proxy for the disposal that became vacuous the moment the deadline stopped writing files*: with no automatic write, an undisposed deadline leaves no file either, so the row would pass with the dispose removed. F1428. T3.26's `dispose` arm is the copier's half of this row, and this row is the session's half: T3.26 cannot see whether anything calls `dispose`. Removing `this.#copier?.[Symbol.dispose]()` from the session's stop → this row fails.
- **T5.6** (I61, §6a, R-SEL-004, R-SEL-011): a PTY session with `clipboard: "osc52"` declared — three entries, `A`, `y` → the OSC 52 payload **decoded from the PTY's bytes** is the three entries' copy text, plain, in document order with a blank line between entries, and the toast reads `sent to the terminal's clipboard`. *Amended (review batch 4, M10 item 1):* it read *forty rows*; the count is the fixture's and not the claim, and the claim — what the clipboard holds — had no instrument until the payload could be read off the wire.

- **T4.11** (I24, with C13 and C09): a viewport over a transcript whose entry holds a 25-line `logs` block under `maxBlockRows: 10` → `totalRows` is `chrome + 11`, `visible()` at the foot selects the marker row, and the frame's last block row reads `… 10 of 25 rows`.

- **T4.10** (with C13, §4): an entry appended empty and streaming, then settled with a document → `totalRows` covers its rows and `visible()` includes it. **The transition rather than either end**: `settle(id, doc)` is newer than this component's invalidation table, and both halves were separately correct while nothing measured the entry after the settle.

### Tier 6 — fail-on-revert

- **T2.15** (I29): a viewport whose injected `measureSequence` records its third argument → every call names the entry whose blocks it was given, and a run with two entries records two distinct ids. **Asserted on the ids and not on the arity**, because a parameter declared and never passed satisfies the type and is what a later reader deletes.
- **T6.25** (I29): dropping the entry id from the `measureSequence` call → T2.15 fails, and C28's `byEntry` under-reports every entry by whatever the height cache missed — an undercount with no signal, which is worse than the absence it looks like.
- **T6.26** (I30): moving the invalidation from `#setTop` into the scroll methods → **T1.23** fails at the append step — the range served after the append is the one before it, with the new entry absent and the old `topRow` — because a content change reaches the clamp through `#afterContent` and never through a scroll method. Dropping the memo only when the clamp changed the row → **T1.23** fails at the fitting append: the top row is 0 before and after, and the range served is the one without the new entry. Dropping the memo write → T1.23 fails on identity at the second call. Anchor in `tools/mutate/runs/c14-visible-memo.mjs`.
- **T6.24** (I28): counting `nothing-changed` as a fourth axis — a miss where none of the three moved — → T1.22 fails, and **the counter becomes one that can never be non-zero**, because a slot agreeing on `rev` and `width` is a hit. The revert to guard against is not a wrong number but a vacuous one, which reads as a healthy zero for ever.

- **T6.1** (I4): recomputing `topRow` from an index rather than the anchor → T1.10 and T5.3 fail; the view jumps whenever a stream above it grows.
- **T6.2** (I3): adding theme to the cache key → T1.12 fails and every theme toggle remeasures the session.
- **T6.3** (I6): anchoring on an index → T3.8 fails after eviction.
- **T6.4** (I7): letting a clamped row offset spill into the next entry → T3.7 fails.
- **T6.5** (I9): replacing the Fenwick tree with a linear scan → T2.2 and T5.2 fail at scale.
- **T6.6** (I1): rendering to determine visibility → T2.6 fails.
- **T6.7** (I8): invalidating on height-only resizes → T3.12 fails and resizing becomes needlessly expensive.
- **T6.8** (C13 I12): treating every `Change` as a full invalidation → T4.3 fails and T5.3 misses its budget.
- **T6.9** (I10): an off-by-one in the visible range → T2.1 fails across the corpus.
- **T6.10** (I14, §6a): dropping the prior follow state on semantic copy mode's exit → T1.14 fails and users are stranded detached.
- **T6.11** (I11): shelling out to a clipboard binary → T2.4 fails.
- **T6.13** (§4): restoring `settle` to "invalidates nothing" → T4.10 fails, and the app route's entry has zero height for the rest of the session: appended with no blocks, measured at zero, settled with the real document, never remeasured. The screen is blank with the entry in the store, and every assertion about anchors, clamping and the cache passes.
- **T6.12** (I12): C14 calling `commit` directly → T4.8's spy fails, and L2 gains a dependency on L0-terminal.
- **T6.20** (I13): special-casing the eviction marker → T4.3's cache-delta assertions fail on the marker entry.
- **T6.14** (I3): reading `(entryId, rev, width)` as a composite map key → T2.3b fails, and a `--watch` at a thousand lines a second accumulates a slot per tick. T2.3 still passes, which is why T2.3b exists.
- **T6.15** (I9): keeping the front offset and never rebuilding → T2.8 fails on a session that evicts without resizing, and the index outgrows the transcript it indexes.
- **T6.19** (§5 step 6): removing the `followTail` branch from `resize` → T3.12c fails and the tail drifts off the bottom of the screen. `#afterContent` has the same two-branch shape ten lines away, which is what makes the omission read as a completed step.
- **T6.17** (I21): removing the unchanged-size guard → T3.12b fails, and every frame L4 composes emits a `Change` back at L4, because L4 now hands the region's height over per frame (C22 I34).
- **T6.18** (I22): handing `resize` the terminal's height instead of the region's → C04 T5.1 fails at the foot of the document, and `paint`'s transcript region refuses the over-long selection instead of silently keeping its first rows. **Neither half of that existed when the defect did**: the paint truncated and the drift test was deferred, so the last three rows of every tall entry were unreachable and nothing in six tiers could say so.
- **T6.21** (I23): removing `code`'s `window`, or dropping the `lineRange` pin so the slice re-tokenises from its first line → T1.18 fails on the row count in the first case and on the comment slot in the second; the frame is byte-identical for every block that has no multi-line token, which is why the pin's row is the comment one.
- **T6.22** (I24): removing the capped-form resolution from `measure` alone → T1.19 fails on the count while `render` still draws the marker, and I1 is broken by the registry itself; removing it from `render` alone → T1.19 fails on the frame while the count holds, which is the silent-truncation class the marker exists to end. Removing the `capped` re-attachment in `windowSequence` → T1.20's `[9, 11)` piece measures 2 and the frame's last row is a content row, with every count in T2.1 still balancing.
- **T6.23** (I26): consulting a list of kinds instead of `definition.window !== undefined` → T1.19's `panel` child row passes and the row for a test kind that declares `window` fails, because the list did not know it.
- **T6.16** (I1, C09 I80): reading a block's `padding` at the sequence — adding `t + b` between the children — instead of letting `measure` return it → every padded block is counted twice and T2.9 fails. **This row replaces the one it is numbered after**, which reverted `measureSequence` to `Σ measure(b, w)`: under C09 I17 as it now reads those are the same fold, so that revert changes no number and the row could no longer fail. The defect moved with the rule, and this is where it went — the spacing is applied once, inside the block, and a second application is what a reader adding it back at the composer would write. C04_PADDING_WALK A9a has the finding.
- **T6.27** (I56): following the tail past the held entry — `#follow` ignoring the hold → **T1.76** fails at the first append and **T4.38** loses the child's command row and top border off the top of the screen.
- **T6.28** (I57): the transcript laid out at the content width rather than `transcriptWidth` → **T4.39** fails on the viewport's width and every row's column 0.
- **T6.29** (I58): the rail drawn inside the wash, taking `inverse` at 1-bit → **T3.25** fails at both 1-bit rungs.
- **T6.30** (I34): the waiting count taken as `record.length − held.length` → **T1.78** fails on the patch rows and on both eviction rows, and T1.34's appends-only sequence still passes.
- **T6.31** (I59): `⏎` bound back to `copySelectedEntries`, copying and staying → **T4.40** fails on the mode still being up, and T1.47 on the action.
- **T6.32** (I59, I55): the `esc` label read from `size === null` again → **T3.15** fails on its rule-alone half, where `escape()` clears and the footer says `esc out`. *Corrected on landing:* it named T1.80, whose *only blocks that copy nothing* row hands the footer a `CopyState` with `clears` already decided — so it checks the chip against the field and cannot see the session computing the field from `size`. The mutation pass measured it: T1.80 green, T3.15 red.
- **T6.33** (I60): `rectBetween` ignoring a span's columns → **T1.79** fails on the forty presses and on the narrowed span, and the copy reaches into the gutter.
- **T6.34** (I37): the edge scroll removed from the keyboard move → **T3.14** fails at the press past the last row, where the view stays put and the caret is off the screen.
- **T6.35** (I60): the autoscroll tick extending the block selection in the rectangle, as it did → **T4.42** fails: the rectangle's head never leaves the press, and the copy is one cell.
- **T6.36** (I61, ruling 72): OSC 52's toast worded *copied* → **T1.81** fails. The defect is the one the ruling was written against: a copy that appears to work, on the one path whose success nothing reports.
- **T6.37** (I61, trace rows 7–9): the pending copy's deadline removed → **T3.26** fails: a `pbcopy` that never exits leaves `copying with pbcopy` up until the toast expires, and then nothing — silent, which R-SEL-011 calls the worst outcome available.
- **T6.38** (C17 I31): the kill buffer skipped when a clipboard took the text → **T4.43** fails at `⌃y`, which yanks the previous kill.
- **T6.39** (I61, the person's correction 2026-09-29): the automatic write on a failed or silent tool restored → **T3.27** fails: the file system holds `copy.txt` after a copy nobody asked to save.
- **T6.40** (I61, K5, K6): the offer drawn while a route exists — `fileOffer` answering for every copy → **T1.82** fails, and **T4.43**'s OSC 52 session reads `⏎ to file` over a copy that went to the terminal.
- **T6.41** (I61, K1): OSC 52 treated as failed — its copy recorded as the failed copy → **T1.82** fails: the OSC 52 session offers a file for the text it just sent.

---

## 11. Out of scope

| Not here | Where |
|---|---|
| Which keys scroll, and native-selection bindings | C16 |
| Measuring a block | C09 |
| Holding entries, eviction policy, `rev` | C13 |
| Overlays above the viewport | C15 |
| When a frame is written | C03 |
| Column selection in native selection | Phase 1B |
| Overscan | Measurable addition; not in v1 |
