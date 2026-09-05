# C16 — Input router

| Field | Value |
|---|---|
| **Type** | Component |
| **Package** | `@fmx/calcium` |
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
  | Readonly<{ kind: "key";   key: Key;
               event?: "press" | "repeat" | "release" }>   // only under C02 `keyboardProtocol`
  | Readonly<{ kind: "paste"; text: string }>
  | Readonly<{
      kind:   "mouse";
      row:    number;                   // 0-based terminal row
      col:    number;                   // 0-based terminal column
      button: `button${number}` | "wheelUp" | "wheelDown" | "wheelLeft" | "wheelRight";
      press:  boolean;                  // final byte `M`; `false` is the release, final `m`
      shift:  boolean;                  // bit 4
      meta:   boolean;                  // bit 8
      ctrl:   boolean;                  // bit 16
      motion: boolean;                  // bit 32 — a 1002 drag report, not a fresh press
    }>;
```

**`CSI Z` is `⇧tab`, and it was discarded until a binding needed it** (C26 §4g row c, I17). Every
terminal sends backtab as `ESC [ Z` — the shift is in the final letter, not in a parameter — so
it is a row of its own in the decoder rather than an entry in the letter table, whose finals
carry no modifier. Only the bare form: `CSI 999 Z` is malformed and stays discarded (T3.13),
which the first version of the row got wrong and the existing test caught. Found the way the
other three were, by T2.13 walking the keymap through the decoder — the fourth instance of the
class, and the first found before the row shipped.

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

**Most terminals send no key-up events and repeat held keys as fresh presses**, so there is no chord support beyond modifiers, and a keymap must not be designed around one. Under C02's `keyboardProtocol: "kitty"` (C01 pushes `CSI > 3 u`) a key arrives as `CSI code ; mods : event u` and the decoder carries the event type as an **optional** `event` field on the `kind: "key"` record — `"press"`, `"repeat"` or `"release"` when the sequence says, **absent** otherwise, so every consumer that ignores it is unchanged and `toEqual` records written before it exist unchanged. **Nothing may be reachable only through that field** (C02 I12): a binding that names an `event` filter without a fallback that fires under `"none"` is A03 SS55's violation, and the rule is vacuous today because no binding names one. The same arm decodes `CSI 27 u` as `escape` **whole** — under the protocol a lone `Esc` is never a prefix and the 50 ms window never runs — and names the modifier key codes `57441`–`57452` (`shift`, `ctrl`, `alt`, `super`) so a terminal that sends them produces a named key rather than a private-use glyph, though the flags C01 pushes do not ask for them (C02 §3's table). The arm's modifier bits are kitty's: shift 1, alt 2, ctrl 4; **bit 8 is folded into nothing** — it is xterm's Meta and kitty's Super, and `⌘` arriving as `Alt` is the live-binding class below — and kitty's meta, bit 32, joins alt in `meta` as the `CSI 1;m X` arm already folds them. Stated blind spot: an xterm at `formatOtherKeys=1` loses a Meta modifier through this arm; its default format keeps it.

### `modifiersOf` read three bits of four, and the fourth collapsed onto a live binding

**Measured 2026-08-13 by pressing sequences through the built decoder**, while checking the bindings entry 15's selection model would add. It was a defect in shipped code, not a design input. **Fixed the same day** (T1.3e, `tools/mutate/runs/c16-modifiers.mjs`); the table below is the state it was found in.

xterm's modifier parameter is `1 + (shift 1 | alt 2 | ctrl 4 | meta 8)`. `modifiersOf` mapped bits 1, 2 and 4 — the decoder's `meta` is xterm's **alt** — and **never read bit 8**. So every Meta-modified key lost its modifier silently:

| sent | xterm means | decoder emits |
|---|---|---|
| `CSI 1;9D` | Meta-Left | **`left`** — bare, every modifier gone |
| `CSI 1;10D` | Meta-Shift-Left | **`s+left`** — which is `⇧←`, a *different key* |
| `CSI 1;13D` | Meta-Ctrl-Left | `c+left` |
| `CSI 1;4D` | Alt-Shift-Left | `ms+left` — correct |
| `CSI 1;16D` | all four | `cms+left` — correct **by accident**, since the other three bits are all set |

**This is worse than the unexecuted-binding class and it is the reason to record it separately.** That class is a binding no event can produce: dead, and silent. This is an event decoding as a *different, live* binding — on a terminal that sends Meta rather than Alt, `⌥⇧←` would extend a selection by one character instead of one word, and every assertion written about `⇧←` passes while it happens. A test indexed by "which keys does the decoder produce" agrees, because it produces a perfectly good key.

The fix includes bit 8 in `meta`: the `Key` shape has one alt/meta flag and both bits mean the same thing to every binding above. Splitting them would put the terminal's Option-key configuration into the keymap. **It landed before any shifted-motion binding**, because with it absent the two wire forms of `⌥⇧←` disagree about which key was pressed.

**The test row is the pair, not either form.** T1.3e asserts that `CSI 1;10D` and `CSI 1;2D` decode to *different* keys, and that `CSI 1;4D` and `CSI 1;10D` decode to the *same* one. A row asserting either form alone passes in the broken state — which is exactly what `CSI 1;16D` demonstrates by being correct with the bit unread. **An assertion about one wire form of a two-form key is an assertion about the terminal you happened to test on.**

Four mutations, all caught: the defect restored, bit 8 read *instead of* bit 2 (the careless fix, which breaks the Alt-sending majority every existing test was written against), `shift` claiming bit 8, and the plus-one dropped from the encoding.

**And the ESC-prefixed CSI form is shredded.** `ESC ESC [ 1 ; 2 D` decodes as `m+escape` followed by six printable keys — `[`, `1`, `;`, `2`, `D` — which are text an editor would insert. The roadmap names this as a wire form `⌥⇧←` may arrive in; **no terminal has been measured emitting it**, so this is recorded as an owed check rather than a second defect. The measurement is of the decoder, which is what was run.

### The SGR mouse arm read two bits of eight

**Measured 2026-09-05 by pressing sequences through the built decoder**, the same instrument as the row above; the table is the state it was found in. One line decided everything the event carried:

    const button = code >= 64 ? (code === 64 ? "wheelUp" : "wheelDown") : `button${code & 3}`;

xterm's *ctlseqs* (§Mouse Tracking) lays the SGR 1006 button parameter `Cb` out as a bit field, and the same field is what mode 1002 and the wheel extend:

| bits | value | means | carried as |
|---|---|---|---|
| 0–1 | `Cb & 3` | button 1, 2, 3 — `0`, `1`, `2` | `button0` · `button1` · `button2` |
| 2 | `& 4` | Shift held | `shift` |
| 3 | `& 8` | Meta held | `meta` |
| 4 | `& 16` | Control held | `ctrl` |
| 5 | `& 32` | motion while a button is held (mode 1002) | `motion` |
| 6 | `& 64` | wheel; bits 0–1 select `up 0`, `down 1`, `left 2`, `right 3` | `wheelUp` · `wheelDown` · `wheelLeft` · `wheelRight` |
| 7 | `& 128` | buttons 8–11; bits 0–1 select which | `button8` … `button11` |
| final | `M` / `m` | press or motion report / release | `press: true` / `press: false` |

SGR release carries the *button* in bits 0–1 and the release in the final byte — X10 encoding's `3 = release` value does not occur here. A motion report has the `M` final, so `press: true, motion: true` is a drag and not a second click. The wheel sends no release. What the shipped line did with each:

| sent | xterm means | decoder emitted |
|---|---|---|
| `CSI < 4;10;5 M` | Shift-click | **`button0`**, every modifier gone — shift-click was click |
| `CSI < 16;1;1 M` | Ctrl-click | **`button0`** — the same |
| `CSI < 80;10;5 M` | Ctrl-wheel-up | **`wheelDown`** — `code === 64` was the only wheel-up, so **ctrl-scroll-up scrolled down** |
| `CSI < 66;1;1 M`, `67` | wheel left, wheel right | **`wheelDown`**, both |
| `CSI < 128;1;1 M` | button 8 | **`wheelDown`** |
| `CSI < 32;2;1 M` | drag, button 1 held | **`button0`, `press: true`** — a fresh click at every cell the pointer crossed |

The third row is the live-binding class again, and it is the one a user meets: a wheel with a modifier held reverses. The last is the one nothing downstream could repair — a drag arrived as a stream of presses, so no consumer could tell a drag from a click, and the two fields that would have said so were masked in the line that built the event.

**I30 — a mouse event carries every bit the terminal sent; nothing is masked.** The decoder names each bit and interprets none of them: what a shift-click *does* is §4's and the keymap's. `press` is the final byte and is the release; no second field restates it, because two fields that must agree are a place for two readers to disagree. Horizontal wheel and buttons 8–11 are carried for the same reason the modifiers are — a bit the decoder drops is one no lane above it can put back.

**No terminal emulator has been measured.** The container this was measured in has no Ghostty, kitty or WezTerm; the bit layout is *ctlseqs*' and the four sequences are the decoder's. Which emulators send `66`/`67` for a horizontal wheel and `32` under 1002 is an owed check, recorded here rather than assumed.

**The test rows assert the whole event, not one field.** T1.3k–T1.3n each `toEqual` the full record, because a row asserting `button` alone is satisfied by a decoder that still drops the modifiers — the shipped line passes every `button`-only row for the shift-click. Two mutations, both caught, in `tools/mutate/runs/c16-mouse-decode.mjs`: `code === 64` restored (T1.3k dies) and `& 3` masking the modifiers back out (T1.3l dies).

---

## 3. Derived focus

> **C26 is this section's successor, and nothing here is retracted.** The flat union is what
> a navigation model replaces — see `C26_navigation.md`. Two things in it constrain that
> design rather than being replaced by it: **`FOCUS_ORDER` is the single priority artefact**,
> so C26's interaction mode is a focus target and not a flag consulted first (C26 I2), and
> **I2's `resetFocus()` is a call rather than a subscription**, which C26 inherits for element
> resolution (C26 I11). The measured counts this component actually carries — `pushedView` 9,
> `liveBlock` 4, `copyMode` 0 — are in C26 §1, because the roadmap's table had two of them
> wrong.

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

**The location now names its entry as well** (C26 I21, §4g): the `liveBlock` arm carries `entryId` beside the element address, because focus can be in a settled entry and three readers that each derived the entry from `liveId` were three copies of one constant. C09's `FocusState` is derived from this plus `focusedEntryId()` in L4, which answers the stored entry while it exists and the live one when it does not (C26 I22). The target keeps its name; *live* in `liveBlock` is historical.

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
3  handlers for "global"              → shortcuts, unless the top layer
                                        must be answered OR covers the region
4  otherwise                          → dropped
```

**Step 3 is skipped when the top layer must be answered or covers the region, and this is a rule rather than six special cases.** A layer that must be answered is modal, and a global shortcut firing beneath one acts on a surface the user cannot see — the same defect as a missing rung, one layer up.

It is deliberately *not* "skipped whenever an overlay is on top". A completion menu is dismissable, and switching theme or scrolling beneath one costs nothing and surprises nobody. `dismissable: false` is the property that means must-be-answered, which is why C15 refuses to let it change mid-life (C15 §2): a modality gate that depended on *when* it looked would be the same defect this closes.

#### The second condition, and why one clause was not enough

**A layer that covers the whole region skips step 3 as well, and `dismissable` cannot express it.** A pushed view is dismissable — `Esc` pops it, and it must — so it takes the first clause's permissive branch, and `PgUp` over one falls through to `global` and scrolls the transcript **underneath the thing filling the screen**. That is word for word the defect this step exists to close: a global shortcut acting on a surface the user cannot see. The reason reached the case and the condition did not.

Nothing had ever failed, because nothing in the tree had ever pushed a view (C22 §13). An invariant is vacuous until its subject exists, and this one was about to acquire one.

**The property is coverage, not kind.** `top.kind === "view"` is the narrow fix and it is a proxy: a view skips step 3 because it *covers the region*, which C15 §4 already commits to — `top: 0`, `left: 0`, the region's full height and width — and any other full-region layer would want the same treatment while a kind test would miss it. The router already holds `placed()` and `region()`, so the box is asked about where the box is.

The two clauses are different properties and both are needed. Must-be-answered is about **modality**: a confirm may be one row tall, and a shortcut beneath it acts on something perfectly visible — it is forbidden because the confirm has to be resolved first. Coverage is about **visibility**: a view is escapable at any moment, and a shortcut beneath it acts on something no one can see. Neither implies the other, which is why collapsing them into one test would drop a case whichever one survived.

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

Wheel events go to the layer covering the pointer if there is one; otherwise **to the entry under the pointer first, and to C14 when that entry declines** (§4a). The rung used to send every uncovered wheel straight to C14 as *directional rather than targeted*, and that was true for exactly as long as nothing in the transcript could scroll on its own — a `scroll` block (C04 I48) is a second thing the wheel can mean, and a wheel that always moved the transcript would move the box's frame while leaving the box's content where it was.

A **horizontal** wheel (`wheelLeft`/`wheelRight`, I30) is a wheel for this table's purpose and nothing consumes it. The test was `button === "wheelUp" || button === "wheelDown"` when the decoder could only produce those two, so the day the decoder named the other two directions a horizontal wheel fell through to the entry rung **and was routed as a click on the block under the pointer** — a focus move from a gesture that means *scroll sideways*. `startsWith("wheel")` is the test, so a fifth direction could not do it again.

"Covers the point" is both axes, and C15's `Placed` carries `top`, `left`, `height` and `width` for this reason — a centred confirm's horizontal extent is not recoverable from the region and the layer alone (C15 I6, F3 of that spec's interface pass). Nothing here computes a layer's position; it reads the one C15 placed.

**Both rungs test a region row, and the event carries a terminal row** (I20). A decoded mouse event is 0-based and absolute; rung 2 subtracts the region's top before asking C14, and rung 1 must subtract it before comparing against `Placed.top`, because a layer's box is placed relative to the viewport region (S01 §3a, C15 I6). The two ran in different coordinate systems — adjacent lines of one function, one of them translating and one not — and the symptom is a click near a layer's edge resolving to the row above the one it landed on, which reads as a placement error in C15 rather than as a missing subtraction here. Neither rung recomputes anything: one number is translated once, and both rungs use it.

Mouse events are dropped entirely when `capabilities.mouse` is false, before decoding (T3.12).

## 4a. The pointer's gesture table — a table onto the key effects

**Every mouse affordance has a keyboard equivalent** (C02 `capabilities.ts`), and C26 §5 rules the shape: *the keyboard walks the list; the pointer searches it. One source, so they cannot disagree.* So the pointer is **not a second focus mechanism**. It is a table from gestures onto states the keys already reach, through the same `focus` calls and the same `keys.table` effects — a click lands where `↓`/`tab` would land, a drag where `⇧↓` would, and nothing here can produce a `StoredFocus` a key could not. The mouse arm sits beside `bound()` in L4 (`construct.ts`), for I19's reason one gesture over: C16 routes and executes nothing.

**The pointer → element resolution is one `find` over the same `elementsIn` list the keyboard walks**, at the same width, and it is the one place the two differ in what they need: the keyboard needs reading order and the pointer needs geometry. Two geometric facts the keyboard never had to know, both measured rather than assumed:

- **`rowOffset` is in the entry's height including its chrome** (C14 I20): the command line is drawn above the blocks and is part of the row the index answers with, so the pointer subtracts `chromeRows(entry)` before the element list's rows mean anything. A pointer on the command line has a negative block row and hits no element.
- **A `scroll`'s elements are in content rows, not box rows** (C26 I3 — elements never depend on the offset), so a pointer inside the box is at content row `boxRow + offset`, and a pointer on the residue row or outside the box hits nothing of the box's. This is a structural interaction between two correct rules — *elements are offset-free* meets *the pointer is in screen space* — and a hit test by `rows` alone selects the child **above** the one under the pointer by exactly the offset, a wrong answer inside the bounds.

**Deepest level wins** (C26 §6): a `cell` inside a `row` inside a `block` resolves to the cell. Per-level disjointness (C26 §5 predicate 3) is what makes the answer single-valued within a level.

### The gesture table

Gesture is `button0` unless said otherwise; `press: false` is the release (I30). *Entry* is the entry C14 names for the region row; *element* is the deepest element containing `(blockRow, col)`.

| gesture | where | effect | the key it equals |
|---|---|---|---|
| click | an element, not the focused one | **focus it**: `enterLiveBlock(entry, address)` from the prompt, `focusRow(entry, address)` from a row — one stored shape either way, `anchor: null`, `mode: "navigate"`. The entry may be settled (C26 I21) | `↓` / `↑` / `tab` / `⇧tab` |
| click | the focused element, in `navigate` | **`rowActivate`** — the element's `activate`, dispatched from the focused entry (C23 I37); a settled entry's reaches C23 I18's refusal. No double-click timer: C16 reads no clock (I9) and the terminal has none to offer here; *click again* is a state test, not a timing one | `⏎` |
| click | the focused element, in `interact` | **nothing.** The block owns its keys there (C26 I14) and there is no block pointer vocabulary, so the framework does not fire its own `⏎` through a mode built to keep the framework's keys out | — (a block key) |
| click | an entry row that is no element — chrome, gap, a `scroll`'s residue row, blank space beside a short block | **nothing**, and the event is unconsumed. `element: null` is a location the keys never produce and the frame never highlights, so a click that stored it would change state invisibly — the class the frame-read exists for. I22's third clause one level down: a row with nothing focusable is not entered | — |
| press + `motion` | an element in the **focused** entry | **`extendRow(entry, address)`** — the head moves, the anchor is placed on the first extension and never moved (C26 I16). Motion onto the anchor's own element collapses to `anchor === element`, which is no selection, exactly as `⇧↑` back to the start does | `⇧↓` / `⇧↑` |
| press + `motion` | an element in **another** entry, a non-element row, a layer, chrome | **nothing** — the selection keeps its head. A selection cannot straddle two entries (C26 §4g) and the pointer does not get a wider one than the keys | — |
| wheel | inside a `scroll`'s box | **that box scrolls** by the wheel step, through the same `scrollOffsets` store `blockPageUp/Down` write — clamped at read (C04 I48). Focus does not move (C26 I18). The scroll under the **pointer**, not the focused one, because a wheel is positional like a click and unlike a key | `PgUp`/`PgDn` on the focused box |
| wheel | anywhere else in the region, chrome, the prompt | **the transcript scrolls**, as before (C14) | `PgUp`/`PgDn`/`⌃Home`/`⌃End` at the prompt |
| click | header, footer, the prompt row | **`focusPrompt`** — the reader stepping out (C26 I13) | `Esc` |
| release (`press: false`) | anywhere | **nothing**, and it is unconsumed. The press did the work; a release that also acted would be a second click | — |
| shift + click | an element in the **focused** entry | **`extendRow(entry, address)`** — the drag row's state reached in one press: the anchor is placed on the first extension (the clicked element before it, when there was no region) and the head lands on the clicked element, so click `a` then shift-click `c` selects `a..c`. On the focused element itself it is `anchor === element`, which is no selection | `⇧↓` / `⇧↑` |
| shift + click | an element in **another** entry, a non-element row, chrome; or with focus at the prompt | **nothing**, unconsumed — the drag row's second half: the anchor shares the entry by construction (C26 §4g) and a shift-click does not get a wider selection than the keys. From the prompt there is no anchor to extend from, and `⇧↓` there is not a way in either | — |
| `button1`, `button2`, `button8`–`11`; `meta` or `ctrl` held | anywhere | **nothing in this table**, recorded rather than absorbed: a right-click has no key equal and needs one before it can have an effect, and `meta`/`ctrl` clicks have no `⇧↓`-shaped state to reach | — |

**Where a ruling named an operation, the operation was checked before the row was written.** *Scroll the box under the pointer* needs a per-block nudge that takes an entry and a block id — `scrollOffsets.nudge(entryId, blockId, delta)` exists and clamps at read; `blockPageUp/Down` act on the **focused** block and could not be the effect, so the wheel row does not go through `keys.table` and says so. *Focus a settled entry from the prompt* needs `enterLiveBlock` to take an entry — it does (C26 I21) — because `focusRow` is a deliberate no-op at the prompt and a click is a way in exactly as `↓` is.

### The classification table — structural, at rest

Indexed by the cells where two rules both hold with nothing happening in between. A row governed by one rule is a restatement and is left out.

| | the two rules that meet | ruling |
|---|---|---|
| **a** | *a layer covers the point* (rung 1) meets *the point is over an element* | the layer, and the element never sees it — C15's box is the outer scope. No new rule: rung order already says so, and the row is here because a reader of the gesture table alone would not see that its first column is conditional on rung 1 |
| **b** | *rowOffset is in `chrome ++ blocks`* (C14 I20) meets *element rows are block-sequence-relative* (C09 `elementsIn`) | subtract the chrome, once, before the find. The keys never met this because they never held a row; a version that forgot it hits the row **below** the one under the pointer by exactly the command line's height, on every entry, and reads as an off-by-one in C14 |
| **c** | *a `scroll`'s elements are in content rows* (C26 I3) meets *the pointer is a box row* | translate through the offset for elements the box owns, and require the row to be inside the box's `height` — the residue row and the rows past a short content are no element. Found by measuring `elementsIn` on a five-child, three-row box: `n4` at rows 3–4, `n5` at 4–5, both outside the box the pointer can be in |
| **d** | *two children of a `row` group sit side by side* (C04 `groupChildWidths`) meets *`elementsIn` lifts rows and not cols* | **a defect in C09, recorded and not worked around here** (FINDINGS, Lane W): both tables in an 80-column row group answer `cols {0, 39}`, so a click at column 10 matches both and a click at column 50 matches neither. The pointer helper compares cols honestly and the second child is unreachable until the walk carries a column origin. Working around it here would be a second geometry, which is the drift C26 §5 exists to forbid |
| **e** | *a `cell` sits inside a `row`* (C26 §5 predicate 3, per-level disjointness) meets *the pointer wants one answer* | deepest level wins. Vacuous today — no kind declares both a row and cells over the same area — and said so, because it is the rule that will decide the first table with a column cursor (C26 §11) |
| **f** | *click focuses* meets *the entry is settled* | focus moves to the settled entry (C26 I21; `tab` is the equal). A click cannot enter `interact` there — D4 withdrew the mode from settled entries and `enterLiveBlock`/`focusRow` both land in `navigate` |
| **g** | *click focuses* meets *a selection is open* | `focusRow` collapses it (C26 I16): an unshifted gesture drops the region, exactly as `↓` does |
| **h** | *wheel over a `scroll`* meets *the box is in a settled entry* | the box scrolls: offsets are view state, not data, and a frozen entry's view state is the reader's (C23 I47). Same as `PgDn` on a focused box in a settled entry (T4.59) |
| **i** | *wheel is directional* (old §4 sentence) meets *a `scroll` under the pointer can scroll* | the old sentence loses: the entry is offered the wheel first and the transcript takes what it declines. Both are scrolls; the inner one is under the pointer |
| **j** | *`wheelLeft`/`wheelRight` exist* (I30) meets *the wheel test names two directions* | the horizontal wheel was a click. `startsWith("wheel")`, and T1.3o holds it |
| **k** | *a layer that must be answered blocks everything beneath it* (I8) meets *the mouse routes by position* | the mouse table had no modality gate while the keyboard's had two: a click beside a confirm moved focus under it and a wheel scrolled the transcript under one — I8's own example, arriving by the pointer. With a non-dismissable top layer, an event not on that layer is consumed and nothing happens, which is the key path's shape. T1.3q |
| **l** | *C14 addresses rows from the region's top* (C14 §2, I19) meets *the frame bottom-aligns a short transcript* (`paint.ts`: *content should grow towards the prompt*) | **found by reading the painted frame, and reachable by nothing else.** Every store-level row passed; the first click at a visible `beta-1` in a real session asked C14 for region row 12 of a 12-row transcript and got `null`. C14 §2's own sentence — *a short transcript leaves rows below the last entry* — describes a frame the composer does not draw. The translation is the frame's: L4 subtracts `max(0, height − totalRows)` before asking C14, over the same two numbers `paint.ts` pads with, and C14 stays ignorant of how it is drawn |

### The sequence trace — event-mediated

| | sequence | what is left behind, and the ruling |
|---|---|---|
| **1** | press on element 1 → motion on element 2 → motion on element 3 → release | `{element: 3, anchor: 1}`: three selected. The release leaves nothing. A version that moved the anchor is right after the first motion and wrong after the second (C26 I16), which is why the row has three elements and not two |
| **2** | click on a settled entry's row → `⏎` | C23 I18's refusal, **patched into the settled entry** — its `rev` moves and the live entry's does not. The origin is the focused entry, which the click set; with `liveId` as the origin the action would fire against the live entry's document and be refused by nothing (C26 §4g row e). This is the row that says a click and `tab` are the same state |
| **3** | `↓` into the live entry → a block enters `interact` → click on another element | `navigate`, on the clicked element. `focusRow` drops the mode as `↓` does: a mode belongs to the element it was entered on. Click on the **same** element instead → nothing changes (table row 3) |
| **4** | press on element 1 → motion **off the region** (chrome, or a layer) → motion back onto element 2 | the excursion leaves nothing — chrome and layers ignore a drag — and the return extends from the anchor still at 1. No state is kept between motion reports; each is resolved on its own, which is I1's *derived on every dispatch* for the pointer |
| **5** | press on element 1 in entry A → motion onto an element in entry B | `{element: 1, anchor: null}` unchanged: another entry's element is not a head for A's anchor (table row 6). `extendRow` would drop the anchor on an entry change (eviction's arm) — and it is never called, so the arm is not what enforces this |
| **6** | wheel over a `scroll` × n → wheel over prose | the box's offset moves n steps, the transcript's `topRow` does not; then the transcript moves and the box does not. Two stores, and the pointer decides which one per event — the row asserts **both** counters after each step, because a version that moved both passes either half |
| **7** | click on element → click again → click a third time | focus, activate, activate. There is no toggle and no timer: the third click is the same state test as the second. A `fill` action's third press fills again, which is what `⏎ ⏎` does |
| **8** | click at the prompt row while focus is in a row | `{at: "prompt"}` — `focusPrompt`. The click on chrome is the one gesture that leaves the transcript, and it is the `Esc` route rather than `↑`'s so a settled entry is left the same way (C26 §4g row b) |
| **9** | mouse disabled → any of the above | dropped before decoding (I3, T3.12). No row here is reachable and no state moves |

### What the walk found before the code

Three things, none visible from the gesture table alone. **(b)** the chrome offset — the brief asked *what `rowOffset` is relative to* and the answer is the entry including its command line, which no key ever needed. **(c)** the scroll's content space — a hit test written from `elementsIn`'s signature alone is wrong inside every scrolled box by exactly the offset, and every assertion about a *row being focused* passes. **(d)** the side-by-side columns — a defect in the walk the pointer reads, found by measuring the walk rather than by reading it. **(l)** the frame's alignment — the only one of the four found after the code, by the frame read the brief scheduled: the store said the settled entry's second row was focused in every graph-level row, and the painted session's click landed on blank rows the viewport did not know were there. And one thing the brief's own premise had wrong: **C14's `entryAtRow` did not exist.** The spec declares it (C14 §2, I19, T2.11/T2.12/T3.1b/T3.1c), the router's dep is named for it, and the production `FrameQueries` supplied `() => null` — so rung 2 had never once resolved an entry, `run("liveBlock", e)` had never been reached by a mouse, and *complete skeleton* was true of the router and false of the system. Built in C14 where the spec puts it, and the seam through `FrameQueries` removed rather than kept as a second answer to *which entry is at this row* (C14 I19).

---

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
| **A live subscription is running** | Cancel the **newest**; a second Ctrl-C cancels the next-newest |
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

**The subscription rung, and why it is here rather than at the top.** C23 I6 releases the submission guard for a `streams: true` verb so the prompt stays usable during a `--watch` — and rungs 1 and 2 read `C23.inFlight`, which *is* that guard. So a live stream made every rung decline: Ctrl-C cleared the prompt while the child ran on, and `/tail` reached line 171 after the interrupt. Both rules are correct on their own; the ladder had no rung for the state they produce together.

**Widening rung 1 to take streams was the obvious repair and is the boolean-collapse defect again.** Rung 1 fires while the prompt is usable, so a Ctrl-C meant to clear a half-typed line would cancel the stream instead — one rung swallowing a case that wants its own, which is exactly what made `busy` become `inFlight` returning a route.

So it sits **below the layer rungs and above the prompt rungs**. Below, because a confirm or a menu over a running stream is the more immediate thing — the same reasoning as the copy-mode order above. Above, because a running subscription outranks a half-typed line.

**Newest first, and it is the only rule a reader can predict without looking.** With two streams live, the one they just started is the one they mean. A second Ctrl-C takes the next-newest rather than falling through, so `n` streams take `n` presses to stop and **the exit confirm arms only when nothing is running** — otherwise the key that stops a runaway `--watch` is also the key that closes the session, which is the wrong pair to make adjacent.

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
| 7 | Interaction on a block | `StoredFocus.at === "liveBlock"`, `mode === "interact"`, a live entry, no layer, not copy mode | T2.6b |
| 8 | Focus in the live block | as above with `mode === "navigate"` | T1.14 |
| 9 | Prompt with text | `StoredFocus.at === "prompt"`, buffer non-empty | T5.3 |
| 10 | Prompt empty | as above, buffer empty | T1.9, T1.10 |

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

**And rung 7 arrived a second time, by exactly that route.** C26 added `interaction`
to `FOCUS_ORDER` and registered its `⌃c` handler (`router.ts:234`), and this table
was not re-run — so for the length of that stage the ladder had eight rungs in code
and seven here, with the copy-mode row's neighbours misdescribed. Found while
reading the ladder for copy mode's own work, not by any check. The rule above says
re-running the table is part of adding a rung; the instance that proves it is the
one that ignored it.

---

## 5a. Copy mode's classification table — the three scopes at rest

**Structural, not event-mediated, and it is the artefact this component tends not to
get.** Copy mode looks like a state machine, so the trace in §5b is the obvious
thing to write; the rows that decide the design are the ones where two rules both
hold at rest with no event between them. Indexed by rule interaction, not by input
coverage — a row governed by one rule restates that rule and finds nothing.

The subject is one key, `⌥a`, against the four places focus can be. Two of those
already have owners.

| # | Focus at rest | What already claims the key | What select-all would claim | Ruling |
|---|---|---|---|---|
| A1 | Prompt, buffer has text | C17's keymap: `⌥a` is unbound; `⌥b`/`⌥d`/`⌥f` are bound on the same path | select the whole buffer | **`⌥a` binds here.** The one cell where nothing else claims it |
| A2 | Prompt, buffer empty | as A1 | select nothing | **A no-op, not a refusal.** Selecting an empty buffer produces the empty region, which is the state the reader is already in |
| A3 | Live block, `mode: "navigate"` | C26: arrows move between elements; `⌥a` unbound | select every row of the block? every element? | **Unbound.** See the ruling below — this is the cell that decides whether selection is a C17 concept or a system-wide one |
| A4 | Live block, `mode: "interact"` | the block's own declared keys — **an open set** (C26 I14) | select within the block | **Unbound, and it must stay so.** A framework key inside interaction is the shadowing question C26 already ruled: keys belong to the block |
| A5 | Copy mode | the terminal's native selection, which the app does not see | nothing the app can do | **Unbound, and the cell is why copy mode is a target.** In copy mode the app is not reading the selection at all |
| A6 | An overlay or a pushed view on top | the layer's own answer callback (§4) | — | **Unreachable.** `activeTarget` never answers `prompt` or `liveBlock` with a layer up, so the key never arrives |

### What it found

**The three scopes do not want one selection type — they want one *clipboard*.** A1
and A2 are a character range in a buffer; A3 is a set of elements; A5 is a range of
painted cells the app cannot address. Nothing survives all three as a *region*.
What does survive is where the copied text lands, which is §5b's first ruling and a
C17 one.

**A4 is the row that would have been got wrong.** Binding `⌥a` globally is the
natural implementation and it silently shadows a key a block may declare — the same
defect C26 ruled against for every other framework binding, arriving through a
feature that has nothing to do with blocks. No sequence produces this; it is two
correct statements overlapping at rest.

**A5 says copy mode is not a scope of the selection model at all.** It is the
absence of one: the reader is using the terminal's selection because the app's does
not reach painted history. So "three scopes, one mechanism" is right about the
mechanism and wrong about the count — there are **two** selection scopes and one
mode in which the app deliberately has none.

## 5b. Copy mode's sequence trace — what an event leaves behind

**Event-mediated, and the first row is a defect that exists in the tree today.**

| # | Sequence | What happens now | Ruling |
|---|---|---|---|
| B1 | Enter copy mode, press `⌃c` | **Ships — measured 2026-09-05, and this row said otherwise for some time after it stopped being true.** `activeTarget` answers `copyMode`; the rung calls `deps.exitCopyMode()`, which is `#setCopyMode(false)` (`session.ts:930-950`): mouse tracking comes back **first** (`1002h 1006h`), then `resume()` writes the catching-up frame. Entry is `⌥v` at `prompt` and `liveBlock` (`keymap.ts:321`). The `() => undefined` this row used to cite survives only in test harnesses' `FrameQueries` | **The producer and the exit are one piece of state or neither ships** — and they do: C22 T4.30/T4.31 assert the pair, T4.31b the order inside the exit. The stub was recorded here for the length of C26 *after* it was gone, which is F86/F89/F92's class — the record lagging the tree — and it let a survey read a working mode as a defect |
| B2 | Enter copy mode while a verb is in flight | rungs 1–2 dominate: `⌃c` cancels the verb and copy mode stays | **Correct and kept.** Cancelling the work outranks leaving a viewing mode; the reader presses `⌃c` twice, which is the ladder's shape |
| B3 | A confirm is raised while in copy mode | rung 4 dominates copy mode (T1.12b) — the confirm takes the key | **Correct and kept**, and it is the interaction the original ladder pass got wrong in the other direction |
| B4 | Output arrives while in copy mode | **Measured 2026-09-05.** C13 appends and C14 follows as it always does — the far side is **not** frozen — but `#setCopyMode(true)` has suspended the scheduler (`session.ts:940`, C03 I13), so no frame is written: the screen holds the frame the reader is selecting from, and the catching-up frame arrives on exit (C22 T4.32, T4.32b). A resize is the one thing that paints through the hold — a contaminated write is never held (C03 I13) — and that is right, because the terminal has already destroyed the selection | **The mode suspends the *screen* and says so (`COPY` in the header); it does not suspend the far side.** The selection cannot come to mean other text because the text under it does not move, and what the reader missed is drawn the moment they leave. The open question this row carried has an owner — C22's `#setCopyMode` — and C03 §4a is the mechanism |
| B5 | `y` on a focused element, then `⌃y` at the prompt | `⌃y` yanks the kill buffer (C17 §5) — which `y` did not write | **One clipboard.** See C17 §5a |
| B6 | `⌃k` fills the kill buffer, then `y` copies an element, then `⌃y` | under one clipboard, `⌃y` yanks the element | **Intended.** Copy is another way to fill the same buffer, and it inherits C17 §5's no-rewind ruling rather than needing a second one |
| B7 | Entering copy mode with a selection open in the prompt | **Still open — measured 2026-09-05.** `#setCopyMode(true)` touches the scheduler and the lifecycle and nothing else (`session.ts:936-942`); `keys.ts`'s `enterCopyMode` effect is `void deps.enterCopyMode()`. Nothing clears `Editor.selection`, and C17 exposes no member that would: `move` collapses a region only by moving the caret, and `#apply` does so only on undo (C17 I22) | **Two selections visible, one live — and the frozen frame makes it worse, not better**: the prompt's highlight is painted into the frame the hold keeps, beside the terminal's live one. **Owed, with a symbol**: a C17 member that collapses the region without moving the caret, called from `#setCopyMode(true)` before the indicator's frame. Not a `move`, because the caret is a statement the reader made |

### What it found

B1 was the tree's state when this trace was written and is not now; the row above
records the measurement and the date, because a row that said *stub* for some time
after the stub was gone is what let a survey read a shipped mode as a defect. B4 has
an owner — C22's `#setCopyMode`, on C03 §4a — and the answer is *the screen is held,
the far side is not*. B7 is the interaction between the two surviving scopes, it
only appears because A1 and A5 were written down as separate rows first, and it is
the one row of the three still open.

## 5c. Leaving copy mode — `Esc`, walked and ruled

**A sequence trace, because every row is an event landing on a mode.** Indexed by the
rules that meet in the cell, not by the keys a reader might press; a row governed by one
rule restates it and finds nothing. Measured at HEAD on 2026-09-05 through `dispatch`'s
`lastStages`.

| # | Sequence | What happens now | Rules meeting | Ruling |
|---|---|---|---|---|
| C1 | Enter copy mode, press `Esc` | `dispatch`: not `⌃c`, so the pre-dispatch rungs are skipped; `activeTarget` answers `copyMode`; the rung declines (it takes `⌃c` only); no layer is up; the `global` fallback has no `escape` row → **dropped**, and `lastStages` ends `dropped`. The scheduler is suspended, so the drop has no frame either: the header still says `COPY` and the reader has been told nothing | I24's exemption — *its only key is `⌃c`* — meets §3's shape, in which `Esc` is every other target's own way out: `liveBlock` → `focusPrompt`, `pushedView` → `viewPop`, `overlay` → `dismiss` | **`Esc` exits copy mode.** The reasoning is below the table |
| C2 | Enter copy mode, a confirm is raised, `Esc` | `overlay` sits above `copyMode` in `FOCUS_ORDER`; `dismiss` respects `dismissable`, so a confirm refuses it and copy mode stays; a dismissable layer pops and copy mode stays beneath it | B3's rule at `Esc` instead of `⌃c` | **Correct and unchanged by the ruling.** A `copyMode` row resolves only when `activeTarget` answers `copyMode`, so no layer can be reached past — the same structural fact that puts the `⌃c` rung where it is |
| C3 | Enter, the far side settles an entry, exit | no frame while held; `resume()` writes one diffed frame carrying the new text (C22 T4.32b) | B4 | Recorded at B4 |
| C4 | Enter, resize, exit | `commit("resize")` sets `contaminated`; C03's gate is `suspended && !contaminated`, so the repaint is written *through* the hold (C03 I13); exit then resumes onto a model that is still true | C03 I13 meets C03 §4a's hold | **Correct.** The terminal has already destroyed the selection on a resize, and holding a wrapped line is the one corruption the app cannot see. Mutated in `tools/mutate/runs/c22-copy-mode.mjs` (*suspension holds a contaminated write too*) |
| C5 | Enter, `⌥v` again | `activeTarget` answers `copyMode`; the `prompt` and `liveBlock` rows never resolve; `global` has no `⌥v` → dropped. `#setCopyMode(true)` would have refused anyway (`this.#copyMode === on`) | the entry rows' targets meet the mode being its own target | A no-op by two independent guards; C22 T4.32c asserts one `1002l` and nothing written for the second press |
| C6 | Enter, SGR mouse bytes arrive anyway | tracking is off (`1006l 1002l`), so a conforming terminal sends none. Were bytes to arrive, the decoder still decodes them — `capabilities.mouse` is C02's *record*, not C01's *held set* — and `routeMouse` runs: a wheel reaches `run("copyMode") \|\| run("global")` and scrolls the viewport under a held screen | C02's record meets C01's held set | **Not reachable from a conforming terminal; noted, not fixed.** A `mouseEnabled` that read the held set would close it and lives in `construct.ts` |

### The ruling, and why I24's sentence did not constrain it

I24 exempted `copyMode` from having bindings because *a binding there would be the second
mechanism I23 objects to*. I23 objects to a key handled **outside the table** — a `switch`
in L4 that `/help` cannot render. A `copyMode`-target row is *in* the table, and it
resolves at exactly the moment the `⌃c` rung does, because both hang off `activeTarget`:
there is no order of its own to drift. The sentence is true of a `global` row and was
attached to a decision about a `copyMode` row. `types.ts`, `keys.ts` and `keymap.ts` each
repeat it, and three restatements are one claim.

**The pattern every other target already has is the one copy mode lacks.** `Esc` is a
target's own dismissal and `⌃c` is the ladder's cancel; `pushedView` has both, they do
the same thing (`viewPop` / `popLayer`), and I24 itself defends the pair. Copy mode is the
one target where the key a reader has learnt at every other level does nothing — and does
it silently, on a frozen screen, which is the *keys going somewhere invisible* failure §1
calls close to undebuggable.

So: `defaultKeymap` gains `{ target: "copyMode", key: { name: "escape" }, action:
"exitCopyMode" }`; `KeyAction` gains `"exitCopyMode"`; L4's effect table gains
`exitCopyMode: () => void deps.exitCopyMode()`, over a dep that already exists on
`RouterDeps` and `FrameQueries`. **The `⌃c` rung stays**: the ladder's shape — undo the
innermost thing — still needs it, exactly as `pushedView` keeps both. I24's exemption is
withdrawn below, and T1.32's `copyMode` clause inverts with it. Cost: one union member, one
row, one effect line, and a test clause.

**T4.68 asserts the ruling and is written `it.fails` until the three lines land** — it
constructs the state, asserts what the ruling says, and goes red the day the row exists,
which is the signal to flip it. A todo cannot do that here: `todo-expiry` is indexed by
component, and every component this needs already exists.

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

**Scrolling is bound here too, and until now it was not bound anywhere** (I23). `pageUp`, `pageDown`, `scrollToTop` and `scrollToBottom` are C14's operations and C14 §2 says the keys that invoke them are C16's — and C16 had none of them. L4 read the four keys out of an `InputEvent` in a `switch` inside its `global` handler, which is a second mechanism for one target's key handling and has two consequences: `/help` cannot show a binding that is not in the table, so **the shell has never been able to tell a user that PageUp scrolls**, and two of the four arms were reachable by nothing at all. Fifteen unexecuted bindings is a defect this component already had; two executed ones outside the table is its inverse.

| Key | Action | | Key | Action |
|---|---|---|---|---|
| `pageup` | `scrollPageUp` | | `pagedown` | `scrollPageDown` |
| `⌃home` | `scrollTop` | | `⌃end` | `scrollBottom` |

They target `global`, which is the first built-in use of that target and is what makes them work: `global` is last in the ladder, so a prompt that binds a key keeps it.

**`Home` and `End` stay the line's; `⌃Home` and `⌃End` are the document's.** That is the distinction every editor draws and it is borrowed rather than arbitrated — the alternative rulings were the prompt yielding `Home`/`End` at an empty buffer, which makes one key mean two things depending on state, and `g`/`G`, which cannot work because the prompt takes letters. S12 draws `g`/`G` for a pushed view and that is consistent: a pushed view has no prompt competing for them.

**Both wire forms were pressed through the real decoder before this was written** (I17, T2.13), and the result was that no decoder change is needed: xterm's `CSI 1;5H` reaches `CSI_LETTER_KEYS` with `modifiersOf("5")` setting the ctrl bit, and rxvt's `CSI 7;5~` reaches `CSI_TILDE_KEYS` at the same name with the same modifiers. Recorded as a positive result beside `⌃_`'s negative one, because a checked assumption that held is worth not checking twice — and the ruling that produced these keys said to drop the binding rather than widen the decoder if it had failed.

**The pushed view's keys are the third block, and the target had bindings for nothing** (I24). `pushedView` has been in the focus union since C16 was written and in `focus.ts` since it was built, and `defaultKeymap` has never had a row for it — so `activeTarget` would resolve to a target with an empty handler set and every key would fall to step 3. Nothing failed, because nothing pushed a view; the target was a name with no vocabulary behind it, which is `frameworkSources` and the editing bindings a third time.

| Key | Action | | Key | Action |
|---|---|---|---|---|
| `n` | `viewNextHunk` | | `p` | `viewPrevHunk` |
| `g` | `viewTop` | | `G` | `viewBottom` |
| `pageup`, `↑` | `viewPageUp` | | `pagedown`, `↓` | `viewPageDown` |
| `escape` | `viewPop` | | | |

**`n`/`p` are the diff-specific pair and the rest are conventions a view inherits** (C25 §3b). Letters are available here for the reason §6 already gives two blocks up: a pushed view has no prompt competing for them, which is why `g`/`G` were rejected for the transcript and are correct here.

**`pageup` and `pagedown` are bound at two targets deliberately, and that is not the duplicate the conflict rule refuses.** The rule refuses a duplicate `(target, key)`; these are one key at two targets, resolved by the ladder — with a view on top `activeTarget` is `pushedView` and the view's own row wins, and with no view the `global` row scrolls the transcript. That is the mechanism working, and it is worth stating because the coverage clause in §4 makes the two look like alternatives when they are a priority.

**`escape` pops, and it is not the Ctrl-C rung wearing another name.** §5's `pushedView` rung already pops on Ctrl-C, and that rung is a *cancellation* — it is the ladder answering "what does interrupting mean here". `Esc` is the view's own dismissal (A01 D7): the transcript is untouched, nothing is appended, and the selection the reader left behind is intact. Two keys, one outcome, two reasons — and a single implementation shared between them would make the ladder's rung depend on the keymap, which §5 spends a section keeping apart.

**A wheel event is not a key and stays out of the table.** It has no `(target, key)` to resolve on, so the `global` handler is `bound("global", e)` falling through to the mouse arms. That is the boundary: everything that is a key resolves through the keymap, and the one thing that is not does not pretend to.

**And this newly occupies the `global` slots for those four keys**, so a `BlockKeymap` binding `PageUp` is now refused at commit rather than shadowing the scroll. That is the conflict rule working as written, and it is named here because the refusal is new.

The set is closed for **built-in** bindings only. A `BlockKeymap`'s action is a surface's string dispatched through C23's block-action route (C23 §3a), and it is open by design — the surface supplies both halves.

**Three more `liveBlock` families, and each is a ruling made elsewhere landing as rows here.**

| Key | Action | | Key | Action |
|---|---|---|---|---|
| `⇧tab` | `entryPrev` | | `tab` | `entryNext` |
| `←` | `cursorLeft` | | `→` | `cursorRight` |
| `⇧⏎`, `⌥⏎` | `rerunEntry` | | | |

**`tab`/`⇧tab` move focus between entries** (C26 I21, §4g): the only two keys that change which
entry focus is in, landing on the target entry's first element. `tab` was free at this target —
the prompt's is `complete` and the overlay's is `menuNext`, one key at three targets resolved by
the ladder — and `⇧tab`'s wire form is §2's `CSI Z`.

**`←`/`→` are the horizontal pair** (I28, C22 I76, C12 §3s). The vertical pair steps elements
and the horizontal one had no subject; the record said both *fell through to the prompt*, and
they did not — dispatch runs the target's handlers and then `global`, neither binds an arrow,
and both were dropped. That claim was carried through two rulings (C22 I71 chose `[` `]` on it)
and measured by nothing until a row wanted the keys. The first consumer is the plot's crosshair
and the second a table's column cursor (C26 §11), which is why the pair is a built-in rather than
one kind's key; on a kind with no horizontal interior it is a no-op, the camera family's
precedent.

**`⇧⏎`/`⌥⏎` re-run the focused entry's recorded command** (I29, C23 I18): the prompt's own
newline pair at the other target, meaning *run*, which is the notebook convention. Both wire
forms are already pressed through the decoder for the prompt's rows.

**Surfaces contribute bindings through the block.** A surface is not a component and cannot register a handler, so an adapter may attach a `BlockKeymap` to the block it produces. C16 merges it **while that block is live**, and withdraws it when the block freezes — so `s` sorts a `/ps` table and does nothing once a newer entry arrives.

**A colliding block key is placed, not refused** (I27). Two bindings for the same `(target, key)` in the *default* table is a construction error, not a last-wins. A block keymap's key that `global` or `liveBlock` already binds used to be the same error, raised at commit — *the global always wins, and a silent shadow would be worse than a loud refusal* — and its first consumer would have tripped it on every key it has: the widget design (`docs/notes/CALCIUM_WIDGETS_DESIGN.md` §keys) binds `↑` `↓` `PgUp` `PgDn` `Esc`, all five built-ins here, and C12 §3s's cursor keys are the arrows. C26 §4f had already found what the mode is for — *the keys `mergeBlock` refuses* — so the ruling is the placement that section implies: **a colliding key lands at `interaction`**, the one rung where the built-ins are out of scope, and fires once the reader has entered the block (C26 I14); **a free key lands at `liveBlock`** and works from the first `↓` (A01 D4). Neither half is shadowed and nothing is silent — `/help` lists both at their targets (I19) — and the one refusal that survives is the same key twice inside one block keymap, which is the block's own author contradicting themselves. **`interaction` gains its first bindings by this route and by no other**: a framework row there would shadow a block's, which is §5a row A4.

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
- **I8** — **While the top layer must be answered *or* covers the region, no event acts on anything beneath it.** It is never dismissed, no lower focus target is reached, and the `global` fallback does not run (§4 step 3). The invariant was originally about Ctrl-C alone, and Ctrl-C was only the first key traced past a confirm — forbidding the dismissal left every lower rung and every global shortcut reachable, so an unanswered confirm sat over a screen that had changed theme, scrolled, or entered copy mode. Not dismissing the confirm is small comfort when the thing under it moved. **The second clause is the same widening a second time, found the same way.** `dismissable` is modality, and a pushed view is dismissable — so a view, which fills the region by construction (C15 §4), let every global shortcut through to a transcript nobody could see. Coverage is asked of the layer's box rather than of its kind, because kind is a proxy for it and a proxy stops being true the moment a second full-region layer exists.
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
- **I23** — **Every key that scrolls is a binding in the table.** The four scroll operations C14 exposes are named by `global` bindings — `pageup`, `pagedown`, `⌃home`, `⌃end` — rather than read out of an `InputEvent` in L4. Two mechanisms for one target's key handling is the inverse of the defect I19 exists to prevent: a binding outside the table is one `/help` cannot render, so a key that works is one no user can discover, and two of the four were reachable by nothing while looking exactly like the two that worked. A wheel event is not a key, has no `(target, key)` to resolve on, and stays out — that is the boundary rather than an exception to it. `Home` and `End` remain the line's, so the document's extremes take the modified pair every editor uses, and both of its wire forms were pressed through the real decoder before being written down (I17).
- **I24** — Every target that receives ordinary keys has bindings, and a target with none is a defect rather than a default. `pushedView` was in the union and in `focus.ts` from the start with no row anywhere in `defaultKeymap`, so every key at that target fell through step 3 — vacuous only for as long as nothing pushed a view. **`copyMode` was the one exemption, and §5c withdraws it** (ruled 2026-09-05): its `escape` row is the target's own dismissal, as `viewPop` is the view's, and `⌃c` stays the ladder's. The exemption's reason — *a binding there would be the second mechanism I23 objects to* — was true of a `global` row and was attached to a `copyMode` one, which resolves at the same moment the rung does and has no order of its own. `Esc` at a view is the view's own dismissal and is not the Ctrl-C rung under another name (§5, A01 D7).
- **I25** — **A layer that must be answered gets its keys before the ladder does.** When the top layer carries an answer callback, rung 4 offers it every key — accelerators, `Enter`, `Esc` and `⌃c` — and consumes what it takes, **before both of the rung's existing clauses** — and it is two clauses rather than one, which the mutation pass had to establish because the first wording said "before the `⌃c` clause" and a reordering satisfied it. They fail differently: the `isCtrlC` bail-out returns false for every key that is not `⌃c`, so an accelerator, `Enter`, `Esc` and an arrow are **dropped**; the `!top.dismissable` clause returns *consumed, and nothing happens* (I8), so `⌃c` **hangs** — the key vanishes and the handler awaiting it waits forever. One ordering, two defects, and a wording naming only the second reads as satisfied while the first is live. **The rung was written when no layer could be answered, so "nothing happens" was the whole truth; a question makes it a hang.** `Esc` and `⌃c` are routed rather than special-cased here, because what they mean is the question's business — C23 I36 resolves both with the default choice — and a router that knew that would hold half of a rule whose other half lives two layers away. The callback is read from the top layer only, never searched down the stack, for C15 `pop()`'s reason: a question raised over a completion menu must not be answered by the menu.
- **I26** — **`enter` is bound on `liveBlock`, and `rowActivate` is in `KeyAction`.** I22 gave the target entry and exit and three bindings — `escape`, `down`, `up` — which is a cursor with nothing to press. The effect is C23's (C23 I37); what C16 owns is that the key resolves from the table like every other, so `/help` renders it and a consumer can rebind it. **The union's gap was the whole of F21 from this side**: an action with no `KeyAction` cannot be bound, and a binding that does not exist reads exactly like one that is unused. It is the same key `overlay` accepts a menu item with, which is the consistency a reader has already learnt before reaching a row.

- **I27** — **A block key that collides with a `global` or `liveBlock` built-in is merged at `interaction`; a free key is merged at `liveBlock`; the same key twice in one block keymap is a construction error.** The throw this replaces was correct about the hazard — a silent shadow — and wrong about the remedy, because its first consumer needs exactly the keys it refused: widgets bind the arrows, paging and `Esc` (§6). Placement at `interaction` is the mode's purpose made mechanical (C26 §4f): the built-ins are out of scope there by `FOCUS_ORDER`, so nothing is shadowed and `/help` lists both halves at their targets. Withdrawal on freeze takes both.
- **I28** — **`←` and `→` at `liveBlock` are the horizontal pair, and they are built-ins.** They resolve to `cursorLeft`/`cursorRight`; the effect moves a focused plot's crosshair (C22 I76) and is a no-op on a kind with no horizontal interior. They were dropped at this target, not passed to the prompt as two rulings said — and a claim about where a key goes is settled by `dispatch`'s three steps, which never include `prompt` from `liveBlock`.
- **I29** — **`⇧⏎` and `⌥⏎` at `liveBlock` re-run the focused entry's recorded command through C23 §2's submit, and nothing else fires from a frozen entry** (→ C23 I18). Not an action kind: the five kinds fire against a document's data, which a frozen entry's is stale; the command text is not. An entry with an empty command is a silent no-op and declares no element to be focused on anyway.
- **I30** — **A mouse event carries every bit the terminal sent; nothing is masked.** SGR 1006's `Cb` is a bit field (§2's table): button in bits 0–1, shift 4, meta 8, ctrl 16, motion 32, wheel 64 with bits 0–1 selecting up/down/left/right, buttons 8–11 at 128; press or release is the final byte. The decoder names each bit and interprets none — what a modified click or a drag *does* is §4's. A masked bit is one no consumer can recover: ctrl-wheel-up decoded as `wheelDown` and a drag as a stream of clicks, and both read as correct events to everything above.

- **I31** — **A pointer gesture reaches only states a key reaches, through the same calls** (§4a). A click on an element is `enterLiveBlock`/`focusRow` on that entry and address — the settled entry included; a click on the focused element in `navigate` is `rowActivate` and in `interact` is nothing; a drag **and a shift-click** are `extendRow` within the focused entry and nothing across entries; a wheel inside a `scroll`'s box moves that box's offset and elsewhere the transcript's; a click on chrome is `focusPrompt`; a release, a horizontal wheel, a second button and a `meta`- or `ctrl`-modified click do nothing and are unconsumed. Resolution is one `find` over the list the keyboard walks, after the entry's chrome rows are subtracted and a `scroll`'s offset is added, and the deepest level wins. `StoredFocus` therefore has no pointer-only value, and the table above is the whole of what the pointer can do.

**And a question outranks rungs 1 and 2, which is the one place newest-first is not enough on its own.** A local verb awaiting `ctx.ask` is `inFlight` for the whole time its question is on screen, so `⌃c` was taken by the cancel rung and the question never saw it — two rungs with a claim, and the older one higher. Ruling A's own argument decides it: `Esc` and `⌃c` collapse *because* declining and cancelling produce the same outcome, and when two paths produce the same outcome the one that leaves a record is the one to keep. Cancellation discards the entry; declining settles one saying nothing changed. **Found by a frame-read and reachable by nothing else** — the container was untouched and the layer was gone, which is everything a test asserts, and the frame showed that the submitted line had disappeared. The suite agreed throughout, because every harness reported `inFlight: null` and that is the one arrangement where both readings agree.

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
21. `enter` on a focused row is a binding in the default table, resolving to `rowActivate` — so the one thing a focused row could not do is a row in the table rather than a special case in a handler (I26). The effect is C23’s (→ C23 I37).
19. C17's public surface is the editing action vocabulary, and the bindings are readline's; each was pressed through the real decoder before being written down, and a candidate the decoder does not produce is dropped rather than met by widening the decoder (I21, I17).
21. Scrolling is bound in the table like everything else that is a key: `pageup`, `pagedown`, `⌃home`, `⌃end` on the `global` target, so `/help` can render them and a scroll key cannot exist outside the vocabulary. The wheel is not a key and stays out (I23).
22. Step 3 is skipped when the top layer must be answered **or covers the region**; the two are different properties and neither implies the other, and coverage is read from the layer's box rather than from its kind (I8).
24. A top layer that must be answered receives every key at rung 4 before **both** of the rung's existing clauses, and a question outranks the cancel rungs above it — so `Esc` and `⌃c` reach the question rather than being dropped, consumed into silence, or cancelling the verb that asked. The callback comes from the top layer only (I25).
23. Every focus target that takes ordinary keys has bindings; `copyMode`'s is `Esc` (§5c, ruled 2026-09-05 — until the row lands, T4.68 is `it.fails` and says so) and its `⌃c` is the ladder's. `pushedView` gets `n`/`p`, `g`/`G`, paging and `Esc`, and its `Esc` is the view's own dismissal rather than §5's cancellation rung (I24).
25. A colliding block key is placed at `interaction` and a free one at `liveBlock`; only a key bound twice in one block keymap is refused (I27).
26. `←`/`→` at `liveBlock` are built-ins for the horizontal axis, the crosshair first (I28).
27. `⇧⏎`/`⌥⏎` at `liveBlock` re-run the focused entry's recorded command, and that is the whole of what fires from a frozen entry (I29, → C23 I18).
28. `CSI Z` decodes as `⇧tab`, bare form only (I17, §2).
29. An SGR mouse event carries button, shift, meta, ctrl, motion and press/release as the terminal sent them; the wheel has four directions and buttons 8–11 have names (I30, §2).
30. The pointer is a gesture table onto the key effects — click focuses, click-again activates, drag extends, wheel scrolls the box under it or else the transcript, chrome returns to the prompt — resolved by one find over the list the keyboard walks, and it can reach no state a key cannot (I31, §4a). A region row becomes an entry in C14 and nowhere else (→ C14 I19).

---

## 10. Tests

Six tiers. Every cell of both §7 tables is covered.

### Tier 1 — unit

- **T1.30** (I8): with a full-region layer on top, `PgUp` is **dropped** rather than reaching `global`. The control is the same key under a one-row *dismissable* overlay, which does reach `global` — without it the assertion passes for a router that skips step 3 whenever any layer is open, which is the rule §4 spends a paragraph rejecting.
- **T1.31** (I8): coverage is read from the box. A layer that is **not** a view but whose `Placed` spans the region also skips step 3, and a view whose box has been clamped smaller does not. Hand-built `Placed`, because the property is geometric and a kind test would pass the first case and fail the second.
- **T1.32** (I24): every member of the `FocusTarget` union has at least one row in `defaultKeymap`. Derived from the union, not from a list written beside it — a coverage set built from the test's own table covers nothing.
- **T1.33** (I24): at `pushedView`, `n`, `p`, `g`, `G`, `pageup`, `pagedown` and `escape` each resolve to their action, and `escape` resolves to `viewPop` rather than to `dismiss`.
- **T1.1**: byte sequences decode to the documented keys — plain, ctrl, meta, arrows, function keys, `Esc`. Twenty cases.
- **T1.2**: a lone `Esc` byte is distinguished from an escape sequence prefix by the documented disambiguation window.
- **T1.3** (I15): `activeTarget` returns the documented target for each of the six conditions.
- **T1.3b** (I2): moving focus to `liveBlock`, then `resetFocus()` → focus is back at `prompt`, and the stored `rowId` is gone with it.
- **T1.3b2** (I2): a C13 append with no `resetFocus()` call leaves the stored location untouched — the reset is the caller's, and a router that quietly subscribed would pass T1.3b while failing this.
- **T1.16** (I18): each of the three pending states, reset and then continued — a lone `Esc` mid-window, a paste between its markers, a run inside the heuristic's window. *Then* the bytes that would have completed each sequence decode as themselves, and `reset()` itself emitted nothing. Three cases rather than one, because a reset that cleared only the escape window passes any single-state test and still emits a child's keystrokes inside the next paste.
- **T1.3c** (I3): a click at a transcript row resolves to that row's block, not to the focused target.
- **T1.3d** (I3): a click inside an overlay's placed region resolves to the overlay even when focus is elsewhere.
- **T1.3h** (I17): `\r` decodes to `enter` and `\n` to `Ctrl-J` — asserted as a pair, because the defect was that they were the same event and either one alone still passes.
- **T1.3i** (I17): `ESC \r` decodes to `{name: "enter", meta: true}` — the name the keymap uses, not the byte.
- **T1.3j** (I17): `CSI 13;2u` and `CSI 27;2;13~` both decode to `{name: "enter", shift: true}`. Both forms, because a terminal sends one or the other and a rule satisfied by either is satisfied on half the terminals.
- **T1.3e** (I17, §2): xterm's Meta bit is read. `CSI 1;10D` and `CSI 1;2D` decode to **different** keys, and `CSI 1;10D` and `CSI 1;4D` to the **same** one — the two wire forms of `⌥⇧←`. The pair is the assertion: either form alone passes with bit 8 unread, which `CSI 1;16D` shows by being correct in the broken state. Fabricated rather than found, because the defect produces a well-formed key and nothing above the decoder can see it.
- **T1.3k** (I30, §2): `CSI < 80;10;5 M` decodes to the **whole** record `{wheelUp, ctrl: true, press: true}` at row 4, col 9 — the ctrl-wheel-up that scrolled down. `CSI < 64` beside it as the unmodified control, and `65` as `wheelDown`.
- **T1.3l** (I30, §2): `CSI < 4;10;5 M` is `button0` **with `shift: true`**, `16` is `button0` with `ctrl`, `8` with `meta`, and `29` is `button1` with all three. Asserted as full records: a row on `button` alone passes with the modifiers masked — and the first draft of this row wrote ctrl-click as `20`, which is `16 + 4`, and the whole-record assertion refused it.
- **T1.3m** (I30, §2): a drag — `CSI < 0;1;1 M`, `CSI < 32;2;1 M`, `CSI < 0;3;1 m` — is press, **motion**, release, each a full record; the middle one is `press: true, motion: true` and not a second click.
- **T1.3n** (I30, §2): `66` and `67` are `wheelLeft` and `wheelRight`, `128`–`131` are `button8`–`button11`, and `130` and `2` are **different** buttons — the 128 bit is read, not folded onto bits 0–1.
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
- **T2.16** (I23): `⌃Home` and `⌃End` in both wire forms — xterm's `CSI 1;5H`/`CSI 1;5F` and rxvt's `CSI 7;5~`/`CSI 8;5~` — decode to `{name, ctrl: true}` and resolve on `global`, while the unmodified `home` and `end` resolve on `prompt` to the line motions. Written as one row over both because the claim is the *discrimination*: the two are different slots, and `keyText` is one line away from making them the same. The check that produced this ruling, made mechanical so it cannot rot.
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
- **T1.3o** (I31, §4a row j): `wheelLeft` over an entry's row is offered as a wheel — `viewport:wheel` in the stages, never `viewport:<entry>` — and consumed by nothing; the control is `button0` at the same row reaching the entry.
- **T1.3p** (I31, §4a row i): an uncovered `wheelUp` inside the region is offered to the entry under it before `global`, and reaches `global` when the entry declines; with a layer covering the point it goes to the layer and nowhere else (T3.12b's half, kept).
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
- **T4.62** (I31, §4a row 1 of the gesture table; C26 I21): in a session with two entries of two rows each, a click at the settled entry's **second** row focuses `{entry: settled, element: b1}` — asserted as the whole stored location and read back from the frame, where the settled entry's probe saw the focus and the live entry's saw none. Containment is not correctness: the row names which element, not that one was focused.
- **T4.62b** (I31, §4a row b): the same click one row higher lands on the settled entry's **first** row, and a click on the command line above it changes nothing — the chrome subtraction, held from both sides.
- **T4.63** (I31, §4a row c): a click at the live entry's first row from the prompt enters `liveBlock` there; the column matters — over a `pills` block, a click at the second chip's columns focuses `chip-1` and not `chip-0` on the same row.
- **T4.64** (I31, §4a trace 7; C23 I18): click on a row, click again → the row's `fill` action runs; on a **settled** entry the second click reaches the refusal, which is patched into that entry — its `rev` moves and the live entry's does not.
- **T4.65** (I31, §4a trace 1; C26 I16): press on row 1, motion onto row 2, motion onto row 3 → `{element: 3, anchor: 1}`; the release leaves it; motion onto another entry's row leaves it too (trace 5).
- **T4.66** (I31, §4a trace 6; C04 I48): a wheel inside a `scroll`'s box moves that box's offset and leaves the transcript's `topRow` where it was; a wheel over prose in the same session moves `topRow` and leaves the offset. Both counters asserted after each step.
- **T4.66b** (I31, §4a row c): with the box scrolled by two, a click at its first box row focuses the **third** child, not the first — the offset translation, and the row a `rows`-only hit test fails.
- **T4.67** (I31, §4a trace 8): a click on the prompt row from a focused row → `{at: "prompt"}`; a release and a `button1` press over an element move nothing.
- **T4.68** (§5c C1): `Esc` in copy mode leaves it — tracking back (`1002h`), the indicator gone. **Written `it.fails` until the keymap row, the union member and the effect land** (Lane S's files); it turns red the day they do, which is the signal to flip it to `it`. The body asserts the ruling, not the current drop.
- **T4.9b** (I23, with L4): the four scroll bindings appear in what `/help` renders. The row that says the ruling changed anything a user can see — before it, three of the four keys worked and none of them could be found, and the fourth pair did not work at all.

### Tier 5 — e2e

- **T5.1**: typing continuously while a stream runs → every keystroke lands, in order, no drops.
- **T5.2**: pasting a 5,000-character command → appears as one edit; the prompt stays responsive.
- **T5.3**: the full Ctrl-C ladder in one session — cancel a verb, exit copy mode, pop a view, clear input, then double-tap to the exit confirm.
- **T5.4**: navigating from prompt into a live table, expanding a row, and returning, with focus visible and correct at every step.
- **T5.5**: a session under `bracketedPaste: false` → the heuristic works, and the notice appears once.
- **T5.6** (I31, §4a row 1): **the mouse through a PTY — bytes in, frame out, no fake decoder.** The shell under `node-pty` with the detected record (mouse on), two `/ps --mine` entries of two rows each; the first capture is checked for `1002h` and `1006h` **before** any byte is written (F759 — an instrument written before its subject), then the SGR bytes `CSI < 0 ; COL ; ROW M` for the **first** entry's **second** row are written and the highlight is read back from `styledFrame`: that row's pen changes and the other three rows' pens do not. Every other test of this path fed the decoder from a string; this one feeds the process.
- **T5.7** (I31, §4a row i): `CSI < 64 ; COL ; ROW M` over a notice — prose, no box — moves the transcript by `WHEEL_ROWS`: the line under the pointer is three rows lower afterwards and no longer where it was. The transcript is made taller than the region first, and the row asserts the frame moved by the constant rather than that it moved.
- **T5.8** (I31, C02 I10): **the control.** The same session with `mouse` forced **off** through the fixture (`FORCE_MOUSE=0`, the same override path `FORCE_DEPTH` takes, so the *lifecycle's* record is what is forced): the first capture carries no `1002h`, and the same click and wheel bytes leave `styledFrame` byte-identical — the decoder consumes them (`decode.ts:512`) and nothing downstream sees a gesture.

### Tier 6 — fail-on-revert

- **T6.30** (I8): step 3's condition back to `!dismissable` alone → T1.30 fails, and a pushed view stops holding the keys that page it. The revert that looks like a simplification, because the first clause reads as complete on its own.
- **T6.31** (I8): coverage tested as `kind === "view"` → T1.31's second case fails. The proxy passes every test written about views and stops being true the day a second full-region layer exists.
- **T6.32** (I24): the `pushedView` rows deleted → T1.32 fails, and the target reverts to the state it shipped in — a name in the union that nothing binds.
- **T6.1** (I1): caching the focus target → T2.1 and T3.17 fail; keys go somewhere invisible.
- **T6.2** (I6): dispatching paste bytes as key events → T3.1 fails and a large paste hangs the session.
- **T6.3** (I7): letting an overlay consume Ctrl-C ahead of an in-flight verb → T1.11 fails.
- **T6.4** (I8): allowing Ctrl-C to dismiss a confirm → T1.12 fails.
- **T6.4b** (I8): restoring copy mode above the overlay rungs, or moving only the dismissable one → T1.12b fails, and Ctrl-C on an unanswered confirm changes the screen behind it.
- **T6.4c** (I8): running the `global` fallback under a non-dismissable layer → T1.12c fails, and every shortcut except Ctrl-C acts beneath an unanswered confirm.
- **T6.4d** (I4, §5) — **structural guard, no failing test.** Reimplementing the Ctrl-C ladder as a list of conditions instead of handlers registered on their targets → nothing fails today, and the ladder is free to drift from `activeTarget` on the next edit touching one and not the other. Every other entry in this tier reads *change X → test Y fails*; this one names a change no assertion catches, and says so deliberately. Inventing an assertion that looked like a guard would be worse than pointing at the real one, which is **T2.5's exhaustiveness over `FocusTarget`**: while the rungs are handlers, a target with no binding is a compile-level gap, and the ladder cannot hold an order of its own to disagree with. Read this row as a signpost to that, not as an unfinished test (A02 §7).
- **T6.22** (I23): binding the document's extremes to unmodified `home`/`end` → C04's tier-5 scroll row fails, because the prompt resolves first at every moment it has focus, which is nearly always. That is the state this ruling replaced: the arms existed, read correctly, and were reachable by nothing.
- **T6.23** (I23): moving the four scroll keys back out of the table into L4's `switch` → T4.9b fails, and scrolling becomes undiscoverable again while continuing to work. The one regression in this tier whose whole symptom is that a user cannot find a key.
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
- **T6.9e** (I17): dropping bit 8 from `modifiersOf`'s `meta` → T1.3e fails, and `⌥⇧←` arrives as `⇧←` on every terminal that sends Option as Meta — a **live** binding rather than a dead one, which is why no row above the decoder fails with it.
- **T6.9f** (I30): restoring `code === 64` as the only wheel-up → T1.3k fails, and ctrl-scroll-up scrolls down. Masking the modifiers back out with `& 3` → T1.3l fails. Dropping the motion bit → T1.3m fails and a drag is a stream of clicks. All three in `tools/mutate/runs/c16-mouse-decode.mjs`.
- **T6.9h** (I31, F759): the decoder's row translation `Number(y) - 1` → `Number(y)` → T5.6 highlights the row *below* the pointer, and every fake-decoder row still passes because the fake never went through the translation. `WHEEL_DIRECTIONS` with its first pair swapped → T5.7 moves the wrong way. **A mutation that survives, and the finding is the survivor**: dropping the decoder's `capabilities.mouse` gate alone leaves T5.8 green, because `routeMouse` has a second gate over the same record — two guards over one condition, and either alone is invisible to every row. Anchors in `tools/mutate/runs/c16-mouse-pty.mjs`; each run by hand on 2026-09-05.
- **T6.9g** (I31): the pointer's `find` by rows alone, ignoring cols → T4.63 fails and the second chip is unreachable. `focusRow` with `liveId` in place of the hit entry → T4.62 fails, the settled entry's probe never sees focus, and T4.64's refusal is not reached. The click-again branch dropped → T4.64 fails and a row can be reached and never acted on, which is F21 for the pointer. The chrome subtraction dropped → T4.62b fails one row low. The offset translation dropped → T4.66b focuses the first child. The frame's bottom alignment ignored — C14 asked from the region's top — → T4.62c fails on the painted frame and every graph-level click row with it, because a short transcript's rows are ten rows lower than the viewport says (§4a row l). The wheel test restored to `wheelUp || wheelDown` → T1.3o fails and a horizontal wheel is a click. All in `tools/mutate/runs/c16-mouse-wiring.mjs`, with the wheel line as the control; each was run by hand on 2026-09-05 and every one killed the row it names.

---

- **T2.4b–e** (I27): a key `global` binds lands at `interaction` and the global is untouched; `up` from the real table lands at `interaction` while `rowUp` keeps `liveBlock` and a free key lands at `liveBlock`; the same key twice in one block keymap throws and leaves nothing behind; withdrawal takes both halves. **T2.4c is the fabricated collision**, on `defaultKeymap` itself.
- **T2.13** (I17, §2): `liveBlock s+tab` has the wire form `CSI Z`, and `liveBlock left/right/s+enter/m+enter` the prompt's. Router-decode **T3.13** is the control: `CSI 999 Z` stays discarded.
- **T4.17h** (I28): the horizontal pair moves a focused plot's cursor, clamped to its samples; **T4.17i** (I28): a table is a no-op and a first `←` lands at the far end (→ C22 I76).
- **T4.61** (I29): `⌥⏎` re-runs the **focused** entry's command, not the live one's; **T4.61b** (I29): `⇧⏎` is the same; **T4.61c** (I29): at the prompt both insert a newline and run nothing. **T1.17b** (→ C23 I18): `⏎` on a settled row is refused with the command named.
- **T6.x** (I27): restoring the throw → T2.4b and T2.4c fail. (I29): reading `liveId` in `rerunEntry` → T4.61 fails, because it submits `/more` where `/rows` was focused. (I28): the writer removed → C22's T4.17h–j and T4.17p fail and `plot-interaction` passes.

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
