# One popup, four consumers — drawn

The confirm, the completion menu, the paste peek and `agent-tui`'s question are **the same
thing**: a layer anchored to the prompt, showing content, answered with keys, dismissed with
`esc`. Built separately they will drift — different flip logic, different truncation,
different key handling — which is the two-records-of-one-fact class in UI form.

**Ruling A already pushed the confirm most of the way there**: it is a *choice list, not a
yes/no box*, general enough for A3. A prompt-anchored choice list **is** the completion menu
with different content and a different resolution.

```
              content            selection       resolves by            router may pop?
completion    candidates         arrow / type    inserting into buffer   yes
confirm       2–4 choices        arrow / letter  a promise               NO — would hang
question      choices or text    arrow / typing  a promise               NO — would hang
peek          content only       none            esc, or ⏎ to open       yes
```

**The differences are parameters, not mechanisms.**

---

## 1 — Confirm, anchored to the prompt

```
    ┌ Confirm ─────────────────────────────────────────┐
    │ ▲ Change dtui-cfg's resource limits while it      │
    │   runs?                                           │
    │                                                   │
    │   container  dtui-cfg                             │
    │   image      nginx:alpine                         │
    │   state      running                              │
    │                                                   │
    │ ▸ [n] no                                          │
    │   [y] yes                                         │
    └───────────────────────────────────────────────────┘
❯ /update dtui-cfg --memory 512m
```

**Same content as the centred version. Anchored, and above the prompt.**

Your attention is already at the prompt — the confirm arrives *because you just typed
something*. A centred box makes you look away and come back.

**Weight comes from the content, not the position.** Centred said *stop* by being centred;
anchored it is the `▲` glyph, the `Confirm` title, `no` first and selected, and the fact that
**the prompt is unavailable while a question is open** — typing does nothing, which is itself
a strong signal.

**`dismissable: false` stays false.** That ruling was about the *router* not popping a layer
whose owner is awaiting an answer — a silent pop hangs the verb forever. **Only the anchor
changes, not the flag.**

## 2 — A destructive confirm, where the payload is large

`/prune` lists what it will delete, and the list does not fit above a prompt.

```
    ┌ Confirm ─────────────────────────────────────────┐
    │ ▲ Remove 6 stopped containers and 2 networks?     │
    │   This cannot be undone.                          │
    │                                                   │
    │   dtui-quiet        alpine        Exited (0)      │
    │   old-api           myco/api:v3   Exited (137)    │
    │   seed              alpine        Exited (0)      │
    │   … 5 more                    ⏎ to see the list   │
    │                                                   │
    │ ▸ [n] no                                          │
    │   [y] yes                                         │
    └───────────────────────────────────────────────────┘
❯ /prune
```

**`… 5 more` is the menu's own convention**, and it is already implemented — C19 renders the
indicator because only C19 knows the remainder, reading `Placed.truncated`. **The popup never
grows unboundedly**, and `⏎` opens the full list in a view when it matters.

## 3 — The completion menu, for comparison

```
    ┌──────────────────────────────────────────────────┐
    │ ▸ stats          One container, live             │
    │   start          Start a stopped container       │
    │   stop           Stop a running container        │
    │   … 4 more                                       │
    └──────────────────────────────────────────────────┘
❯ /st
```

**Same frame, same flip, same truncation, same selection.** The confirm is this with a title,
a glyph, a detail block and a different resolution.

## 4 — The paste peek

```
    ┌ #1 · json · 47 lines ────────────────────────────┐
    │ {                                                 │
    │   "Id": "7f3a2c14b9e0",                           │
    │   "State": { "Status": "running", "Pid": 4471 },  │
    │   … 44 more        ⏎ edit · e $EDITOR · x inline  │
    └───────────────────────────────────────────────────┘
❯ explain this error [#1 json · 47L]
```

**No choices — content only.** Dismissable, because nothing is awaiting an answer.

## 5 — A question with free text (`agent-tui` A3)

```
    ┌ ⟩ What should the commit message say? ────────────┐
    │                                                   │
    │ > fix the parser's nested quote handling▌          │
    │                                                   │
    │   ⏎ submit · esc cancel                           │
    └───────────────────────────────────────────────────┘
❯
```

**C17 in the popup**, the same editor as the prompt — which is the same move as the paste
chip's edit view, one size down.

