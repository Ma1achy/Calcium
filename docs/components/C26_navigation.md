# C26 — Navigation

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` |
| **Layer** | L3 interaction |
| **Depends on** | C09 (`BlockDefinition.elements`, `measure`) · C13 (the entry a scope names) · C14 (the visible range, and `#restoreFromAnchor`'s shape) · C11 (`focusableRowIds`, which this generalises) |
| **Consumed by** | C16 router · L4 |
| **Source** | `CALCIUM_ROADMAP.md` Order 7 · A02 §2 focus priority · principia-ii `SMART_NAV_IMPLEMENTATION.md` |
| **Status** | Draft — **design only.** No `src/interaction/navigation/`, no bindings, no keymap rows. |

---

## 1. Purpose

**Navigating the transcript as a structure does not exist.** Row movement inside the live
block works; block to block, column to column, cell to cell does not, and neither does
anything a pointer lands on.

The reason is not that nobody wrote the bindings. It is that there is nowhere for them to
live: `FocusTarget` is a flat priority list of six, so every key a block might want competes
with the prompt in one namespace. `pushedView` has nine bindings and they are a flat list —
`up` and `down` are bound to `viewPageUp` and `viewPageDown`, which is what a namespace looks
like when it has run out of room rather than when it has been designed.

C26 replaces the flat target with **a scope stack plus a mode**, and makes what a block
offers a **declaration** rather than a set of keys.

**It subsumes rather than sits beside.** Block-to-block movement, column and cell movement,
the focusable-block concept, clickable rows and links, `copyMode`'s missing producer,
semantic copy and the question/menu primitive all fall out of this. Every one of them built
first is built twice — §11 lists them.

### What this is designed against, measured rather than remembered

`CALCIUM_ROADMAP.md`'s navigation table was wrong in two of five rows when this was written,
and one of them was the headline argument for the component. Counted from `defaultKeymap`
on 2026-08-13:

| target | bindings | shape |
|---|---|---|
| `prompt` | 28 | full readline |
| `pushedView` | 9 | a flat list with no scope, no mode, no edge semantics |
| `overlay` | 6 | — |
| `liveBlock` | 4 | `escape` · `up` · `down` · `enter` → `rowActivate` |
| `global` | 4 | — |
| `copyMode` | **0** | a focus target with no keys |

**The premise survives on different evidence.** *Zero bindings* was false; *nowhere for a
richer set to live* is not.

---

## 2. The split — navigation and interaction

**Navigation mode** moves focus between things. **Interaction mode** sends keys *to* the
thing focused.

This solves key collision **structurally** rather than key by key: a block in interaction
owns its keys and the prompt does not compete for them. It is the same trade as the `⌃Home`
ruling, made once instead of per binding.

`⏎` enters interaction on the focused element. `Esc` leaves it. **Two-level escape** — the
first exits interaction, the second leaves the scope — is what makes drilling in
non-frustrating: the reader is never one keypress from losing their position.

### The mode is a focus target, and that is a constraint rather than a convenience

**C16 §5's Ctrl-C ladder has no order of its own.** Its rungs 3–7 are handlers registered on
focus targets, so their order *is* `FOCUS_ORDER`'s, and the two cannot disagree. C16's own
spec pass found the defect that arises when the ladder exists as a second artefact — copy
mode above both overlay rungs, against A02 §2 — and `FOCUS_ORDER` is the single artefact that
prevents it.

So **interaction mode must be expressible as a focus target**, not as a flag consulted inside
dispatch. A mode that sat beside `FOCUS_ORDER` and had to be checked first would be a second
priority list, and the ladder would acquire an order of its own again. This is the strongest
constraint on the shape of §3's state, and it came out of the walk (§8a, trace 5).

---

## 3. Scopes

A scope stack, and it is **shallow by construction** — a terminal transcript is not an
arbitrary tree:

```
entry → block → row → cell
```

Four levels, not an unbounded descent, so the drill gesture has a small learnable set.

**A level exists only where §5's declaration reports elements at it.** A kind that reports
none is atomic at that level, and the stack cannot descend into it. That is what makes
"scopes are shallow" a property of the data rather than a promise in prose.

### Focus memory is closer to required than optional

principia-ii lists it as a future enhancement. In a terminal it is not: there is no click to
jump back with, so re-entering a table at row 1 every time is punishing.

**And restoring is a re-resolution, not a restoration.** The element the reader was on may
not exist when they return — C13 evicts, `putBlock` replaces a block whole, and §5's element
list is a function of width. The operation is **resolve by id, fall forward to the nearest
survivor**, which is C14 I6's shape for the scroll anchor and is reused rather than invented.

---

## 4. Policies

Declarative per-kind metadata, taken from principia-ii, answering *what does `↓` do at the
edge of this thing* with no conditional in any handler:

```
ArrowPolicy   navigate · escape-vertical · escape-horizontal · escape-all · custom
EscapePolicy  auto (two-level) · bubble · modal · custom
```

Resolved **global → kind → per-node override**, which is the shape C10's theme resolution and
C05's manifest merge already have — familiar machinery rather than a new one.

### The vocabulary is checked against four kinds before it is adopted

**Two instances fitting a rule is not evidence for the rule — it is the minimum for noticing
one.** `table` and `logs` will both fit, and they are the two anyone would reach for. The
third is `patch` in a pushed view, whose nine bindings today have no edge semantics at all
and whose scope levels are hunks rather than rows. If the vocabulary does not fit it, the
axis is wrong rather than the vocabulary incomplete — which is what C13's patch gate cost
when the third case was not sought.

**The fourth is a scrollable container, and it is the one most likely to break the
vocabulary.** `CALCIUM_ROADMAP.md` entry 46 is where the container lives; the check belongs
here, because it is a step in adopting `ArrowPolicy` rather than a feature of its own.

**Every kind above resolves `↓` at an *edge*. A scroller has an edge *and* an interior that
is not an element.** `↓` inside one is ambiguous in a way no policy value addresses: *move to
the next element* and *scroll the container* are both correct readings, and the vocabulary
has no room to say which — so either scrolling requires interact mode, which makes a table
you cannot scroll without entering, or navigate scrolls and interact has to mean something
else.

