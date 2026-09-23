/**
 * Bindings as data.
 *
 * C16 §6 — see spec. Declarative because Phase 1B adds user-defined bindings, and
 * a keymap expressed as branching code cannot be overridden, listed, or shown in
 * help.
 *
 * **`/help` shares this traversal rather than agreeing with one.** The anti-drift
 * property (C23 I26, C16 T4.9) is satisfiable two ways — the same lookup, or a
 * second one that happens to agree today — and only the first survives an edit to
 * dispatch. So `entries()` returns the very `Binding` objects `resolve()` returns,
 * and T4.9 asserts identity rather than equality: a help renderer showing a
 * binding dispatch would not resolve cannot be written without the two coming
 * apart, and identity is what makes that checkable.
 */

import { REGISTRY_BINDINGS } from "./registry-bindings.js";
import type { Binding, BlockKeymap, BuiltinBinding, FocusTarget, Key, KeyAction, KeyProfile } from "./types.js";

export class KeymapError extends Error {
  override readonly name = "KeymapError";
}

/**
 * A key as one comparable string. Modifiers are part of the identity, so `a` and
 * `Ctrl-A` are different slots rather than a duplicate.
 *
 * Shared by `slot` and `describe`, so neither takes the other's output apart
 * again. The first version derived the modifier text by splitting the slot string
 * it had just built, which SS40 caught — the rule is C17's and this file is not
 * the editor, but re-parsing a value assembled three lines earlier is worth not
 * writing anywhere. Building both from the same parts was the remedy rather than
 * widening the rule, and it removed the separator this file was splitting on.
 */
/**
 * A key as `c+p`, `ms+enter`, `enter`.
 *
 * Exported for `/help` (C23 I26): help renders from this table rather than a
 * maintained list, so the formatting a binding is *shown* with has to be the one
 * the keymap itself uses. A second formatter is a second thing to drift.
 */
export function keyText(key: Binding["key"]): string {
  const mods =
    (key.ctrl === true ? "c" : "") +
    (key.meta === true ? "m" : "") +
    (key.shift === true ? "s" : "") +
    // **`u` for sUper**, because `c`, `m` and `s` are taken and this spelling is
    // read by `slot` as well as printed by help — a letter that collided would
    // make two different chords one slot, which is the defect `super` exists to
    // stop rather than one to introduce alongside it (C16 I34).
    (key.super === true ? "u" : "");
  return mods === "" ? key.name : `${mods}+${key.name}`;
}

/** `(target, key)` as one comparable string. */
function slot(target: FocusTarget, key: Binding["key"]): string {
  return `${target} ${keyText(key)}`;
}

function describe(b: Binding): string {
  return `${b.target}:${keyText(b.key)} -> ${b.action}`;
}

export interface Keymap {
  /** What dispatch asks. `null` when nothing is bound. */
  resolve(target: FocusTarget, key: Key): Binding | null;
  /**
   * The whole table, for `/help`.
   *
   * The same objects `resolve` returns — see the module note. Ordered by
   * registration so help reads in the order the keymap was declared.
   */
  entries(): readonly Binding[];
  /**
   * A live block's own bindings, merged into `liveBlock` (A01 D4) — **and into
   * `interaction` where a key collides** (C16 §6, I27; C26 §4f).
   *
   * A key `global` or `liveBlock` already binds is not refused and not
   * shadowed: it lands at the `interaction` target, the one rung where the
   * built-ins are out of scope, so it fires only once the reader has entered
   * the block. Everything else lands at `liveBlock` and works from the first
   * `↓`. Two keys inside one block keymap is still a construction error.
   * Returns a withdrawal, called when the block freezes.
   */
  mergeBlock(blockKeymap: BlockKeymap): () => void;
}

/**
 * The default table (§6), seeded rather than filled.
 *
 * **It was seeded with three rows and the emptiness was called honest**, on the
 * grounds that C17's newline bindings were the only prompt keys any landed spec
 * named and that writing Ctrl-K or Ctrl-W here would invent a contract in the
 * file that is supposed to hold one. That was right about the reasoning and
 * wrong about the consequence, and the consequence stood for four components:
 * **backspace did nothing at a real prompt.** C17 implemented word motion, kill,
 * yank and undo, C22's effect table was total over the action union, and the
 * union had no editing action in it — every mechanism satisfied and the
 * vocabulary they were total over incomplete.
 *
 * The remedy was not to invent a contract but to notice the one already here:
 * **C17's public surface is the vocabulary** (C16 I21), so the union is derived
 * from the interface and the bindings are readline's — what a terminal user
 * already knows rather than a scheme this file chose. Each was pressed through
 * the real decoder before being written down (I17), and the one candidate the
 * decoder cannot produce is absent rather than approximated.
 *
 * C18, C19 and C20 add their rows when they land. A collision is a construction
 * error rather than last-wins (I10), so a later addition that shadows one of
 * these is loud rather than silent, which is what makes seeding safe.
 *
 * **Shift-Enter is in the table even though most terminals cannot send it**, and
 * that is I12's point rather than an oversight: the three include one binding
 * that depends on the terminal, and the two that do not are what make multi-line
 * input available everywhere. A table with only the reliable two would satisfy
 * half the invariant and lose the good behaviour on terminals that do implement
 * `modifyOtherKeys`.
 *
 * Ctrl-J is reachable only because `\n` and `\r` decode to different keys
 * (I17). It arrived here as a row resolving against an event nothing could
 * produce, which is what found that.
 */