---

## What this unifies, concretely

**The completion menu already has** the list, the selection, keyboard navigation, the
above/below flip, width from the widest entry plus padding, and the `… N more` truncation
reading `Placed.truncated`.

**The confirm currently reimplements or lacks all of it**, and the peek and the question would
each reimplement it again. **One mechanism, four callers.**

**Read against the tree, 2026-08-13, and the disjunction hides which is which — which is the
half that decides the size.** `src/shell/confirm.ts` **reimplements** the selection: its own
`selected` index, its own modular arrow cycling, its own marker glyph in `render`. It
**lacks** the flip and `… N more` entirely. So the shared mechanism is already written twice
and the two missing pieces are additions, not merges.

**And the two copies of the cycling agree exactly, which the walk below had to measure rather
than assume** — `% length` in both directions at `confirm.ts:194`/`:199` and `keys.ts:496`/
`:501`. The copies diverge on where the selection *starts*, not on how it moves; see §6 R1.

### Three parameters, and the third was missing from this list

```
onSelect       insert | resolve(key) | resolve(text) | none
dismissable    true for advisory layers, FALSE where an owner awaits an answer
placement      anchored (with a prefer) | centred
```

**`placement` was not here and the two consumers differ on it**, which is what a read of the
tree found rather than a re-reading of this page. `confirm.ts:148` pushes
`{ kind: "centred" }` with a declared `CONFIRM_WIDTH`; the completion menu and reverse
search push `{ kind: "anchored", prefer: "above" }`. A unification described by two
parameters cannot express the difference its own two consumers actually have.

**And §1 above draws the confirm *anchored to the prompt*, which is not what ships.** The
figure and the parameter list disagreed with the code in opposite directions, and neither
disagreed with the other — so reading this page against itself would not have found it.
**Read the abstract against the section, and the section against the code.**

C15 already models both kinds (`src/viewport/overlay/types.ts:27`), so this is a parameter
the layer type has and this design did not name.

### And two things the unification must not lose

**The centred confirm's weight**, replaced by content — glyph, title, safe default first, and
an unavailable prompt.

**And `dismissable: false`'s protection.** A modal question layer must never be popped by the
router while an answer is pending: the layer vanishes, the prompt stays unavailable, and
nothing says why. **Worth one assertion**, because the symptom is *"the shell froze"* and the
cause is three components away.

---

## 6 — The walk, 2026-08-13

Both artefacts, because this has state (a selection over a list that changes) **and** structure
(parameters that hold at rest, with no event between them). Taking the trace alone because a
selection looks like a state machine is how the structural half goes unexamined.

### 6a — The table, indexed by rule interaction

| # | the two rules meeting | what the overlap says |
|---|---|---|
| **A1** | `dismissable: false` × a `null` selection | **A state neither consumer can construct and the merged type admits.** `⏎` has no choice to resolve with and `Esc` is refused by C15, so the layer can be neither answered nor escaped. The hang arrives from the *type*, not from the router — and neither implementation can reach it today, because the confirm has no `null` arm and the menu is always dismissable |
| A2 | `centred` × no declared width | C15 gives a centred layer the region, `Placed.left` is 0, and the box reads as `fill` — already found, already recorded at `confirm.ts:152`. A merged builder must not default the width for `centred` |
| A3 | `anchored` × a declared width | The menu declares none *deliberately* (`menu.ts:202`); reverse search declares one (`layers.ts:65`). Both anchored. **Width does not follow placement** and cannot be folded into it |
| A4 | `onSelect: none` × an index | The peek would draw a selection marker on a list nothing can accept. `none` must force the selection absent, or the marker states something false |
| A5 | the marker × the block kind | The confirm writes `glyphFor("expand", caps)` into a `raw` block, and that is the entire reason `ConfirmDeps` carries `capabilities` — the file says so (F122, C09 I22). Rendering choices as a *block* lets L1 substitute, so **the merge deletes that seam rather than moving it.** The clearest payoff, and it is *never embed a glyph* being paid back |
| A6 | `dismissable: false` × `anchored` | §1 above draws exactly this cell and nothing in the tree produces it. Legal, unbuilt — the figure is a proposal and not a record, which is the correction §5 already carries |
| **A7** | an empty list × either resolution | **Two opposite dispositions, both right.** `ask()` *rejects* — a question with nothing to answer it cannot resolve, and inventing a key would put a value in the handler's hands no caller wrote (`confirm.ts:135`). `menuBlocks` returns `[]` and C15 omits the layer entirely (C15 I15), because the moment the set empties is C19's to act on. **So the empty list is a fourth parameter, or the merge is at the wrong level** |