**Run it before adopting `ArrowPolicy`, not after.** A vocabulary needing a value it has no
room for is exactly the finding the multi-kind rule exists to surface, and finding it after
adoption means every kind that already declared a policy is re-declared.

**Record the outcome either way**, and this is why the check is not a formality: *fits four
kinds* is a much stronger claim than *fits two*, and *does not fit a scroller* is worth
knowing before C26 ships the vocabulary rather than after an app has written against it.
A check whose negative result is not written down is a check nobody can tell was run.

**Recorded as owed rather than assumed**, and it is the first thing the implementation does.
The fields are not in the tree yet — MG24 caught `NavElement.arrow` and `.escape` shipping
with no reader and they were withdrawn (§8b) — so the check has no cost to run late and
every cost to skip.

---

## 4a. The check, run — and none of the four kinds fits

**Run against the tree at HEAD rather than against the design.** Every row below is a binding
or a declaration that exists, cited by symbol; nothing here is a prediction about a kind that
might be written.

**The artefact is a classification table, and that is a choice.** Every interaction here holds
at rest — *what does `↓` do at this kind's edge* against *what this kind declares* — with no
event between them, which is C18 §8a's shape rather than a trace's. A sequence trace over
entering, stepping and leaving would find none of the four rows below, because none of them
needs anything to have happened.

| # | kind | what `↓` does at the edge, in the tree | does an `ArrowPolicy` value say it |
|---|---|---|---|
| 1 | **`table`** — the only kind declaring `elements` (`presentation/table/definition.ts`, `tableElements`) | `↑` at the **first** element leaves to the prompt (`rowUp`, `shell/keys.ts`); `↓` at the **last** does nothing (`rowDown`, same file, `if (next !== undefined)`) | **no.** `escape-vertical` names an *axis* and the tree escapes in one *direction* — back the way focus came in, since entry is `↓` from the prompt past history's bottom (`historyNext`). There is no value for *escape up, stop down* |
| 2 | **`logs`** | declares `window` and no `elements` (`presentation/blocks/kinds/structured.ts`), so `↓` never steps an element in it at all | **the question does not arise** — and §4 above predicted *`table` and `logs` will both fit*. They are not two instances of one shape: by what each declares they are in different cells, which is the prediction falsified by the two fields rather than by a reading |
| 3 | **`patch` in a pushed view** | `↓` is `viewPageDown` and `n`/`p` step hunks (`interaction/router/keymap.ts`, the `pushedView` target) | **no, and there is no edge.** The policy answers *what happens when stepping runs out*; here `↓` was never stepping |
| 4 | **a scrollable container** (roadmap 46) | unbuilt — but `pushedView` **is** a scroller and it already answers: `↓` scrolls, in navigate mode, with no interact mode involved | **no**, for row 3's reason |

### The outcome, recorded either way as §4 requires

**Zero of four fit, and the two failure modes are different** — which is a stronger result than
four near-misses, and it is the outcome the multi-kind rule exists to produce. Rows 3 and 4
fail because `↓` is not an element step, so the vocabulary's question never arises. Row 1 fails
for an unrelated reason: the question arises and the answer is asymmetric, and every value in
the list is symmetric.

**So the axis is wrong rather than the vocabulary incomplete**, which is the finding §4 named
in advance and is C13's patch-gate class arriving where it was watched for. It is worth being
exact about what *wrong axis* means here: `ArrowPolicy` sorts kinds by **what happens at an
edge**, and the tree sorts them by **whether there is stepping to run out of**.

**And the discrimination it was to provide is already carried by two fields that exist and
have readers.** This is the part that could not have been designed from the outside: the
keymap answers `↓` per *target* (`liveBlock` steps, `pushedView` pages) and cannot tell two
kinds apart at one target — which is the gap `ArrowPolicy` was for. But the fact it needs is
already declared:

| declares | `↓` | kinds today |
|---|---|---|
| `elements` only | steps elements | `table` |
| `window` only | moves a viewport | `logs`, `patch` |
| **both** | **ambiguous — this is the scroller, and it is one cell rather than a vocabulary** | none |
| neither | passes through; the block is atomic | `keyValue`, `code`, `plot` |

**Nothing is adopted here and no field is added.** The check's job was to say whether the
vocabulary survives contact with four kinds, and it does not; what replaces it is §4's
remaining design work and wants its own ruling. Recorded now because *a check whose negative
result is not written down is a check nobody can tell was run*, and because the cell that is
genuinely open — a kind declaring both — is now a single question instead of a vocabulary to
re-declare across every kind.

**One premise of §4 survives intact and is worth separating from the rest**: resolution
global → kind → per-node is familiar machinery, and nothing above bears on it. What the check
refuses is the *vocabulary being resolved*, not the resolution.

---

## 5. Element resolution — one declaration, keyboard and pointer

```typescript
elements?: (block: B, width: number, measureChild: MeasureFn) => readonly NavElement[];
```

on `BlockDefinition`, beside `window?`.

```typescript
type NavElement = Readonly<{
  id: string;
  level: "block" | "row" | "cell";
  rows: Readonly<{ from: number; to: number }>;    // [from, to), block-local
  cols: Readonly<{ from: number; to: number }>;    // [from, to)
  arrow?: ArrowPolicy;
  escape?: EscapePolicy;
  activate?: Action;
}>;
```

**Optional, and a kind that is atomic omits it — and the argument is C09's own**, at
`presentation/blocks/types.ts:94–104` on `window?`: *an absent member cannot be deleted by a
later edit while a branch returning the block unchanged can.* The same sentence covers a
branch returning `[]`. Cited rather than restated, so the two seams read as one decision
rather than as two that happen to agree.

**Pure in `(block, width)`, and never in focus.** That is what makes it legal under C11 I14 —
focus is rendered and never owned — and it is a stronger guarantee than a rule, because focus
is not a parameter and the purity is therefore unrepresentable as a violation. It is also
what makes it cacheable on the key `shell/render-cache.ts` already uses.