export const defaultKeymap: readonly BuiltinBinding[] = [
  { target: "prompt", key: chordOf("newline"), action: "insertNewline" },
  { target: "prompt", key: { name: "enter", meta: true }, action: "insertNewline" },
  { target: "prompt", key: { name: "j", ctrl: true }, action: "insertNewline" },

  // --- C19 §6's seven ----------------------------------------------------
  //
  // **Declared here rather than imported from `completion/`**, and the first
  // attempt did import them. C16 is *consumed by* C19, so a row living in C19
  // and pulled in here makes the two directories mutually referential — the
  // file graph stays acyclic and passes, and the component graph does not. The
  // spec's own wording is the right one: these bindings are C16's. C19 declares
  // what it needs bound and this file is where bindings live.
  { target: "prompt", key: chordOf("focus.next"), action: "complete" },
  //
  // **One action, not two, and this table is what forces it.** Accepting the
  // ghost cannot be a row beside moving the cursor forward: two bindings for
  // one `(target, key)` is a construction error below, so the fallback lives in
  // the handler. The two-row design is the natural one and it fails at startup
  // rather than at the keystroke — loud, but still the seam rewritten.
  { target: "prompt", key: chordOf("move.right"), action: "acceptGhostOrForward" },

  // **The menu's four rows are `panel`, not `overlay`** (C15 §2c, I27,
  // R-BLK-109). The completion menu and reverse-i-search are panels — prompt
  // substates — so the target they answer at moved with the kind. They cannot
  // ride `pushedView`, which shares their rung: `escape` is `dismiss` here and
  // `viewPop` there, and one `(target, key)` takes one binding.
  { target: "panel", key: chordOf("focus.next"), action: "menuNext" },
  { target: "panel", key: chordOf("move.down"), action: "menuNext" },
  { target: "panel", key: chordOf("move.up"), action: "menuPrev" },
  { target: "panel", key: chordOf("confirm"), action: "menuAccept" },
  //
  // Generic rather than C19's alone, landing now because C19 is the first
  // dismissable overlay to arrive. It respects `dismissal`, so a confirm
  // still refuses `Esc` — C15's `pop()` inspects only the top and returns the
  // layer rather than a boolean, which is what lets one row serve both.
  //
  // **Twice, because dismissal is not a property of the kind** (C15 I26). A
  // panel is escapable by construction and an overlay is escapable when its
  // `dismissal` says so, and both need the row: with the menu a panel, an
  // `overlay`-only row would leave `esc` unbound over a completion, and a
  // `panel`-only row would leave a dismissable confirm unclosable.
  { target: "overlay", key: chordOf("escape"), action: "dismiss" },
  { target: "panel", key: chordOf("escape"), action: "dismiss" },

  // --- C20's three, and the fourth that is not here ----------------------
  //
  // `↑`/`↓` are bound on the prompt only. The `panel` target already has both
  // (C19's `menuPrev`/`menuNext`), and two bindings for one `(target, key)` is a
  // construction error rather than a last-wins — which is the table telling the
  // truth: while a menu is open the arrows belong to the menu, and C16 derives
  // the target from the stack (I1) rather than from what each consumer would
  // prefer.
  { target: "prompt", key: chordOf("move.up"), action: "historyPrev" },
  { target: "prompt", key: chordOf("move.down"), action: "historyNext" },
  { target: "prompt", key: { name: "r", ctrl: true }, action: "reverseSearch" },
  //
  // A second `⌃r` steps to an older match, and it is a `panel` row because
  // by then the search *is* the panel. `Tab`, `Enter` and `Esc` inside a
  // search are C19's three rows already in this table, dispatched to whichever
  // layer is on top — the handler reads `overlays.top`, which is L4's to do and
  // is why C20 adds no fourth row here.
  { target: "panel", key: { name: "r", ctrl: true }, action: "searchOlder" },

  // --- C17, readline's set and no more (I21, C16 §6) -----------------------
  //
  // **Every one of these was pressed through the real decoder before it was
  // written here** (I17, T2.13b), which is what the rule is for: a binding the
  // decoder cannot reach is a row `/help` renders and nothing dispatches. The
  // meta forms are the ones most likely not to survive that — `⌥⌫`, `⌥d`,
  // `⌥b`, `⌥f` — and all four do, arriving as the unmodified name with `meta`.
  //
  // **One candidate did not survive and is absent rather than approximated.**
  // `⌃_` and `⌃⇧-` are the same byte, 0x1f; the decoder maps 0x01 to 0x1a and
  // stops, so it emits a keyless raw name. `undo` and `redo` are actions with
  // no binding until a key the decoder produces is chosen for them.
  //
  // **`→` is deliberately not here.** It is already `acceptGhostOrForward`,
  // which moves a character right when there is no ghost, so a second row would
  // be the duplicate `(target, key)` construction error below.
  { target: "prompt", key: { name: "backspace" }, action: "backspace" },
  { target: "prompt", key: { name: "h", ctrl: true }, action: "backspace" },
  { target: "prompt", key: { name: "delete" }, action: "delete" },

  // **`⌃w` is now the only word-delete-left.** The comment here read *both
  // traditions, because they are distinct wire forms and no other binding wants
  // either* — and in M6 one does; see the row below.
  { target: "prompt", key: { name: "w", ctrl: true }, action: "killWordLeft" },
  // **`⌥⌫` left `killWordLeft` in M6** — the registry gives it to `queue.drop`
  // (§6a). `⌃w` keeps the verb, so nothing C17 exposes becomes unreachable;
  // what is lost is the second tradition's spelling of it.
  { target: "prompt", key: chordOf("queue.drop"), action: "queueDrop" },
  { target: "prompt", key: { name: "d", meta: true }, action: "killWordRight" },
  { target: "prompt", key: { name: "u", ctrl: true }, action: "killToStart" },
  { target: "prompt", key: { name: "k", ctrl: true }, action: "killToEnd" },
  { target: "prompt", key: { name: "y", ctrl: true }, action: "yank" },

  { target: "prompt", key: { name: "a", ctrl: true }, action: "home" },
  { target: "prompt", key: { name: "home" }, action: "home" },
  { target: "prompt", key: { name: "e", ctrl: true }, action: "end" },
  { target: "prompt", key: { name: "end" }, action: "end" },

  { target: "prompt", key: { name: "b", meta: true }, action: "wordLeft" },
  { target: "prompt", key: { name: "left", ctrl: true }, action: "wordLeft" },
  { target: "prompt", key: { name: "f", meta: true }, action: "wordRight" },
  { target: "prompt", key: { name: "right", ctrl: true }, action: "wordRight" },
  { target: "prompt", key: chordOf("move.left"), action: "left" },

  // **Not readline's, and confirmed twice before being written.** `⌃z` is the
  // one binding whose failure mode is that the session suspends, so neither
  // half was reasoned about: the decoder emits `{name: "z", ctrl: true}` for
  // 0x1a, and a real session typing that byte keeps taking input because raw
  // mode clears `ISIG` at acquire (C01 §2). `⌥z` is the same ESC-prefixed path
  // `⌥b`, `⌥d` and `⌥f` already take, and `⌃y` is not available for redo —
  // yank is the readline convention worth keeping.
  { target: "prompt", key: { name: "z", ctrl: true }, action: "undo" },
  { target: "prompt", key: { name: "z", meta: true }, action: "redo" },

  // --- the live block, and the way out of it (I22) -------------------------
  //
  // **Entry is `prompt:down`'s second clause, not a row here.** `↓` at the
  // bottom of history enters; these three are what makes that safe. Without
  // them focus lands in a block with no bindings and every key is dropped —
  // which is why the invariant holds entry, exit and the empty case together.
  //
  // `escape` is the route S01's footer already advertises as `esc prompt`.
  // --- scrolling, and the first built-in rows that target `global` (I23) ---
  //
  // **They were in a `switch` in L4, and two of the four were dead.**
  // `keymap.ts` binds `home` and `end` to the prompt's line motions, and the
  // prompt is dispatched before `global` at every moment it has focus — which
  // is nearly always — so `scrollToTop` and `scrollToBottom` had callers in the
  // shell and no route from a keyboard. C04's tier-5 row found it by being
  // written against `Home` and never reaching the top of a document.
  //
  // **The larger half is that none of them were bindings.** `/help` renders
  // from this table (C23 I26), so a key handled in imperative code is one the
  // shell cannot tell anyone about: PageUp has always scrolled and has never
  // been discoverable. Fifteen unexecuted bindings is the defect this file
  // already had; two executed ones outside it are its inverse.
  //
  // `Home`/`End` stay the line's and the document's extremes take the modified
  // pair, which is the distinction every editor draws — borrowed rather than
  // arbitrated. `g`/`G` cannot work here because the prompt takes letters; S12
  // draws them for a pushed view, which has no prompt competing.
  //
  // **Both wire forms were pressed through the real decoder before these were
  // written** (I17, T2.16), and neither needs a decoder change: xterm's
  // `CSI 1;5H` reaches `CSI_LETTER_KEYS` with `modifiersOf("5")` setting ctrl,
  // and rxvt's `CSI 7;5~` reaches `CSI_TILDE_KEYS` at the same name with the
  // same modifiers. Recorded because it held — the ruling was to drop the
  // binding rather than widen the decoder if it had not.
  //
  // **These newly occupy the `global` slots for four keys**, so `mergeBlock`
  // now refuses a block binding PageUp instead of shadowing the scroll. That is
  // the conflict rule working, and it is a change in behaviour.
  // --- the pushed view (I24) -----------------------------------------------
  //
  // Letters are available here for the reason §6 gives about `g`/`G`: a pushed
  // view has no prompt competing for them. `pageup`/`pagedown` appear at two
  // targets deliberately — that is one key at two targets resolved by the
  // ladder, not the duplicate `(target, key)` the conflict rule refuses.
  // **Eleven rows went with the `pushedView` target** (C22 §13a, C25 §3b,
  // C28 §3c, R-EXA-082, F1254): `n`/`p`, `g`/`G`, the two page keys and their
  // `⌥`-arrow pairs, `tab`/`⇧tab` and `escape`. Three surfaces shared the target
  // and every one is a transcript entry now, so the keys that scroll them are the
  // transcript's — which is `R-EXA-082`'s point restated at the keymap: *it was
  // already a scroll container; it needed no frame*, and a frame is what a second
  // set of scroll bindings is.

  // --- selection (C17 §5b, entry 15 step 2) --------------------------------
  //
  // **Every wire form here was pressed through the real decoder before it was
  // written down** (T2.13, T2.14), and the check cost two of the four rows it
  // was given: `⇧⌃a`/`⇧⌃e` for line start and end are ctrl+shift+letter, which
  // is the same `0x01` that killed `⌃⇧a`. `⇧Home`/`⇧End` replace them and are
  // what GUI editors use anyway.
  //
  // **`⌥⇧←` has two wire forms and they disagreed until step 0.** A terminal
  // sending Option as Alt gives `CSI 1;4D`; one sending it as Meta gives
  // `CSI 1;10D`, which the decoder read as `⇧←` because `modifiersOf` never
  // looked at xterm's bit 8. Both forms are in T2.13's table so the row cannot
  // pass on half the terminals.
  { target: "prompt", key: chordOf("selection.left"), action: "extendCharLeft" },
  { target: "prompt", key: chordOf("selection.right"), action: "extendCharRight" },
  { target: "prompt", key: { name: "left", meta: true, shift: true }, action: "extendWordLeft" },
  { target: "prompt", key: { name: "right", meta: true, shift: true }, action: "extendWordRight" },
  { target: "prompt", key: { name: "home", shift: true }, action: "extendLineStart" },
  { target: "prompt", key: { name: "end", shift: true }, action: "extendLineEnd" },
  // **`⌥a`, not `⌃⇧a`.** `⌃a` is line-start in every readline application and
  // `⌃⇧a` is the same byte, so the row would have resolved against `home` and
  // one of the two would silently never run. Not a collision — the byte has a
  // meaning.
  { target: "prompt", key: { name: "a", meta: true }, action: "selectAll" },
  // **`⌥w`, the emacs `kill-ring-save` key**, and the choice is forced rather
  // than preferred: `⌃c` is cancel at every rung of the ladder and `⌃w` is a
  // word kill in every readline application. Checked through the decoder —
  // `ESC w` is `m+w`, and `w` is free on the meta path.
  { target: "prompt", key: { name: "w", meta: true }, action: "copySelection" },

  // --- the transcript's selection (C26 §5c) --------------------------------
  //
  // **`liveBlock`, never `interaction`** — C16 §5a row A4. A block's declared
  // keys are an open set (C26 I14), and the two being separate targets is what
  // makes that structural rather than a rule someone has to remember.
  //
  // Plain `y`, because this target has no prompt competing for letters — the
  // same argument `pushedView`'s `n`/`p`/`g` make. Checked through the decoder:
  // `⇧↑` is `CSI 1;2A` and `⇧↓` is `CSI 1;2B`, both `s+up`/`s+down`.
  { target: "liveBlock", key: chordOf("selection.up"), action: "extendRowUp" },
  { target: "liveBlock", key: chordOf("selection.down"), action: "extendRowDown" },
  { target: "liveBlock", key: { name: "y" }, action: "copyElement" },
  // **`⌃a`, free at this target and measured so** (C26 §5c): dispatching it
  // with focus on a row left the store unchanged before this row existed. At
  // `prompt` the same byte is `home`, which is why the transcript's select-all
  // is a different action from the editor's `⌥a`. Wire form `0x01`, the byte
  // T2.13 already walks for `prompt c+a`.
  { target: "liveBlock", key: { name: "a", ctrl: true }, action: "selectAllElements" },

  // --- copy mode (C16 §5b, entry 15 step 1) --------------------------------
  //
  // **`⌥v` is PROVISIONAL and the word is load-bearing.** Which key enters copy
  // mode is a question for the rebindable-keys row and is deliberately still
  // open; shipping the mode with no way in is B1's failure inverted — a mode
  // that can be left and never entered — so a default is picked and labelled
  // rather than deferred. `v` for *visual*, on the meta path `⌥b`/`⌥d`/`⌥f`
  // already use, and free in this table.
  //
  // **Checked through the real decoder before being written down** (T2.13,
  // T2.14): `ESC v` decodes as `{name: "v", meta: true}`.
  //
  // **Two targets, not `global`.** `activeTarget` answers `global` only with no
  // live entry and focus away from the prompt, so a `global` row would resolve
  // almost nowhere. Not `interaction`: a block's declared keys are an open set
  // (C26 I14) and a framework binding there shadows one — C16 §5a row A4.
  // **`⌥⇧C` is `{name: "C", meta: true}` and not `meta+shift+c`** (I17): `ESC C`
  // names the character it carries, and the decoder sets no shift bit for a
  // capital. Pressed through the real decoder before being written down, which
  // is what T2.13b refused the first spelling on.
  //
  // **`⌥v` left `enterCopyMode` in M6, and the design supplied the replacement
  // itself** (§6a): the registry gives `⌥v` to `values.toggle` and copy mode its
  // own two chords — `⌥⇧C` native handoff, `⌥⇧V` semantic. So nothing is
  // invented and no chord is chosen here. M10 finishes the rename.
  { target: "prompt", key: chordOf("selection.native"), action: "enterCopyMode" },
  { target: "liveBlock", key: chordOf("selection.native"), action: "enterCopyMode" },
  { target: "prompt", key: chordOf("values.toggle"), action: "valuesToggle" },
  { target: "liveBlock", key: chordOf("values.toggle"), action: "valuesToggle" },
  { target: "prompt", key: chordOf("selection.semantic"), action: "enterSemanticSelection" },
  { target: "liveBlock", key: chordOf("selection.semantic"), action: "enterSemanticSelection" },
  // The target's own dismissal, as `viewPop` is the view's (C16 §5c). `⌃c` stays
  // the ladder's; both exist for `pushedView` too, and I24 defends the pair.
  { target: "copyMode", key: chordOf("escape"), action: "exitCopyMode" },

  { target: "global", key: { name: "pageup" }, action: "scrollPageUp" },
  { target: "global", key: { name: "pagedown" }, action: "scrollPageDown" },
  { target: "global", key: { name: "home", ctrl: true }, action: "scrollTop" },
  { target: "global", key: { name: "end", ctrl: true }, action: "scrollBottom" },

  { target: "liveBlock", key: chordOf("escape"), action: "focusPrompt" },
  { target: "liveBlock", key: chordOf("move.down"), action: "rowDown" },
  { target: "liveBlock", key: chordOf("move.up"), action: "rowUp" },
  // **The point of being here at all** (C23 I37, F21). `escape`, `down` and `up`
  // were the whole of this target: a cursor with nothing to press. `enter` is
  // the same key `overlay` accepts a menu item with, which is the consistency a
  // reader has already learnt by the time they reach a row.
  { target: "liveBlock", key: chordOf("confirm"), action: "rowActivate" },

  // **A working key gains a second meaning, and that is a behaviour change**
  // (C04 §3c, C26 §4b). `pageup`/`pagedown` are bound at `global` to the
  // transcript's viewport and had no `liveBlock` row at all, so paging inside a
  // focused block used to scroll the transcript underneath it. The ladder makes
  // these win while focus is in a block and leaves the global pair untouched
  // everywhere else — one key at two targets resolved by priority, which is the
  // same shape the `pushedView` pair already notes and not the duplicate the
  // conflict rule refuses.
  //
  // **Movement moves focus; paging moves the window** (C26 I18). These never
  // touch focus, which is what makes a focused element outside the box a legal
  // state rather than a thing to correct.
  // **The camera's one writer, and `[` `]` rather than `←` `→`** (C22 I71).
  // The design's manual scheme is arrows and step 8 owns it; claiming them here
  // would take two keys from every focused block for a feature one block kind
  // has — and `←` at `liveBlock` was said to fall through to the prompt, which
  // was never measured and is false: see the horizontal pair below. `[` and `]`
  // are free at this target, and a plain printable owned by a focused block is
  // `y`'s precedent and C26 I2's ruling — *the block owns its keys while the
  // reader is inside it*.
  //
  // **The effect is a no-op on a block with no camera**, which is a key consumed
  // and nothing drawn. That is the cost of binding before the form exists, and
  // it is smaller than the alternative: a field nothing can move is
  // `cursorPositions` (C12 §3s).
  //
  // **Step 8 completes the family and the arrows still do not survive** (C22
  // I75, §6i.3). The design note's scheme is `← →` azimuth, `↑ ↓` elevation,
  // `+ −` distance, `r` resets: `↑` and `↓` are `rowUp` and `rowDown` two rows
  // up and the duplicate check refuses them, and `← →` were dropped at this
  // target (not passed to the prompt, whatever the record said) — so the
  // shifted brackets take the elevation, which keeps the sign
  // convention of the key they are shifted from. `{` lowers and `}` raises,
  // exactly as `[` turns one way and `]` the other.
  //
  // **`=` beside `+` because `+` is shifted on every layout this ships to**, and
  // two keys for one action is not the duplicate the conflict rule refuses —
  // that is one key at one target with two actions.
  { target: "liveBlock", key: { name: "[" }, action: "orbitLeft" },
  { target: "liveBlock", key: { name: "]" }, action: "orbitRight" },
  { target: "liveBlock", key: { name: "{" }, action: "tiltDown" },
  { target: "liveBlock", key: { name: "}" }, action: "tiltUp" },
  { target: "liveBlock", key: { name: "+" }, action: "dollyIn" },
  { target: "liveBlock", key: { name: "=" }, action: "dollyIn" },
  { target: "liveBlock", key: { name: "-" }, action: "dollyOut" },
  { target: "liveBlock", key: { name: "r" }, action: "cameraReset" },
  { target: "liveBlock", key: { name: "o" }, action: "orbitToggle" },
  { target: "liveBlock", key: { name: "pagedown" }, action: "blockPageDown" },
  { target: "liveBlock", key: { name: "pageup" }, action: "blockPageUp" },

  // --- between entries (C26 I21, §4g) --------------------------------------
  //
  // **The only two keys that move focus out of an entry without leaving the
  // transcript.** `tab` was free at this target — the prompt's `tab` is
  // `complete` and the overlay's is `menuNext`, one key at three targets
  // resolved by the ladder. `⇧tab`'s wire form is `CSI Z`, which the decoder
  // did not produce until this row needed it (C16 §2): T2.13 is what would
  // have refused the row, and adding the form rather than picking another key
  // is the ruling I17 leaves room for when the form is one every terminal sends.
  { target: "liveBlock", key: chordOf("focus.next"), action: "entryNext" },
  { target: "liveBlock", key: chordOf("focus.previous"), action: "entryPrev" },

  // --- the horizontal pair (C22 I76, C12 §3s) -------------------------------
  //
  // **`←` and `→` did nothing at this target, and the comment above said they
  // fell through to the prompt.** They did not: dispatch runs the target's
  // handlers and then `global`, and neither binds an arrow, so both were
  // dropped (C16 §4 step 3). A claim carried through two rulings — C22 I71 chose
  // `[` `]` on it — and measured by nothing until a row wanted the keys. The
  // vertical pair steps elements; this pair is the horizontal axis of the same
  // movement, with the plot's crosshair as its first consumer and a table's
  // column cursor the second (C26 §11), which is why it is a built-in at
  // `liveBlock` rather than one kind's key.
  { target: "liveBlock", key: chordOf("move.left"), action: "cursorLeft" },
  { target: "liveBlock", key: chordOf("move.right"), action: "cursorRight" },

  // --- re-run the focused entry (C23 I18) -----------------------------------
  //
  // **The prompt's own newline pair, at the other target, meaning *run*.** A
  // notebook's convention for *run this cell* is `⇧⏎`, and it is the pair the
  // prompt already binds to `insertNewline` — both wire forms are pressed
  // through the decoder there (I17, T2.13), so nothing new has to be. Two keys
  // for one action is not the duplicate the conflict rule refuses, and the
  // terminal-dependent one is kept for I12's reason: the meta form works
  // everywhere and the shift form is better where it exists.
  { target: "liveBlock", key: chordOf("newline"), action: "rerunEntry" },
  { target: "liveBlock", key: { name: "enter", meta: true }, action: "rerunEntry" },

  // --- §6a, M6: the design's routes ------------------------------------------
  //
  // **Both profiles are in this table, because a profile is a condition and not
  // a second keymap** (I35). `resolve` refuses a binding the terminal is not in,
  // and the duplicate check runs within a profile — so `⌥w` and `⌃⇧C` may both
  // be `copy` without the two ever meeting.
  //
  // `⌘`, `⇧⏎`, `⌃⇧`-letters and `⌃⇥` are byte-identical to their unmodified
  // forms on a terminal without the Kitty protocol, so each of those actions
  // needs a base route too (I36). Six of the eight base routes are chords this
  // table already binds to the same meaning, which is the argument for them.

  // Help — a durable transcript entry, not a layer (R-KEY-005).
  { target: "global", key: chordOf("help.f1"), action: "helpKeymap" },
  { target: "liveBlock", key: chordOf("help.question"), action: "helpKeymap" },

  // `focus.previous` — the prompt had no `⇧⇥`, and the owner line advertises it.
  { target: "prompt", key: chordOf("focus.previous"), action: "focusTranscript" },

  // `page.up` / `page.down`. `pageup`/`pagedown` are already bound at `global`;
  // these are the design's chords for the same operation, and M5's intercept
  // table classifies all four as `page-scroll` before the ladder sees them.
  { target: "global", key: chordOf("page.up"), action: "scrollPageUp" },
  { target: "global", key: chordOf("page.down"), action: "scrollPageDown" },

  // **`transcript.top` / `transcript.bottom`, restored** (§6a, I41). The earlier
  // note here said `⌘↑` has no wire form, having measured that `CSI 1;9A` folds
  // to `{name: "up", meta: true}` — the same key as `⌥↑`. That was the decoder's
  // limit reported as the terminal's: `⌘↑` is `CSI 1;9A` and `⌥↑` is `CSI 1;3A`,
  // and those are different bytes. Bit 8 is Meta in xterm's encoding and Super in
  // kitty's, so `modifiersOf` now reads it by the negotiated protocol and the two
  // chords stop being one key on a terminal that distinguishes them.
  //
  // Enhanced only: without the protocol, bit 8 *is* Meta and the fold is correct,
  // so these rows would collide with `⌥↑` exactly as the old note said. `⌃home`
  // and `⌃end` remain the `default-terminal` routes, which is I36.
  {
    target: "global",
    key: chordOf("transcript.top"),
    action: "scrollTop",
    profile: "enhanced-terminal",
  },
  {
    target: "global",
    key: chordOf("transcript.bottom"),
    action: "scrollBottom",
    profile: "enhanced-terminal",
  },

  // `copy` / `paste`. The base routes are `⌥w` → `copySelection` and `⌃y` →
  // `yank`, both already bound at `prompt`; these are the enhanced spellings.
  {
    target: "prompt",
    key: chordOf("copy"),
    action: "copySelection",
    profile: "enhanced-terminal",
  },
  {
    target: "prompt",
    key: chordOf("paste"),
    action: "yank",
    profile: "enhanced-terminal",
  },

  // --- the captured child's one key (I49, R-BLK-908) ---------------------
  //
  // **Every other key is the child's, and that is the handler's doing rather
  // than the table's**: the child's handler consumes what it does not bind, so
  // there is nothing here to list. What the table owns is the exception — *a
  // captured child reserves one `host.detach` action because a `/command`
  // cannot reach the host while capture is active.*
  //
  // `⌥esc` is `enhanced-terminal` only. Without the protocol it arrives as
  // `ESC ESC`, which is the lone-`Esc` disambiguation window rather than a
  // chord — and `esc` belongs to the child (R-INT-007), so a base-profile row
  // would take the child's own key away on the terminals least able to say so.
  { target: "child", key: chordOf("host.detach"), action: "hostDetach" },
  {
    target: "child",
    key: chordOfBinding("binding.host-detach-enhanced"),
    action: "hostDetach",
    profile: "enhanced-terminal",
  },

  // `posture.cycle` — reserved, no effect (I38).
  { target: "global", key: chordOf("posture.cycle"), action: "postureCycle" },

  // The agent strip: eleven reserved chords, each in both profiles (I38).
  // `⌥,` and `⌥.` replace `⌥⇥`/`⇧⌥⇥`, which the OS window switcher takes on
  // Windows and most Linux desktops — the compositor never hands them over.
  { target: "global", key: { name: ",", meta: true }, action: "agentPrevious" },
  { target: "global", key: { name: ".", meta: true }, action: "agentNext" },
  {
    target: "global",
    key: chordOf("agent.next"),
    action: "agentNext",
    profile: "enhanced-terminal",
  },
  {
    target: "global",
    key: chordOf("agent.previous"),
    action: "agentPrevious",
    profile: "enhanced-terminal",
  },
  { target: "global", key: { name: "1", meta: true }, action: "agent1" },
  {
    target: "global",
    key: chordOf("agent.1"),
    action: "agent1",
    profile: "enhanced-terminal",
  },
  { target: "global", key: { name: "2", meta: true }, action: "agent2" },
  {
    target: "global",
    key: chordOf("agent.2"),
    action: "agent2",
    profile: "enhanced-terminal",
  },
  { target: "global", key: { name: "3", meta: true }, action: "agent3" },
  {
    target: "global",
    key: chordOf("agent.3"),
    action: "agent3",
    profile: "enhanced-terminal",
  },
  { target: "global", key: { name: "4", meta: true }, action: "agent4" },
  {
    target: "global",
    key: chordOf("agent.4"),
    action: "agent4",
    profile: "enhanced-terminal",
  },
  { target: "global", key: { name: "5", meta: true }, action: "agent5" },
  {
    target: "global",
    key: chordOf("agent.5"),
    action: "agent5",
    profile: "enhanced-terminal",
  },
  { target: "global", key: { name: "6", meta: true }, action: "agent6" },
  {
    target: "global",
    key: chordOf("agent.6"),
    action: "agent6",
    profile: "enhanced-terminal",
  },
  { target: "global", key: { name: "7", meta: true }, action: "agent7" },
  {
    target: "global",
    key: chordOf("agent.7"),
    action: "agent7",
    profile: "enhanced-terminal",
  },
  { target: "global", key: { name: "8", meta: true }, action: "agent8" },
  {
    target: "global",
    key: chordOf("agent.8"),
    action: "agent8",
    profile: "enhanced-terminal",
  },
  { target: "global", key: { name: "9", meta: true }, action: "agent9" },
  {
    target: "global",
    key: chordOf("agent.9"),
    action: "agent9",
    profile: "enhanced-terminal",
  },

];

