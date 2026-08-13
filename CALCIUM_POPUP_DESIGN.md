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
