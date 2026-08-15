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

import type { Binding, BlockKeymap, BuiltinBinding, FocusTarget, Key } from "./types.js";

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
    (key.shift === true ? "s" : "");
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
   * A live block's own bindings, merged into `liveBlock` (A01 D4).
   *
   * Refused rather than shadowed when it collides — see below. Returns a
   * withdrawal, called when the block freezes.
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
  { target: "prompt", key: { name: "enter", shift: true }, action: "insertNewline" },
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
  { target: "prompt", key: { name: "tab" }, action: "complete" },
  //
  // **One action, not two, and this table is what forces it.** Accepting the
  // ghost cannot be a row beside moving the cursor forward: two bindings for
  // one `(target, key)` is a construction error below, so the fallback lives in
  // the handler. The two-row design is the natural one and it fails at startup
  // rather than at the keystroke — loud, but still the seam rewritten.
  { target: "prompt", key: { name: "right" }, action: "acceptGhostOrForward" },

  { target: "overlay", key: { name: "tab" }, action: "menuNext" },
  { target: "overlay", key: { name: "down" }, action: "menuNext" },
  { target: "overlay", key: { name: "up" }, action: "menuPrev" },
  { target: "overlay", key: { name: "enter" }, action: "menuAccept" },
  //
  // Generic rather than C19's alone, landing now because C19 is the first
  // dismissable overlay to arrive. It respects `dismissable`, so a confirm
  // still refuses `Esc` — C15's `pop()` inspects only the top and returns the
  // layer rather than a boolean, which is what lets one row serve both.
  { target: "overlay", key: { name: "escape" }, action: "dismiss" },

  // --- C20's three, and the fourth that is not here ----------------------
  //
  // `↑`/`↓` are bound on the prompt only. The `overlay` target already has both
  // (C19's `menuPrev`/`menuNext`), and two bindings for one `(target, key)` is a
  // construction error rather than a last-wins — which is the table telling the
  // truth: while a menu is open the arrows belong to the menu, and C16 derives
  // the target from the stack (I1) rather than from what each consumer would
  // prefer.
  { target: "prompt", key: { name: "up" }, action: "historyPrev" },
  { target: "prompt", key: { name: "down" }, action: "historyNext" },
  { target: "prompt", key: { name: "r", ctrl: true }, action: "reverseSearch" },
  //
  // A second `⌃r` steps to an older match, and it is an `overlay` row because
  // by then the search *is* the overlay. `Tab`, `Enter` and `Esc` inside a
  // search are C19's three rows already in this table, dispatched to whichever
  // layer is on top — the handler reads `overlays.top`, which is L4's to do and
  // is why C20 adds no fourth row here.
  { target: "overlay", key: { name: "r", ctrl: true }, action: "searchOlder" },

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

  // Both traditions for word-delete-left, because they are distinct wire forms
  // and no other binding wants either.
  { target: "prompt", key: { name: "w", ctrl: true }, action: "killWordLeft" },
  { target: "prompt", key: { name: "backspace", meta: true }, action: "killWordLeft" },
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
  { target: "prompt", key: { name: "left" }, action: "left" },

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
  { target: "pushedView", key: { name: "n" }, action: "viewNextHunk" },
  { target: "pushedView", key: { name: "p" }, action: "viewPrevHunk" },
  { target: "pushedView", key: { name: "g" }, action: "viewTop" },
  // **`G`, not `{name: "g", shift: true}`** (I17). The decoder gives a plain
  // printable its own character as its name and never sets `shift` — a capital
  // arrives as `G`, so the modifier form is a row nothing can produce. T2.13
  // caught it, which is the third time that check has found an unreachable
  // binding and the first where the binding looked more correct than the fix.
  { target: "pushedView", key: { name: "G" }, action: "viewBottom" },
  { target: "pushedView", key: { name: "pageup" }, action: "viewPageUp" },
  { target: "pushedView", key: { name: "pagedown" }, action: "viewPageDown" },
  { target: "pushedView", key: { name: "up" }, action: "viewPageUp" },
  { target: "pushedView", key: { name: "down" }, action: "viewPageDown" },
  { target: "pushedView", key: { name: "escape" }, action: "viewPop" },

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
  { target: "prompt", key: { name: "left", shift: true }, action: "extendCharLeft" },
  { target: "prompt", key: { name: "right", shift: true }, action: "extendCharRight" },
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
  { target: "liveBlock", key: { name: "up", shift: true }, action: "extendRowUp" },
  { target: "liveBlock", key: { name: "down", shift: true }, action: "extendRowDown" },
  { target: "liveBlock", key: { name: "y" }, action: "copyElement" },

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
  { target: "prompt", key: { name: "v", meta: true }, action: "enterCopyMode" },
  { target: "liveBlock", key: { name: "v", meta: true }, action: "enterCopyMode" },

  { target: "global", key: { name: "pageup" }, action: "scrollPageUp" },
  { target: "global", key: { name: "pagedown" }, action: "scrollPageDown" },
  { target: "global", key: { name: "home", ctrl: true }, action: "scrollTop" },
  { target: "global", key: { name: "end", ctrl: true }, action: "scrollBottom" },

  { target: "liveBlock", key: { name: "escape" }, action: "focusPrompt" },
  { target: "liveBlock", key: { name: "down" }, action: "rowDown" },
  { target: "liveBlock", key: { name: "up" }, action: "rowUp" },
  // **The point of being here at all** (C23 I37, F21). `escape`, `down` and `up`
  // were the whole of this target: a cursor with nothing to press. `enter` is
  // the same key `overlay` accepts a menu item with, which is the consistency a
  // reader has already learnt by the time they reach a row.
  { target: "liveBlock", key: { name: "enter" }, action: "rowActivate" },

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
  { target: "liveBlock", key: { name: "pagedown" }, action: "blockPageDown" },
  { target: "liveBlock", key: { name: "pageup" }, action: "blockPageUp" },
];

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
export function createKeymap(bindings: readonly Binding[]): Keymap {
  const bySlot = new Map<string, Binding>();

  for (const b of bindings) {
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

  const order: Binding[] = [...bindings];
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
        const binding: Binding = Object.freeze({
          target: "liveBlock" as const,
          key: entry.key,
          action: entry.action,
        });
        const s = slot("liveBlock", entry.key);

        // The global always wins, and a silent shadow would be worse than a loud
        // refusal (§6). Checked against `global` *and* against an existing
        // `liveBlock` binding: the spec names the global case because that is the
        // one an adapter author will hit, and a block shadowing the built-in
        // `liveBlock` navigation is the same defect with a smaller blast radius.
        const globalClash = bySlot.get(slot("global", entry.key)) ?? bySlot.get(s);
        if (globalClash !== undefined) {
          throw new KeymapError(
            `block keymap binds ${entry.key.name}, which ${describe(globalClash)} already binds. ` +
              `Raised when the block is committed rather than at startup, because the block ` +
              `does not exist until then — the global wins and the refusal is loud.`,
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