### 6b — The trace, indexed by what happens in between

| # | the sequence | what it finds |
|---|---|---|
| B1 | push → the list narrows | A question's choices are fixed; a menu's change on every keystroke, and `showMenu` **resets** the selection to 0 or `null` (`keys.ts:377`). A shared store must be told whether its list is stable, or the confirm inherits a reset it cannot need |
| B2 | select index 2 → the list narrows to two | Out of range. The menu avoids it by resetting; a merged store that **clamped** instead would move a confirm's selection to the last item on a change it can never receive — and no single-keystroke test distinguishes the two |
| B3 | a confirm over a menu → `⌃c` | `pop()` inspects the top **only** (C15 I3), which is what leaves the confirm standing. **One id per layer stays**: pooling them under a shared id would let `update` find the menu |
| B4 | resolve → dispose → a key arrives | `handler = null` happens *before* the dispose (`confirm.ts:166`), so a key landing in the gap falls through the ladder rather than into a settled question. A merged host keeps that order |
| **B5** | the region shrinks → truncation | **`… N more` is not portable.** The menu counts in a *second pass after layout* (`keys.ts:305`), because how many fit is a fact about the frame — and it can count at all only because it holds the candidates. The confirm's payload is a **caller's block** and it has no registry; `CONFIRM_WIDTH` is a request rather than a measurement for exactly that reason (`confirm.ts:35`). C15 reports `truncated` as a flag and nothing more |
| **B6** | `update` mid-life | `LayerUpdate` admits `placement` and `content` and **deliberately excludes `dismissable`** (`overlay/types.ts:115` — a layer that becomes escapable partway makes C16's ladder depend on when it looked). The menu changes its placement on every keystroke. So the parameters are **two kinds**, and a flat list of three reads as though they are one |

### 6c — The rulings

**R1 — the initial index is the divergence, and the cycling is not.** The two copies of the
arrow movement agree exactly. What differs is where the selection starts: the menu at `null`,
or `0` when a `Tab` requested it; the confirm at the choice marked `default`, **falling back to
the last**, because for a destructive verb the safe option is conventionally last and a default
meaning *the first thing offered* is the wrong way for this to fail (`confirm.ts:83`). A merged
selection opening at `0` passes every assertion about arrows moving and puts `/prune` on `yes`.
**That is the mutation to write first**, and the one this walk replaced.

**R2 — `… N more` reduces to `…` for anything that does not hold its own list** (B5). The
shared piece is `Placed.truncated`; the *count* stays C19's, because only C19 can produce it
without the registry this layer deliberately lacks. The second addition drops from a mechanism
to a rendering.

**R3 — the parameters are live and frozen, and the list must say which** (B6). `placement` and
`content` change through `update`; `dismissable` and `onSelect` are fixed at construction, and
C15 I14 already gives the reason for the first of those.

**R4 — the empty list keeps both dispositions** (A7). Reject for a question, draw nothing for a
menu. A merge that picks one either invents an answer or hangs a handler.

**R5 — A1 is the type's own defect and the merge must exclude it.** A non-dismissable layer
carries a selection that is never `null`. That is a constructor-level pairing, not a runtime
check, and it is the one thing here that no test could have found before the type existed.

### 6d — And there is a fifth producer, which is a second confirm

`clearConfirmLayer` (`src/interaction/history/layers.ts:95`) is centred, non-dismissable, and
carries **`(y/N)` inside a notice's text** — no choice list, no selection, no accelerators. It
is published on `HistoryStore` (`history/types.ts:75`), re-exported through C20's barrel, and
asserted by two tests. **Nothing in `src/` pushes it**: `/history` has no `--clear`.

So the row's *four consumers* is five producers with one dead, and the dead one reimplements
the confirm a whole layer down, in L3, where a promise cannot be awaited at all.

**MG24 is quiet about it for F83's reason** — `store.ts:175` implements the member and the
implementing module counts as a consumer. Entry 48's argument, arriving live on a member that
is genuinely unreached.
