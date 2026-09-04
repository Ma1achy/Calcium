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

`null` for a row outside the viewport's occupied rows — a short transcript leaves rows below the last entry, and a click there is not a click on the last entry.

**Pure, and no cursor of its own.** `entryAtRow` reads the index and the current scroll, and stores nothing. Copy mode's row cursor is §6's; this is a query.

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

**An entry's height is `measureSequence(entry.doc.blocks, width)`, not `Σ measure(b, w)`.** The two differ by one row per block declaring `gapBefore`, which C09 I17 applies at the sequence and never at the block — and a surface like S07 declares it on most of its blocks, so the natural summation is short on nearly every entry. Naming the function is the whole of the fix: "measured height" is otherwise ambiguous between two functions that disagree, and the symptom of picking the wrong one is §1's drift rather than anything that looks like a bug.

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

## 6. Copy mode

> **Unbuilt as of 2026-07-31, and this note exists because nothing else recorded that.** C14 landed with §6 specified and no implementation: `Viewport` carries no `enterCopy`/`exitCopy`, no clipboard injection, and **T1.13, T1.14, T1.15, T3.14 and T5.6 are absent from the suite rather than deferred**. Absent is not deferred — a deferral is tracked and expires (`tools/enforce/todo-expiry.mjs`), while an absent test is indistinguishable from a component that had nothing to say. The five now exist as deferrals against the file that will hold this section, so they fail the moment it is written.
>
> Until then, C16 takes `copyMode` as a boolean input and `exitCopyMode` as an injected call. That is a seam standing in for something **unbuilt**, which is legitimate, as distinct from a seam standing in for something unspecified — the distinction that put `entryAtRow` in §2 rather than in C16's constructor.

Mouse is on by default (D34), which takes the terminal's own text selection — the way people copy a UUID today. Copy mode is therefore not optional (A01 S30).

- Entry is by a key binding C16 owns. Copy mode is its own **focus target**, sitting above `pushedView` and below `overlay` in A02's priority order — it takes every key, including inside the dashboard, but a confirm raised over it still wins.
- Entering freezes the viewport and shows a row cursor.
- Movement keys extend a row-range selection.
- Yank writes the selected rows' **text** — glyphs and content, no escape sequences, no gutter markers — through an injected `clipboard` writer.
- Selection is by whole rows in v1. Column selection is Phase 1B.
- `Shift`-drag remains documented as the native-selection bypass on terminals that honour it.

The clipboard writer is injected because C14 must stay pure and testable; a component that shells out to `pbcopy` cannot be unit-tested.

---

## 7. State machine

| From ↓ / call → | scroll up | scroll to bottom / `End` | `enterCopy` | `exitCopy` |
|---|---|---|---|---|
| **following** | → detached (T1.6) | → following (T3.2) | → copying (T1.13) | — |
| **detached** | → detached (T1.5) | → following (T1.7) | → copying (T1.13) | — |
| **copying** | moves the cursor, not the view (T3.14) | — | no-op | → previous mode (T1.14) |

Copy mode remembers whether it was following, so leaving it resumes the tail rather than stranding the user.

---

## 8. Invariants

