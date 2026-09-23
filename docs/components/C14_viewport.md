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

`live` is carried per entry so the frame can draw the **live gutter** (`▌`, D6) beside the live block's rows without re-consulting C13 per row. **C14 marks; S01 draws.** The live gutter is frame chrome, not block content — putting it in a block would make it part of every measurement and every theme.

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
from the other side. The system clipboard and OSC 52 are the rule's two mechanisms
and neither is built; what **is** owed here is the rule's last sentence — *if
neither is available the mode states it and offers a file instead*, because *a copy
that appears to work and does not is the worst outcome available here.* So the
refusal is the part that ships with the copy, not after it: the kill buffer always
succeeds, so the statement is about the **system** clipboard and it is made once,
when a copy is taken and cannot leave the process.

### The label is parked on a word the design does not supply

`R-SEL-009` names *the mode label in the footer* and `R-SEL-007` has a rectangular
selection *say so in the mode label*, so this mode's label is specified. The other
one's is not, and the two now collide: `ChromeContext.owner` is the **rung**, both
modes map to `copy`, and the repo's header draws `COPY` from it. The design gives
`COPY` to this mode — `selection.semantic` is *enter Calcium copy mode* — which
leaves the handoff needing a label the registry has no word for.

So the count lands on the seam (`FrameQueries.semanticSelectionCount`) and **the
label does not land here**. Drawing a second `COPY` beside the first would put two
modes behind one word on the one surface whose job is saying which mode you are in,
which is worse than the label arriving a commit later.

### Leaving

`R-SEL-005`, and it is two presses rather than one: `esc` clears the selection if
there is one, and a second `esc` leaves the mode. **A selection is state within a
rung, not a rung of its own**, so this does not violate esc popping exactly one rung
— and the footer says which press is next, which is the part that keeps the two
presses from reading as a dropped keystroke.

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
- **I18** — `VisibleRange` carries `live` per entry; the gutter marker is frame chrome and never enters a block or a measurement.
- **I19** — `entryAtRow` is pure and total: it reads the index and the current scroll, stores nothing, and returns `null` for any row the transcript does not occupy. It is the **only** place a region row becomes an entry — C16 routes mouse events by position and does not recompute the mapping, because two components computing where a row is will agree until one of them learns about a height change and the other does not. **The region row reaches it through one translation** — `paint.ts`'s `blankRowsAbove`, the bottom alignment the composer draws with — which L4 reads from the exported function rather than restating, so the painted row and the clicked row cannot drift apart separately (F755).
- **I20** — **Chrome that occupies rows enters the height; chrome that occupies columns does not.** I18's live gutter is the second kind, and that is *why* it may stay out of every measurement — not because it is chrome. The command line each entry is drawn with is the first kind: it is not a block, so it is never adapter output and never counts toward C13's cap, but it takes a row and may wrap, so an entry's height is `chromeRows(entry, width) + measureSequence(entry.doc.blocks, width)`. `chromeRows` is injected beside `measureSequence` and defaults to none, so C14 still knows nothing about what the chrome says. **Composing the two in different places is the whole hazard**: the composer draws `chrome ++ blocks` and the index measures `blocks`, and a viewport that is arithmetically self-consistent then describes a document it is not showing.
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
16. `VisibleRange` marks the live entry; the frame draws the live gutter, and no measurement includes it (I18).
17. An entry's height is `measureSequence`, and a block's own spacing is inside each `measure` rather than added between them (I1, → C09 I17, → C09 I80).
18. A region row resolves to an entry and a row within it here, once, and C16 does not recompute the mapping (I19).
19. Row-occupying chrome is measured and column-occupying chrome is not; the command line is the first and the live gutter is the second (I20, I18).
20. A resize to the size already held does nothing and emits nothing (I21).
21. The height and the width `resize` is given are the transcript region's, and the caller that composed the frame owns both (I22).
22. One block's rows on the render path are bounded by the region plus a residue, through the window seam and not through a cap on content (I23, §4a).
23. One block occupies at most `maxBlockRows` rows plus a marker row that names what was cut; the cap is the registry's, generic over `BlockDefinition`, and no kind implements it (I24, §4b).
24. A window over a capped block windows the capped rows, and the marker travels with the piece that reaches it (I25, §4b).
25. The cap applies to exactly the kinds that declare `window`; atomic kinds are outside it by the same absence, and a container's children are capped through the child seam (I26, §4b).
25a. **A seam carries the identity of the thing it is asked about** (I29). `chromeRows` takes the entry and `measureSequence` takes its id; C14 reads neither, and a measurer that wants to attribute what it measured cannot recover the identity from the blocks.
26. **A cache that publishes its size publishes its hit rate and its miss reasons** (I27, I28). The comparisons already happen; which one rejected is free, and the value comparison that says a miss was pointless costs one more. A size cannot say whether the cache is working.
27. **A pure function of the component's own state is answered once per state** (I30, F1198). `visible()` is memoised at the one point every movement passes through, so a caller asking it per part per sweep pays the walk once per movement; the memo publishes its rate beside the height cache's.

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
- **T3.14** (§6a): movement in semantic copy mode moves the caret and scrolls only when the caret reaches an edge.
- **T3.15**: yank with an empty selection → clipboard untouched, no throw.
- **T3.16**: yank of rows containing tone spans and gutter markers → clipboard receives plain text only.
- **T3.17**: 100,000 entries, scroll from top to bottom by page → every query within budget, no leak.
- **T3.18**: a streaming entry patched a thousand times → the cache holds one live key for it, not a thousand.
- **T3.19** (I23): a window opening in the middle of a wrapped source line → the whole line is kept and the surplus is charged to `skipRows`; a window of one row over a block whose every line wraps to three → one unit, `skipRows + dropRows === 2`.

