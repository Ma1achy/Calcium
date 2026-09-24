# C15 — Overlay manager

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` |
| **Layer** | L2 viewport |
| **Depends on** | C04 (`Block`) · C09 (`measure` via the registry). **Not C14** — the region is passed to `layout()`, so C15 imports nothing from it |
| **Consumed by** | C16 (input priority) · C19 completion · C20 reverse search · L4 (confirms, panels, peeks) |
| **Source** | A01 D3, D4, D7 · A02 §2 |
| **Status** | Draft |

---

## 1. Purpose

Some things sit above the transcript: a completion menu, reverse-i-search, a confirm, a panel above the prompt, a peek beside a focused element. None of them belongs in the scrollback. They are transient, positional, and they take input priority while present.

C15 owns the stack of those layers: what is on top, where each one sits, how big it is, and what `Esc` closes. It does not route keys — that is C16, which reads the top of this stack to decide priority.

**There is no pushed view, and this section used to open by naming two** (R-EXA-082, F1254). The unifying decision was *overlays and pushed views are the same mechanism with different placement* — one positioned and content-sized, the other filling the region — and the argument for it was that treating them separately would mean two `Esc` implementations and two focus rules. The design removes the second half rather than the argument: the test for anything wanting a frame of its own is *does it have its own prompt and its own context*, and a reading, a diff and a help page have neither, so each is an entry in the transcript. What is left is **one mechanism with one shape**: content above the transcript, positioned, content-sized, with input priority while present. **The `fill` placement went with it** (parked 3): it outlived the kind for a while because three refusals named it, and each of those refusals had a live subject besides, so the placement was deleted and the three were amended rather than emptied (§4).

---

## 2. Layers

```typescript
type Placement =
  | Readonly<{ kind: "anchored"; row: number; rows?: number;   // the anchor's own extent, default 1
               prefer: "above" | "below" }>
  | Readonly<{ kind: "centred" }>

type Layer = Readonly<{
  id:          string;
  kind:        "overlay" | "panel" | "peek";      // peek — takes no keys, is never `top` (§2a)
  placement:   Placement;
  content:     readonly Block[];
  dismissable: boolean;                          // false = must be resolved, not escaped
  width?:      number;                            // cells; absent means the region's width
  maxHeightFraction?: number;                     // overlays; default 0.5
  /** Where this layer wants the terminal cursor, relative to its own origin (I19). */
  cursor?:     Readonly<{ row: number; col: number }>;
}>;

type Placed = Readonly<{
  layer:  Layer;
  top:    number;                                // absolute row within the viewport region
  left:   number;                                // absolute column within it
  height: number;
  width:  number;
  truncated: boolean;
  /** Where this layer wants the terminal cursor, relative to its own origin (I19). */
  cursor?: Readonly<{ row: number; col: number }>;
}>;

type DismissReason = "explicit" | "anchorEvicted";

/** What `update` may change — deliberately not `dismissable`. See below. */
type LayerUpdate = Partial<Pick<Layer, "content" | "placement" | "width" | "cursor">>;

type OverlayChange =
  | Readonly<{ kind: "push";    id: string; layerKind: Layer["kind"] }>
  | Readonly<{ kind: "pop";     id: string; layerKind: "overlay" | "panel" }>  // a peek is never popped (I21)
  | Readonly<{ kind: "content"; id: string }>
  | Readonly<{ kind: "dismiss"; id: string; reason: DismissReason }>;

interface OverlayManager {
  push(layer: Layer): Disposable;
  pop(): Layer | null;                           // the top layer, if it is dismissable
  dismiss(id: string, reason?: DismissReason): void;   // default "explicit"
  update(id: string, next: LayerUpdate): boolean;
  layout(region: Readonly<{ width: number; height: number }>): readonly Placed[];
  subscribe(cb: (change: OverlayChange) => void): Disposable;

  readonly stack:  readonly Layer[];             // bottom-first
  readonly top:    KeyedLayer | null;            // the topmost layer that takes keys — never a peek (I21)
}