- **I1** — Measured heights are the sole basis for visibility; C14 never renders to decide. An entry's height is `measureSequence(doc.blocks, width)` and never `Σ measure(b, w)` — the two differ by one row per `gapBefore` (C09 I17), and the summation is the natural thing to write.
- **I2** — `topRow` is always in `[0, max(0, totalRows − viewportHeight)]`.
- **I3** — A cached height is valid iff its entry's `rev` and the current `width` both match the ones it was measured at. Theme, colour depth and unicode mode are excluded by construction. **This is a validity predicate over one slot per entry, not a composite map key**, so the cache holds at most one height per entry and a stale revision has nowhere to accumulate: after any number of patches, `cache.size ≤ entries.length`.
- **I4** — Content growing above the viewport never moves the visible rows while detached.
- **I5** — `followTail` is on iff the viewport is at the bottom.
- **I6** — The anchor is an `EntryId` plus a row offset, never an index, so eviction cannot shift it.
- **I7** — A row offset exceeding its entry's height after remeasure clamps to that entry's last row, never spilling into the next.
- **I8** — Width changes invalidate the whole cache; height changes invalidate nothing.
- **I9** — Visibility queries are O(log n) in entry count, and the index does not grow with the session. Stated as a post-condition rather than as a rule about when a method runs, for the reason C13 I15 is: **after any operation, `index.length ≤ 2 × entries.length`.** The front offset carries the common eviction and the array is rebuilt once the evicted prefix exceeds the live count, which is amortised O(1) per append.
- **I10** — Summed `takeRows` over a visible range equals `min(viewportHeight, totalRows)`, exactly.
- **I11** — C14 reads no clock and performs no I/O; the clipboard writer is injected.
- **I12** — C14 imports nothing from `terminal/`; dimensions arrive as data, and C14 never calls the frame scheduler. L4 orchestrates.
- **I13** — The eviction marker is an ordinary entry (C13 I14); C14 holds no special case for it.
- **I14** — Copy mode restores the prior follow state on exit.
- **I15** — Cache invalidation is incremental, driven by C13's granular `Change`. An append invalidates nothing already measured; a patch invalidates one entry through its `rev`. Dropping the cache on every change would make the Fenwick tree pointless.
- **I16** — There is no overscan in v1. Rows outside the viewport are not measured or rendered ahead, and adding it is a measurable change against M-T3's baseline rather than a default nobody chose.
- **I17** — A page movement is exactly `viewportHeight − 1` rows, in both directions. The overlap is the point: a full-height page turn leaves a reader with no anchor in what they just read, and the off-by-one is the difference between the two.
- **I18** — `VisibleRange` carries `live` per entry; the gutter marker is frame chrome and never enters a block or a measurement.
- **I19** — `entryAtRow` is pure and total: it reads the index and the current scroll, stores nothing, and returns `null` for any row the transcript does not occupy. It is the **only** place a region row becomes an entry — C16 routes mouse events by position and does not recompute the mapping, because two components computing where a row is will agree until one of them learns about a height change and the other does not.
- **I20** — **Chrome that occupies rows enters the height; chrome that occupies columns does not.** I18's live gutter is the second kind, and that is *why* it may stay out of every measurement — not because it is chrome. The command line each entry is drawn with is the first kind: it is not a block, so it is never adapter output and never counts toward C13's cap, but it takes a row and may wrap, so an entry's height is `chromeRows(entry, width) + measureSequence(entry.doc.blocks, width)`. `chromeRows` is injected beside `measureSequence` and defaults to none, so C14 still knows nothing about what the chrome says. **Composing the two in different places is the whole hazard**: the composer draws `chrome ++ blocks` and the index measures `blocks`, and a viewport that is arithmetically self-consistent then describes a document it is not showing.
- **I21** — `resize` to the size already held is a no-op: nothing is captured, nothing is restored, and **no `Change` is emitted**. The emit is the load-bearing half — a change reports that the view moved, and a view that did not move must not report one, whatever the caller intended by the call. C01 delivers a `SIGWINCH` whenever the size *may* have changed and holds no previous size to compare against, so this component is the first one that can tell.
- **I22** — The height handed to `resize` is the **transcript region's**, not the terminal's. C14 holds no geometry above itself and cannot derive one from the other — the difference includes the prompt, whose height varies with what is typed — so the caller composing the frame owns the value (C22 I34). The failure is silent in both directions: too tall and `#maxTop()` leaves the document's last rows unreachable by any key, while the surplus rows `visible()` selects are discarded by the paint, so no count downstream is ever surprised. I10 holds throughout, because it compares the viewport with itself.
- **I23** — **The render path draws at most the region's rows of any one block, plus a residue.** Every kind whose rows are its lines declares a `window` (C09 I25) — `logs`, `patch`, `table`, `keyValue`, and `code` and `raw` since §4a landed — and a window that must pin what the whole block derived carries the pin as view state (`presorted`, `lineRange`). Kinds that are atomic by ruling (`plot`, C12 I1; `scroll`, C04 §3c) are the stated exceptions and are bounded by their own height. A frame's paint cost is then linear in the region, not in the document, which is the property D40 was mistaken for providing.
- **I24** — **One block occupies at most `maxBlockRows` rows plus one marker row, and the marker says what was cut.** The registry resolves every block to its capped form before any definition sees it — `window(block, w, 0, cap)` with `capped: { shown, total }` attached — so `measure` counts `shown + 1`, `render` draws `shown` rows and then `… shown of total rows` in `muted`, and no kind implements the cap. `shown` is the window's own rows and not `cap`, because a window is a unit boundary and the marker must name the rows on screen. A block whose rows are within the cap is returned by reference, unchanged. Default 2 000, the app's to raise per session and never per block (§4b, C09 §2b).
- **I25** — **The window and the cap compose: a window over a capped block windows the capped rows, and the marker travels with the piece that reaches it.** `windowSequence` windows the capped form; a range below the marker yields the definition's window with `capped` stripped — byte-identical to the same range of the uncapped block — and a range whose `to` reaches the marker row carries `capped` onto the piece. The field is attached after the definition's window, never before, because a kind's window may build a fresh block and drop it. C09 I26's identity holds for every window of a capped block with the marker counted as one row.
- **I26** — **The cap applies to exactly the kinds that declare `window`, and no list of kinds is consulted.** A kind's `window` is its statement that its rows are its lines; the kinds atomic by ruling — `plot` (C12 I1), `image`, `scroll` (C04 §3c), `panel`, `group`, `mosaic` and the single-row kinds — are outside the cap by the same absence that makes them unwindowable, and a container's children are capped individually through the child seam. A kind that declares `window` is capped on the day it does.

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
12. Copy mode is mandatory because mouse is on by default; the clipboard writer is injected (I11).
13. Summed visible rows equal the viewport height exactly (I10).
14. C14 never calls C03; scrolling reports a change and L4 commits (I12).
15. The eviction marker is an ordinary entry and needs no special handling (I13).
16. `VisibleRange` marks the live entry; the frame draws the live gutter, and no measurement includes it (I18).
17. An entry's height is `measureSequence`, so `gapBefore` is counted — never `Σ measure`, which is short by one row per gap (I1, C09 I17).
18. A region row resolves to an entry and a row within it here, once, and C16 does not recompute the mapping (I19).
19. Row-occupying chrome is measured and column-occupying chrome is not; the command line is the first and the live gutter is the second (I20, I18).
20. A resize to the size already held does nothing and emits nothing (I21).
21. The height `resize` is given is the transcript region's, and the caller that composed the frame owns it (I22).
22. One block's rows on the render path are bounded by the region plus a residue, through the window seam and not through a cap on content (I23, §4a).
23. One block occupies at most `maxBlockRows` rows plus a marker row that names what was cut; the cap is the registry's, generic over `BlockDefinition`, and no kind implements it (I24, §4b).
24. A window over a capped block windows the capped rows, and the marker travels with the piece that reaches it (I25, §4b).
25. The cap applies to exactly the kinds that declare `window`; atomic kinds are outside it by the same absence, and a container's children are capped through the child seam (I26, §4b).