**The keyboard walks the list; the pointer searches it. One source, so they cannot disagree**
— which is the roadmap's constraint on the mouse work, satisfied structurally rather than by
two mechanisms agreeing.

`focusableRowIds` (`presentation/table/definition.ts:230`) is this, at one level for one kind.
**C26 generalises it and does not sit beside it.** A second parallel mechanism is the defect
to avoid, and it is named here so the implementation cannot reach for one quietly.

### What generic invariant does this earn, and it is weaker than `window`'s

`window?` earned an equality: `measure(w.block, width) − w.skipRows === to − from`. One
number against one number, total over every kind that declares it, and it is what made an
app's wrong implementation catchable by a sweep rather than by review. **The question is what
the equivalent is here, and it has to be asked before the seam ships** — an invariant with no
subject is A03 §2's vacuity class, and C11 I17 is the measured instance of it.

**There is no single equality. There are four predicates, and each catches a class:**

1. **Containment.** Every element's `rows` lies within `[0, measure(block, width))` and its
   `cols` within `[0, width)`. Catches an implementation whose positions are derived from
   something other than the block it was handed — F134's drift class in the navigation axis.
2. **Reading order.** The list is non-decreasing by `(rows.from, cols.from)`. Needed because
   the keyboard *walks* it: "next" has to mean "next on screen" or `↓` is arbitrary.
3. **Disjointness per level.** Two elements at the same `level` share no cell. This is what
   makes pointer resolution single-valued. **Per level and not globally**, because a cell
   nests inside its row by design — a global disjointness would forbid the structure
   (§8a, table row d).
4. **Stability.** `elements(b, w)` twice is deeply equal. Catches an implementation reading a
   clock or a counter, which the signature does not forbid.

**And the strongest property is the one that will be vacuous at landing, which is said here
rather than discovered.** A kind declaring **both** `window` and `elements` owes their
agreement:

```
elements(window(b, w, from, to).block, w)
  ≡  { e shifted by (from − skipRows) : e ∈ elements(b, w), e.rows ⊆ [from, to) }
```

That is F134's gutter defect one field along — a derivation computed over the whole block
while the window shows a slice — and it is the check that would catch it generically. Today
`window` has exactly two implementers (`logs`, `patch`) and `elements` will have `table`
first, so **the intersection is empty and the invariant has no subject on the day it lands.**

**The premise is recorded so it can be re-checked** (F102's disposal, and F134's own hazard
note): *this is vacuous while no kind declares both.* The day one does — `patch` is the
likely first, since a hunk is a natural scope — it becomes a live requirement, and this
paragraph is where to look.

### Resolution is a pull, not a subscription

C16 reads C13, C14 and C15 **at the moment it needs them** and registers no callback on any
change stream — *"every one is a pull, and that is the audit"* (`router.ts`). The reason
generalises: C13 emits `append` then `evict` for one `append()`, so a consumer reading deltas
as current state sees a half-applied store, which cost C14 a blank screen that every assertion
passed.

**So the element list is recomputed on dispatch, not maintained under a subscription.** C26
inherits the property rather than being the component that breaks it.

---


## 5c. The transcript's selection, and semantic copy

**One mechanism, two shapes, one clipboard.** C17 §5b holds a character range in the prompt; this holds a set of element addresses in the transcript; both land in the kill buffer (C17 §5a). What does *not* unify is the region — a character range and a set of addresses have nothing in common but their destination, which is why there is no abstract `Selection` type anywhere.

### The anchor is the only new state, one level up

`StoredFocus.anchor` beside `element`, and **`element` is the head** — there is not a second position to keep in step with where focus is. `anchor === element` is no selection. `extendRow` places the anchor on the **first** extension and never touches it again; `focusRow` collapses. That is C17 I21 restated at the level above, and the defect it forbids is the same one: an extension that moves the anchor is right on the first keystroke and wrong on the second, and every assertion about *a row being selected* passes either way.

**`⇧↑` stops at the first element rather than leaving the block.** Unshifted `↑` exits to the prompt — the reader stepping out (I13) — and extending is a gesture *inside* the block; one that walked out would take the selection with it and leave nothing to copy.

### `y` lives in `navigate` only, and the two targets are why

C16 §5a row A4: a block's declared keys are an open set (I14), so a framework binding inside interaction silently shadows one. `interaction` and `liveBlock` being separate targets makes that **structural** rather than a rule someone has to remember — the binding is declared at `liveBlock` and there is nowhere for it to leak.

### `NavElement.copy` is the element's source, never its rendering

**This is the whole of semantic copy and it is the one thing a raw terminal cannot offer.** The painted cells are a rendering: columns are dropped at narrow widths, values are truncated with an ellipsis, and a marker column carries a glyph nobody typed. A copy taken from them is *what is on screen* — which passes every assertion about what is on screen and is wrong about exactly what this exists for.

So the **declarer** supplies it from the data it was given. `tableElements` joins every declared column's `cell.text`, in declared order, at no width — so the copy is the same text at 60 columns and at 200. `planColumns` is deliberately not consulted: a copy that changed with the terminal's size would be the defect rather than a feature.

Tab-separated, because that is what pastes into a spreadsheet and into every shell tool that takes columns; newline-joined across a range, because the elements are rows. An element declaring no `copy` contributes nothing rather than a blank line — it is a place to stand, not empty data.

**And MG24 cannot see this field**, which is measured rather than assumed: removing its only consumer leaves `make enforce` green, because `LineEditor.copy()` carries the same name. F160's blind spot on a published field of the block vocabulary, and the third instance of it. Recorded here so a later reader does not take the gate's silence as coverage.

---

## 6. Pointer

**The plumbing is built.** SGR decoding (`decode.ts:393`), a `mouse` capability that is off
under tmux, and a routing table that hit-tests layers by `Placed` and falls through to the
viewport (`router.ts:254`). Wheel scrolling works. What is missing is **cell → element
resolution**, which is §5's declaration and nothing else.