/**
 * The union, as a value (I19).
 *
 * **Not "the actions the default rows bind", which was the first cut and was
 * wrong by nine.** `toggleSeries1` … `toggleSeries9` are in `KeyAction` and in
 * L4's effect table, and no default row binds them: they reach the keymap only
 * through the plot's `mergeBlock` (C12 I116). Measured with the digits counted —
 * 78 in the union, 69 bound by a default row, 78 in the effect table — after a
 * first measurement whose `[A-Za-z]+` silently excluded every name with a digit
 * and reported 69 of 69. A check against the rows refused the plot's own digits.
 *
 * **Total by type, so it cannot drift**: `satisfies Record<KeyAction, true>`
 * fails to compile on a missing member and on a name outside the union, which is
 * the same guarantee `keys.ts`'s table carries for the executors. L3 still holds
 * no copy of L4's *table* — this is the vocabulary, which is C16's own (I19).
 */
/**
 * The chord the registry names for a design verb (§6b, I42, R-KEY-007).
 *
 * **The chord is written in `calcium-registry.json` and nowhere else.** M6 had it
 * hand-written here as well, with a rule comparing the two — two records of one
 * fact, where the gate catches drift after it happens and makes the copy look
 * deliberate. `registry-bindings.ts` is generated from the registry, and a row
 * above that the registry names takes its key from here.
 *
 * **The `target` and the action stay on the row, because the registry does not
 * hold them.** Nine of its bindings are one verb several owners spell
 * differently — `escape` is `dismiss` at an overlay, `viewPop` in a view,
 * `exitCopyMode` while frozen and `focusPrompt` in the transcript — so
 * `actionId` does not select a handler. That is R-KEY-003's *unless the current
 * owner explicitly captures the action*, and the registry's `when: "focused"` is
 * the design saying the owner decides. The join is the row: this supplies the
 * chord, the row supplies who and what.
 *
 * **`profile` is not taken from the registry, and that is a finding rather than
 * an omission.** Every registry binding carries `profile: "default-terminal"` —
 * measured, all 39 — while this table marks 15 rows `enhanced-terminal`. The two
 * fields share a name and a value space and mean different things: the design's
 * asserts the route it intends, and this one records whether a terminal without
 * the Kitty protocol can *deliver* the bytes. §6a measured four families that
 * cannot — `⌃⇧`-letters, `⇧⏎`, `⌃⇥` and `⌘n` are byte-identical to their
 * unmodified forms — so generating `profile` from the registry would bind chords
 * on terminals that can never send them. It stays a row's own declaration.
 */