/** A layer C16 can route to. `top` is typed to this so a peek cannot reach `activeTarget`. */
type KeyedLayer = Layer & Readonly<{ kind: "overlay" | "panel" }>;
```

### A layer changes without leaving the stack

`update` exists because every consumer needs it and none of them is opening a new layer when it does. C19's menu narrows on each keystroke and re-highlights on each arrow; C20's reverse search rewrites its match line; a peek's content changes when the entry under it is patched. All three change what is drawn while the layer stays exactly where it is. **Two of the three examples here were pushed views** — a logs buffer scrolling itself and a fullscreen patch paging — and the seam outlives them (F1254): what argues for `update` is a layer whose content changes while the layer does not move, which is what every remaining kind does.

The two alternatives were considered and are worse in ways that are not obvious.

- **Content as a thunk** — `() => Block[]`, evaluated inside `layout()`. It needs no new method, and it makes `layout()`'s output depend on the owner's private state rather than on the stack. T2.1 stops being assertable and I5's purity becomes a claim about C15's code rather than about its output, which is the difference between an invariant and a convention.
- **Dismiss and re-push** — no interface change, one pop and one push per keystroke. C16 derives focus on every dispatch (C16 I1), so focus churns inside the thing being typed into, and the layer loses its position under anything stacked above it.

`update` keeps `layout()` a pure function of the stack. The stack is what changed.

**It cannot change `dismissable`, and that is deliberate rather than an oversight in the `Pick`.** A layer that becomes escapable partway through its life makes C16's Ctrl-C ladder depend on *when* it looked: the same confirm answers "may I be dismissed?" differently on two consecutive keystrokes, and the branch that is right is unknowable from either side. A layer that needs to change what `Esc` means to it is two layers.

### Width is the owner's, because measurement cannot supply one

`BlockRegistry` answers one question — `measure(block, width) → rows`. There is no query for the width a block would *like*, and adding one means every registered kind implementing it.

So `Layer.width` is declared, in cells, and absent means the region's. `Placed.left` follows from it: `0` for `anchored`, and `floor((region.width − width) / 2)` for `centred`. Without a declared width every overlay is region-width, `left` is permanently zero, and `centred` is vertical-only in a section that promises both axes.

This is I8's argument one field over. C19 knows its longest candidate and a confirm knows its text; C15 knows neither, and a component that guesses a width here would be inventing the same information I8 forbids it inventing about the remainder.

### The dismissal reason is recorded, not detected

`anchorEvicted` is supplied by whoever raised the layer. C15 subscribes to nothing, holds no entry ids, and imports nothing from C13 (I9, I12) — so it cannot notice an eviction, and the requirement was never that it should. What L4 needs is to tell a user's cancellation from a referent that no longer exists, and that is a field on the change rather than a duty on the manager.

C19 knows which row its menu is anchored to and is already subscribed to what moves it. The same call is what moves an anchored layer when the viewport scrolls: `update(id, { placement })`, one seam for both.

### How a removal reaches its owner

**Every removal emits one change naming the layer's id, synchronously, before the removing call
returns** (I25): `pop()` emits `pop`, `dismiss(id)` emits `dismiss` with its reason, and the
disposable `push` returned is `dismiss` under another name. `pop()` on a non-dismissable top and
`dismiss` of an unknown id remove nothing and emit nothing. There is no removal path that emits
nothing, and that is what makes the stream the owner's seam rather than a courtesy.

**It matters because the manager is not always called by the owner.** C16's ⌃c ladder pops the
top keyed layer and never learns who raised it; the owner that holds state about the layer — an
offset, a timer — learns nothing unless it subscribed. Measured 2026-09-09 (F944): after the
ladder's `pop()`, `document-view.ts`'s `openFor` still named its command over an empty stack.

**The three owners that argued for this stream are gone and the seam is not** (R-EXA-082, F1254).
They were the pushed views — the patch, the document and the profiler's deck — and each one's
teardown ran from the change carrying its id. What is left on the stack is a confirm, a completion
menu, a panel and a peek, and the first three all hold state a stale owner costs: an in-flight
answer, a selected row, an anchor. The argument was never about views; it was about **who is
holding state when someone else removes the layer**, and a `pop()` from the ladder is still not
the owner's call.

---

## 2a. The peek — a layer that takes no keys

**A tooltip is the focused element's detail, and it is drawn here.** `NavElement.detail?: Block`
(C26 §5) is the element's source that the rendering could not show — a table row's cut and dropped
cells, a chip's producer-supplied detail — and L4 shows it beside the focused element as a layer
of `kind: "peek"`. It appears whether focus arrived by key or by click (C02: every mouse
affordance has a keyboard equivalent), so it needs no hover, and hover is not reachable anyway:
the mouse mode is 1002, motion only while a button is held. The pointer's way to a detail is the
click that focuses. A delay for a motion event that never arrives is not built, and the trade
that would make it arrive is recorded under the symbol `MOUSE_ANY_EVENT` (1003 floods the decoder
with motion for the whole session to serve one affordance).

**Two rules meet, and the cell where they meet is the one to measure first.** *A layer that
must be answered gets its keys first and blocks* (C16 I25; the confirm) and *a detail is
furniture and must block nothing*. Measured at HEAD: `activeTarget` answers `overlay` for any
layer whose `kind` is `overlay` (`router/focus.ts`), so a peek pushed as one steals exactly the
keys it exists beside — with an anchored, dismissable, empty overlay on the stack over a focused
table, `↓` was consumed and focus did not move (r2 → r2), `⏎` was consumed by the layer, and
`Esc` dismissed the layer instead of leaving the block. That is why the peek is a **third
`kind`** rather than a flag: C16 reads `top.kind`, and a layer that is never `top` cannot reach
the ladder at all. `dismissable` is the wrong axis — it decides what `Esc` does *to a layer
that has the keys*, and a peek never has them.

**What `peek` means, in three rules.**

- **A peek is never `top`** (I21). `top` is the topmost layer of kind `overlay` or `panel`, and
  it is typed to say so — `KeyedLayer` — so C16's `overlayTop` cannot see a peek without a type
  error. `pop()` reads `top`, so a peek is never popped; only its owner removes it, through
  `dismiss(id)` or the disposable. The Ctrl-C ladder, `promptUnderMenu`, the confirm's
  `answerHandler` and the terminal cursor all read `top` and all are unchanged by a peek.
- **A peek is anchored** (I22). Its whole meaning is *beside the thing it describes*; a centred peek
  is a confirm wearing the wrong kind, and both entry points refuse it —
  `update` too, on I20's argument that `LayerUpdate` admits `placement`.
- **Every overlay sorts above every panel, and every panel above every peek** (I23). A
  confirm raised by the far side while a peek is up draws over the peek and takes the keys;
  the peek stays, because nothing about the element it describes has changed.

**The peek is a projection of focus, and it has no key of its own.** L4 reconciles it — on
every delivered input and on every viewport change — against three facts: the active target
is `liveBlock` or `interaction`, the resolved element declares `detail`, and the element's first
row is on screen. All three, and a peek is on the stack anchored at that row with that detail;
any fewer, and there is none. So `↓` onto an element with a detail opens it, `↓` onto one
without closes it, `⏎` activates the element (the peek has no `⏎`), and `Esc` at `liveBlock` is
`focusPrompt` as it is today — the peek closes *because focus left*, not because `Esc` reached
it. Native selection freezes the screen and takes every key; the target is `nativeSelection`, so the peek is
dismissed for the same reason. An anchored width is the region's, on the confirm's argument
(`confirm.ts`, `placementOf`): a narrower layer leaves the rows behind it visible on the same
line. `maxHeightFraction` is the default half, which is the fraction the confirm's own comment
says is right for a peek.

**Where a ruling names an operation, the operation was checked.** `update(id, { content,
placement })` exists and carries both (§2 *A layer changes without leaving the stack*);
`dismiss(id)` exists; the owner recomputing a region row from C14's `visible()` and
`blankRowsAbove` is the same arithmetic `entryAtRegionRow` already runs in reverse. Nothing here
asked C15 to know what a row is (I9, I12).

### The walk — a classification table and a trace

Structural, at rest — cells where two rules both hold:

| peek up × … | ruling | why |
|---|---|---|
| `activeTarget` | unchanged — `top` skips peeks (I21) | measured: a plain overlay steals `↓`, `⏎`, `Esc` |
| a confirm raised by the far side | confirm above, takes the keys; peek stays | I23; the element is unchanged |
| `pop()` (Ctrl-C ladder) | pops the top **keyed** layer, never the peek | `pop` reads `top` |
| the element is on a settled entry | allowed — a detail is data, not an affordance | C26 §4g: focus reaches settled entries |
| the region edge | `prefer: "below"`, C15 flips above when there is no room | I17, existing arithmetic |
| the element's row scrolled off screen | no anchor → no peek | I17's anchor is a region row |
| the element is inside a `scroll` box | **uninhabited** — a scroll owns its elements (C09 I30, C26 §4b cell 3): one per child, block-level, and none carries a `detail`, because only a table **row** declares one (`table/definition.ts`, `rowDetail`). So no element inside a box can want a peek, and the content-row → region-row translation the pointer does (`elementAt`, F757 row c) has nothing to translate | measured: `elementsIn` over a scroll holding a cut table answers two elements, `detail` on neither, against the same table alone answering row `a` with one. `peekWanted` carried a guard for this state for as long as it was owed under `SCROLL_PEEK`; the guard was unreachable and is gone, and `test/integration/peek.test.ts` T4.13 pins the premise — it goes red the day a scroll's element gains a `detail`, which is the day the translation is owed |
| `Esc` | `focusPrompt` (today's binding); the peek follows focus out | no `Esc` reaches a layer that is not `top` |

Event-mediated — the trace:

| step | focus | stack | frame |
|---|---|---|---|
| `↓` from the prompt onto row `a` (cut) | `a` | `[peek@a]` | detail of `a` below the row |
| `↓` onto row `b` (nothing cut) | `b` | `[]` | transcript alone |
| `↓` onto row `c` (cut) | `c` | `[peek@c]` | detail of `c`; row `a` unchanged beneath |
| `tab` to the next entry with elements | its first | `[peek]` or `[]` by that element's `detail` | |
| far side raises a confirm | unchanged | `[peek, confirm]` | confirm over the peek |
| `n` answers it | unchanged | `[peek]` | peek visible again, same content |
| the entry is patched (the cut cell changes) | unchanged | `[peek]` updated | new content, one `content` change, no pop/push |
| `Esc` | prompt | `[]` | |

**Containment is not correctness.** The frame rows assert the peek's row against the element's
row, and the transcript rows the peek does not cover against the same frame with no peek.

**Content is `Block[]`, not React.** Every layer renders through the same block library as the transcript — so a completion menu is themed, degrades to ASCII, and is measurable by the same code. React appears only in the positioning shell, never in the content.

That is the payoff of the block vocabulary being a vocabulary rather than a rendering of one particular thing, and it is worth defending: a component that reaches for raw React to draw an overlay has stepped outside theming and measurement at once.

### 2b. Approval is a layer, and a subagent is a tab

**A call that needs a decision does not draw the decision in its own gutter** (`AGENT_TUI_DESIGN.md`
§9e §8). It goes to the overlay — the surface that already carries questions, image previews and
pasted content — because the reader is being *asked*, not shown: a body is read at the reader's
pace and a decision is something the session is stopped on. **One surface for a reason**: a
question, an approval, a paste to confirm and an image to look at are the same interruption with
different content, and an inline approval would make one of the four special for no reason a
reader can see.

**What the layer carries, and none of it is new** (I24): the invocation in the head's own words,
the consequence as a `warn` line if the caller supplied one, and the choices as the confirm host's
own three-column table — same navigation, same selection, same dismissal — so `always allow rm` is
a row like any other and not a checkbox. C23's `approvalPrompt` composes it; this component places
it. It is an `overlay` and not a peek: it must be answered, so it takes the keys (C16 I25), and the
call's head reads `⬤ rm -rf build/ · ⠋ waiting` beneath it so a transcript scrolled away from the
layer still shows what is happening (C23 I60). On resolve the layer pops, the head updates, and a
denied call keeps its head reading `denied`.

**A subagent's transcript is a different document, not a longer block** — and the design settles
what shape that takes: *a subagent → A TAB* (R-EXA-082). It has its own prompt and its own
context, which is the test, and that is exactly what a layer is not. So `⏎` on a subagent's head
does not push anything here; it is a composition question for C22 and not a stack question for
C15. Still **deferred**: nothing in `src/` produces a subagent, and the far side's transcript type
does not exist. The two-level nesting rule (C22 I89) is what this deferral protects.

---

## 2c. Blocking and dismissal are two fields — M8

**`dismissable` carried three concepts and the design separates them** (R-QST-001, R-BLK-822). The flag answered *can `pop()` remove it* (I3), *is it modal to the mouse* (C16 I8) and *does it claim keys before the prompt* (C16 I25) — three questions with one bit, which is right for exactly as long as the three answers agree. They do not. `R-BLK-822` is the design's own construction of the case that breaks it:

> ★ BLOCKING AND REPLACING ARE INDEPENDENT. A typed reply BLOCKS and FLOATS, which is the combination that proves it — and it never becomes dismissable, because an owner is still waiting.

And R-QST-001 says the answer is not inferred: *a question declares blocking and owner explicitly.*

So a layer carries two fields.

| field | what it answers | values |
|---|---|---|
| `blocking` | does this layer own input while it is up | `true` · `false` |
| `dismissal` | what closes it | `escape` · `focus` · `answer` |

**Three shapes, and the design names all three** (R-BLK-779):

> a **PANEL** floats above the prompt, between two rules. DISMISSABLE: a click off it CLOSES it, and the click stops there. a **PEEK** anchored BESIDE an element, and it takes NO KEYS — it is a projection of focus, so focus leaving closes it. an **OVERLAY** modal, and it OWNS input. NOT dismissable: clicking off it does nothing, because an owner is waiting.

| kind | `blocking` | `dismissal` | takes keys |
|---|---|---|---|
| `overlay` | declared — a question's is `true`, a completion menu's is `false` | `answer` when blocking, `escape` otherwise | yes |
| `panel` | `false` | `escape` | yes |
| `peek` | `false` | `focus` | no |

**The old flag maps onto the pair without ambiguity**, which is what makes the rewrite mechanical: `dismissable: true` was *not blocking, closed by escape*, and `dismissable: false` was *blocking, closed by its answer*. Nothing in the tree held the third combination, because it could not be written.

**What the split retires, and it is the better half of the change.** C16's step 3 asked `!top.dismissable || coversRegion(top.id)` — a declared flag **or** a measured geometry, because the flag could not say *owns input* on its own and a full-region layer had to be recognised by its box. `blocking` says it, so `coversRegion` goes and C16 I8 is amended: a layer that owns input says so, and one that does not is not made modal by being large. C16's `promptKeys` carries the same shape from the other side — *a layer that is chrome for the prompt does not stop typing* — and that is `blocking: false` written as an exception before the field existed.

### A blocking layer closes the panels beneath it

R-BLK-873, and it is an ordering rule rather than a placement one:

> a panel is DISMISSABLE and a question is NOT. Two layers, and one of them is about to take the keyboard. **THE PANEL CLOSES FIRST**, and its state is held with the prompt's. A panel is a thing you opened; a question is a thing that arrived. The arriving one cannot silently sit under something you were reading, and stacking two dismissable-versus-not layers makes `esc` ambiguous.

So pushing a `blocking` layer dismisses every `dismissal: "escape"` layer already on the stack, each with its own change and its own reason (I25), before the new layer is pushed. The reason is `escape`'s own — it is not an eviction and the referent has not gone — and L4 is what holds the panel's state, exactly as it holds the prompt's.

**Why here and not in C16.** The rule is about what the *stack* may contain, and the stack is this component's. A version living in the caller is a rule every caller has to remember, and the measured cost of that shape is C16 §6's second keymap.

---

## 3. Stack rules

**Overlays always sit above panels, and panels above peeks** (I23). A confirm raised while a completion menu is open appears over it, which is why A02's focus priority lists `overlay` above the prompt's substate.

**The sort is real code in `layout()` rather than a property of push order.** It was written that way for `view`, whose every non-empty push was a rejection — so overlays always followed it in push order and an implementation sorting by push order alone satisfied the rule without ever knowing it, which is A03's vacuity class arriving in a spec. **The reason changed with the kind and the code did not** (R-EXA-082, F1254): a peek and a panel are both pushed onto stacks that already hold things, in orders a session genuinely produces, so the sort is now exercised by `push` as well as by a hand-built stack. T2.8 keeps the hand-built one because it is the only way to construct a stack `push` would have sorted on the way in.

**Overlays nest freely.** Reverse-i-search over a completion menu is legitimate.

**A peek sits beneath every overlay and every panel, and is never `top`** (§2a, I21, I23). It
takes no keys, so nothing in this section about `pop` or `Esc` reaches it; its owner dismisses
it, and the change it emits is `dismiss`, never `pop`.

`pop()` inspects **only the top layer**. If it is dismissable it is removed; if it is not, nothing happens and `null` comes back. It does not search downwards for the first dismissable layer, and the difference is not academic: under a confirm raised over a completion menu, the searching version pops the menu — answering nothing, closing something the user was not looking at, and leaving the confirm sitting over a changed screen. That is T6.4's failure reached by a reading of the word "topmost" rather than by a bug.

A non-dismissable layer — a confirm awaiting y/N — must be resolved by `dismiss(id)` from whatever raised it. `Esc` on it is a no-op rather than a silent cancellation, because a confirm that can be dismissed by an unrelated keypress is not a confirm.

**`pop()` returning `null` covers two cases, and its caller has to tell them apart.** C16's Ctrl-C ladder is the consumer: it dismisses a dismissable overlay, no-ops on a non-dismissable one, and *falls through to the next rung* when there is no layer at all (C16 §5, I8). Those are three outcomes and `pop()` reports two, so the ladder reads `top` before calling — `top === null` is the fall-through, `top.dismissable === false` is the no-op. Said here because the obvious code branches on the return value, and the obvious code sends Ctrl-C nowhere while a confirm is open.

Popping emits a change. **C15 does not write to the transcript**, and after A01 D7's amendment nothing else does on a pop either — a trace entry would freeze the block the pop returns to and clear the selection D7 preserves. The invariant is unchanged and its justification is now simpler: an overlay manager that could append would need to understand what a dashboard is, and keeping C15 out of C13 is what stops L2 depending on the transcript's contents (I9, MG13).

---

## 4. Placement

**Two placements, and both are positioned.** There was a third, `fill` — the region entire, `top = 0`, `left = 0` — and nothing in `src/` produced one once the view kind was removed (R-EXA-082, F1254). It was kept a while on the argument that I20, I22 and I27 were each written as a refusal of it, and a refusal whose subject cannot be constructed is A03 §2's vacuity class. **The argument was true of one clause in each and not of the invariants** (parked 3): I20 refuses a centred layer with no width, I22 a centred peek, I27 a centred, blocking or non-`escape` panel, and all of those are constructible. So the placement is deleted and the three refusals keep every subject they still have. A layer that wants the region is a centred layer declaring the region's width and `maxHeightFraction: 1`, and nothing in the tree wants one.

### Drawing a layer is L4's, and nothing did it

`layout(region)` returns `Placed` boxes and **no component draws them.** L4's paint composites header, transcript, prompt and footer, and calls `layout()` in exactly two places — C16's hit-testing, and the completion menu's own remainder count. So this component has never put a glyph on a screen: the completion menu, reverse search and the exit confirm are all invisible, and `raiseExitConfirm` stopping the session directly was a symptom of that rather than a simplification, because there was nowhere for a confirm to appear.

**S01 §3's arithmetic is why nothing complained.** A layer floats above the four regions rather than taking rows from them, so the heights still sum to `rows` and the frame is internally consistent with every overlay missing. The check that catches a region wrong by one row cannot see a region that is not drawn at all.

Three things follow, and they are decisions rather than details:

**Clamping is C15's and drawing is L4's, and neither does the other's half.** `layout()` clamps the box to the region and reports `truncated` (§4 steps 3, 6, 7); the drawer composites exactly the box it is handed and never re-decides its extent. Two components with an opinion about a layer's extent is how a menu comes to be one row taller than the space computed for it. The corollary is that **the drawer must not exceed `height`**: C15 clips no *content* (below), so a layer whose blocks render taller than its box is cut by whoever draws it.

**The region is the viewport's, and the offset to the terminal is the drawer's** (S01 §3a). Every number `layout()` returns is relative to the region it was handed, and the drawer adds the region's top before writing a row — one translation, in one place. Handing this component the whole terminal instead would spare the drawer that addition and cost C15 its shape: it would then have to know where the viewport sits, which is the header's height, which is S01's arithmetic arriving inside the one component built specifically not to hold any. That is why it imports neither C14 nor `terminal/` (I12), and why the region is a parameter rather than a property.

**Width is clamped, and unlike height that is not optional.** A layer taller than its box loses rows the reader can scroll to; a layer wider than the region wraps, and a wrapped overlay row shifts every row below it — the failure S01 §3 and `docs/notes/resize-and-compositor.md` both name, arriving through a layer instead of through a frame.

**The terminal cursor is placed by whatever holds focus, and hidden when that thing has none** (I19). C16's `activeTarget` already puts `overlay` above `prompt`, so the cursor belongs to the layer for the same reason the keys do — and leaving it blinking at the prompt under a menu that owns the keystrokes is precisely the *somewhere invisible* symptom derived focus exists to prevent.

**The field originates on `Layer` and `layout()` copies it through.** The ruling
first put it on `Placed` alone, which is a shape nothing can produce: `place()`
computes geometry from a measured height and a region and has no idea where a
search's caret is, so a cursor that existed only on its output could only be
invented there. The producer states it — `searchLayer` knows the caret because
it drew the line — and it survives placement unchanged, because both ends of the
copy are relative to the same origin. `update` carries it for the same reason it
carries `content`: the caret moves as the search is typed into, and a
pop-and-repush is not how a layer changes.

`Placed.cursor` is how the drawer reads it, **relative to the layer's own origin**, so the drawer never has to know what a prompt or a search field is. Absent means the layer has no cursor and the terminal's is hidden, which is the default and the case that matters: it is what a menu wants.

The two live producers answer oppositely, which is what makes this a field rather than a constant. **Reverse search has a cursor** — text is being typed into it — and **the completion menu has none**; nothing is entered into a menu, the keys move a selection. C15's exit confirm has none either, for the same reason, and it now has somewhere to appear at all.

**`cursorCell` stays exactly as it is** (C17 §2). C17 is a data structure with no notion of focus: it reports where its own cursor sits and always has. The *drawer* chooses — the focused layer's cursor if it has one, the prompt's if focus is `prompt`, hidden otherwise. A `cursorCell` that answered differently depending on focus would be C17 knowing about focus, which is what keeps it testable.

#### Four things the drawer has to get right

Written here before the build rather than after it, because each has a failure that looks like something else.

**1 — A layer over the prompt is the case with two owners.** The prompt paints its rows and the layer composites over them, so those cells are written twice. That is correct, and it means **the layer must paint every cell in its box, background included**. A loop that writes only the glyphs its blocks produce leaves the prompt showing through the gaps, and the symptom is text bleeding through a menu rather than anything that reads as a layout error.

**2 — Stacking order is the band sort, and the last layer wins each cell.** I23 settles it, and "the last one wins" is obvious only once two of them overlap — the first time that happens will be in front of a user.

**3 — Every layer floats; none replaces the transcript.** There was a `fill` placement whose box *was* the viewport region, and the drawer treated it as one more layer rather than as a replacement — one path for every kind. The placement is deleted (§4), and the path it argued for is the only one there is.

**4 — Read the frame.** This will be the first time anything this component places appears on a screen, and every comparable first in this project was caught by looking rather than by an assertion: the glyph column rendering `…`, C12's y-label decimals, C25's five defects. Compose a menu over a prompt, a confirm over a menu, and a peek beside an element, and look at all three.

**C15 scrolls nothing, and there is no longer a kind that needed saying so of** (R-EXA-082, F1254). The sentence here was *a view's content is already the region's worth and its owner windows it* — written to stop C15 growing a scroll offset for views, which is a second scroll model beside C14's and the thing A01 D3 spent a decision avoiding. The refusal survives its subject: a layer is placed at the size it measures, C15 clips nothing vertically beyond reporting `truncated`, and anything long enough to need windowing is an entry in the transcript, where C14 already scrolls.

Overlays are content-sized and resolved in a fixed order:

```
1  resolve width: min(layer.width ?? region.width, region.width)
2  measure content at that width  → desired height
3  clamp to floor(region.height × maxHeightFraction)   → truncated if reduced
4  place at the preferred side of the anchor span
       above → rows [row − height, row − 1]
       below → rows [row + rows, row + rows + height − 1]
