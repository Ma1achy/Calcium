# C29 §13 — the walk

Phase 5 of the layout-engine plan. **Both artefacts**: a classification table over the cells where
the memo's rules meet another rule at rest, and a sequence trace over the events that change what a
cached answer is an answer *to*.

**Indexed by rule interaction, not by input coverage**, and the premises are measured rather than
read (F1231).

---

## §0 · The premises, measured (F1231)

| the design says | the tree says |
|---|---|
| *the spec so far solves the whole tree every frame* | **False.** The engine's four callers are entered through `measure`, and every child ask inside the `Box` they build goes through C22's session memo first. The engine is reached on a miss |
| *the cache is keyed on (box identity, available width) and nothing else* | **Built, one layer above the engine.** `construct.ts:830` opens a `WeakMap<Block, {width, rows}>` (C22 I100); `#measureChild` reads it on every child ask. `src/presentation/layout/` holds no Map, no WeakMap and no memo in 864 lines |
| *the 850 measure misses a frame is the window range in the key* | **Refuted before the pass began**, and measured again here: `measure absent 421 · height absent 1/rev 1` over 97 frames. No height cache has a range in its key |
| *a child whose natural size did not change cannot dirty its parent*, with a five-step marking pass | **The rule holds; the machine has nowhere to live.** Blocks are frozen and replaced on change, so the mark **is** the key. Stricter on one side — a rebuilt block with identical content misses — and free on the other, because no marking pass runs |
| *a width change dirties everything, and that is correct* | **True and already what happens**, because a slot whose width no longer matches is a miss. Measured at zero width misses in a static run, so the cost is paid on resize and never otherwise |
| one cache | **Three, with different subjects**: the registry memo (block, width) → rows; `HeightCache` (entryId, rev, width) → an entry's rows; `RenderCache` → lines. §13 describes the first and is silent about the other two |

---

## Artefact A — the classification table

| # | the cell | rule A | rule B | ruling |
|---|---|---|---|---|
| A1 | the memo's single slot × the **two** child seams | §13: one cache, keyed on identity and width | C09: `measureChild` answers a height at a width; `widthChild` answers a width, uncached (`registry.ts:1057`) | **No thrash between them, because they do not share the slot.** Only heights are memoised and only heights are keyed by width; a group's `width()` recurses through `layout()` with `measureChild` **undefined**, so it asks no heights at all. §13's *one cache* is right about the subject it names and silent about the other seam, which is uncached by design and measured at 0.7% of a frame's work (`group.place`) |
| A2 | identity as the dirty mark × a block rebuilt with identical content | §13: *if it equals the cached one, STOP* | C22 I100: the key is the block **object** | **Identity is the stricter rule and the difference is a cost, not a defect.** A block rebuilt with byte-identical content is a new key and re-measures, where §13's rule would compare sizes and stop. What it buys is that **no marking pass exists at all** — no traversal, no dirty bit, no propagation loop — and the registry's own comment already states the trade: *a rebuilt block is a new key and a settled entry's blocks are collected with it; nothing evicts and nothing subscribes* |
| A3 | the memo's stored figure × C14 I24's cap and C04 I67's floor | §13: cache the **natural size** | C09 I33/I61: `#measured` stores the **floored, capped** figure | **The stored number must be the committed one, and §13's spelling would make it two.** A cache of the natural size has the cap applied after each read, so the memo and the render path answer one question twice and agree only while both are right — MG24's shape. `#measured`'s own comment is the ruling already taken: the memo holds the floored figure *so it is the same number by construction and not by agreement* |
| A4 | the memo × a measurer that throws | §13: cache the result | C09 I11: a throwing measurer is contained and the block is one row | **Only an `ok` answer is kept**, and the reason is not caution: the render-time ask is the one carrying the fitted request (I34), so a memoised fault would leave every report at `rows: 0`. Already built, already commented, and §13 does not reach it because a section about hit rates does not ask what a miss is allowed to store |
| A5 | the memo's lifetime × eviction | §13: nothing — it does not say what the cache's life is | C22 I100: a `WeakMap` over frozen blocks, opened before the viewport | **Eviction is the key's, and that is what identity buys.** A settled entry's blocks are collected with it, so nothing evicts and nothing subscribes. §13 writes *(box identity, available width)* and never says that choosing the object as the key is what removes the eviction problem — the strongest argument for its own prescription is the one it leaves out |
| A6 | the memo × the engine's `layout()` **product** | §13 step 5: *re-position only the subtrees whose box actually moved* | the memo holds a height, never the solved rects | **The one part of §13 with a subject, and it is small.** A render re-solves the `Box` tree even where the height was a hit, because nothing caches a `SolvedBox`. Measured in the panel case: `panel` 15.9% and `group` 10.5% of self time, of which the solve is a part — real, and not the *whole tree every frame* §13 opens with. Left unbuilt: a second store keyed the same way would hold rects that only a composition consumes, and the composition is what C22 I100's memo was measured against |

---

## Artefact B — the sequence trace

| # | the sequence | what happens | ruling |
|---|---|---|---|
| S1 | the terminal resizes | every slot's width stops matching, so every ask misses and the tree re-measures | §13's *a width change dirties everything* — already the behaviour, and delivered by the key rather than by a pass. **The single slot is what makes it total**: a map over widths would keep the old answer and a resize sweep would alternate cheaply. Measured: 80 → 60 → 80 leaves the slot at each width in turn, so the third ask is a miss |
| S2 | the far side patches one block of an entry | that block is a new object and misses; its siblings are the same objects and hit; the parent holds a new children array, so it misses too and re-solves over hits | **§13's headline rule, delivered by structural sharing.** The parent re-solves rather than being skipped, which §13 would avoid — and what it costs is one map lookup per child, not a subtree walk |
| S3 | the window scrolls | `HeightCache` answers at `(entryId, rev, width)` above the registry memo | **Two caches, one subject, and the range is in neither key.** Measured over 97 frames: `height absent 1/rev 1`. §13's diagnosis named the defect it would prevent and the defect is not in the tree |
| S4 | the theme changes | every block is the same object, so every memoised height is still returned | **Correct, and for a reason written a component away**: appearance animates and geometry never does, so a theme cannot move a row count. The cell where a cache could be wrong and is not, and nothing in §13 or C29 says why — it holds on CLAUDE.md's rule |
| S5 | an entry is evicted | its blocks lose their last reference and the `WeakMap` entries go with them | No eviction pass, no subscription, no staleness. A5 as an event |

---

## What the walk rules

1. **The engine holds no cache and should not**, because the memo above it already answers on the
   key §13 names and answers with the number the render path commits (A3).
2. **The dirty machine's effect is delivered by immutability**, stricter on one side and free on the
   other, so the five steps have nothing to run on (A2, S2).
3. **The single slot is a resize cost and a stable-width saving**, measured rather than read (S1).
4. **Step 5 is the only part with a subject**, and it is the solved rects rather than the heights —
   left unbuilt, with the measurement that says how small it is (A6).