/**
 * The chord of one **named binding**, for an action the registry gives two.
 *
 * `chordOf` takes the first row for an action and that is right while an action
 * has one chord. `host.detach` has two by design — *its base candidate is `⌃]`;
 * `⌥esc` is an enhancement* (R-BLK-908) — so the profile split lives in the
 * registry rather than in a literal here, and the row that wants the second one
 * has to say which. Asking by id rather than by `(actionId, profile)` because
 * the profile is the keymap row's own declaration and reading it from two
 * places is the drift §6b exists to end.
 */
function chordOfBinding(id: string): Binding["key"] {
  const found = REGISTRY_BINDINGS.find((b) => b.id === id);
  if (found === undefined) throw new Error(`no registry binding ${id}`);
  return found.key;
}

function chordOf(actionId: string): Binding["key"] {
  const found = REGISTRY_BINDINGS.find((b) => b.actionId === actionId);
  // A build-time fact, thrown rather than defaulted: a missing id means the
  // registry changed under a row that still names it, and a fallback chord would
  // bind something nobody asked for (T1.96).
  if (found === undefined) throw new Error(`no registry binding for ${actionId}`);
  return found.key;
}

const BUILTIN_ACTIONS: ReadonlySet<string> = new Set(
  Object.keys({
    insertNewline: true,
    complete: true,
    acceptGhostOrForward: true,
    menuNext: true,
    menuPrev: true,
    menuAccept: true,
    dismiss: true,
    historyPrev: true,
    historyNext: true,
    reverseSearch: true,
    searchOlder: true,
    backspace: true,
    delete: true,
    killWordLeft: true,
    killWordRight: true,
    killToStart: true,
    killToEnd: true,
    yank: true,
    undo: true,
    redo: true,
    wordLeft: true,
    wordRight: true,
    home: true,
    end: true,
    left: true,
    extendCharLeft: true,
    extendCharRight: true,
    extendWordLeft: true,
    extendWordRight: true,
    extendLineStart: true,
    extendLineEnd: true,
    selectAll: true,
    copySelection: true,
    extendRowUp: true,
    extendRowDown: true,
    copyElement: true,
    selectAllElements: true,
    focusPrompt: true,
    rowUp: true,
    rowDown: true,
    entryPrev: true,
    entryNext: true,
    cursorLeft: true,
    cursorRight: true,
    rerunEntry: true,
    orbitLeft: true,
    orbitRight: true,
    tiltDown: true,
    tiltUp: true,
    dollyIn: true,
    dollyOut: true,
    cameraReset: true,
    orbitToggle: true,
    toggleSeries1: true,
    toggleSeries2: true,
    toggleSeries3: true,
    toggleSeries4: true,
    toggleSeries5: true,
    toggleSeries6: true,
    toggleSeries7: true,
    toggleSeries8: true,
    toggleSeries9: true,
    blockPageDown: true,
    blockPageUp: true,
    rowActivate: true,
    scrollPageUp: true,
    scrollPageDown: true,
    scrollTop: true,
    scrollBottom: true,
    enterCopyMode: true,
    exitCopyMode: true,
    // --- §6a, M6 ------------------------------------------------------------
    helpKeymap: true,
    focusTranscript: true,
    agentNext: true,
    agentPrevious: true,
    agent1: true,
    agent2: true,
    agent3: true,
    agent4: true,
    agent5: true,
    agent6: true,
    agent7: true,
    agent8: true,
    agent9: true,
    hostDetach: true,
    postureCycle: true,
    valuesToggle: true,
    queueDrop: true,
    enterSemanticSelection: true,
  } satisfies Readonly<Record<KeyAction, true>>),
);