- **T3.20** (I24, C09 I26): a `table` whose row at the boundary is expanded to a three-row detail → the unit is kept whole, `shown` is `cap + 2` rows past the header, and the marker names `shown`, not `cap`. Asserted on the marker's text against the rows above it.
- **T3.21** (I24, C09 I33): a capped block carrying `minHeight` above `shown + 1` measures the floor and below it measures `shown + 1`; in both cases `windowSequence` keeps it whole and the marker is drawn.
- **T3.22** (I24, C13 I14): a transcript at the session block cap whose surviving entry holds a capped block → two markers on screen, D40's notice above and the row cap's beneath the block, and evicting further changes neither.
- **T3.23** (I24, C25 I18): a `patch` over the cap → the piece is a valid `Patch` carrying its path header and `collapsedBefore` markers inside `shown`, and the registry's `capped` survives `windowRows` building a fresh block.
- **T3.24** (I24, C09 I11): a kind whose `measure` throws on a block over the cap → contained exactly as before, one row, the fault reported once for `measure`; the cap adds no second report.

### Tier 4 — integration

- **T4.1** (with C09): summed measured heights of a visible range equal the rows actually rendered, at seven widths. **The drift test.**
- **T4.2** (with C09, C11): expanding a table row shifts subsequent entries by exactly the measured delta.
- **T4.3** (with C13): each `Change` variant produces exactly the documented invalidation, asserted by cache-size deltas.
- **T4.4** (with C13): a `merge` patch on a `--watch` leaves `topRow` unmoved and any expanded row expanded.
- **T4.5** (with C10): switching theme mid-scroll → no remeasure, no movement, only a repaint.
- **T4.6** (with C02, C09): a `unicode: "ascii"` session measures identically to UTF-8 at every width.
- **T4.7** (with C01): a `SIGWINCH` snapshot drives one resize; the anchor is captured before the cache is dropped.
- **T4.8** (with C03, L4): a scroll causes **L4** to issue one `commit("input")` — immediate, never coalesced. A spy asserts C14 never calls the scheduler itself, matching the C01 and C10 orchestration pattern. **Driven through L4's read loop rather than by dispatching to the handler**, because the commit is the loop's (C22 I27): a test that dispatched directly would assert the mechanism it happened to find, and it passed while the handler and the loop would both have committed.

### Tier 5 — e2e

- **T5.1**: a 10,000-block transcript scrolled top to bottom → on-screen rows match measured heights at every screenful.
- **T5.2**: Page Down through 10,000 blocks → under 50 ms per page (A02 §7).
- **T5.3**: a live `--logs` tail at 1,000 lines/s while scrolled up reading → the view does not move.
- **T5.4**: the same, then `End` → snaps to the bottom and resumes following.
- **T5.5**: dragging the terminal edge from 160 to 60 and back while scrolled to the middle → the same content is on screen at both ends, no blank frames.
- **T5.6** (§6a, R-SEL-004): semantic copy mode selecting forty rows across three entries and yanking → the clipboard holds exactly those rows as plain text, in document order with a blank line between entries.

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