---

## 10. Tests

Six tiers. Every cell of the §7 transition table is covered.

### Tier 1 — unit

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
- **T1.13**: `enterCopy` from following and from detached → both enter copying.
- **T1.14** (I14): `exitCopy` restores the prior follow state, both ways.
- **T1.15**: copy mode entered from inside a pushed view → keys route to copy mode, not the view.
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
- **T2.9** (I1): an entry's height equals `measureSequence(doc.blocks, width)`, and for a document whose blocks declare *k* gaps it exceeds `Σ measure(b, w)` by exactly *k*. The two must be distinguishable by the test, or the wrong one passes.
- **T2.4** (I11): a source scan finds no clock, no `fs`, no clipboard shell-out in `viewport/`.
- **T2.5** (I12): the module graph shows no import from `terminal/`.
- **T2.6** (I1): a spy on the block registry proves `render` is never called during a visibility query.
- **T2.7**: every `Change` variant from C13 has a documented cache effect — exhaustive over the union.
- **T2.11** (I19): over the same fuzz corpus as T2.1, `entryAtRow` agrees with `visible()` for every occupied row — the entry it names is the one whose `skipRows`/`takeRows` span covers that row, and the `rowOffset` it returns lands inside that entry's height. Asserted against `visible()` rather than against a hand-rolled walk, or the test reimplements the thing it checks and the two agree by construction.
- **T2.12** (I19): `entryAtRow` performs no mutation — a thousand calls leave `scroll`, `anchor` and `stats` identical.
- **T2.13** (I25, C09 I26): over every `[from, to)` of a capped `logs` and a capped `table`, `measure(piece) − skipRows − dropRows === to − from` with the marker counted, and the rows kept equal the capped rendering's rows at those offsets — the identity and the frame, because containment is not correctness.
- **T2.14** (I24): `createBlockRegistry({ maxBlockRows })` refuses `0`, a negative, a fraction and `NaN` at construction, and `createTui` refuses the same values as a `ConfigError` naming `maxBlockRows` before anything is built.

