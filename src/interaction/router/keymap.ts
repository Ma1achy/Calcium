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
 * **Three rows, and the emptiness of the rest is honest.** C17's newline
 * bindings are the only prompt keys any landed spec names: C17 §4 states all
 * three and I12 requires that at least two work on a terminal that cannot
 * distinguish Shift-Enter. Nothing in the tree names Ctrl-K, Ctrl-W, Ctrl-A or
 * any other editing key, so writing them here would be inventing a contract in
 * the file that is supposed to *hold* one — and `/help` renders from this table,
 * which would publish the invention as documentation.
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
