# C14 — Viewport

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
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
| `↑` / `↓` | One row |
| `PageUp` / `PageDown` | `viewportHeight − 1` rows, so one line of context carries over |
| `Home` | `topRow = 0` |
| `End` | Bottom, and `followTail` back on |
| Wheel | Three rows, when mouse is enabled |

C14 exposes these as operations; the keys that invoke them are C16's.

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

## 5. Resize

Width changes invalidate every cached height, because wrapping changes. Height changes do not.

```
on resize:
  1  capture the anchor before anything else
  2  if width changed: drop the cache, rebuild the index
  3  recompute viewportHeight from the same snapshot (C01 SIGWINCH, D31)
  4  restore topRow from the anchor
  5  clamp to [0, max(0, totalRows − viewportHeight)]
  6  if followTail: snap to the bottom instead
```

Step 1 before step 2 matters: the anchor is an entry id and a row offset within it, and after remeasuring at a new width that row offset may exceed the entry's new height. It clamps to the entry's last row rather than spilling into the next entry, so the anchor degrades gracefully rather than drifting.

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
- **T3.13**: a patch that shrinks an entry below the current `topRow`'s dependence → `topRow` clamps rather than exceeding `totalRows`.
- **T3.14**: movement in copy mode moves the cursor and scrolls only when the cursor reaches an edge.
- **T3.15**: yank with an empty selection → clipboard untouched, no throw.
- **T3.16**: yank of rows containing tone spans and gutter markers → clipboard receives plain text only.
- **T3.17**: 100,000 entries, scroll from top to bottom by page → every query within budget, no leak.
- **T3.18**: a streaming entry patched a thousand times → the cache holds one live key for it, not a thousand.

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
- **T6.13** (I13): special-casing the eviction marker → T4.3's cache-delta assertions fail on the marker entry.
- **T6.14** (I3): reading `(entryId, rev, width)` as a composite map key → T2.3b fails, and a `--watch` at a thousand lines a second accumulates a slot per tick. T2.3 still passes, which is why T2.3b exists.
- **T6.15** (I9): keeping the front offset and never rebuilding → T2.8 fails on a session that evicts without resizing, and the index outgrows the transcript it indexes.
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