5  if it does not fit that side, flip to the other
6  if it fits neither, take the larger side and clamp again
7  clamp the top edge to the region; never negative, never past the bottom
8  resolve left: 0, or centred within the region
```

**The anchor is a span, not a row, and this is what a two-row prompt forced.** A prompt occupying rows 18 and 19 of a twenty-row region has no single row that places a menu correctly: anchoring on 18 and preferring `below` starts the menu on row 19, over the prompt's second line, and anchoring on 19 and preferring `above` ends it on row 18, over the prompt's first. Both preferences are wrong, and both produce a `Placed` in which every number is self-consistent — inside the region, non-negative, untruncated — so the whole of T2.2's corpus passes while the menu sits on top of the line it belongs to. It was found by drawing the frame.

So `rows` defaults to 1 and names the anchor's own extent, and **the anchor's rows are never covered**: step 4's arithmetic excludes `[row, row + rows − 1]` on both sides. Written out rather than left to the word "below", because `row + 1` is the natural thing to write and it is right exactly when the anchor is one row tall.

**Step 1 precedes step 2 and this is not tidiness.** Height is a function of width, so a forty-cell confirm measured at a hundred and twenty comes back one row tall and is drawn as three. Measuring at the region's width was the original wording and it was only ever right because nothing declared a narrower one.

**Flip before clamp** — and it is the *fit* clamp, steps 6 and 7, not the fraction clamp at step 3. The fraction is a policy about how much of the screen an overlay may take and it applies wherever the overlay ends up; the fit clamp is what happens when the chosen side is too small, and doing it before the flip is what produces the bug. A reader who takes I7 literally moves step 3 after step 5 and breaks T3.7, which is why the two clamps are named separately here rather than sharing a word.

The bug itself: a completion menu anchored just below the prompt has no room below it and plenty above; clamping first squashes it to two rows when flipping would have shown all eight. It is the most common overlay bug and it looks like "the menu is inexplicably tiny".

Truncation is reported through `Placed.truncated`, so the layer's owner can render its own "N more" indicator. C15 does not invent one — C19 knows what the remaining candidates are and C15 does not.

`centred` is for confirms and help: horizontally and vertically centred, same clamping. Horizontal centring is the only thing `Placed.left` is ever non-zero for, and it needs the region's width, which `layout()` is given, and the layer's own, which step 1 resolved.

**An overlay measuring zero rows is omitted from the result, and `layout()` does not dismiss it.** Purity (I5) forbids the manager acting on what it computed, so there is no third option here: the layer stays on the stack, nothing is drawn, and the owner dismisses. Push is deliberately not rejected for empty content, because content becomes empty legitimately — a completion menu narrows to no candidates as the last character is typed — and that moment is C19's to act on, not C15's.

**No backdrop dimming.** Terminals dim badly — a half-intensity region reads as a rendering fault rather than as depth. An overlay draws over what it covers, with a border to delimit it.

---

## 5. Geometry and resize

C15 holds no geometry of its own; `layout()` is a pure function of the stack and the region passed in. A resize therefore needs no invalidation — the next `layout()` call is simply computed against new dimensions.

An anchored overlay whose anchor row has scrolled out of the region clamps to the nearest edge rather than vanishing.

**An anchor row is a region row, and keeping it current is the owner's.** C15 is given a number and places against it; it has no way to learn that the row moved, and by design no way to learn that the entry under it was evicted. So a layer anchored to transcript content follows it by its owner calling `update(id, { placement })` as the viewport scrolls, and stops existing by its owner calling `dismiss(id, "anchorEvicted")`. Both are the same seam, and both keep `layout()` a pure function of what it was handed.

The alternative — C15 subscribing to C13 and anchoring on an `EntryId` — was rejected. It trades MG13, C15's statelessness and `layout()`'s purity to solve a problem the owner already has the information for, and it makes C15 the second component reading a change stream, which is the class C14 paid for in a blank screen.

---

## 6. State machine

Over the stack's shape.

**The `push(view)` column is gone with the kind, and with it three rejection cells** (R-EXA-082, F1254). Every one of them said the same thing — a view is pushed onto an empty stack or not at all — and that rule is what made I2's sort unfalsifiable through `push`. A panel and a peek both arrive onto stacks that already hold things.

| From ↓ / call → | `push(overlay)` | `push(panel)` | `push(peek)` | `pop` | `dismiss(id)` | `update(id, …)` |
|---|---|---|---|---|---|---|
| **empty** | → overlays (T1.1) | → panel, it is `top` (T1.31) | → peek, `top` null (T1.23) | null (T3.1) | no-op (T3.2) | false, no change (T3.17) |
| **overlays** | → overlays, deeper (T1.3) | → beneath them, `top` unchanged (T1.33) | → beneath them, `top` unchanged (T1.24) | pops the top if dismissable (T1.5, T1.9) | removes that layer (T1.7) | shape unchanged (T1.12) |
| **panel** | → overlay above it; a **blocking** one closes the panel first (T1.32) | → two panels (T1.33) | → beneath it (T1.33) | pops the panel (T1.30) | removes that layer (T1.7) | shape unchanged (T1.12) |
| **peek** | → overlay above it (T1.24) | → panel above it (T1.33) | → two peeks (T1.23) | **null, peek stays** (T1.25) | → empty (T1.25) | shape unchanged |

`update` is the only call that changes no cell of this table — it alters a layer, never the stack's shape. It earns a column precisely so that stays visible: a later hand reaching for "update should push if the id is unknown" has to write a transition that contradicts the row above it.

---

## 7. Invariants

- **I1** — **Retired with the view kind** (F1254). *At most one `view` in the stack at any time* — there is no `view` kind, so the rule has no subject. Its nesting clause was answered by the design rather than dropped: a thing wanting a frame of its own is a tab, and everything else is a block, an entry or a question (R-EXA-082).
- **I2** — **Retired with the view kind** (F1254). *Every `overlay` sorts above every `view`* is I23's first half with the bottom band removed; I23 is the rule and it is stated over the bands that exist.
- **I3** — `pop()` removes only the topmost layer whose `dismissal` is `"escape"`; a layer closed by its answer or by focus is not escapable (§2c, M8). The predicate moved off `dismissable` and the rule did not: *escapable* was always one of the three things that flag conflated, and it is the one `pop()` ever meant.
- **I4** — Layer content is `Block[]`; no layer carries raw React.
- **I5** — `layout()` is pure — same stack and region, same result — and performs no I/O.
- **I6** — No placed layer exceeds the region on either axis, and neither offset is negative: `0 ≤ top`, `top + height ≤ region.height`, `0 ≤ left`, `left + width ≤ region.width`. Stated over both axes because `Placed` carries both, and a single-axis reading is what left `left` out of it.
- **I7** — Flip precedes the **fit** clamp. The `maxHeightFraction` clamp is a separate rule applied before placement begins (§4).
- **I8** — Truncation is reported, never disguised; C15 renders no overflow indicator itself.
- **I9** — C15 never writes to the transcript.
- **I10** — A dismissal **records why**: `anchorEvicted` when the layer's referent has gone, `explicit` otherwise. C15 detects neither — it holds no entry ids and imports nothing from C13 (I9, I12) — and the requirement was never detection but that L4 can tell a user's cancellation from a vanished referent.
- **I11** — No layer paints a backdrop, dim or otherwise. A terminal renders a dimmed region as damaged output rather than as depth, and the separation an overlay needs comes from its border and its position — which are things a cell grid can actually express.
- **I12** — C15 imports nothing from `terminal/` **or C14**; the region arrives as data.
- **I13** — Pushing returns a disposable; disposing is equivalent to `dismiss(id)`.
- **I14** — `update` changes a layer's content, placement or width and never the stack's shape, its order, its `blocking` or its `dismissal` (§2c, M8). A layer whose escapability changes mid-life makes C16's Ctrl-C ladder depend on when it looked — and the same is true of ownership twice over, because a layer that stopped blocking mid-answer would hand the keyboard back to a prompt an owner is still waiting on.
- **I15** — `layout()` omits a zero-height overlay and dismisses nothing. Acting on what it computed would cost I5.
- **I16** — An overlay's width is `min(layer.width ?? region.width, region.width)`, and its content is measured at that width rather than at the region's. `Placed.left` is derived from it.
- **I17** — An anchored overlay never covers its anchor's own rows, `[row, row + rows − 1]`, **whenever either side has a row to offer**. A single-row anchor is the default and the special case, not the general one. The qualification is T3.8's: a one-row region with a one-row anchor has no room on either side, and an overlay covering its anchor is a better answer than one silently absent.
- **I18** — The `maxHeightFraction` clamp is floored at one row. `floor(1 × 0.5)` is zero, and a region too short for the fraction must not swallow every overlay it holds.
- **I19** — The terminal cursor is placed by whatever holds focus and hidden when that thing has none. A layer states its own through `Placed.cursor`, relative to its origin; absent means hidden. The choice is the drawer's and never C17's — a `cursorCell` that varied with focus would put focus inside a component that has no notion of it.
- **I20** — **A `centred` layer declares a width, and `push` and `update` refuse one that does not.** I16 resolves an absent width to the region's, which is right for an anchored layer — so a centred layer without one is placed at `left = floor((region.width − region.width) / 2)`, which is zero, and is centred on neither axis a reader can see: it is an anchored layer's column span wearing `centred`. *(Amended, parked 3: this read "indistinguishable from a `fill` layer", and the placement it compared with is deleted; the state it forbids is unchanged.)* **The state reads as correct everywhere and is wrong about what it was asked to be**, which is why the check is at construction rather than in a caller's comment: `confirm.ts` carried exactly that comment, written after the defect had been found once, and a second centred layer written by anyone else would have reached it again. `update` is checked too, because `LayerUpdate` admits `placement` — so a layer pushed anchored and updated to centred reaches the same state by a route the push-time check cannot see.
- **I21** — **A `peek` is never `top`.** `top` is the topmost layer of kind `overlay` or `panel`, typed `KeyedLayer`; a **panel takes keys and is therefore `top`** — it is what a completion menu and a command palette are (R-BLK-866), and a layer that is never `top` cannot reach the ladder at all; `pop()` reads it and so never removes a peek, and C16's `activeTarget` is unchanged by any number of peeks on the stack. A peek is removed only by its owner (`dismiss`, or the disposable).
- **I22** — **A `peek` is anchored**, and `push` and `update` refuse a centred one. Its meaning is *beside the thing it describes*, and `centred` is a confirm's. *(Amended, parked 3: it refused `fill` too, and the placement is deleted — §4.)*
- **I23** — **`overlay › panel › peek › base`, regardless of push order, and this is the scroll priority too** (R-BLK-779, §2c). One ordering does both jobs, which is the design's own argument for it: a wheel over a panel moves the panel and not the transcript beneath it, for the same reason a key over a panel is the panel's. **The `view` band is gone and the ordering is over the three kinds that exist** (R-EXA-082, F1254): `overlay › panel › peek › base`, where `base` is the transcript. I2 was this invariant's `overlay`/`view` half and is retired; what it protected — a confirm drawing over what it was raised from — is the `overlay › panel` edge, which `push` now reaches on its own because both arrive onto occupied stacks.
- **I24** — **A call's approval is an `overlay` of the confirm host's shape — the invocation, an optional consequence line, and the choices as the host's own table — composed by C23 and placed here; it takes the keys as every confirm does, and a subagent is a tab rather than a layer of any kind** (§2b, R-EXA-082, → C23 I60, C26 I23).
- **I25** — **Every removal of a layer emits exactly one change carrying that layer's id, synchronously, before the removing call returns** — `pop` from `pop()`, `dismiss` with its reason from `dismiss(id)` and from the push's disposable — and a call that removes nothing emits nothing. An owner holding state about a layer can therefore run its teardown from the subscription alone, whichever caller removed the layer; C16's ⌃c ladder is the caller that never asks an owner, and this is the only way it reaches one (§2, → C28 I50).
- **I26** — **`blocking` and `dismissal` are independent, and both are declared** (§2c, R-QST-001, R-BLK-822). `blocking` says whether the layer owns input; `dismissal` says what closes it — `escape`, `focus` or `answer`. Neither is inferred from the other, from the kind, or from the layer's geometry: *a question declares blocking and owner explicitly*, and a typed reply is the combination that proves the fields are two — it blocks, it floats above a live prompt, and it is still not escapable. The single `dismissable` flag answered three questions at once and was right only while their answers agreed.
- **I27** — **A `panel` is anchored, non-blocking and closed by `escape`**, and `push` and `update` refuse any other combination (§2c, R-BLK-779, R-BLK-776). *Floats above the prompt, between two rules* is a placement relative to something, so `centred` is a confirm's (§4; `fill`, which this also refused, is deleted — parked 3); and the two fields are fixed rather than declared because a blocking panel is an overlay and a panel that outlives `esc` is a peek — the kind is the name for exactly this triple, and a panel free to vary them would be a fourth kind wearing a third one's name.
- **I28** — **Pushing a `blocking` layer first dismisses every open `panel`**, each with its own change and its own reason, before the new layer is pushed (§2c, R-BLK-873). *A panel is a thing you opened; a question is a thing that arrived* — the arriving one cannot silently sit under something the reader was reading, and two layers differing on escapability make `esc` ambiguous. It lives here rather than in the caller because it is a rule about what the stack may hold, and a rule every caller must remember is the shape C16 §6 measured the cost of.

  **The subject is the panel and not every escapable layer**, which the first draft of this invariant got wrong in the direction that reads as more general. R-BLK-873 names both parties — *a panel is DISMISSABLE and a question is NOT*, and *THE PANEL CLOSES FIRST* — so the rule is about the pair it names. Read as *every `escape` layer*, it closed a **view**: a confirm raised over a dashboard took the dashboard with it, which is a full-region thing the reader is inside rather than a transient they opened above the prompt. **The instance is gone and the scoping is not** (F1254): the generalisation was invisible while a view was the only other escapable kind nobody had tested it against, T4.2 is where it showed, and the rule still has to say *panel* rather than *escapable* because a peek is escapable-adjacent and untouched by an arrival.

---

## 8. Commitments

1. Every layer is one mechanism with a declared placement and a declared kind; there is no pushed view (I23, R-EXA-082).
2. Layer content is blocks, so overlays are themed, degradable and measurable like everything else (I4).
3. Overlays sort above panels and panels above peeks, regardless of push order (I23).
4. ~~A `fill` layer has no producer, and the three refusals written against it are what keep the placement~~ — **the placement is deleted, and the three refusals keep their live subjects** (I20, I22, I27; §4, parked 3).
5. `Esc` pops the top dismissable layer; a confirm is not escapable (I3).
6. Placement flips before clamping (I7).
7. Truncation is reported; the owner renders its own indicator (I8).
8. No backdrop dimming — terminals render it as a fault, not as depth (I11).
9. `layout()` is pure and needs no resize invalidation (I5).
10. A dismissal records why it happened; C15 records the reason and never detects it (I10).
11. C15 emits pop events and writes nothing to the transcript; a pop appends nothing at all (I9, A01 D7).
12. Push returns a disposable equivalent to dismissal (I13).
13. A layer changes in place through `update` — content, placement or width, never the stack's shape and never its escapability (I14).
14. A zero-height overlay is omitted from the layout rather than dismissed by it (I15).
15. An overlay's width is its owner's to declare, and its content is measured at that width; `left` follows from it (I16, I6).
16. An anchor is a span rather than a row, and an overlay never covers it while either side has room (I17).
17. Both clamps have a floor of one row, so a short region never silently swallows a layer (I18).
18. The terminal cursor is placed by whatever holds focus and hidden when that thing has none; a layer states its own in `Placed`, and C17's `cursorCell` is unchanged because it has no notion of focus (I19).
19. A centred layer declares its own width, and both entry points refuse one that does not — the absent-width default is an anchored layer's, and a centred layer that inherits it sits at `left` 0 while reading as centred (I20, I16).
20. A peek is a third kind and never `top`, so it takes no keys, is never popped and leaves C16's ladder untouched (I21).
21. A peek is anchored, and both entry points refuse one that is not (I22).
22. `overlay › panel › peek › base`, whatever the push order, and the same ordering is the scroll priority (I23, I2).
23. Approval is the confirm layer with a call's content, and a subagent is a tab (I24).
24. A removal reaches the owner through the change stream, synchronously and exactly once, whoever called it (I25).
25. A layer declares `blocking` and `dismissal` separately; neither is inferred from the other, from the kind or from the geometry, and a typed reply blocks while floating above a live prompt (I26, §2c).
26. A `panel` is anchored, non-blocking and closed by `escape`, refused at both entry points in any other combination (I27).
27. A blocking layer arriving closes every open **panel** first, each with its own change; a peek is untouched (I28).

---

## 9. Tests

Six tiers. Every cell of the §6 transition table is covered.

### Tier 1 — unit

- **T1.21** (I20): a centred layer pushed with no width → refused, naming the layer. **The frame is the control**: the same layer with a width placed beside a region-width anchored layer at the same region, read for a `left` that differs — without it the row asserts a throw and says nothing about the state the throw prevents, which is a centred layer at `left` 0.
- **T1.22** (I20): a layer pushed **anchored** and updated to `centred` with no width → refused, and the layer is left exactly as it was. The route the push-time check cannot see, and the assertion on the survivor is the half that matters: a guard that throws after mutating leaves a layer neither placed nor removed.
- **T1.20** (I19): a layer carrying a cursor and a layer carrying none, placed → the first's `Placed.cursor` is relative to its own origin and survives the flip from `below` to `above`; the second's is absent. Both, because a field that is always present and always ignored passes any test of the first alone — and the two live producers answer oppositely, which is why this is a field.

- **T1.23** (I21): `push(peek)` on empty → stack of one and `top` is `null`; a second peek → stack of two, `top` still `null`, `hasView` false.
- **T1.24** (I21, I23): a peek pushed **after** an overlay → `top` is the overlay and `layout()` places the peek beneath it; a peek pushed after a panel → `top` is the panel and the peek is beneath it; a peek pushed between a panel and an overlay → placed beneath both. **Reached through `push`**: a peek can legitimately arrive in any order, so the sort is exercised by the manager and not only by T2.8's hand-built stack.
- **T1.25** (I21, I3): `pop()` with a peek beneath a dismissable overlay → the overlay goes and the peek stays; `pop()` with only a peek → `null` and the peek stays; `dismiss(peekId)` → removes it and emits `dismiss`, never `pop`.
- **T1.26** (I22): a `centred` peek (with a width) → refused by `push`, naming the layer; an anchored peek updated to `centred` → refused, and the layer is left exactly as it was.
- **T1.1**: `push(overlay)` on empty → stack of one, `top` is it.
- **T1.2**: an anchored overlay on empty → stack of one, `top` is it, and `layout()` places it. **Re-aimed off `hasView`** (F1254), **then off `fill`** (parked 3): what is left to assert is that the stack holds and exposes one layer.
- **T1.3**: two overlays → LIFO order, `top` is the second.
- **T1.4** (I23): a centred overlay pushed over a panel → the overlay is `top` and the panel is beneath it.
- **T1.5**: `pop` with two overlays → removes the top one only.
- **T1.6**: `pop` with only one overlay → empty.
- **T1.7** (I13): `dismiss(id)` removes that specific layer from any depth; the returned disposable does the same.
- **T1.8** (I23): `pop` with a panel plus an overlay → the overlay goes first.
- **T1.9** (I3): `pop` on a non-dismissable top → returns null, stack unchanged.
- **T1.10**: `dismiss` on a non-dismissable layer → removes it. Explicit resolution always works.
- **T1.11**: **retired with the placement** (parked 3). It read *`fill` placement → `top` 0, `left` 0, full region height and width*.
- **T1.12** (I14): `update` on a layer at any depth changes its content and leaves `stack`, its order, `top` and `hasView` identical; a `content` change is emitted.
- **T1.13** (I14): `LayerUpdate` has no `dismissable` — a compile-level test rejects `update(id, { dismissable: true })`, which is the only form the restriction can take.
- **T1.14** (I16): a layer declaring `width: 40` in a 120-cell region → `Placed.width` 40, and its content was measured at 40, not 120. The height differs from the region-width measurement, which is the point.
- **T1.15** (I16, I6): a `centred` layer of width 40 in a 120-cell region → `left` 40. Odd remainders round down, deterministically (T3.12).
- **T1.27** (I24, §2b): `approvalPrompt`'s options pushed through the confirm host produce a layer of kind `overlay` whose blocks are the invocation notice, the `warn` consequence when supplied and none when not, and the host's 3-column choice table with `always allow` as an ordinary row; `activeTarget` answers `overlay` while it is up; resolving *deny* pops it and the entry beneath reads `denied`.
- **T1.28** (I25): a layer whose owner holds state, popped by a **non-owner** calling `pop()` → the owner's subscriber saw one `pop` change carrying the layer's id **before `pop()` returned**, and the owner's state is gone by the time the caller reads it; `dismiss(id)` on the same layer → one `dismiss`; `dismiss` of an id not on the stack → no change at all. **Moved off C28's view** (F1254), which was the owner whose state was a profiler tier and a timer; it is written in `test/unit/overlay.test.ts` against an owner that keeps a flag, because what the row is about is the **ordering of the change against the call's return** and not what the state happens to be.

- **T1.29** (I26, R-QST-001): `blocking` and `dismissal` are read from the layer and from nowhere else — a region-height non-blocking layer is not modal and a one-row blocking layer is, which is the pair `coversRegion` answered backwards. The combination that proves them independent is the typed reply's: `blocking: true`, `dismissal: "answer"`, anchored above a live prompt.
- **T1.30** (I3, I26): `pop()` removes an `escape` layer, leaves an `answer` layer, and leaves a `focus` layer — three values, three answers, in one stack. The old row asserted two of the three because only two existed.
- **T1.31** (I27): `push` refuses a centred panel, a blocking panel and a panel whose `dismissal` is not `escape`; the control is the anchored non-blocking `escape` one, which is accepted. `update` is checked on the same three, because `LayerUpdate` admits `placement`.
- **T1.32** (I28, R-BLK-873): with a panel and a peek on the stack, pushing a blocking overlay leaves the peek and the overlay — the panel is gone, its change carried its id and the reason `explicit`, and it was emitted **before** the push returned. The control is pushing a *non*-blocking overlay, which leaves the panel where it was.
- **T1.33** (I23, R-BLK-779): a stack pushed in every order sorts `peek · panel · overlay` bottom-first, asserted as the whole sequence of ids rather than by the top alone — a sort is a property of the list, and the first member is the degenerate one. **The overlay is a non-blocking advisory**, because I28 makes *a panel beneath a blocking layer* a stack this component will not hold: a row using a question would be asserting the sort over three bands while claiming four.

### Tier 2 — contract / interface

- **T2.1** (I5): `layout()` called a hundred times on the same stack and region returns deeply equal results and performs no I/O. It is `update` that makes this assertable — with content as a thunk, the same stack and region could legitimately return two answers.
- **T2.2** (I6): over a fuzz corpus of stacks × regions from 1×1 to 400×200, no placed layer exceeds the region on either axis or is placed negatively on either. Both offsets, both extents, four assertions.
- **T2.3** (I4): every `Layer` in the corpus carries `Block[]`; a compile-level test rejects a React element in `content`.
- **T2.4** (I1, I2, I6, I14): a thousand random sequences of `push`, `pop`, `dismiss` and `update` — **sequences, not single calls**, and I1, I2 and I14 are asserted after *every* step rather than at the end. A component holding state is tested over its history: an invariant that constrains each operation says nothing about the path, and that is where C12, C13 and C14 each hid a defect.
- **T2.5** (I9): the module graph shows no import from C13 in `overlay/` (MG13).
- **T2.6** (I12): the module graph shows no import from `terminal/` or C14.
- **T2.8** (I23): placement over a stack built by hand with an overlay beneath a peek → the peek is placed first and the overlay last. Reached without `push`, because `push` sorts on the way in and a stack in the wrong order is otherwise unconstructible.
- **T2.9** (I16, T3.5b): the anchor span, over a corpus of anchor rows and extents from 1 to 5 in regions of every height → the placed overlay never intersects `[row, row + rows − 1]` on either side of the flip.
- **T2.10** (I21, I23): T2.4's random sequences with `push(peek)` added → after **every** step `top` is never a peek and `layout()` lists every peek before every panel before every overlay.
- **T2.7**: every `OverlayChange` variant is emitted by at least one operation — `push`, `pop`, `content` and both `dismiss` reasons, `explicit` and `anchorEvicted`. The second reason is emitted by a caller passing it, which is the whole of I10.

### Tier 3 — edge cases

- **T3.1**: `pop` on empty → null, no throw.
- **T3.2**: `dismiss` with an unknown id → no-op.
- ~~**T3.3**, **T3.4**, **T3.4b**~~ — **struck with I1** (F1254, R-EXA-082). Three rejections of `push(view)` onto a non-empty stack, in the three shapes a stack can have. There is no `push(view)`.
- **T3.5** (I7): an overlay preferring `below` at a row with 2 rows beneath and 12 above → **flips above and shows its full height**. The classic bug, tested directly. A control above it asserts the fixture is taller than the room below, so a fixture that fits either way cannot report a pass.
- **T3.5b** (I7): the same overlay against a prompt **two rows tall** — `row: 18, rows: 2` in a twenty-row region → the menu occupies rows 10–17 and touches neither prompt row. Both the single-row readings overlap it, and both produce a self-consistent `Placed`, so this is asserted as a frame and not only as numbers.
- **T3.6** (I7): neither side fits → the larger side is taken and clamped; `truncated` true.
- **T3.7**: an overlay taller than `maxHeightFraction` of the region → clamped, `truncated` true. A control asserts the same overlay is *un*truncated in a taller region, so a fixture that is always truncated cannot report a pass.
- **T3.7b** (I7): the fraction clamp is applied before placement and the fit clamp after — asserted by an overlay that would flip differently if the two were swapped. The pair of clamps sharing a word is what makes this worth its own test.
- **T3.8** (I17, I18): region height 1 → the overlay occupies 1 row, truncated, no negative arithmetic. It covers its anchor, which is the one case I17 permits and the reason I17 is qualified rather than absolute: with no room on either side the alternatives are covering the anchor or vanishing, and vanishing is the one that looks like a dropped keystroke.
- **T3.8b** (I18): an overlay in a region of 1 row with the default fraction → placed, not omitted. `floor(1 × 0.5)` is zero and the floor is what stops that reading the layout.
- **T3.9** (I16): a layer declaring a width wider than the region → clamped to the region, content measured at the clamped width, `left` 0, nothing overflows horizontally.
- **T3.10**: an anchor row outside the region → clamped to the nearest edge, not vanished.
- **T3.11** (I10): `dismiss(id, "anchorEvicted")` → the layer is removed and the change carries that reason; `dismiss(id)` carries `explicit`. C15 is the recorder, so the test is over what it reports, not over what it noticed.
- **T3.17** (I14): `update` with an unknown id → `false`, no change emitted, stack untouched. It does not push.
- **T3.18** (I14, I5): `update` changes what the next `layout()` returns, and only the updated layer's `Placed` differs.
- **T3.19** (I15): a layer updated to empty content → omitted from `layout()`, still on the stack, no change emitted by `layout()` itself. The narrowing-to-zero-candidates case, end to end.
- **T3.12**: `centred` in a region of even and odd height → deterministic rounding, never off-by-one between renders.
- **T3.13** (I15, I5): an overlay measuring 0 rows (empty content) → omitted from the result rather than drawing a zero-height border. It is *not* dismissed by `layout()`: a pure function does not act on what it computed.
- **T3.14**: twenty nested overlays → all tracked, LIFO order preserved, layout stays within budget.
- **T3.15**: disposing a disposable twice → second is a no-op.
- **T3.16**: disposing a layer already popped → no-op, does not remove a newer layer that reused nothing.

### Tier 4 — integration

- **T4.1** (with C09): overlay content measures through the same registry as transcript blocks; heights agree with what is rendered.
- **T4.2** (with C09, C10): an overlay in both themes and at 1-bit has identical geometry.
- **T4.3** (with C02, C09): under `unicode: "ascii"`, overlay borders use ASCII and the height is unchanged.
- **T4.4**: **retired with the placement** (parked 3). It read *a `fill` layer occupies exactly the viewport region; header and footer are untouched*.
- **T4.5** (with C14, I14): an overlay anchored to a transcript row follows it as the viewport scrolls — by its owner recomputing the region row and calling `update(id, { placement })` — and clamps at the edges. C15 is driven here, not subscribed.
- **T4.5b** (with C16): `pop()` returning `null` is disambiguated by `top` — the Ctrl-C ladder falls through with an empty stack and no-ops with a non-dismissable layer, and the two are distinguished without reading the return value.
- **T4.6** (with C16): `top` determines input priority; an overlay over a panel routes keys to the overlay.
- **T4.7** (with C19): the completion menu pushes an anchored overlay and renders its own "N more" from `Placed.truncated`.
- **T4.7b** (with C19, I14): typing narrows the candidate set through `update`, not through a pop and a push — asserted by the change log, which holds one `push`, N `content` and one `pop` rather than N of each.
- **T4.9** (with C25): a layer whose content is a single block is carried by `Block[]` with no special case, and `Placed` never gains a scroll offset. **Re-aimed off the fullscreen patch** (F1254): that layer was C25 §3b's pushed view, its `n`/`p` paging went with it, and what the row was ever about is that this component holds no offset of its own.
- **T4.10** (with C16, I21): a graph with a focused table row and a peek on the stack → `router.target` is `liveBlock`, `↓` moves focus to the next row and `⏎` fires the row's action — the three keys a plain overlay was measured to steal.
- **T4.11** (with L4, C26 §5): the trace in §2a, driven through the graph's stdin — `↓` onto a row declaring `detail` pushes one peek anchored at that row; `↓` onto a row without one dismisses it; `↓` onto a third with one pushes again; `Esc` leaves the block and the stack is empty. Asserted on the stack **and on the frame**: the peek's first painted row is the element's row plus one, and every transcript row the peek does not cover is byte-identical to the same frame without the peek.
- **T4.12** (with C23, I14): the focused entry is patched so the cut cell's text changes → the peek's content changes through one `content` change, with no `pop` and no `push`.
- **T4.8** (with L4): popping a layer emits a `pop` change and the transcript is untouched — same entry count, same live id, before and after. C15 writes nothing and L4 appends nothing (A01 D7).

### Tier 5 — e2e

- **T5.1**: a completion menu near the bottom of the terminal flips above the prompt and shows every candidate.
- **T5.2**: reverse-i-search raised over a completion menu → both stacked, keys go to the search, `Esc` returns to the menu.
- **T5.3**: a confirm raised over a completion menu → drawn above it, `Esc` does nothing, `n` resolves it. **The menu is closed by the arrival** (I28), which is the half this row gained when the dashboard it named stopped existing.
- **T5.4**: resizing the terminal with three layers open → all reposition correctly, none escapes the region, no blank frames.
- ~~**T5.5**, **T5.6**~~ — **struck with the view kind** (F1254, R-EXA-082). Both were `Esc` from a pushed view — the logs view and the fullscreen patch — asserting that the pop left the transcript untouched and the selection intact. There is nothing to press `Esc` on: a diff expands in place and logs are a block with follow, so the reader never leaves the transcript and the property the rows protected is the one the design makes structural. The transcript's own `Esc` behaviour is C22's and is asserted there.

### Tier 6 — fail-on-revert

- **T6.24** (I26): `blocking` derived from `dismissal !== "escape"` rather than declared → T1.29 fails, because a non-blocking overlay closed by `answer` and a blocking one closed by `escape` are both expressible and neither is derivable. The revert that reads as removing a redundant field and is exactly the conflation the split undid.
- **T6.25** (I28): the dismissal of escapable layers moved into the caller that raises a question → T1.32 fails for every *other* caller. The revert that keeps one consumer working, which is how a rule becomes a thing each caller has to remember.
- **T6.26** (I23): the sort's `panel` band removed → T1.33 fails, and a panel raised before a peek draws under it. The revert that passes every row asserting `top`, because `top` is unchanged by where the band sits.
- **T6.1** (I7): clamping before flipping → T3.5 fails, and menus become inexplicably small near the bottom.
- **T6.2** (I23): removing the sort from `layout()` → T2.8 fails. It was I2's row and the argument for aiming it at a hand-built stack was that `push(view)` was rejected onto any non-empty stack, so nothing reached through `push` could construct a mis-ordered one. **The kind is gone and the aim is still right** (F1254): `push` sorts on the way in, so a stack in the wrong order is only ever built by hand.
- **T6.4** (I3): letting `Esc` dismiss a confirm → T1.9 fails; a stray keypress answers a question the user did not read.
- **T6.5** (I4): rendering an overlay with raw React → T2.3 fails, and the overlay stops being themed or measurable.
- **T6.6** (I9): writing to the transcript from C15 → T2.5 fails and L2 gains a dependency on the transcript's contents.
- **T6.7** (I6): an off-by-one in clamping → T2.2 fails across the corpus.
- **T6.8** (I8): rendering an overflow indicator inside C15 → T4.7 fails, since C15 cannot know what the remainder is.
- **T6.9** (I5): caching layout results across regions → T2.1 fails after a resize.
- **T6.10** (I7): reading I7 as "flip before *any* clamp" and moving the fraction clamp after the flip → T3.7 and T3.7b fail. The revert that a correct-sounding sentence invites.
- **T6.11** (I3): making `pop()` search downwards for the first dismissable layer → T1.9 fails, and `Esc` under a confirm closes the menu beneath it.
- **T6.12** (I16): measuring content at `region.width` rather than at the resolved width → T1.14 fails, and a narrow confirm is drawn shorter than it is.
- **T6.13** (I6): omitting `left` from `Placed` → T1.15 and T2.2 fail, and C16 cannot hit-test a centred confirm.
- **T6.14** (I14): widening `LayerUpdate` to include `dismissable` → T1.13 fails, and C16's Ctrl-C ladder starts depending on when it looked.
- **T6.15** (I17): computing the anchored sides from `row ± 1` rather than from the span → T3.5b fails, and a menu lands on the second line of a two-row prompt while every number in `Placed` agrees with every other.
- **T6.16** (I18): dropping either clamp's floor of one row → T3.8 and T3.8b fail, and a short terminal loses its overlays entirely rather than showing them badly.
- **T6.18** (I21): making `top` return the topmost layer of any kind → T1.23, T1.25 and T4.10 fail; a peek becomes `overlay` to C16 and steals `↓`, `⏎` and `Esc` from the element it describes — the measured cell.
- **T6.19** (I23): sorting peeks with the overlays → T1.24 fails, and a confirm raised over a peek is drawn beneath it.
- **T6.20** (I22): dropping the placement check for peeks → T1.26 fails, and a centred peek sits over the transcript as a confirm with nothing to answer it.
- **T6.21** (§2a): the emitter not reconciling on the next focus move → T4.11's second row fails, and the detail of row `a` sits beside row `b`.
- **T6.17** (I20): moving the width check into `confirm.ts` — where it lived as a comment — → T1.21 and T1.22 both fail. **The revert that reads as a tidy-up**: the comment was correct, was written after the defect, and constrained exactly one caller. The second centred layer in the tree (`clearConfirmLayer`, C20) declares no width at all.
- **T6.22** (I24): the approval pushed as a `peek` → T1.27's `activeTarget` assertion fails and `⏎` reaches the transcript instead of the choice; the consequence line drawn when none was supplied → T1.27's block count fails.
- **T6.23** (I25): emitting the removal change on a microtask rather than before the call returns → T1.28's *before `pop()` returned* fails, and an owner answers *still open* for one turn after the ladder has already popped its layer; removing the `pop` emission → T1.28 fails and the owner's teardown never runs. **The measured instance was C28's view holding a raised profiler tier** (F944) and is gone with it; what the revert costs is the same and the owner is now a confirm with an answer in flight or a menu with a selected row.

---

## 10. Out of scope

| Not here | Where |
|---|---|
| Routing keys to the top layer | C16 |
| What the completion menu contains | C19 |
| Reverse-search behaviour | C20 |
| The dashboard's panels and refresh | S13 |
| Whether a popped layer records anything in the transcript | L4 — and after A01 D7's amendment it records nothing |
| Scroll state beneath an overlay | C14 |
| Scrolling anything | C14, over the transcript. No layer scrolls: a thing long enough to need it is an entry (R-EXA-082, §4) |
| Noticing that a layer's anchor row moved or was evicted | Its owner, through `update` and `dismiss(id, "anchorEvicted")` |
| The width an overlay would like to be | Its owner. Measurement answers height at a width, never the reverse |
| Backdrop effects | Rejected — terminals render dimming as a fault |