/**
 * Construction-time duplicate detection (I10, T2.4).
 *
 * **This is not the same check as `mergeBlock`'s, and the two are deliberately
 * separate code paths.** This one runs once, over a static array, at startup, and
 * a duplicate here is a programming error in the default keymap or in a user's
 * config. `mergeBlock`'s runs per committed block, over data an *adapter*
 * produced, at a moment when a session is already running — and it can only be
 * checked then, because the block does not exist until it is committed.
 *
 * A single check covering both would have to run at the later moment, which would
 * let a duplicate in the default keymap reach a user's session before anyone
 * heard about it.
 */
export function createKeymap(
  bindings: readonly Binding[],
  /**
   * Which terminal this session is (C16 I35, §6a). A binding with no `profile`
   * is in both; one with a profile resolves only in its own.
   *
   * **The filter is here rather than in `resolve`**, so the collision check
   * below runs over exactly the set that can fire: a base route and an enhanced
   * route for one action may share a `(target, key)` in principle, and refusing
   * that globally would forbid the very pairing §6a's table is made of.
   */
  profile: KeyProfile = "default-terminal",
): Keymap {
  const bySlot = new Map<string, Binding>();
  const inProfile = bindings.filter((b) => b.profile === undefined || b.profile === profile);

  for (const b of inProfile) {
    const s = slot(b.target, b.key);
    const clash = bySlot.get(s);
    if (clash !== undefined) {
      // Names both, per T2.4. A message naming only the loser sends the reader
      // looking for a binding that is fine.
      throw new KeymapError(
        `duplicate binding for ${b.target} ${b.key.name}: ${describe(clash)} and ${describe(b)}. ` +
          `Two bindings for one (target, key) is a construction error rather than a last-wins, ` +
          `because a silently shadowed binding is one nobody can find.`,
      );
    }
    bySlot.set(s, b);
  }

  const order: Binding[] = [...inProfile];
  /** Block bindings live apart, so withdrawing them cannot disturb the base table. */
  let block: ReadonlyMap<string, Binding> = new Map();

  return {
    resolve(target, key) {
      const s = slot(target, key);
      return block.get(s) ?? bySlot.get(s) ?? null;
    },

    entries() {
      return Object.freeze([...order, ...block.values()]);
    },

    mergeBlock(blockKeymap) {
      const next = new Map<string, Binding>();
      for (const entry of blockKeymap) {
        // **A collision is a placement, not a refusal** (I27). This used to
        // throw on a key `global` or `liveBlock` already bound — *the global
        // wins and the refusal is loud* — and its first consumer would have
        // tripped it on every key it has: the widget design binds `↑` `↓`
        // `PgUp` `PgDn` and `Esc`, all five of which are built-ins here. The
        // mode C26 §4f describes exists for exactly these keys: `interaction`
        // is the one rung where the built-ins are out of scope, so a colliding
        // key is bound there and fires once the reader has entered the block
        // (`⏎`, C26 I14), while a free key stays at `liveBlock` and works from
        // the first `↓` (A01 D4). Neither half is shadowed and nothing is
        // silent: `/help` lists both, at their targets.
        // **An action no built-in row binds is refused, not placed** (I19). The
        // sentence this implements used to promise a C23 §3a route for an open
        // string, and there is none: the binding would resolve and then execute
        // nothing, silently, at every press.
        if (!BUILTIN_ACTIONS.has(entry.action)) {
          throw new KeymapError(
            `block keymap binds ${entry.key.name} to "${entry.action}", which names no built-in action ` +
              `(C16 I19). L4's effect table has no entry for it, so the key would resolve and do nothing; ` +
              `refused here, where the block's author can see it.`,
          );
        }
        const collides =
          bySlot.has(slot("global", entry.key)) || bySlot.has(slot("liveBlock", entry.key));
        const target: FocusTarget = collides ? "interaction" : "liveBlock";
        const binding: Binding = Object.freeze({ target, key: entry.key, action: entry.action });
        const s = slot(target, entry.key);

        // Two keys inside one block keymap is still the construction error it
        // always was (I10): the block's author wrote both, and neither can win.
        const twice = next.get(s);
        if (twice !== undefined) {
          throw new KeymapError(
            `block keymap binds ${entry.key.name} twice: ${describe(twice)} and ${describe(binding)}. ` +
              `Two bindings for one key in one block is a construction error rather than a last-wins.`,
          );
        }
        next.set(s, binding);
      }

      block = next;
      return () => {
        // Withdrawn on freeze, so `s` sorts a live `/ps` table and does nothing
        // once a newer entry arrives.
        if (block === next) block = new Map();
      };
    },
  };
}
