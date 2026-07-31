# C16 — Input router

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `tui-kit` |
| **Layer** | L3 interaction |
| **Depends on** | C15 (`top`, `layout` for hit-testing) · C14 (scroll ops, `entryAtRow`; copy mode as an injected `exitCopyMode` while C14 §6 is unbuilt) · C13 (live entry) · C02 (`bracketedPaste`, `mouse`) · C06 (`busy`, `cancel` — the highest-precedence Ctrl-C branch) |
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

Where `bracketedPaste` is unavailable (C02 §4), C16 falls back to a timing heuristic: more than 8 characters within 30 ms with no intervening escape is treated as a paste, and a notice is committed on first use so the user knows the behaviour is approximate.

**Ink 7 changed two key semantics** worth knowing before wiring this: backspace
arrives as `key.backspace` rather than `key.delete`, and a plain `Escape` no
longer sets `key.meta`. The second matters for §2's escape-sequence
disambiguation — a lone `Esc` and an escape-sequence prefix are told apart by the
documented window, not by a modifier flag.

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

It is a focus *location*, not a bit — when focus is in the live block, which row holds it is part of the same fact and has no separate owner. C09's `FocusState` is derived from this plus C13's `liveId`. `↓` from the prompt moves focus into the live block's rows; `Esc` returns it. C16 owns it, and **it resets to `{at: "prompt"}` on every C13 append** — running a command always returns focus to where the next one is typed.