The constitution it ships with is the constraint: *"every mouse affordance has a keyboard
equivalent, so nothing is lost — only convenience"* (`capabilities.ts:67`). Clicking is *jump
directly to this scope*; the keyboard is *walk there*. Same target set, two routes.

**Deepest level wins**, which is what makes click-to-focus and click-to-activate one rule
rather than a per-block decision: a click resolves to the innermost element containing the
cell, and an element carrying `activate` is invoked while one without it takes focus.

**One translation, used by both rungs** — C16 I20 already records what it costs to
have two: a layer's box and C14's entry map are both region-relative, and comparing a
terminal row to one of them directly resolved clicks to the row above.

---

## 7. Focus is rendered, never owned

**C11 I14 and C11 I17 are the hard edge of this component.** Focus changes tone and nothing else:
no marker, no extra row, no width. A height that varied with focus would move without `rev`
moving, so C14's cache could not invalidate it — and `measure` never receives focus at all
(C09 I8), so it is invisible to measurement. C11 T1.18's three-way equality and T6.16 are the
rows that hold it.

**C11 I17 is the pattern to copy and not only the rule to obey.** The action bar's *presence*
follows the data and its *content* follows focus. Every C26 affordance resolves the same way:
the space a focus ring would occupy is reserved by the data or it does not exist.

Background and reverse video are free. Anything that changes size is not.

**The chrome says the mode, the block says the focus** — `NAV` / `EDIT`, the way vim shows
`-- INSERT --`. **This spec does not decide the chrome row.** Chrome is one row each by
design and four features already want it (`CALCIUM_ROADMAP.md` Order 29). C26 states a
requirement — *the mode must be visible somewhere that is not the block* — and defers the
placement. **The operation does not exist yet, and saying so is the point**: a ruling that
names a mechanism the layer below does not have is C23 §8a A4's class, and it is cheaper to
notice here.

---

## 8. Invariants

- **I1** — The scope stack is at most four deep, and a level exists only where §5's
  declaration reports an element at it.
- **I2** — Interaction mode is a focus target, so C16 §5's ladder derives from `FOCUS_ORDER`
  and holds no order of its own (§2).
- **I3** — `elements` is pure in `(block, width)`. Focus is not a parameter, so a
  focus-dependent geometry is unrepresentable rather than forbidden.
- **I4** — Every element's rows lie within `[0, measure(block, width))` and its columns within
  `[0, width)`.
- **I5** — The element list is in reading order, non-decreasing by `(rows.from, cols.from)`.
- **I6** — Two elements at the same `level` share no cell. Nesting across levels is the
  structure and is not a violation.
- **I7** — A kind declaring both `window` and `elements` owes their agreement (§5). **Vacuous
  while the intersection is empty**, and the premise is recorded so it can be re-checked.
- **I8** — The keyboard and the pointer resolve against the same declaration. There is no
  second source.
- **I9** — Focus is rendered by the block and owned here (C11 I14). C26 holds a location; it
  draws nothing and commits no frame.
