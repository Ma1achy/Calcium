# C16 — Input router

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
| **Layer** | L3 interaction |
| **Depends on** | C15 (`top`, `layout` for hit-testing) · C14 (scroll ops, `entryAtRow`; copy mode as an injected `exitCopyMode` while C14 §6 is unbuilt) · C13 (live entry) · C02 (`bracketedPaste`, `mouse`) · C23 (`inFlight`, `cancel` — the two highest-precedence Ctrl-C branches) |
| **Consumed by** | C17 editor · C19 completion · C20 history · L4 |
| **Source** | A01 D3, D6 · A02 §2 focus priority · `j22` #10 |
| **Status** | Draft |

---

## 1. Purpose

Every keystroke has to reach exactly one place. C16 decodes raw stdin into key events, decides which layer owns the keystroke, and dispatches it there.

The rule that keeps it honest: **focus is derived, never stored.** It is computed from what is actually on screen — C15's stack top, C14's copy mode, C13's live entry — rather than tracked in a variable that something has to remember to update. A stored focus drifts from the display, and the symptom is keys going somewhere invisible, which is close to undebuggable from a user report.

---

## 2. Key decoding

C01 puts the terminal in raw mode; C16 interprets the bytes. That split is deliberate — raw mode is terminal *state*, decoding is *input*.

```typescript
type Key = Readonly<{
  name:     string;                   // "a", "enter", "escape", "up", "tab", "backspace"
  ctrl:     boolean;
  meta:     boolean;                  // alt
  shift:    boolean;
  sequence: string;                   // the raw bytes, for diagnostics
}>;

type InputEvent =
  | Readonly<{ kind: "key";   key: Key }>
  | Readonly<{ kind: "paste"; text: string }>
  | Readonly<{ kind: "mouse"; row: number; col: number; button: string; press: boolean }>;
```

**A paste is one event, not N key events.** Bracketed paste wraps content in `CSI 200~` … `CSI 201~`; C16 buffers between the markers and emits a single `paste`. Ten thousand characters arriving as ten thousand key events would each trigger a completion recompute and a frame commit, which is a hang rather than a slowdown.

Where `bracketedPaste` is unavailable (C02 §4), C16 falls back to a timing heuristic: more than 8 characters within 30 ms with no intervening escape is treated as a paste, and a notice is committed on first use so the user knows the behaviour is approximate. The machine is enumerated in §7 and its one qualification to I6 is stated there.

**One consumer consequence, because only C17 sees it and nobody would look for it.** C17 I5 makes each `paste` event exactly one undo unit, and on this path a large paste is several events — so **undo after a hundred-thousand-character paste returns it in chunks rather than all at once.** Both invariants hold; it is their composition that surprises. Acceptable on a degraded path the notice already flags as approximate, and written down here rather than discovered by someone testing undo on a terminal without bracketed paste.

**Ink 7 changed two key semantics** worth knowing before wiring this: backspace
arrives as `key.backspace` rather than `key.delete`, and a plain `Escape` no
longer sets `key.meta`. The second matters for §2's escape-sequence
disambiguation — a lone `Esc` and an escape-sequence prefix are told apart by the
documented window, not by a modifier flag.

**The window is 50 ms**, and until C16 was implemented this section called it "the
documented window" while documenting no number — every other constant here is
written down, so the omission was an oversight rather than latitude.

It is a compromise, not a measurement. Below roughly 25 ms a slow link splits a
real sequence and `Esc` fires spuriously in the middle of an arrow key; above
roughly 100 ms a deliberate `Esc` feels sticky. 50 sits centrally in that range and
is where terminal libraries have converged — `vim`'s `ttimeoutlen` default is the
same number.

**It is capability-independent and deliberately not tunable.** A user reaching for
a knob here is working around a link slow enough that the terminal is already
unusable, and the knob's effect would be to make that failure intermittent instead
of consistent. One constant, one behaviour, one bug report.

**A suspension discards whatever was half-decoded, through `reset()`** (I18). Three of this component's states span more than one chunk — a lone `Esc` waiting out its 50 ms window, a paste accumulating between its markers, a run of printables inside the heuristic's window — and all three survive a gap in the byte stream by design, because a gap is what a slow link looks like. A suspension is a different gap: the bytes in it went to a child (C01 I18), and the pending state on the far side of it belongs to a sequence that will never be completed. Resumed without a reset, the next real keystroke completes a sequence begun before `vim` started — an arrow key arriving as an unrelated letter, or a paste emitted with a child's keystrokes inside it.

`reset()` discards the pending bytes, the paste buffer and the escape window, and **emits nothing**: the flush rule that turns accumulated printables into keys (§7) is about a window closing, and this window did not close, it stopped mattering. The call is the shell's, on resume, because C01 delivers bytes and interprets none and C16 owns no timer — neither of them knows a suspension ended. That makes it C22's orchestration, and §4's ordering is where it is written down.

Terminals send no key-up events and repeat held keys as fresh presses, so there is no chord support beyond modifiers. Saying so prevents someone designing a keymap that cannot work.

---

## 3. Derived focus

```typescript
type FocusTarget =
  | "overlay" | "copyMode" | "pushedView" | "prompt" | "liveBlock" | "global";

function activeTarget(deps: Readonly<{
  overlayTop: Layer | null;
  copyMode:   boolean;
  liveEntry:  TranscriptEntry | null;
  promptFocused: boolean;
}>): FocusTarget;
```

Resolution order, first match wins:

| Condition | Target |
|---|---|
| An overlay is on top of C15's stack | `overlay` |
| C14 is in copy mode | `copyMode` |
| A view is on C15's stack | `pushedView` |
| The prompt holds focus (the default) | `prompt` |
| Focus has been moved into the live block | `liveBlock` |
| — | `global` |

Copy mode sits above `pushedView` because it takes every key, including inside the dashboard; only a confirm raised over it wins (A02 §2).

`prompt` and `liveBlock` are the one pair that is genuinely a mode, and therefore the **one piece of stored focus state** in the system:

```typescript
type StoredFocus =
  | Readonly<{ at: "prompt" }>
  | Readonly<{ at: "liveBlock"; rowId: string | null }>;
```

It is a focus *location*, not a bit — when focus is in the live block, which row holds it is part of the same fact and has no separate owner. C09's `FocusState` is derived from this plus C13's `liveId`. `↓` from the prompt moves focus into the live block's rows; `Esc` returns it.

**`↓` is one binding with two effects, in order** (I22). The prompt's `↓` is
`historyNext`, and this section's sentence says the same key enters the live
block — two claims on one keystroke, which stood for four components with
neither implemented: `enterLiveBlock` had no caller anywhere and focus could
never leave the prompt in a live session, so C11's row keys were unreachable and
`activeTarget` returned `liveBlock` for nobody.

They are not competing cases. **C20's navigation already has a defined bottom** —
`↓` past the newest entry restores the stashed draft — so entering the live block
is what `↓` does *after* that end rather than instead of it. One key, one
conceptual thing: move down through what is below the cursor. `historyNext`
therefore gains one clause: with navigation inactive or already at the bottom, it
enters the live block instead.

**Focus must be able to come back, or entry is a session with no prompt.** Two
ways, and both are advertised: `Esc` at the live block returns to the prompt —
which S01's footer already prints as `esc prompt` — and `↑` from the *first*
focusable row returns as well, mirroring the entry. Between rows, `↑` and `↓`
move the selection.