### Tier 3 — edge cases

- **T3.1**: empty transcript → empty range, `topRow` 0, no throw.
- **T3.1b** (I19): `entryAtRow` on an empty transcript, on a negative row, and on a row below the last entry in a short transcript → `null` in all three, never the last entry. A click on blank space beneath the transcript is not a click on the thing above it.
- **T3.1c** (I19): a row inside an entry that begins above the viewport's top edge → the entry is named and `rowOffset` accounts for the `skipRows` already scrolled past, rather than counting from the viewport's first row.
- **T3.2**: scroll to bottom while already following → no-op.
- **T3.3**: `viewportHeight` of 0 → empty range, no division by zero.
- **T3.4**: `viewportHeight` of 1 → exactly one row visible.
- **T3.5**: a single entry taller than the entire viewport → scrolls within itself correctly at every offset.
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
- **T3.14**: movement in copy mode moves the cursor and scrolls only when the cursor reaches an edge.
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
- **T5.6**: copy mode selecting forty rows across three entries and yanking → the clipboard holds exactly those rows as plain text.

- **T4.11** (I24, with C13 and C09): a viewport over a transcript whose entry holds a 25-line `logs` block under `maxBlockRows: 10` → `totalRows` is `chrome + 11`, `visible()` at the foot selects the marker row, and the frame's last block row reads `… 10 of 25 rows`.

- **T4.10** (with C13, §4): an entry appended empty and streaming, then settled with a document → `totalRows` covers its rows and `visible()` includes it. **The transition rather than either end**: `settle(id, doc)` is newer than this component's invalidation table, and both halves were separately correct while nothing measured the entry after the settle.

### Tier 6 — fail-on-revert

- **T6.1** (I4): recomputing `topRow` from an index rather than the anchor → T1.10 and T5.3 fail; the view jumps whenever a stream above it grows.
- **T6.2** (I3): adding theme to the cache key → T1.12 fails and every theme toggle remeasures the session.
- **T6.3** (I6): anchoring on an index → T3.8 fails after eviction.
- **T6.4** (I7): letting a clamped row offset spill into the next entry → T3.7 fails.
- **T6.5** (I9): replacing the Fenwick tree with a linear scan → T2.2 and T5.2 fail at scale.
- **T6.6** (I1): rendering to determine visibility → T2.6 fails.
- **T6.7** (I8): invalidating on height-only resizes → T3.12 fails and resizing becomes needlessly expensive.
- **T6.8** (C13 I12): treating every `Change` as a full invalidation → T4.3 fails and T5.3 misses its budget.
- **T6.9** (I10): an off-by-one in the visible range → T2.1 fails across the corpus.
- **T6.10** (I14): dropping the prior follow state on copy-mode exit → T1.14 fails and users are stranded detached.
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
- **T6.16** (I1): summing `measure(b, w)` instead of calling `measureSequence` → T2.9 fails, and every entry with a `gapBefore` is short by one row per gap. The most likely single defect in this component, because the summation is what a reader writes.

---

## 11. Out of scope

| Not here | Where |
|---|---|
| Which keys scroll, and copy-mode bindings | C16 |
| Measuring a block | C09 |
| Holding entries, eviction policy, `rev` | C13 |
| Overlays above the viewport | C15 |
| When a frame is written | C03 |
| Column selection in copy mode | Phase 1B |
| Overscan | Measurable addition; not in v1 |