- **I10** — Focus is stored as an **address**, `(blockId, elementId)`, and restoring it is a
  re-resolution by that address with a fall-forward to the nearest survivor **forward in
  reading order**, never an index (C14 I6's shape). **One resolver answers for both the render
  side and the key side**, so what is highlighted and where the next arrow goes cannot
  disagree; it writes nothing, and the store is repaired by the next focus-moving keystroke
  (§8b.7).
- **I11** — Element resolution is a pull, recomputed on dispatch. C26 subscribes to no change
  stream.
- **I12** — A refused or throwing `elements` makes the block atomic for that dispatch and
  focus falls to the block level. It is not a throw the caller sees.
- **I13** — Leaving a scope and a command running are **different transitions**, and only
  one may keep a focus memory. **`FocusStore` already has both functions** — `toPrompt()` is
  the reader stepping out and `reset()` is C16 I2's append — and the call sites use the wrong
  one (§8b.2). The invariant is that each exit calls the transition that names it.
- **I14** — Two-level escape: the first `Esc` exits interaction, the second leaves the
  scope. Neither is C16 §5's Ctrl-C rung and neither is `viewPop` (→ C16 I24) — the
  collision between the second and `viewPop` is trace 6 and is owed a ruling.
  **Vacuous while nothing can enter interaction** (§8b.8), and the premise is recorded rather
  than left to be found: `⌃c` is the only binding on the target today, so the first level has
  no subject and the second is `liveBlock`'s existing exit. The day a block declares keys,
  both levels are first tested for real.
- **I15** — Policies resolve global → kind → per-node override, and **an override naming a
- **I16** — **The transcript's selection is an anchor plus the focused element**, and the focused element is the head. `anchor === element` is no selection; an extending motion moves the head and never the anchor; an unshifted motion collapses. C17 I21 at the level above, and the same two halves fail the same two ways.
- **I17** — **An element's `copy` is its source, never its rendering.** The declarer supplies it from the data, at no width, so a dropped column and a truncation are absent from it and the text is the same at every terminal size. A copy assembled from painted cells satisfies every assertion about the painted frame, which is why this is an invariant rather than a preference.
  level the kind reports no element at is a construction error**, the way a duplicate
  binding is (→ C16 I10). An override for an absent level is unreachable and reads as
  configured, which is A03 §2's vacuity class arriving in a config value.

---

## 8a. The walk

**Both artefact shapes, because this component has state *and* structure.** C19 is the
measured case for taking only the trace: its `--flag=value` defect was structural, no number
of event rows could reach it, and the table that would have caught it was already in the repo.

Eleven rows below; **six carried a finding**, and each is a cell where two correct statements
overlap.

### Classification table — structural, at rest

| # | the two rules that meet | ruling |
|---|---|---|
| **a** | *`Esc` returns to the prompt* (C16 I24, `liveBlock`) meets *focus memory remembers the row* | **FINDING.** `FocusStore.toPrompt()` and `reset()` both assign `AT_PROMPT`, which has no `rowId` — so returning to the prompt destroys the location today. Focus memory needs them to diverge: `reset()` is *a command ran* (C16 I2) and `toPrompt()` is *the reader stepped out*. One state transition, two meanings, nothing distinguishing them. → **I13** |
| **b** | *an override wins over the kind* meets *a level exists only where elements report one* | **FINDING.** An override naming a `cell` policy on a kind reporting no cell elements is unreachable and reads as configured — A03 §2's vacuity class arriving in a config value. Ruling: an override for an absent level is a **construction error**, the way C16 I10 makes a duplicate binding one. |
| **c** | *deepest level wins* meets *disjointness makes resolution single-valued* | **FINDING.** Global disjointness forbids the nesting the model is built on. Disjointness is **per level** → **I6**, and it is the reason §5 lists four predicates rather than three. |
| **d** | *`escape-all` leaves the scope* meets *there is no scope above `entry`* | Falls to the prompt by row **a**'s transition, and therefore inherits its ruling rather than adding one. |
| **f** | *`⏎` enters interaction on the focused element* (§2) meets *`⏎` activates the focused row* (C16 I22, F21) | **FINDING, and it needs two absences distinguished.** *The block declares no keys* and *the element declares no `activate`* are different facts about different things, and only one of them is a reason to refuse the mode. Ruling in §8b.8: activate if the element declares one; **do not enter interaction**, because the second absence is currently structural. |
| **g** | *entering interaction hands the block every key* (§2) meets *`interaction` has one binding, and no block declares any* | **FINDING.** A mode with nothing in it is reachable, takes every key from the prompt, and is left only by `⌃c` — A03 §2's vacuity class as a *reachable state* rather than as an unfalsifiable rule. Measured, not assumed: `Keymap.mergeBlock` has no caller in `src/` and `register("interaction", …)` binds `⌃c` alone. → §8b.8 |
| **e** | *the arrow policy governs the edge* meets *`↓` at the prompt is `historyNext` **and** enters the live block* (C16 I22) | Not a collision: C16 I22's second effect is entry and this governs exit. But the pair means there are two ways back to the prompt (`Esc` and the bottom edge) and **they must agree about row a's transition.** Named so the implementation does not give them separate paths. |

### Sequence trace — event-mediated

| # | what happens in between | ruling |
|---|---|---|
| **1** | an entry is **evicted** while focus is inside it | **FINDING.** C13's cap sweep exempts live and streaming entries, so focus inside the live block cannot be evicted today. **C26 makes eviction reachable under focus for the first time**, because block-to-block movement leaves the live entry. → **I10** |
| **2** | `resetFocus()` (C16 I2, L4 calls it on submit) arrives **while in interaction mode** | Row **a**. The mode must be left, not only the location reset. |
| **3** | a **resize** while in interaction | `elements` is width-dependent, so the focused element may not exist at the new width. Same remedy as 1, and the operation exists: C14 `#restoreFromAnchor`. |
| **4** | a **refresh** replaces the block under a focused element | `putBlock` is total and never throws (`document-view.ts:107`), so the element vanishes with no signal. Same remedy — and it is why **I11** is a pull: there is nothing to subscribe to that would say *your element went*. |
| **5** | **`⌃c` in interaction mode** | **FINDING, and it constrains the type.** If the mode were a flag consulted before dispatch, the ladder would gain a rung with an order of its own — exactly the artefact C16's `FOCUS_ORDER` comment exists to prevent. The mode must be a focus target. → **I2**, §2 |
| **6** | **`Esc` inside a pushed view in interaction mode** | **FINDING.** `escape` on `pushedView` is `viewPop` (C16 I24), and two-level escape wants the first `Esc` to exit interaction. C16 I24 argued that `viewPop` is *not* the Ctrl-C rung under another name; the same argument now has to be made about `Esc`, and it does not obviously survive — the view's dismissal and the mode's exit are both *"undo the last thing I entered"*. Ruling owed at implementation, with the two-level rule taking the inner one. |

### The two checks that neither artefact indexes

**Does the ruling name an operation that exists?** (C23 §8a A4.)

- *Focus memory restores the row* — needs the row to survive. It does not; the operation is
  re-resolve and fall forward, and it exists as C14 `#restoreFromAnchor`. **Survives, remedy
  changed.**
- *The chrome shows the mode* — needs a chrome row. Order 29 owns one row and four features
  want it. **The operation does not exist**, so §7 states a requirement and defers.
- *An element is re-resolved after a patch* — needs a change signal. C16 subscribes to none by
  ruling. **Recompute on dispatch** → I11.

**What does a refusal leave behind?** A throwing `elements` would abandon a focus location
pointing at something unresolvable, two components from the throw. So it is not a throw:
the block is atomic for that dispatch and focus falls to the block level → **I12**.

---

## 8b. What the implementation falsified

**The walk rules the shape; code is the first thing that can disprove it.** Every entry below
was found by reading the call sites before writing a line, and most make a §8a ruling
*sharper* rather than wrong — which is the disposition worth having a heading for, because a
walk that is only ever confirmed is a walk nobody checked.

**This heading said "Both entries below" over six of them**, and it is F142's lesson arriving
in the smallest possible form: *a count in prose is a snapshot with no mechanism.* It was
written when there were two and was never a claim anyone re-read. Corrected to a quantifier,
which cannot go stale.

### 1. `⏎` is already bound on `liveBlock`, so §2 cannot have it

§2 says *`⏎` enters interaction on the focused element*. `defaultKeymap` already binds
`{ target: "liveBlock", key: { name: "enter" }, action: "rowActivate" }` — F21's close, and
the route from a keystroke to `actions.ts` that did not exist for four components.

**Two bindings on one `(target, key)` is a construction error** (→ C16 I10), so this is not a
choice between them. **The ruling: one binding, two effects, in order** — `rowActivate` enters
interaction when the focused element declares one and dispatches the row's action otherwise.

**The precedent is in the same component and was reached the same way.** C16 I22 is `↓`:
*one binding with two effects, in order*, because the prompt's `↓` is `historyNext` and §3's
sentence also said it enters the live block. Two claims on one keystroke, and the resolution
was ordering rather than a second key. Nothing in §8a's table reached this, because the table
indexes *policy* interactions and this is a collision with a binding that already exists —
**a rule interaction with the keymap, which is a table neither artefact was indexed over.**

### 2. I13 is smaller as a remedy and larger as a defect

§8a row a said `toPrompt()` and `reset()` both assign `AT_PROMPT`, so one transition carries
two meanings and focus memory needs them to diverge. **They already diverge. The call sites
are wired to the wrong one.**

| exit | calls | should call |
|---|---|---|
| `⌃c` from the live block — `router.ts:227` | `toPrompt()` | `toPrompt()` ✓ |
| `Esc` — `focusPrompt`, `keys.ts:530` | **`reset()`** | `toPrompt()` |
| `↑` past the first row — `keys.ts:570` | **`reset()`** | `toPrompt()` |

`toPrompt()` has **exactly one caller in the tree**, and it is the emphatic exit. The two
ordinary ones call C16 I2's *a command ran*.

**Invisible today because both produce `AT_PROMPT`**, and backwards the moment focus memory
exists: `Esc` and `↑` would wipe the memory while `⌃c` kept it. So the remedy is two call
sites rather than a new transition, and the defect is that the distinction the API already
draws has never been honoured.

**This is the shape §8a's own preamble warns about one level up.** A ruling can be correct
about the interaction and wrong about the mechanism it assumed — C23 §8a A4's class. Here it
assumed a mechanism was *missing* that is present and unused, which is the same error with
the sign flipped, and it is cheaper to find at the call site than at the cache.

### 3. `elements` cannot compute its own positions — the signature is wrong

§5 declares `elements?(block, width)`. **A table's row offsets are not a function of those
two.** `measure` is `(block, width, measureChild)` and a row's offset is
`header + Σ(1 + detailHeight(row))`, where `detailHeight` calls `sequenceHeight(...,
measureChild)` for every expanded row (`table/definition.ts:88`). Without it the positions
would have to be guessed, and a guessed position is a pointer landing on the wrong row —
the drift class, arriving through the seam built to prevent it.

**The signature is `Measure<B>`'s, and that is the argument rather than a convenience.**
A02 Seam 1 injects measurement precisely so a container composes children whose kind it does
not know; `elements` has the same problem and takes the same seam. The registry supplies it,
as it already does for `measure` — which also means an implementation cannot reach for its
own measurer.

```typescript
elements?: (block: B, width: number, measureChild: MeasureFn) => readonly NavElement[];
```

### 4. There are three parallel walks, and the code predicted it

§5 says a second mechanism beside `focusableRowIds` is the defect to avoid. **There are
already three, each with `block.kind === "table"` written into it:**

| walk | file | answers |
|---|---|---|
| `liveRows` | `shell/construct.ts:838` | the ordered row ids |
| `liveRowAction` | `shell/construct.ts:856` | the focused row's action |
| `focusFor` | `shell/session.ts:715` | which block owns the focused row |

`liveRowAction`'s own comment names the hazard — *"a second walk elsewhere would be a second
answer to what is here, and the two would disagree the first time a block kind became
navigable"* — and it is written **beside** the walk it was warning about, while the third sat
in another component. Two instances read as a pair; the third is in a different file, which is
why the comment did not find it.

### 5. All three walk the top level only, so a nested table is unreachable

Each iterates `entry.doc.blocks` and stops. `panel` and `group` hold `children: readonly
Block[]` (`viewmodel/types.ts:553,560`), so **a table inside a panel cannot be focused, moved
through, or activated** — by keyboard or, once it exists, by pointer.

C04 exports `descendants` and C13's cap uses it *by name*, with a comment saying a second copy
would miss things. None of the three focus walks call it. Registry-side `elements` resolution
inherits the recursion for free, because the registry already walks children for `measure` and
`render`.

### 6. Row ids collide across blocks, and focus resolves to the wrong one

Row ids are unique within a block at best — C11 T3.15 records that even *that* is unchecked
and is C04's to add. `liveRows` **concatenates** ids across every table in the entry, `rowUp`
and `rowDown` use `rows.indexOf(...)`, and `focusFor` returns the **first** block containing
the id.

So two tables in one document each carrying a row `r1` give: `↓` onto the second table's `r1`,
highlight drawn on the *first* table's, and the next `↓` continuing from the first table's
position. Every step is individually correct.

**`elements` closes it by construction rather than by adding a uniqueness rule**: an element
is addressed by its own id within a declaration that knows which block produced it, so there
is no flat namespace for two rows to collide in.

**Half of that landed in stage 2 and half did not, which entry 7 below is about.**
`elementsIn` pairs every element with its block, so the *declaration* side has no flat
namespace. `StoredFocus.rowId` stayed a bare string, so the *stored* side still had one, and
the defect above survived a change whose whole subject it was.

---

### 7. The address type already exists one layer down, and `focusFor` manufactures the other half

Reading every reader of `rowId` before choosing the type — the same pass that falsified §5's
signature in entry 3 — moves two decisions and confirms three.

**`FocusState` is already the address.** `presentation/blocks/types.ts:17` is
`{blockId, rowId: string | null}`, because C09 needs a pair to tell one block it holds focus
(C11 I14). The store held half of it and `session.ts` re-derived the other half by taking the
**first** element whose id matched.

So entry 6's diagnosis was true and named the wrong subject. It is not that row ids collide —
C04 I31 makes them unique *within* a table and says nothing across blocks, so a collision
between two tables is well-formed and always was. **It is that one type is the address and
the other is half of it, and the join between them is a first-match search.** The remedy is
not a uniqueness rule anywhere; it is that the stored form stops being narrower than the form
it is rendered as.

**I10 is ruled and unimplemented, and its four readers improvise four different answers.**
Against an id the block no longer has:

| reader | today |
|---|---|
| `keys.ts` `rowUp` | `indexOf` → −1, `i <= 0` → leaves to the prompt |
| `keys.ts` `rowDown` | `indexOf` → −1, `rows[0]` → jumps to the first row |
| `session.ts` `focusFor` | no match → `null` → no highlight drawn |
| `keys.ts` `rowActivate` | `null` → silent |

None is I10's fall-forward. So *what does a stale address do* is not a question the new type
raises — it is a ruling that exists, that nothing implements, and that four call sites answer
four ways. **A spread of dispositions with no shared source is what an unimplemented invariant
looks like from the code**, and it is invisible to a reader checking any one of them.

**The address is well-founded on invariants that already exist.** C04 **I14** makes block ids
unique within the document, *nested children included* (`src/data/viewmodel/validate.ts:439`);
**I6** above makes element ids unique within a block's declaration. `(blockId, elementId)` is
therefore unique with no new rule, and entry 6's *closes it by construction* becomes checkable
rather than asserted.

**`liveRowAction`'s reason for being a second function is already false in the code.** Its
comment argues two functions rather than one returning pairs *because `liveRows` is asked on
every arrow keystroke and this only on `enter`* — while its body calls `liveElements()`, the
same full registry walk. The cheap/expensive split does not exist and has not since stage 2
rewired it. Both signatures have to change for the address anyway, so they collapse to one
pull. **A justification that was true when written and was falsified by a later change reads
exactly like one that still holds** — the sibling of §7's mutation lesson, one artefact over.

**Eviction and resize are not the reachable staleness; patch is.** §8a listed three, and
against the tree:

- **Eviction** (trace 1) — C13's sweep exempts live and streaming entries, and both `focusFor`
  and `activeTarget` gate on the live entry. Unreachable until block-to-block movement exists,
  which §11 defers.
- **Resize** (trace 3) — element ids are row ids and are width-independent; only positions
  move. The trace's premise is true *generically* and **vacuous for `table`**, which yields an
  element per row at every width. It cannot be tested with a real kind, so a fabricated one is
  owed — a check whose only subject is the kind that cannot violate it passes exactly like one
  that is satisfied (A03 §2).
- **Patch** (trace 4) — `putBlock` is total and never throws, so the element vanishes with no
  signal. **The only case reachable today**, and the one the disposition is written for.

#### The ruling I10 was owed

Resolution is **exact match on `(blockId, elementId)` first; on no match, the nearest survivor
forward in the list**. The list is in reading order by I5, so *nearest* is the list's own order
and not a second notion of distance that could disagree with it.

**One resolver, shared by the render side and the key side**, and the reason is that the
obvious placement is wrong. `focusFor` is a render query and must write nothing, so a
fall-forward computed there would leave the store holding a dead address and the next `↓`
computing from it — the original defect one layer over. A fall-forward that *did* write would
put a mutation in a per-frame read. So neither side owns it: both call the same pure function,
display and the next keystroke agree by construction, and the store is repaired by the next
focus-moving keystroke. Same argument as `elements` itself — one source, or they disagree.

It takes its element list **structurally rather than by import**, on the argument `focus.ts`
already makes for `FocusInputs`: taking C15's and C13's shapes by structure *keeps purity a
property of the signature*. One decision applied twice, not a second one that agrees.

---

### 8. `⏎`'s second effect names a mechanism with no producer, so it does not ship

Entry 1 ruled that `⏎` cannot simply *be* the interaction key, because `rowActivate` already
holds `(liveBlock, enter)` and two bindings on one pair is a construction error (→ C16 I10).
The remedy was one binding with two effects in order, on C16 I22's precedent. **Deciding the
order required asking what "the block declares no keys" means, and there are two absences
behind that phrase.**

| | the absence | what it is a fact about | observable today? |
|---|---|---|---|
| **A** | the block declares no **keymap** | the block — whether the mode has anything in it | **no.** Nothing reports it |
| **B** | the element declares no **`activate`** | the element — whether `⏎` has an action | **yes.** `NavElement.activate` is optional |

**They do not resolve the same way, and collapsing them is how the trap would have shipped.**
B is a per-element silence and is already right: pressing `⏎` on a row that does nothing is a
question, not a mistake, and a refusal per keystroke on a table where most rows have none is
noise the reader cannot act on. **A is structural**, and it is currently true of every block:

- `Keymap.mergeBlock` — the seam an adapter attaches a `BlockKeymap` through — **has no caller
  in `src/`.** `src/index.ts` §3 records it as one of three members ruled interior and dropped,
  *"not public, not finished"*.
- `register("interaction", …)` binds **`⌃c` and nothing else**. `Esc` is not on the target;
  I14's two-level escape is unimplemented.

So entering interaction today produces a mode with **zero bindings**, which takes every key
away from the prompt and is left only by `⌃c`. That is row **g**: A03 §2's vacuity class
arriving as a *reachable state* rather than as a rule nothing can violate.

#### The ruling, and why it is narrower than §2 said

**`⏎` dispatches the focused element's `activate`, and does nothing otherwise. It does not
enter interaction, and the second effect returns with the mechanism that makes the mode
inhabitable** — in the commit that gives `mergeBlock` a producer.

**Not a deferral of convenience: the arm cannot be written.** *Enter interaction when the
block declares keys* names a question nothing in the tree can answer — no element, no
definition and no registry reports whether a block has a keymap, because the only thing that
would attach one has no producer. **When a ruling names an operation, check the operation
exists** (C23 §8a A4), and this is that check run on the ruling the walk had already made.
Shipping the arm would mean inventing a mechanism to report an absence that is currently
total, in order to guard a mode nothing can act in.

The finding survives and only the remedy changes, which is A4's disposition exactly. What
would have shipped without the check is worse than a missing feature: `⏎` on any row without
an action would have entered a keyless mode and the prompt would have stopped responding.

**Stage 3's code already implements the ruling** — `rowActivate` resolves the address and
dispatches the element's own `activate` — so this entry changes a commitment and no code, which
is the shape a spec commit should have.

---

## 9. Commitments

1. The scope stack is `entry → block → row → cell`, at most four deep (I1).
2. Navigation and interaction are modes, and interaction is a focus target (I2).
3. `⏎` dispatches the focused element's `activate` and is silent otherwise; `Esc` leaves interaction, then leaves the scope (I14). **`⏎`'s second effect — entering interaction — is not committed**, because the mode has no bindings and the seam that would supply them has no producer (§8b.8). It arrives with that producer, as one binding with two effects in order (→ C16 I22).
4. `ArrowPolicy` and `EscapePolicy` resolve global → kind → per-node override, and an override for a level the kind does not report is a construction error (I15).
5. `BlockDefinition.elements` is optional, pure in `(block, width)`, and is the single source for both keyboard and pointer (I3, I8).
6. Element lists satisfy containment, reading order, per-level disjointness and stability (I4, I5, I6) — checked generically by a conformance sweep, as `window`'s equality is.
7. A kind declaring both `window` and `elements` satisfies their agreement (I7), and the invariant's emptiness is recorded rather than left to be found.
8. Focus changes tone and nothing else (I9, → C11 I14).
9. Focus is stored as a `(blockId, elementId)` address, and restoration is a re-resolution of it with a fall-forward, through one resolver shared by render and keys (I10).
10. Element resolution is a pull (I11).
11. `focusableRowIds` is replaced by `elements` rather than joined by it — one source, or the keyboard and the pointer disagree (I8).

**The four-kind validation of §4 is not here, and SP1 is why.** *If it is none of those, it
is a § detail rather than a commitment* — it is a step the implementation takes, and no
invariant can hold a promise about the order in which something was checked. It stays in §4
where it is owed, rather than being given an invariant it would make vacuous.

---

## 10. Tests

Named against the invariants; the tiers are the six.

- **T1.x** (I4, I5, I6) — the four predicates, per kind, as a **generic conformance sweep**
  over every kind declaring `elements`. The shape is C09's window conformance: it walks every
  fixture rather than asserting one, because a single-element row passes against a wrong
  implementation. **Two fabrications confirm it is live**, as F134's did.
- **T1.42, T1.43** (I17, §5c) — an element's `copy` carries **every declared column**, including the ones the width dropped, is the same text at 60 columns and at 200, and is untruncated. The control is `planColumns(...).dropped` being non-empty at that width: without it the row passes for a table that drops nothing. The expand column contributes its **cell**, not the marker a renderer puts there.
- **T1.44, T1.45, T1.46** (I16, §5c) — `⇧↓` twice leaves the anchor where it was and `y` copies the range newline-joined; an unshifted motion collapses, so `y` afterwards copies one row; and `⇧↑` at the first element stays in the block, where unshifted `↑` leaves. **Two extensions in the first, because one passes whichever end moved** — C17 T1.23's argument one level up.
- **T2.x** (I2) — the ladder still derives from `FOCUS_ORDER` with the mode present:
  exhaustive over the target union, not over a hand-written list.
- **T2.x** (I8) — a click and the equivalent walk reach the **same element object**, asserted
  by identity rather than equality. The keymap's `/help` traversal is the precedent: identity
  is what makes "one source" checkable.
- **T3.x** (I10, I12) — evict, resize and `putBlock` under a live focus; and a kind whose
  `elements` throws. **Two of the three need a fabricated kind or are unreachable** (§8b.7):
  eviction exempts the live entry, and `table` yields an element per row at every width, so
  the resize arm has no subject until a definition that drops one exists.
- **T3.x** (I10) — two blocks sharing an element id, focus on the second: the highlight draws
  on the **second** and the next arrow continues from it. `tableOf` collides by construction,
  so the fixture is the state the defect needed rather than one invented to suit.
- **T3.x** (I10) — an address whose `blockId` matches and `elementId` does not, and the
  converse. **These are the rows a bare-id implementation still passes**, which is what makes
  them the ones worth writing.
- **T6.x** (I10) — resolution matching on `elementId` alone → the collision row fails; the
  fall-forward taking the first element rather than the nearest forward → the `putBlock` row
  fails.
- **T3.x** (I13) — `reset()` and `toPrompt()` produce different locations.
- **T2.x** (§8b.8, I14) — **the vacuity of interaction mode, asserted rather than described.**
  `Keymap.mergeBlock` has no caller in `src/` and `interaction` carries one binding, so the
  mode has nothing in it and `⏎`'s second effect is not committed. The row asserts both facts,
  and it **fails the day either changes** — which is when the second effect and I14's first
  level go live and this row is inverted. A premise recorded and unchecked is a premise that
  goes quiet (F102's disposal, and T2.17's shape for the `window` × `elements` agreement).
- **T6.x** (I6) — making disjointness global → the nesting fixtures fail.
- **T6.x** (I11) — turning the pull into a subscription → the half-applied-store row fails.
- **T6.x** (I2) — moving the mode out of `FOCUS_ORDER` into a pre-dispatch flag → the ladder
  ordering row fails.

**The mutation pass is scheduled, not optional.** Every module mutated on landing; a mutation
that fails nothing indicts the tests or the prose, and §5's vacuity note is the sentence most
likely to be the second kind.

---

## 11. Subsumed — within this model, not built here

Each is a `CALCIUM_ROADMAP.md` entry that lands inside C26 rather than beside it, and each is
listed so the Order list can point here instead of carrying a duplicate:

- **10** question / menu primitive — `ctx.ask` exists with `choices`
  (`shell/local/registry.ts:59`); the in-transcript menu block is an interactive element.
- **15** text selection, copy and semantic copy — `copyMode` is a focus target with **zero**
  bindings and no producer (`enterCopyMode` is defined nowhere in `src/`). Semantic copy is
  *copy the focused element*, which needs §5 and nothing else.
- **16** one popup — the confirm and the completion menu are two mechanisms today; whichever
  survives is an interaction-mode consumer.
- block-to-block movement · column and cell movement · the focusable-block concept · clickable
  rows and links — §3 and §5.
- `pushedView`'s nine flat bindings — §2 and trace 6.

## 12. Out of scope

- **The chrome row.** Order 29, and §7 says why.
- **Rebindable keys** (Order 42). A precedence ladder over bindings is orthogonal to what a
  binding may address.
- **The scroll anchor.** Already built — C14 I4/I5/I6.