**L4 makes that reset as a call, and C16 does not subscribe to C13.** The information path is named here because leaving it implicit is how the same duty gets implemented twice or not at all. A subscription is constructible — `TranscriptView` exposes `subscribe` and C16 already takes the view — and it is the wrong mechanism, for a reason that is about the data rather than about layering: `Change` carries a single `append` kind, so a subscriber cannot tell a command outcome from a notice append (§2's bracketed-paste notice is one). The sentence above says *running a command* returns focus to the prompt, and only the caller knows it ran a command. So `resetFocus()` is on the interface and C23 §4's submit row calls it.

It also keeps C16 off a delta stream. C14 is the component that paid for being the second consumer of one, in a blank screen that every assertion passed.

**Pushing a view does not clear it, and popping does not either.** A01 D7 requires that popping a pushed view returns to a still-live block *with selection preserved*, and the pop appends nothing (C23 §4), so the stored location survives the whole push/pop cycle. Only an append resets it.

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
1  in-flight verb + Ctrl-C          → cancel, consume        (§5)
2  handlers for activeTarget()      → first consumer wins
3  handlers for "global"            → shortcuts
4  otherwise                        → dropped
```

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

Mouse events are dropped entirely when `capabilities.mouse` is false, before decoding (T3.12).

**Exactly one handler consumes a key.** No broadcast, no bubbling past the first consumer. Multiple handlers on one target are tried in registration order.

Unconsumed keys are dropped silently rather than inserted anywhere. A printable character arriving while the dashboard has focus does nothing — it does not leak into the prompt behind it.

---

## 5. Hierarchical Ctrl-C

Ctrl-C means "stop the most immediate thing", and what that is depends on context (`j22` #10).

| Context | Behaviour |
|---|---|
| **A verb is in flight** | Cancel it (C06's escalation ladder). **Takes precedence over everything** |
| A piped shell child is running | Forward `SIGINT` to the child |
| A dismissable overlay is on top | Dismiss it |
| A non-dismissable overlay is on top | No-op — a confirm is not cancellable by Ctrl-C |
| Copy mode | Exit copy mode |
| A pushed view | Pop it |
| Prompt with text | Clear the input |
| Prompt empty | Arm the exit confirm; a second within 500 ms raises it |

**Both overlay rungs sit above copy mode, and the order is not this spec's to choose.** A02 §2 and C14 §6 both put `overlay` above `copyMode` — "a confirm raised over copy mode still wins" — and an earlier draft of this table had copy mode above both. A ladder that disagrees with focus priority is two answers to "what does this key mean now", and the one that loses is whichever the reader did not consult.

The defect it produced is the one C15's fourth drawn frame already found, one rung lower: Ctrl-C on an unanswered confirm raised over copy mode **exited copy mode behind it**, leaving the confirm over a screen that had changed. **Moving only the dismissable rung does not fix it** — a non-dismissable confirm would then fall through to copy mode and do the same thing. The two rungs move together or neither does, which is why they are adjacent here and why a test asserts the pair rather than the first of them.

**Three of those rungs are one question C15 answers in two parts.** `pop()` returns `null` both when the top layer refuses to be popped and when there is no layer at all, and this ladder needs those apart: one is a no-op and the other falls through to the prompt. So it reads `top` — `null` is the fall-through, `dismissable: false` is the no-op — and calls `pop()` only in the branch that should pop (C15 §3).

The collapsed form, `if (pop()) handled`, does not merely send Ctrl-C nowhere. A `null` from a non-dismissable confirm falls through to whatever rung comes next, and every rung below it acts on something *underneath* the confirm: it exits copy mode, or it **pops the pushed view beneath it** — Ctrl-C on an unanswered confirm closes the dashboard behind it and leaves the confirm sitting over a screen that changed. Found by drawing the frame for C15's fourth walk case, which is also where the requirement that the frame be byte-identical came from.

Note that the reorder above widened this hazard rather than narrowing it: the three layer rungs used to be consecutive, and copy mode now sits between the confirm's no-op and the view's pop. The fall-through has one more wrong thing to do, which is an argument for reading `top` rather than an argument against the order.

**Rung 2 is the piped shell child, and it used to name the pass-through child, which cannot reach here.** A pass-through child runs through A02 Seam 4's `lifecycle.suspend()` → `runner.handoff()`, and C21 I6 makes `handoff` *refuse* while raw mode is still set. With raw mode suspended C16 receives no stdin at all: the terminal delivers `SIGINT` to the foreground process group directly, and the rung had no constructible case for the children it named.

The `shell` route is a different thing and is reachable. It goes through `spawnShell` rather than `C06.invoke`, so `busy` is false and rung 1 does not catch it, which is what leaves a real gap for this rung to fill.

**Making `spawnShell` set `busy` instead was rejected.** It would put a foreground shell command under C06's concurrency guard, and C23 I5 already owns that condition at a different scope — C23's guard is authoritative and C06's is the backstop. Two guards over one condition is how they drift.

**Cancellation outranks everything** because it is the most consequential and most time-sensitive intent. A user hitting Ctrl-C while a promote is running means the promote, not the dashboard they happen to be looking at. Stating the precedence matters — the alternative reading is defensible, and leaving it implicit guarantees the two get implemented differently.

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
| 1 | In-flight verb | `C06.busy`, any focus target | T1.11 |
| 2 | Piped shell child | a `shell` route running; `busy` false | T3.11 |
| 3 | Dismissable overlay | completion menu or reverse search on top | T1.1x |
| 4 | Non-dismissable overlay | a confirm on top — **over anything**, including copy mode and a view | T1.12, T1.12b |
| 5 | Copy mode | `copyMode` true, no layer on the stack | T4.3 |
| 6 | Pushed view | a view on the stack, no overlay above it | T5.3 |
| 7 | Prompt with text | `StoredFocus.at === "prompt"`, buffer non-empty | T5.3 |
| 8 | Prompt empty | as above, buffer empty | T1.9, T1.10 |

Two rows earned their place by being hard to fill. Rung 2's column said
"pass-through child" and could not be written at all. Rung 4's said "a confirm on
top" until the question "on top of *what*" was asked, which is what exposed the
order defect — rungs 3 and 4 have to dominate 5 and 6, not merely precede 3's old
neighbours.

**One rung is missing and this is where it shows.** No row covers Ctrl-C while
`StoredFocus.at === "liveBlock"`. It falls through to rungs 7 and 8, which is
probably right — Ctrl-C returning the user to where they type is consistent with
I2 — and it is stated nowhere, so the fall-through is an accident that happens to
be correct. Left as a question rather than answered here.

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

**Surfaces contribute bindings through the block.** A surface is not a component and cannot register a handler, so an adapter may attach a `BlockKeymap` to the block it produces. C16 merges it into the `liveBlock` target **while that block is live**, and withdraws it when the block freezes — so `s` sorts a `/ps` table and does nothing once a newer entry arrives.

**Conflict detection at startup**: two bindings for the same `(target, key)` is a construction error, not a last-wins. A block keymap colliding with a global binding is the same error, raised when the block is committed rather than at startup — the global always wins, and a silent shadow would be worse than a loud refusal.

---

## 7. State machine

Two small machines, both with an injected clock.

**Exit arming**

| From ↓ / event → | Ctrl-C at empty prompt | any other key | 500 ms elapse |
|---|---|---|---|
| **idle** | → armed (T1.9) | idle | — |
| **armed** | → confirm raised (T1.10) | → idle (T3.8) | → idle (T3.9) |

**Paste buffering** (bracketed paste available)

| From ↓ / input → | `CSI 200~` | bytes | `CSI 201~` |
|---|---|---|---|
| **normal** | → buffering (T1.4) | dispatch as keys | ignored (T3.5) |
| **buffering** | ignored (T3.6) | buffered, not dispatched (T1.5) | → normal, emit one paste (T1.6) |

---

## 8. Invariants

- **I1** — Focus is derived on every dispatch from C15, C14 and C13, plus exactly one stored **location** (`StoredFocus`) owned by C16.
- **I2** — That **location** resets to `{at: "prompt"}` on every C13 append, and the reset arrives as a `resetFocus()` call from L4 rather than through a subscription. C16 subscribes to no change stream: `Change` has one `append` kind, so a subscriber could not tell a command outcome from a notice, and the rule is about running a command. "Bit" was this invariant's original word and §3 is the correction — which row holds focus is part of the same fact.
- **I3** — Mouse events route by position, never by focus target, and are dropped when the capability is absent.
- **I4** — Exactly one handler consumes an event; there is no bubbling past the first consumer.
- **I5** — Unconsumed events are dropped, never inserted into a lower target.
- **I6** — A paste emits one `paste` event regardless of length.
- **I7** — Cancellation of an in-flight verb outranks every other Ctrl-C meaning.
- **I8** — Ctrl-C never dismisses a non-dismissable overlay, **and never acts on anything beneath one**. The second clause is the load-bearing half and the original wording lacked it: forbidding only the dismissal leaves every lower rung reachable, so Ctrl-C on an unanswered confirm exits the copy mode or pops the view behind it and changes a screen the user is not looking at. Not dismissing the confirm is small comfort when the thing under it moved.
- **I9** — C16 reads no ambient clock; timing is injected.
- **I10** — The keymap is data; duplicate `(target, key)` bindings fail at construction.
- **I11** — C16 never calls the frame scheduler. L4 commits.
- **I12** — Bytes buffered during a paste are never dispatched as individual keys.
- **I13** — C16 imports nothing from `terminal/`; raw mode is C01's and decoding is data-in.
- **I14** — No chord support beyond modifiers. Terminals send no key-up event, so a two-key chord cannot be distinguished from two keystrokes without a timeout, and a timeout would make the same input mean different things at different typing speeds.
- **I15** — `activeTarget` is pure over its inputs.
- **I16** — Ctrl-D is dispatched only when the editor buffer is empty, and it opens a confirm rather than exiting. With text present it is consumed and discarded — never treated as EOF, and never as a delete-forward, because a keystroke that sometimes ends the session and sometimes edits the line is one nobody presses twice.

---

## 9. Commitments

1. C01 sets raw mode; C16 decodes the bytes (I13).
2. Focus is derived from what is on screen, plus one stored location — including which row — that resets only on append, and only because L4 says so (I1, I2).
3. Mouse events route by position through C15 then C14; keys route by focus (I3).
4. A paste is one event, whatever its size; the no-bracketed-paste fallback is a documented heuristic (I6, I12).
5. No chord support beyond modifiers — terminals send no key-up (I14).
6. Exactly one handler consumes an event; unconsumed events are dropped (I4, I5).
7. Ctrl-C cancels an in-flight verb ahead of every other meaning (I7).
8. Ctrl-C never dismisses a confirm, and never reaches past one to the screen beneath (I8).
9. Ctrl-D at an empty prompt confirms exit; with text it does nothing (I16).
10. Double-tap timing is 500 ms on an injected clock (I9).
11. The keymap is declarative data, so a binding is added in one place (I10). `/help` renders from it, and that rendering is C23's (→ C23 I26).
12. Duplicate bindings fail at construction (I10).
13. C16 never commits a frame; L4 does (I11).

---

## 10. Tests

Six tiers. Every cell of both §7 tables is covered.

### Tier 1 — unit

- **T1.1**: byte sequences decode to the documented keys — plain, ctrl, meta, arrows, function keys, `Esc`. Twenty cases.
- **T1.2**: a lone `Esc` byte is distinguished from an escape sequence prefix by the documented disambiguation window.
- **T1.3** (I15): `activeTarget` returns the documented target for each of the six conditions.
- **T1.3b** (I2): moving focus to `liveBlock`, then `resetFocus()` → focus is back at `prompt`, and the stored `rowId` is gone with it.
- **T1.3b2** (I2): a C13 append with no `resetFocus()` call leaves the stored location untouched — the reset is the caller's, and a router that quietly subscribed would pass T1.3b while failing this.
- **T1.3c** (I3): a click at a transcript row resolves to that row's block, not to the focused target.
- **T1.3d** (I3): a click inside an overlay's placed region resolves to the overlay even when focus is elsewhere.
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
- **T1.13**: Ctrl-D at an empty prompt arms the same confirm; with text present it is a no-op.

### Tier 2 — contract / interface

- **T2.1** (I1): a spy proves `activeTarget` is recomputed on every dispatch, never cached across events.
- **T2.2** (I15): `activeTarget` called a thousand times on the same inputs returns the same result and performs no I/O.
- **T2.3** (I9): a source scan finds no clock reference in `input/`.
- **T2.4** (I10): a keymap with a duplicate `(target, key)` fails at construction, naming both bindings.
- **T2.5**: every `FocusTarget` in the union has at least one default binding — exhaustive over the type.
- **T2.6** (I11): a source scan finds no scheduler call in `input/`.
- **T2.7** (I13): the module graph shows no import from `terminal/`.
- **T2.8**: `register` returns a disposable; disposing removes the handler mid-session.

### Tier 3 — edge cases

- **T3.1**: a paste of 100,000 characters → one event, delivered within budget, no per-character work.
- **T3.2**: a paste containing `CSI 201~`-like bytes in its payload → terminated only by a true end marker.
- **T3.3**: a paste containing control characters → stripped before the event is emitted (C09 I18 at the input boundary).
- **T3.4**: an unterminated paste — start marker, then the stream stalls → after a 1 s timeout the buffer is flushed as a paste rather than swallowing input forever.
- **T3.5**: an end marker with no start → ignored.
- **T3.6**: a second start marker while buffering → ignored, not nested.
- **T3.7**: the timing heuristic with `bracketedPaste: false` — 12 characters in 20 ms → one paste; 3 characters in 200 ms → three keys.
- **T3.8**: any key between two Ctrl-Cs → disarms.
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
- **T6.5** (I4): broadcasting to every handler → T1.7 fails and actions fire twice.
- **T6.6** (I5): falling through to the prompt on an unconsumed key → T1.8 fails and typing in the dashboard edits the hidden prompt.
- **T6.7** (I9): using a real timer for the double-tap → T2.3 fails and the test flakes.
- **T6.8** (I10): last-wins on duplicate bindings → T2.4 fails.
- **T6.9** (I11): committing a frame from C16 → T2.6 and T4.4 fail.
- **T6.10** (I12): flushing the paste buffer as keys on timeout → T3.4 fails.
- **T6.11**: expressing bindings as conditionals → T4.9 fails, and help drifts from behaviour.
- **T6.12** (I2): failing to reset focus on append → T1.3b fails, and the next command is typed into a table.
- **T6.13** (I3): routing mouse events through focus priority → T1.3c fails, and clicks land on the wrong block.

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