**And a live block with nothing focusable cannot be entered.** A notice or a raw
block has no rows, so entering would put focus somewhere with nothing in it:
`activeTarget` answers `liveBlock`, every key resolves against a target with no
bindings, and they are dropped — the *somewhere invisible* symptom derived focus
exists to prevent. The clause is a no-op in that case and `↓` does what it did
before, which is nothing. Whether an entry is row-navigable is a question about
the block and is answered from the block (C11's `focusableRowIds`, I14); C16
takes the ids as data and holds no opinion about what a row is. C16 owns it, and **it resets to `{at: "prompt"}` on every C13 append** — running a command always returns focus to where the next one is typed.

**L4 makes that reset as a call, and C16 does not subscribe to C13.** The information path is named here because leaving it implicit is how the same duty gets implemented twice or not at all. A subscription is constructible — `TranscriptView` exposes `subscribe` and C16 already takes the view — and it is the wrong mechanism, for a reason that is about the data rather than about layering: `Change` carries a single `append` kind, so a subscriber cannot tell a command outcome from a notice append (§2's bracketed-paste notice is one). The sentence above says *running a command* returns focus to the prompt, and only the caller knows it ran a command. So `resetFocus()` is on the interface and C23 §4's submit row calls it.

It also keeps C16 off a delta stream. C14 is the component that paid for being the second consumer of one, in a blank screen that every assertion passed.

**Pushing a view does not clear it, and popping does not either.** A01 D7 requires that popping a pushed view returns to a still-live block *with selection preserved*, and the pop appends nothing (C23 §4), so the stored location survives the whole push/pop cycle. Only an append resets it.

**One row of the dispatch trace argues this better than the paragraphs above it.** `↓` is bound on two targets — it moves the completion menu's highlight, and it moves focus from the prompt into the live block's rows. Press it with a menu open and it goes to the menu; dismiss the menu and press it again and focus enters the table. Nothing tracked the change, nothing was notified, and no handler asked which mode the session was in: the menu's presence on C15's stack *is* the fact, and `activeTarget` reads it on the way past.

A stored focus gets this right until the one path that forgets to update it — and the symptom is not a crash but `↓` scrolling a table the user cannot see while they stare at a menu.

Everything else is derived from something visible. The precise claim is therefore: focus is derived from visible state plus exactly one stored location, whose owner and reset condition are both named. A second piece of stored focus would be a design change, not an implementation detail.

---

## 4. Dispatch

Handlers register against a target and return whether they consumed the event.

```typescript
interface InputRouter {
  register(target: FocusTarget, handler: (e: InputEvent) => boolean): Disposable;
  dispatch(e: InputEvent): boolean;
  resetFocus(): void;                 // L4 calls this on append (§3, I2)
  readonly target: FocusTarget;
}
```

```
0  the exit-arming machine observes    → always, before anything (§7)
1  in-flight verb + Ctrl-C            → cancel, consume         (§5)
2  handlers for activeTarget()        → first consumer wins
3  handlers for "global"              → shortcuts, unless a
                                        non-dismissable layer is on top
4  otherwise                          → dropped
```

**Step 3 is skipped when the top layer is non-dismissable, and this is a rule rather than six special cases.** A layer that must be answered is modal, and a global shortcut firing beneath one acts on a surface the user cannot see — the same defect as a missing rung, one layer up.

It is deliberately *not* "skipped whenever an overlay is on top". A completion menu is dismissable, and switching theme or scrolling beneath one costs nothing and surprises nobody. `dismissable: false` is the property that means must-be-answered, which is why C15 refuses to let it change mid-life (C15 §2): a modality gate that depended on *when* it looked would be the same defect this closes.

**I8 is an instance of this, not a rule of its own.** It was written about Ctrl-C, and Ctrl-C was simply the first key anyone traced past a confirm; every other global binding walked through the same door until this step existed.

### Mouse events route by position, not focus

A click is positional. Sending it through focus priority would deliver a click on a transcript row to whatever happens to hold focus, which is never what the user meant.

```
1  a layer covers the point (C15 layout)   → that layer
2  the point is in the viewport region     → C14's entryAtRow maps row → entry
                                              and row offset (C14 I19), and
                                              C11 resolves a row action
3  header or footer                        → global
4  otherwise                               → dropped
```

Wheel events are the exception: they are directional rather than targeted, and go to C14 unless a layer covers the pointer.

"Covers the point" is both axes, and C15's `Placed` carries `top`, `left`, `height` and `width` for this reason — a centred confirm's horizontal extent is not recoverable from the region and the layer alone (C15 I6, F3 of that spec's interface pass). Nothing here computes a layer's position; it reads the one C15 placed.

**Both rungs test a region row, and the event carries a terminal row** (I20). A decoded mouse event is 0-based and absolute; rung 2 subtracts the region's top before asking C14, and rung 1 must subtract it before comparing against `Placed.top`, because a layer's box is placed relative to the viewport region (S01 §3a, C15 I6). The two ran in different coordinate systems — adjacent lines of one function, one of them translating and one not — and the symptom is a click near a layer's edge resolving to the row above the one it landed on, which reads as a placement error in C15 rather than as a missing subtraction here. Neither rung recomputes anything: one number is translated once, and both rungs use it.

Mouse events are dropped entirely when `capabilities.mouse` is false, before decoding (T3.12).

**Exactly one handler consumes a key.** No broadcast, no bubbling past the first consumer. Multiple handlers on one target are tried in registration order.

Unconsumed keys are dropped silently rather than inserted anywhere. A printable character arriving while the dashboard has focus does nothing — it does not leak into the prompt behind it.

---

## 5. Hierarchical Ctrl-C

Ctrl-C means "stop the most immediate thing", and what that is depends on context (`j22` #10).

| Context | Behaviour |
|---|---|
| **A verb is in flight** | Cancel it (C06's escalation ladder). **Takes precedence over everything.** *In flight* is `C23.inFlight`, not `C06.busy` — see below |
| A piped shell child is running | Forward `SIGINT` to the child |
| A dismissable overlay is on top | Dismiss it |
| A non-dismissable overlay is on top | No-op — a confirm is not cancellable by Ctrl-C |
| Copy mode | Exit copy mode |
| A pushed view | Pop it |
| Focus in the live block | Return focus to the prompt, keeping the input; a second Ctrl-C then takes the prompt rungs |
| Prompt with text | Clear the input |
| Prompt empty | Arm the exit confirm; a second within 500 ms raises it |

> **This table documents derived behaviour. It is not a specification, and it is not implemented as a list.** Rungs 3 to 7 are handlers registered on `overlay`, `copyMode`, `pushedView` and `liveBlock`, so the order below **is** `activeTarget`'s order (§3) and the two cannot disagree. Rungs 1 and 2 are the exceptions and stay pre-dispatch, because a verb in flight and a shell child are not focus targets and so have no target to register on.
>
> Said this loudly because the alternative already happened. The order defect corrected below existed *only* because the ladder was written as an independent table, and a second priority list beside the first will drift from it again — through the same door, on the next edit that touches one and not the other. If this table ever disagrees with §3, §3 is right and this is stale.
>
> **One consequence: the rung reachability table below becomes derivable.** A rung with no constructible state is now a *target* with no constructible state, which `activeTarget`'s own tests already cover. That is a check moving from hand-maintained to structural, which is the trade this component keeps making.

**Rungs 1 and 2 ask C23 what is in flight, and asked C06 and the runner until C23's walk.** C23 I5 says it plainly — *C23's guard is authoritative; C06's is a backstop* — and rung 1 was wired to the backstop, through `RouterDeps.busy` supplied as `runner.live.length > 0`.

The gap that leaves is not a corner. C23 I3 appends the pending entry **before** invoking the transport, deliberately, because three hundred milliseconds of interpreter startup otherwise read as a dropped keystroke. Through that whole window C23 holds its guard and no process exists, so `C06.busy` is false, every rung declines, and Ctrl-C clears the prompt instead of cancelling. The entry stays pending, the guard stays held, and every later submission is refused for the rest of the session. C23 T3.4 asserts that this case works, and nothing in the tree could produce it.

**So `busy` becomes `inFlight`, and it returns the route rather than a boolean** — `null | "app" | "local" | "shell"`. A boolean was the thing that could not be right: C23's guard covers every foreground route (I5), so a boolean sourced from it would make rung 1 fire on a `shell` delegation and swallow rung 2 entirely, which is this table's own unconstructible-rung defect created by fixing the one above it. Rung 1 takes `app` and `local` — cancel the submission, and C23 decides what that means for each. Rung 2 takes `shell` — forward `SIGINT`, so the child sees the signal it would have seen from a terminal. That is C23 T4.7's two behaviours, kept apart by the component that knows which is running.

**This vindicates the rejected alternative below rather than reversing it.** Making `spawnShell` set `C06.busy` was refused because it puts a foreground shell command under C06's concurrency guard, and two guards over one condition drift. Correct — and the conclusion is not that C06 should answer differently but that C06 should not be asked. The fact is C23's; it was being read from whichever collaborator happened to have a related flag.

**And it is rung 7's lesson through the other door.** There a constructible state had no rung and the ladder answered confidently with the next one down. Here both rungs exist and ask the wrong component whether their state holds — and a ladder always returns something, so it is a confident wrong answer either way. What distinguishes this one is that no state column could have caught it: rung 1's state *is* constructible and *is* tested. The disagreement is about who owns the fact, which a reachability table does not ask.

**Both overlay rungs sit above copy mode, and the order is not this spec's to choose.** A02 §2 and C14 §6 both put `overlay` above `copyMode` — "a confirm raised over copy mode still wins" — and an earlier draft of this table had copy mode above both. A ladder that disagrees with focus priority is two answers to "what does this key mean now", and the one that loses is whichever the reader did not consult.

The defect it produced is the one C15's fourth drawn frame already found, one rung lower: Ctrl-C on an unanswered confirm raised over copy mode **exited copy mode behind it**, leaving the confirm over a screen that had changed. **Moving only the dismissable rung does not fix it** — a non-dismissable confirm would then fall through to copy mode and do the same thing. The two rungs move together or neither does, which is why they are adjacent here and why a test asserts the pair rather than the first of them.

**Three of those rungs are one question C15 answers in two parts.** `pop()` returns `null` both when the top layer refuses to be popped and when there is no layer at all, and this ladder needs those apart: one is a no-op and the other falls through to the prompt. So it reads `top` — `null` is the fall-through, `dismissable: false` is the no-op — and calls `pop()` only in the branch that should pop (C15 §3).

The collapsed form, `if (pop()) handled`, does not merely send Ctrl-C nowhere. A `null` from a non-dismissable confirm falls through to whatever rung comes next, and every rung below it acts on something *underneath* the confirm: it exits copy mode, or it **pops the pushed view beneath it** — Ctrl-C on an unanswered confirm closes the dashboard behind it and leaves the confirm sitting over a screen that changed. Found by drawing the frame for C15's fourth walk case, which is also where the requirement that the frame be byte-identical came from.

Note that the reorder above widened this hazard rather than narrowing it: the three layer rungs used to be consecutive, and copy mode now sits between the confirm's no-op and the view's pop. The fall-through has one more wrong thing to do, which is an argument for reading `top` rather than an argument against the order.

**Rung 2 is the piped shell child, and it used to name the pass-through child, which cannot reach here.** A pass-through child runs through A02 Seam 4's `lifecycle.suspend()` → `runner.handoff()`, and C21 I6 makes `handoff` *refuse* while raw mode is still set. With raw mode suspended C16 receives no stdin at all: the terminal delivers `SIGINT` to the foreground process group directly, and the rung had no constructible case for the children it named.

The `shell` route is a different thing and is reachable. It goes through `spawnShell` rather than `C06.invoke`, and it is what `C23.inFlight` reports as `shell` — which is what keeps this rung apart from rung 1 now that both read the same source.

**Making `spawnShell` set `busy` instead was rejected.** It would put a foreground shell command under C06's concurrency guard, and C23 I5 already owns that condition at a different scope — C23's guard is authoritative and C06's is the backstop. Two guards over one condition is how they drift.

**The live-block rung is new, and it is a change rather than a description.** The table had no row for focus being in the live block, so it fell through to the prompt rungs — meaning Ctrl-C while navigating a table *cleared the prompt behind it*, a side effect on a surface the user is not looking at. That is I5's principle broken by omission: an event that finds no rung for the target that owns it should not act on a lower one.

Under the ladder's own rule, "stop the most immediate thing", the most immediate thing while focus is in a table is being in the table. So the rung returns focus to the prompt and keeps whatever was typed, which makes Ctrl-C the coarse partner of `Esc` (§3) rather than a duplicate of it, and a second Ctrl-C then behaves exactly as it would have from the prompt. Nothing is lost and nothing invisible changes.

It was found by writing the reachability table below and having no state to put in one of the rows — the same table that caught the reorder and rung 2. **"Correct by accident" is one reorder away from wrong**, and a rung that works by falling through is invisible to a reader who resolves the ladder by reading it top to bottom, which is the only thing a ladder is for.

**Cancellation outranks everything** because it is the most consequential and most time-sensitive intent. A user hitting Ctrl-C while a promote is running means the promote, not the dashboard they happen to be looking at. Stating the precedence matters — the alternative reading is defensible, and leaving it implicit guarantees the two get implemented differently.

**`\r` and `\n` are two keys, not one.** In raw mode Enter sends `\r` and Ctrl-J sends `\n`, and the decoder mapped both to `enter` — the obvious reading, and the one that makes C17 I12 unsatisfiable: Ctrl-J is one of the two newline bindings that must work on every terminal, and a binding on `{name: "j", ctrl: true}` would have resolved against an event nothing could produce. That is §5's unconstructible-rung class one layer lower, in the decoder rather than the ladder, and it was found while seeding the keymap rather than by running anything.

It also settles what a newline *inside* an unbracketed paste means. The heuristic path (§7) sees the byte as a control that ends a printable run, and under the old mapping every line of a pasted block arrived as `enter` — submitting each line in turn. As `Ctrl-J` it inserts, which is what a pasting user meant and what bracketed paste already did.

Ctrl-D at an empty prompt takes the same confirm path (`j22` #10). With text present it is a no-op, not a delete-forward, because a stray Ctrl-D that eats a character mid-command is worse than one that does nothing.

The 500 ms window uses an **injected clock**, like C03's scheduler — C16 reads no ambient time, so double-tap timing is testable on a fake clock.

### Every rung, and the state that constructs it

Kept rather than merely run. The two corrections above — the reorder and rung 2 —
both came out of filling this in on paper, before any code existed to test. A rung
whose state column cannot be written is a finding about the ladder, not a test to
delete, and nothing else in the spec would catch a ninth rung added later with no
constructible case.

| # | Rung | Constructed by | Test |
|---|---|---|---|
| 1 | In-flight verb | `C23.inFlight` is `app` or `local`, any focus target | T1.11 |
| 2 | Piped shell child | `C23.inFlight` is `shell` | T3.11 |
| 3 | Dismissable overlay | completion menu or reverse search on top | T1.1x |
| 4 | Non-dismissable overlay | a confirm on top — **over anything**, including copy mode and a view | T1.12, T1.12b |
| 5 | Copy mode | `copyMode` true, no layer on the stack | T4.3 |
| 6 | Pushed view | a view on the stack, no overlay above it | T5.3 |
| 7 | Focus in the live block | `StoredFocus.at === "liveBlock"`, no layer, not copy mode | T1.14 |
| 8 | Prompt with text | `StoredFocus.at === "prompt"`, buffer non-empty | T5.3 |
| 9 | Prompt empty | as above, buffer empty | T1.9, T1.10 |

Three rows earned their place by being hard to fill, and each was a different
defect.

Rung 2's column said "pass-through child" and could not be written at all —
unreachable behaviour.

Rung 4's said "a confirm on top" until the question "on top of *what*" was asked,
which is what exposed the order defect: rungs 3 and 4 have to dominate 5 and 6, not
merely precede 3's old neighbours.

Rung 7 had no row. Its state — focus in the live block, nothing layered above —
is perfectly constructible and every rung above it declined, so the ladder answered
with rung 8 and cleared a prompt the user could not see. **A missing rung is not a
gap in the table; it is a wrong answer given confidently**, because a ladder always
returns something. That is why re-running this table after adding a rung is part of
the rule rather than a courtesy: rung 7's arrival renumbered two rows, and a row
whose number moved is a citation somewhere that did not.

---

## 6. Keymap

Bindings are declarative data, not conditionals inside handlers.

```typescript
type Binding = Readonly<{
  target: FocusTarget;
  key:    Readonly<{ name: string; ctrl?: boolean; meta?: boolean; shift?: boolean }>;
  action: string;
}>;

const defaultKeymap: readonly Binding[];

type BlockKeymap = readonly Readonly<{
  key:    Binding["key"];
  action: string;
}>[];
```

Data because Phase 1B adds user-defined bindings and a keymap expressed as branching code cannot be overridden, listed, or shown in help. `/help` renders the keymap from this table, so documentation cannot drift from behaviour.

**An action is a name, and C16 executes none of them** (I19). Resolving `historyPrev` into a call on C20 would put L3's router in charge of L3's history store and L2's overlay stack, which is the reaching A02 Seam 4 forbids; the effect table is L4's, and C22 §3 step 11 is where it lives.

**The built-in action names are a closed set, and that is what makes `/help` honest.** The anti-drift claim has always been that help renders from the table dispatch uses — and until the effects existed, that claim was vacuous in the direction nobody checked: a binding could sit in the table with no executor anywhere, and `/help` would list a key that does nothing. The remedy is the one this project has taken four times before: make it unconstructible rather than checked. `defaultKeymap`'s rows are typed against a `KeyAction` union and L4's table is a total `Record<KeyAction, …>`, so a binding naming an action nobody implements does not compile, and neither does an implementation of an action nobody binds.

**And the closed set was closed over the wrong vocabulary.** Until the editing
bindings landed, `defaultKeymap`'s `prompt` target held eight rows — three
newlines, Tab, right-for-ghost, history up and down, and reverse search — and not
one of them edited. C17 implements word motion, kill, yank, undo and redo in
full; C22's effect table is total over the action union; and the union had no
editing action in it. Every mechanism was satisfied and the vocabulary they were
total over was incomplete, which is A03 §2's vacuity class one level above where
it was last found: **backspace did nothing at a real prompt**, and the row that
found it (C17 T5.4) went *green* while asserting nothing, because the keystroke
under test reached nothing and the two assertions either side of it were about
history navigation, which was bound.

Nobody shipped them because the obligation had two plausible owners and no path:
§6 says the framework binds the concerns it owns and editing is C17's, and C17
has no keymap. The same shape as `frameworkSources`.

**So C17's public surface is the vocabulary** (I21). Every editing operation the
editor exposes has an action, and every action names exactly one of them, which
makes the union derivable from the interface rather than maintained beside it. A
method with no action is the gap that just bit; an action with no method does not
compile.

The bindings are readline's set and no more — what a terminal user already knows,
rather than a scheme this project invented. **Each was pressed through the real
decoder before it was written down** (I17, T2.13b), and one candidate did not
survive: `⌃_` and `⌃⇧-` are the same byte, `0x1f`, and the decoder maps `0x01`
to `0x1a` and stops, so it emits a keyless raw name for it. Widening the decoder
to reach one binding is how a table comes to name keys nothing sends, so that
candidate is dropped rather than met.

**Undo and redo are `⌃z` and `⌥z`**, which is not readline's convention and is
the right trade anyway: an editor with 200-unit structural coalescing and a
kill-append flag, reachable by no key, wastes the component. `⌃z` is the one
binding whose failure mode is that the session *suspends*, so it was confirmed
twice rather than reasoned about — the decoder emits `{name: "z", ctrl: true}`
for `0x1a`, and a real session typing that byte keeps taking input, because raw
mode clears `ISIG` at acquire (C01 §2). `⌥z` costs nothing: the ESC-prefixed
path is already how `⌥b`, `⌥d` and `⌥f` arrive. `⌃y` is not available for redo —
yank is the readline convention worth keeping.

| Key | Action | | Key | Action |
|---|---|---|---|---|
| `backspace`, `⌃h` | `backspace` | | `delete` | `delete` |
| `⌃w`, `⌥⌫` | `killWordLeft` | | `⌥d` | `killWordRight` |
| `⌃u` | `killToStart` | | `⌃k` | `killToEnd` |
| `⌃y` | `yank` | | `⌃a`, `home` | `home` |
| `⌃e`, `end` | `end` | | `⌥b`, `⌃←` | `wordLeft` |
| `⌥f`, `⌃→` | `wordRight` | | `←` | `left` |
| `⌃z` | `undo` | | `⌥z` | `redo` |

`⌃w` and `⌥⌫` are both word-delete-left, in different traditions; they are
distinct wire forms and no other binding wants either, so both are bound. **`→`
is deliberately absent**: it is already `acceptGhostOrForward`, which falls
through to a character-right move when there is no ghost, so binding it again
would be the duplicate `(target, key)` construction error below.

The set is closed for **built-in** bindings only. A `BlockKeymap`'s action is a surface's string dispatched through C23's block-action route (C23 §3a), and it is open by design — the surface supplies both halves.

**Surfaces contribute bindings through the block.** A surface is not a component and cannot register a handler, so an adapter may attach a `BlockKeymap` to the block it produces. C16 merges it into the `liveBlock` target **while that block is live**, and withdraws it when the block freezes — so `s` sorts a `/ps` table and does nothing once a newer entry arrives.

**Conflict detection at startup**: two bindings for the same `(target, key)` is a construction error, not a last-wins. A block keymap colliding with a global binding is the same error, raised when the block is committed rather than at startup — the global always wins, and a silent shadow would be worse than a loud refusal.

---

## 7. State machine

Two small machines, both with an injected clock.

**Exit arming**

| From ↓ / event → | Ctrl-C at empty prompt | any other **input** | 500 ms elapse |
|---|---|---|---|
| **idle** | → armed (T1.9) | idle | — |
| **armed** | → confirm raised (T1.10) | → idle (T3.8) | → idle (T3.9) |

**"Any other input", not "any other key", and the widening is not pedantry.** A paste is input and a click is input, and the original wording answered for neither. Ctrl-C, a five-thousand-character paste, Ctrl-C — under the narrow reading the second raises the exit confirm, which is the wrong answer to a sequence nobody would read as a double-tap.

**The machine observes every event before dispatch, and disarms even when a handler consumes the event** (§4 step 0). This is the sharper half. The natural implementation registers the disarm as a handler, which is wrong in a way that surfaces only when a *consumed* key fails to disarm — a two-keystroke window that no test hits by accident, and whose symptom is an exit confirm appearing after the user typed something in between. Arming state is a property of the session, not of whoever happened to want that keystroke.

**Paste buffering** (bracketed paste available)

| From ↓ / input → | `CSI 200~` | bytes | `CSI 201~` |
|---|---|---|---|
| **normal** | → buffering (T1.4) | dispatch as keys | ignored (T3.5) |
| **buffering** | ignored (T3.6) | buffered, not dispatched (T1.5) | → normal, emit one paste (T1.6) |

**Paste heuristic** (`bracketedPaste: false`). A02 §7's completeness rule applies: a heuristic that accumulates keystrokes against a window owns a state machine, and §2 described it in prose without enumerating it.

| From ↓ / input → | printable byte | escape byte | 30 ms window elapses |
|---|---|---|---|
| **idle** | → accumulating; buffered, window opens (T1.15) | decoded as a key; stays idle (T3.7b) | — |
| **accumulating** | buffered; window unchanged (T3.7) | → idle: **buffer flushed as individual keys**, then the escape decodes normally (T3.7c) | → idle: more than 8 buffered emits one `paste`; 8 or fewer emit that many keys (T3.7) |

**The escape cell is what prose left open.** §2 says "with no intervening escape" and does not say what becomes of the characters already accumulated. They are flushed as keys — an escape means the run was typing, and typed characters are keys. Discarding them would eat input, and emitting them as a paste would contradict the condition that just failed. The bracketed-paste table above answers its equivalent cell explicitly (T3.6); this one did not.

**Two properties this table makes visible, both consequences rather than choices.**

The window is measured **from the first buffered character, not from the last**, and that is what makes the heuristic discriminate: nine characters spread over 200 ms fall into separate windows of one or two and emit nine keys, while a paste's characters arrive inside a single window and emit one event. A gap-based timer instead of a fixed window fails exactly that case — 200 ms of typing has ~22 ms gaps, which is under the threshold, so the run would never close and nine keystrokes would become a paste.

And **every printable is therefore delayed by up to 30 ms on this path**. That is unavoidable: a decision that depends on what arrives next cannot be made before it arrives, and nothing can un-send a key already dispatched. It is a second reason the §2 notice exists, and it is the honest reading of "the behaviour is approximate".

**I6 is qualified for this path, and the window does not extend.** A paste spanning more than one window emits one event per window. Extending the window while bytes kept arriving would restore the single event and reintroduce precisely what the fixed window was forced to solve — a close condition depending on what arrives next, which nine characters at 22 ms already showed cannot terminate. Separating that case from a real paste would need a second threshold, which is a second heuristic layered on the one the notice already apologises for.

The guarantee I6 was written for survives: bounded work, not a single event. Twenty-five events for a hundred thousand characters is not the hang that ten thousand key events would be.

---

## 8. Invariants

- **I1** — Focus is derived on every dispatch from C15, C14 and C13, plus exactly one stored **location** (`StoredFocus`) owned by C16.
- **I2** — That **location** resets to `{at: "prompt"}` on every C13 append, and the reset arrives as a `resetFocus()` call from L4 rather than through a subscription. C16 subscribes to no change stream: `Change` has one `append` kind, so a subscriber could not tell a command outcome from a notice, and the rule is about running a command. "Bit" was this invariant's original word and §3 is the correction — which row holds focus is part of the same fact.
- **I3** — Mouse events route by position, never by focus target, and are dropped when the capability is absent.
- **I4** — Exactly one handler consumes an event; there is no bubbling past the first consumer.
- **I5** — Unconsumed events are dropped, never inserted into a lower target.
- **I6** — A paste emits one `paste` event regardless of length on the bracketed path. On the heuristic path it emits one event per window: **the guarantee is bounded work, not a single event.** The purpose survives the qualification — I6 exists because ten thousand characters as ten thousand key events would each trigger a completion recompute and a frame commit, a hang rather than a slowdown, and one event per 30 ms window makes T3.1's 100,000 characters roughly twenty-five. It is the literal wording that does not hold. A window that extended while bytes kept arriving would restore the single event and could not terminate, which is the same close-condition problem the fixed window was forced to solve (§7).
- **I7** — Cancellation of an in-flight verb outranks every other Ctrl-C meaning.
- **I8** — **While a non-dismissable layer is on top, no event acts on anything beneath it.** It is never dismissed, no lower focus target is reached, and the `global` fallback does not run (§4 step 3). The invariant was originally about Ctrl-C alone, and Ctrl-C was only the first key traced past a confirm — forbidding the dismissal left every lower rung and every global shortcut reachable, so an unanswered confirm sat over a screen that had changed theme, scrolled, or entered copy mode. Not dismissing the confirm is small comfort when the thing under it moved.
- **I9** — C16 reads no ambient clock; timing is injected.
- **I10** — The keymap is data; duplicate `(target, key)` bindings fail at construction.
- **I11** — C16 never calls the frame scheduler. L4 commits.
- **I12** — Bytes buffered during a paste are never dispatched as individual keys.
- **I13** — C16 imports nothing from `terminal/`; raw mode is C01's and decoding is data-in.
- **I14** — No chord support beyond modifiers. Terminals send no key-up event, so a two-key chord cannot be distinguished from two keystrokes without a timeout, and a timeout would make the same input mean different things at different typing speeds.
- **I15** — `activeTarget` is pure over its inputs.
- **I16** — Ctrl-D is dispatched only when the editor buffer is empty, and it opens a confirm rather than exiting. With text present it is consumed and discarded — never treated as EOF, and never as a delete-forward, because a keystroke that sometimes ends the session and sometimes edits the line is one nobody presses twice.
- **I17** — `\r` and `\n` are **different keys**. `\r` is `enter`; `\n` is `Ctrl-J`, which is what that byte is. Collapsing them is the obvious reading of "the Enter key" and it silently removes one of the two terminal-independent newline bindings C17 I12 requires — a binding that resolves against nothing, which is C16 §5's unconstructible-rung class arriving one layer lower, in the decoder. It also decides what a newline inside an unbracketed paste means: `enter` submits each line of a pasted block, `Ctrl-J` inserts it. **And a modified key carries the same `name` as the unmodified one**: `Alt-Enter` is `{name: "enter", meta: true}`, not `{name: "\r", meta: true}`. That is the same defect one path over — the ESC-prefixed branch passed its character through raw — and it removed the *other* of C17 I12's two terminal-independent bindings, so both of them resolved against events nothing could produce while the keymap read as complete. Found by pressing the bindings through a real decoder in C17's tier 4, not by reading either file. The general rule the two share: **a key the keymap can name must be a key the decoder produces**, and the only way to know is to press it.

  **The sentence says "a key the keymap can name" and the mechanism walked the keymap, which is narrower.** T2.13 traverses `defaultKeymap`; a key named in imperative code is outside the set it was written to cover, and that is where the fourth instance was — C22's `prompt` handler tested `key.name === "return"` while the decoder has only ever produced `enter`, so Enter did not submit. Nothing in this component was wrong; the comparison lived in another file, in a form no table walk reaches. T2.13b covers the other half: **every `key.name === "…"` literal under `src/` must name a key the decoder produces**, with the producible set gathered by pressing rather than declared. Second time a rule's mechanism has been narrower than its sentence, and the remedy both times is to widen the mechanism.

  **Made mechanical, it immediately found a third.** T2.13 walks every row of `defaultKeymap` through a real decoder, and a row with no wire form fails. Shift-Enter has two — `CSI 13;2u` and xterm's `modifyOtherKeys` form `CSI 27;2;13~` — and the decoder discarded both as well-formed-but-unknown, because `u` is not in the letter table and `27` is not in the tilde table. The third of C17 I12's three bindings was unreachable in every terminal that sends it, and the two that a reader would check by hand had already been fixed. `27` is a marker rather than a keycode, so the tilde branch tests it before the table; the codepoint is named through the same `namedControl` the unprefixed byte uses, because a second naming path is exactly how the meta branch came to call Enter `\r`.
- **I18** — `reset()` discards every partially-decoded state — pending bytes, the paste buffer, the escape window — and emits nothing. It exists for the one gap in the byte stream that is not a slow link: a suspension, whose bytes went to a child. The decoder cannot detect that gap itself — it owns no timer and reads no clock beyond the injected one (I9) — so the call belongs to whoever knows the terminal was handed over and taken back, which is L4 (C22 §4, C01 I18).
- **I19** — C16 names actions and executes none. The built-in names are a closed union and L4's effect table is total over it, so a binding with no executor and an executor with no binding are both compile errors — which is what makes `/help` rendering from the dispatch table a property rather than a coincidence. Block keymaps are open strings by design and dispatch through C23 §3a.
- **I20** — A mouse event's row is translated into a region row **once**, and both positional rungs use the result. The event carries a 0-based terminal row; a layer's box and C14's entry map are both relative to the viewport region (S01 §3a, C15 I6). Two rungs of one table in two coordinate systems is a click near a layer's edge resolving to the row above the one it landed on — a wrong answer that reads as a placement defect in the component that placed it correctly.
- **I21** — **C17's public surface is the action vocabulary for editing.** Every editing operation the editor exposes is named by exactly one `KeyAction`, and every editing `KeyAction` names exactly one of them. Totality over the union is what makes `/help` honest (I19), and totality over an incomplete union is honest about nothing: the union held no editing action at all while C17 implemented word motion, kill, yank and undo, so backspace did nothing at a real prompt and every check in the chain passed. Derived from the interface rather than maintained beside it, so a method added to C17 with no action fails rather than going unbound in silence.
- **I22** — `↓` enters the live block only from the bottom of history, `Esc` and `↑`-from-the-first-row leave it, and an entry with no focusable row cannot be entered at all. One binding with two effects in order rather than two bindings competing for a keystroke: C20's navigation has a defined bottom, so entering is what `↓` does after that end. The three halves are one invariant because any one alone is a defect — entry with no exit is a session whose prompt is unreachable, exit with no entry is what shipped, and entry into a block with no rows drops every key silently.

---

## 9. Commitments

1. C01 sets raw mode; C16 decodes the bytes (I13).
2. Focus is derived from what is on screen, plus one stored location — including which row — that resets only on append, and only because L4 says so (I1, I2).
3. Mouse events route by position through C15 then C14; keys route by focus (I3).
4. A paste is one event, whatever its size; the no-bracketed-paste fallback is a documented heuristic (I6, I12).
5. No chord support beyond modifiers — terminals send no key-up (I14).
6. Exactly one handler consumes an event; unconsumed events are dropped (I4, I5).
7. Ctrl-C cancels an in-flight verb ahead of every other meaning (I7).
8. Nothing reaches past a non-dismissable layer — not Ctrl-C, not a lower target, not a global shortcut (I8).
9. Ctrl-D at an empty prompt confirms exit; with text it does nothing (I16).
10. Double-tap timing is 500 ms on an injected clock (I9).
11. The keymap is declarative data, so a binding is added in one place (I10). `/help` renders from it, and that rendering is C23's (→ C23 I26).
12. Duplicate bindings fail at construction (I10).
13. C16 never commits a frame; L4 does (I11).
14. `\r` and `\n` decode to different keys and a modified key keeps the unmodified name, so both of C17's terminal-independent newline bindings resolve against events the decoder actually produces (I17).
15. Every row of `defaultKeymap` is walked through a real decoder, and a row with no wire form fails — the rule made mechanical, which found the third instance (I17).
16. A suspension discards half-decoded state through `reset()`, which emits nothing; the decoder cannot see the gap and the shell calls it on resume (I18).
17. C16 names actions and executes none; the built-in names are closed and L4's table is total over them, so `/help` cannot list a key that does nothing (I19).
18. Both positional rungs test a region row, translated once from the event's terminal row (I20).
20. `↓` at the bottom of history enters the live block; `Esc` and `↑`-from-the-first-row return; a block with no focusable row is not entered (I22).
19. C17's public surface is the editing action vocabulary, and the bindings are readline's; each was pressed through the real decoder before being written down, and a candidate the decoder does not produce is dropped rather than met by widening the decoder (I21, I17).

---

## 10. Tests

Six tiers. Every cell of both §7 tables is covered.

### Tier 1 — unit

- **T1.1**: byte sequences decode to the documented keys — plain, ctrl, meta, arrows, function keys, `Esc`. Twenty cases.
- **T1.2**: a lone `Esc` byte is distinguished from an escape sequence prefix by the documented disambiguation window.
- **T1.3** (I15): `activeTarget` returns the documented target for each of the six conditions.
- **T1.3b** (I2): moving focus to `liveBlock`, then `resetFocus()` → focus is back at `prompt`, and the stored `rowId` is gone with it.
- **T1.3b2** (I2): a C13 append with no `resetFocus()` call leaves the stored location untouched — the reset is the caller's, and a router that quietly subscribed would pass T1.3b while failing this.
- **T1.16** (I18): each of the three pending states, reset and then continued — a lone `Esc` mid-window, a paste between its markers, a run inside the heuristic's window. *Then* the bytes that would have completed each sequence decode as themselves, and `reset()` itself emitted nothing. Three cases rather than one, because a reset that cleared only the escape window passes any single-state test and still emits a child's keystrokes inside the next paste.
- **T1.3c** (I3): a click at a transcript row resolves to that row's block, not to the focused target.
- **T1.3d** (I3): a click inside an overlay's placed region resolves to the overlay even when focus is elsewhere.
- **T1.3b** (I17): `\r` decodes to `enter` and `\n` to `Ctrl-J` — asserted as a pair, because the defect was that they were the same event and either one alone still passes.
- **T1.3c** (I17): `ESC \r` decodes to `{name: "enter", meta: true}` — the name the keymap uses, not the byte.
- **T1.3d** (I17): `CSI 13;2u` and `CSI 27;2;13~` both decode to `{name: "enter", shift: true}`. Both forms, because a terminal sends one or the other and a rule satisfied by either is satisfied on half the terminals.
- **T1.4**: `CSI 200~` enters buffering.
- **T1.5** (I12): bytes during buffering emit no key events.
- **T1.6** (I6): `CSI 201~` emits exactly one `paste` carrying the buffered text.
- **T1.7** (I4): two handlers on one target → the first to return true consumes; the second is not called.
- **T1.8** (I5): an event no handler consumes → dropped; no lower target sees it.
- **T1.9**: Ctrl-C at an empty prompt → armed, no confirm yet.
- **T1.10**: a second Ctrl-C within 500 ms → confirm raised.
- **T1.11** (I7): Ctrl-C with a verb in flight → cancel is invoked and no other handler runs.
- **T1.12** (I8): Ctrl-C with a non-dismissable overlay on top → no-op.
- **T1.12b** (I8): Ctrl-C with a confirm raised over copy mode → no-op, and copy mode is **still active**. The pair, not the first of it: moving only the dismissable rung above copy mode passes T1.12 and fails this.
- **T1.12c** (I8): a key bound on `global` — a theme switch — pressed while a non-dismissable layer is on top → the global handler is **not** called. With a *dismissable* layer on top the same key does reach it, which is what makes this a test of `dismissable` rather than of "an overlay exists".
- **T1.13**: Ctrl-D at an empty prompt arms the same confirm; with text present it is a no-op.
- **T1.15**: a printable byte with `bracketedPaste: false` opens the window and is buffered rather than dispatched — the `idle → accumulating` cell.
- **T1.14** (I5): Ctrl-C with focus in the live block and text in the prompt → focus returns to `{at: "prompt"}` and **the buffer is unchanged**. The buffer assertion is the one that matters: without the rung this passes the focus half by accident and clears the input, which is a side effect on a surface the user is not looking at.
- **T1.14b**: a second Ctrl-C after T1.14 → clears the input, exactly as rung 8 would have from the prompt. The rung defers the prompt behaviour rather than replacing it.

### Tier 2 — contract / interface

- **T2.1** (I1): a spy proves `activeTarget` is recomputed on every dispatch, never cached across events.
- **T2.2** (I15): `activeTarget` called a thousand times on the same inputs returns the same result and performs no I/O.
- **T2.3** (I9): a source scan finds no clock reference in `input/`.
- **T2.4** (I10): a keymap with a duplicate `(target, key)` fails at construction, naming both bindings.
- **T2.5**: every `FocusTarget` in the union has at least one default binding — exhaustive over the type.
- **T2.6** (I11): a source scan finds no scheduler call in `input/`.
- **T2.7** (I13): the module graph shows no import from `terminal/`.
- **T2.8**: `register` returns a disposable; disposing removes the handler mid-session.
- **T2.15** (I22): the three halves, driven as one sequence against a real focus store and a real table — `↓` at the prompt with history available navigates history; `↓` again at the bottom enters the live block; `↑` moves between rows and returns to the prompt from the first; `Esc` returns from anywhere. Written as a sequence rather than four cases because the defect it replaces was an entry with no exit, which every case-at-a-time test passes.
- **T2.15b** (I22): `↓` at the bottom of history with a live entry that has no focusable row leaves focus at the prompt. The control is the same sequence against an entry that does have rows, because a clause that never fires and a clause that always no-ops are the same green.
- **T2.14** (I21): every editing operation on C17's `LineEditor` is reached by some binding in `defaultKeymap`, driven through L4's effect table against a real editor that records which of its methods were called. The non-editing surface — layout, measurement, the diagnostic counters — is named as an explicit exception with its reason, so a method added to C17 joins the covered set or the exception list deliberately. A count would have passed against a union with no editing action in it, which is the state this row was written in.
- **T2.13b** (I17): every `key.name === "…"` literal under `src/` names a key the real decoder emits, against a set collected by pushing bytes through it rather than declared beside it. A declared set is a second table to drift from the decoder, which is the defect this rule is about. The fourth instance was a literal in a handler, which no walk of the keymap could reach.

### Tier 3 — edge cases

- **T3.1** (I6): a paste of 100,000 characters on the **bracketed** path → one event, delivered within budget, no per-character work.
- **T3.1b** (I6): the same paste on the **heuristic** path → one event per window rather than one event, and the assertion is the bound, not the count: the event count is far below the character count and no per-character dispatch occurs. Asserting `=== 1` here would encode the wording I6 no longer makes; asserting a bound encodes the guarantee it does.
- **T3.2**: a paste containing `CSI 201~`-like bytes in its payload → terminated only by a true end marker.
- **T3.3**: a paste containing control characters → stripped before the event is emitted (C09 I18 at the input boundary).
- **T3.4**: an unterminated paste — start marker, then the stream stalls → after a 1 s timeout the buffer is flushed as a paste rather than swallowing input forever.
- **T3.5**: an end marker with no start → ignored.
- **T3.6**: a second start marker while buffering → ignored, not nested.
- **T3.7**: the timing heuristic with `bracketedPaste: false` — 12 characters in 20 ms → one paste; **9 characters in 200 ms → nine keys**, asserted in the same test. The negative case is the positive control: a fixture that only ever sends a fast burst proves the timer exists and not that it discriminates, which is `test/support/README.md`'s rule in the place it is easiest to miss. Nine rather than three, because the count must exceed the threshold — three characters would emit keys under a heuristic that had no threshold at all.
- **T3.7b**: an escape byte from idle → decoded as a key; no buffering begins.
- **T3.7c**: an escape byte mid-run — six printables, then `Esc` → the six emit as six keys and the escape decodes normally. Neither discarded nor emitted as a paste. The cell §2's prose left open.
- **T3.8**: any key between two Ctrl-Cs → disarms.
- **T3.8b**: a **paste** between two Ctrl-Cs disarms; a **mouse click** between two Ctrl-Cs disarms. The two event kinds the original "any other key" did not answer for.
- **T3.8c**: a key between two Ctrl-Cs that a handler **consumes** still disarms — a spy confirms the handler ran and returned true, and the second Ctrl-C arms afresh rather than raising the confirm. The test that separates a machine observing before dispatch from one living in a handler; the latter passes T3.8 and fails this.
- **T3.9**: 501 ms between two Ctrl-Cs → disarms; the second arms afresh.
- **T3.10**: three Ctrl-Cs in rapid succession → one confirm, not two.
- **T3.11**: Ctrl-C during a piped `shell` child → `SIGINT` forwarded, no local handler runs.
- **T3.11b**: during a *pass-through* child C16 receives no input at all — a spy on `dispatch` records nothing between `lifecycle.suspend()` and `resume()`, which is why that case is not a rung. Asserts the absence the §5 table now records.
- **T3.12** (I3): a mouse event with mouse disabled → dropped before decoding, never surfaced as keys.
- **T3.12b** (I3): a wheel event with an overlay under the pointer → goes to the overlay; with none → goes to C14.
- **T3.13**: a malformed escape sequence → discarded; the next valid key decodes normally.
- **T3.14**: a multi-byte UTF-8 character split across two stdin chunks → one key event, correct codepoint.
- **T3.15**: a handler that throws → contained; the event is treated as unconsumed and the session survives.
- **T3.16**: dispatch with an empty handler set → returns false, no throw.
- **T3.17**: focus target changes between two keystrokes → the second goes to the new target with no stale routing.

### Tier 4 — integration

- **T4.1** (with C15): an overlay pushed mid-session takes the next keystroke without any explicit focus call.
- **T4.2** (with C15): a confirm over the dashboard → keys go to the confirm; `Esc` is a no-op; an explicit answer resolves it.
- **T4.3** (with C14): entering copy mode routes every key to copy mode, including inside a pushed view.
- **T4.4** (with C14): `PageDown` at the prompt scrolls the viewport; C16 calls C14's operation and does **not** commit a frame (I11).
- **T4.5** (with C13): `↓` from the prompt moves focus into the live block; `Esc` returns it; a frozen entry never becomes focusable.
- **T4.6** (with C17): printable keys reach the editor; a paste inserts as one edit, undoable as one.
- **T4.7** (with C19): `Tab` reaches completion only when the prompt has focus.
- **T4.8** (with C06): Ctrl-C during a real invocation triggers the escalation ladder.
- **T4.9** (with L4): `/help` renders the keymap from the same table dispatch uses.

### Tier 5 — e2e

- **T5.1**: typing continuously while a stream runs → every keystroke lands, in order, no drops.
- **T5.2**: pasting a 5,000-character command → appears as one edit; the prompt stays responsive.
- **T5.3**: the full Ctrl-C ladder in one session — cancel a verb, exit copy mode, pop a view, clear input, then double-tap to the exit confirm.
- **T5.4**: navigating from prompt into a live table, expanding a row, and returning, with focus visible and correct at every step.
- **T5.5**: a session under `bracketedPaste: false` → the heuristic works, and the notice appears once.

### Tier 6 — fail-on-revert

- **T6.1** (I1): caching the focus target → T2.1 and T3.17 fail; keys go somewhere invisible.
- **T6.2** (I6): dispatching paste bytes as key events → T3.1 fails and a large paste hangs the session.
- **T6.3** (I7): letting an overlay consume Ctrl-C ahead of an in-flight verb → T1.11 fails.
- **T6.4** (I8): allowing Ctrl-C to dismiss a confirm → T1.12 fails.
- **T6.4b** (I8): restoring copy mode above the overlay rungs, or moving only the dismissable one → T1.12b fails, and Ctrl-C on an unanswered confirm changes the screen behind it.
- **T6.4c** (I8): running the `global` fallback under a non-dismissable layer → T1.12c fails, and every shortcut except Ctrl-C acts beneath an unanswered confirm.
- **T6.4d** (I4, §5) — **structural guard, no failing test.** Reimplementing the Ctrl-C ladder as a list of conditions instead of handlers registered on their targets → nothing fails today, and the ladder is free to drift from `activeTarget` on the next edit touching one and not the other. Every other entry in this tier reads *change X → test Y fails*; this one names a change no assertion catches, and says so deliberately. Inventing an assertion that looked like a guard would be worse than pointing at the real one, which is **T2.5's exhaustiveness over `FocusTarget`**: while the rungs are handlers, a target with no binding is a compile-level gap, and the ladder cannot hold an order of its own to disagree with. Read this row as a signpost to that, not as an unfinished test (A02 §7).
- **T6.21** (I22): removing the `Esc` binding at `liveBlock` → T2.15 fails at the return. The regression is a session whose prompt cannot be reached again, and nothing else in the tree notices.
- **T6.20** (I21): removing an editing binding from `defaultKeymap` → T2.14 names the C17 method nothing reaches. The regression is silent everywhere else: the effect table is still total, `/help` still renders, and the key simply stops working.
- **T6.15** (I19) — **structural guard, no failing test.** Widening `KeyAction` to `string`, or making L4's table partial, → nothing fails, and every binding is free to become one `/help` lists and nothing dispatches. The protection is the total `Record`, which is why this row names the shape rather than an assertion: the fourteen bindings had no executor at all while every test here passed, because a table of names is satisfied by names.
- **T6.14** (I18): making `reset()` flush the accumulated run as keys rather than discard it → T1.16's heuristic case fails, and the characters a user typed at `vim` arrive at the prompt when they come back.
- **T6.13b** (§7): registering the disarm as a handler rather than observing before dispatch → T3.8c fails, and an exit confirm appears after the user typed something in between.
- **T6.5** (I4): broadcasting to every handler → T1.7 fails and actions fire twice.
- **T6.6** (I5): falling through to the prompt on an unconsumed key → T1.8 fails and typing in the dashboard edits the hidden prompt.
- **T6.6b** (I5): deleting the live-block rung so Ctrl-C falls through to the prompt rungs → T1.14 fails, and Ctrl-C while navigating a table clears an input the user cannot see. The same defect as T6.6, arriving through an omission rather than through a broadcast.
- **T6.7** (I9): using a real timer for the double-tap → T2.3 fails and the test flakes.
- **T6.8** (I10): last-wins on duplicate bindings → T2.4 fails.
- **T6.9** (I11): committing a frame from C16 → T2.6 and T4.4 fail.
- **T6.10** (I12): flushing the paste buffer as keys on timeout → T3.4 fails.
- **T6.11**: expressing bindings as conditionals → T4.9 fails, and help drifts from behaviour.
- **T6.12** (I2): failing to reset focus on append → T1.3b fails, and the next command is typed into a table.
- **T6.13** (I3): routing mouse events through focus priority → T1.3c fails, and clicks land on the wrong block.
- **T6.9b** (I17): collapsing `\r` and `\n` back into one key → T1.3b fails, C17's Ctrl-J binding resolves against an event nothing produces, and every line of an unbracketed paste submits.
- **T6.9c** (I17): passing the meta path's character through unnamed → T1.3c and C17 T4.2 fail, and Alt-Enter inserts nothing on every terminal.
- **T6.9d** (I17): dropping the CSI-u and `modifyOtherKeys` branches → T1.3d and T2.13 fail, and Shift-Enter is unreachable on every terminal that sends it.

---

## 11. Out of scope

| Not here | Where |
|---|---|
| Editing the input buffer | C17 |
| Tokenising and classifying a submitted command | C18 |
| Completion candidates and the menu | C19 |
| History navigation and reverse search | C20 |
| Scroll arithmetic | C14 |
| The overlay stack | C15 |
| Raw mode, bracketed-paste enabling | C01 |
| Committing frames | L4 |
| User-defined keybindings | Phase 1B — the keymap is already data |
