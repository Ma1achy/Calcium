/**
 * C22 §6 — the default header and footer, and the prompt's gutter.
 *
 * Calcium owns the frame's structure — a one-row header with a rule under it, two rules around the
 * prompt, and a footer as tall as its blocks (§6l) — and the app decides what
 * goes in the header and the footer. The default exists so that
 * `createTui({ name, binary, manifest, theme })` produces a usable shell (I17):
 * a framework that required chrome to render anything would make the four-field
 * claim false.
 *
 * **Both functions take the frame's `now`** rather than reading one (I13a). A
 * header and a footer that each read the clock can straddle a second boundary
 * and print two different times in one frame, which is C01 I12's rule arriving
 * one layer up — and A03 SS1 would refuse the read here in any case.
 */

import { block } from "../data/viewmodel/index.js";
import type { Block, Pills } from "../data/viewmodel/index.js";
import { barStyle, glyphFor, glyphs } from "../presentation/blocks/index.js";
import { cells, stripControl, truncate } from "../presentation/text.js";
import type { ChromeContext, ChromeFn, CopyState, GuardRefusal, OwnerHints, WatchRowState } from "./types.js";
import type { TerminalCapabilities } from "../terminal/capabilities.js";
import type { Binding, FocusTarget, KeyAction, OwnerRung } from "../interaction/router/types.js";
import { chordText, defaultKeymap } from "../interaction/router/keymap.js";
import { QUESTION_KEYS } from "./confirm.js";

type Chip = Pills["chips"][number];

/** C09's gap between chips — `CHIP_GAP` in `simple.ts`, asserted equal by T1.46 rather than imported. */
const CHIP_GAP = 2;

/**
 * The width a `pills` cluster takes, as C09's `pills` measures it (C22 I86).
 *
 * **A figure the registry could answer and chrome cannot ask it.** A `ChromeFn`
 * returns blocks and holds no registry, and the right cluster's share is a
 * `{ cells }` the group needs before anything renders — so the arithmetic is
 * here, and T1.46 holds it to `registry.width(pills)` at every width tried,
 * which is the coupling made an assertion rather than a comment.
 */
export function clusterCells(chips: readonly Chip[]): number {
  let used = 0;
  chips.forEach((chip, i) => {
    used += cells(chip.label) + (i > 0 ? CHIP_GAP : 0); // narrow-ok — held to C09's own `width` by T1.46, which renders under the same convention
  });
  return Math.max(1, used);
}

/**
 * Two clusters on one row (C22 I86, §6l.6 row 20): the left takes the remainder,
 * the right a cell exactly its own content width, so it ends the row — facts that name
 * the session at the left, facts that change at the right, where a reader
 * glancing down finds them. The design's frame, and the second consumer of C04's
 * both axes (C04 §3) after the group tests themselves.
 */
function clusters(id: string, left: readonly Chip[], right: readonly Chip[]): Block {
  return block<Block>({
    kind: "group",
    id,
    direction: "row",
    children: [
      block<Block>({ kind: "pills", id: `${id}.left`, chips: left }),
      block<Block>({ kind: "pills", id: `${id}.right`, chips: right }),
    ],
    // **The cell's width is the whole mechanism.** An `align: top-right` sat
    // beside it and a mutation of either survived on the other (F822); a cell
    // exactly its content's width has nothing to align.
    flex: [1, { cells: clusterCells(right) }],
  });
}

/** §4's clock format, and S01 §4's narrow form. `14:23:07`, then `14:23`. */
export function formatClock(now: number, columns: number): string {
  // From the epoch value directly rather than through a `Date`: SS1 bans the
  // constructor across `src/`, and the arithmetic is four lines. UTC, because a
  // local-time conversion is what needs the platform's zone database.
  const total = Math.floor(now / 1000);
  const pad = (n: number): string => String(n).padStart(2, "0");
  const hh = pad(Math.floor(total / 3600) % 24);
  const mm = pad(Math.floor(total / 60) % 60);
  const ss = pad(total % 60);
  return columns >= 80 ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

const header =
  (name: string, binary: string): ChromeFn =>
  (ctx: ChromeContext): readonly Block[] => [
    clusters(
      "chrome.header",
      [
        { label: name, tone: "default" },
        { label: binary, tone: "muted" },
        // **Not optional, and not a footer hint.** Native selection is the one mode
        // whose whole effect is that things stop responding — the mouse goes
        // dead and the screen stops moving — so a reader with nothing on screen
        // saying why has been handed a bug rather than a feature. It sits in
        // the header because the header is the row that is always drawn, and in
        // the left cluster because it is a fact about the session's posture.
        // **By mode, not by rung** (C14 I55): both copy modes raise one rung,
        // and the handoff is the one whose mouse has gone dead.
        ...(ctx.owner === "copy"
          ? [{ label: ctx.copy?.mode === "native" ? "NATIVE" : "COPY", tone: "warn" as const }]
          : []),
      ],
      // The clock is the right cluster on its own: it is the fact that changes,
      // and its last cell is the frame's last column (I86).
      [{ label: formatClock(ctx.now, ctx.columns), tone: "muted" }],
    ),
  ];

/**
 * The working directory with the home directory folded to `~` — the shape every
 * shell prompt uses, so a reader recognises it without a label.
 *
 * `home` comes from the session's own snapshot of the environment, never from
 * `process.env` (A03 SS1): the shell is the one place that read it.
 */
export function foldHome(cwd: string, home: string | undefined): string {
  if (home === undefined || home === "") return cwd;
  if (cwd === home) return "~";
  return cwd.startsWith(`${home}/`) ? `~${cwd.slice(home.length)}` : cwd;
}

/**
 * One muted row (C22 §6l.4 E): `/help`, the working directory, and `stopping`
 * while the session says so — every one a field `SessionSnapshot` already
 * carries, so the footer adds no writer.
 *
 * **Verbs and facts, never key names.** A framework-supplied footer of
 * keybindings would be wrong the moment an app rebinds anything, and a key
 * named in chrome is C16 I19's second keymap. `/help` is a verb the shell
 * itself answers, so it is right in every app. An app that wants no footer
 * returns `[]` and gets none (I82).
 */
/**
 * C24 I32's figure, as one cell.
 *
 * **One decimal, and the unit attached.** A frame budget is 16 ms, so the
 * digit after the point is the one that separates a comfortable frame from a
 * tight one and everything below it is noise a reader would have to ignore.
 * `<0.1ms` rather than `0.0ms` for a frame too fast to resolve, because a
 * rounded zero reads as *not measured* and that is the one thing it is not.
 *
 * **Fixed width, and that is not tidiness** (F911). The figure is redrawn every
 * frame and it sits in a cluster with cells after it, so a cell whose width
 * tracks its value moves everything to its right on every frame a session gets
 * faster or slower — `last 9.6ms` against `last <0.1ms` is a one-column shift,
 * once per frame, for as long as the profiler is on. It was found by a replay
 * comparison, where the shift showed up as the padding differing rather than
 * the number; the number was already known to differ and was already masked.
 * Five is the width of `123.4`, which covers a frame up to a second; anything
 * past that overflows the pad and is a session with a larger problem than its
 * footer's alignment.
 */
export function formatFrameCost(ms: number): string {
  const figure = ms < 0.05 ? "<0.1" : ms.toFixed(1);
  return `last ${figure.padStart(5, " ")}ms`;
}

/**
 * §103's last line: **EVERY OWNER SAYS SO, in the footer's last line.**
 *
 * **This overturns the paragraph above `footer`, and that paragraph was right
 * about the thing it was actually afraid of.** *A framework-supplied footer of
 * keybindings would be wrong the moment an app rebinds anything* — true, and
 * R-KEY-007 says the same from the other side: *footer hints in retained
 * specimens are examples, not binding projections.* What it concluded from it
 * was *verbs and facts, never key names*, and that closes the rung rather than
 * the hazard. The design's answer is narrower and holds: the line names the
 * **owner**, and the owner is the framework's own — a question, native selection, an
 * attached child and a block's interior are rungs Calcium raises, not actions
 * an app rebinds. `scope`'s line is the one made of ordinary editing verbs, and
 * it is the one an app can replace by supplying its own chrome (I82).
 *
 * **Which rungs get how much** is §103's own split, and it is not uniform:
 * *every rung retains owner plus its highest-ranked reachable safe action;
 * **ordinary** rungs also show primary action, safe exit and help.* A question
 * is not an ordinary rung — its keys are its own vocabulary, not keymap rows —
 * so its line is the owner and what that vocabulary names, ending on where `esc`
 * resolves (C22 I133, ruling 63).
 *
 * **The keys are looked up, not spelled** (C22 I133). Every chord on the line is
 * `hints.chord(target, action)` — the session keymap's first row for an action
 * — so a rebinding moves the chip and an unbound action draws none. The line
 * said *the owner is the framework's own, so the keys are safe to name*, and
 * that was true of the owner and not of the keys: `⇧⏎ newline` is an app's to
 * rebind, and the footer went on naming the old chord.
 *
 * `null` is the idle ladder, where the global keymap is all there is and there
 * is no owner to name; the row is absent rather than empty.
 */
type Mark = readonly [unicode: string, ascii: string];

/**
 * **A pair resolved where the capability is in hand** — SS47's second arm, and
 * the only one open to a chip label.
 *
 * A `Glyph` slot is the usual answer and it does not reach here: a slot is
 * resolved inside the block renderer for a *mark*, and these are chip **text**,
 * carrying key names rather than semantics. So the pair is declared beside the
 * line and resolved once, here, where `ctx.capabilities` is.
 *
 * The ASCII rung spells the modifiers rather than dropping them: `S-enter` is
 * a key a reader can press, where `enter` would be a different one.
 */
const mark = (m: Mark, caps: TerminalCapabilities): string =>
  caps.unicode === "ascii" ? m[1] : m[0];

/**
 * A chord and what it does, **spelled by `chordText` at the terminal's rung**
 * (C16 I58). The line held its own table of ASCII spellings and it drifted
 * three ways — `↑↓` was `arrows` on one rung and `up/down` on another, and
 * `⌃c` stood where the registry writes `⌃C`. A pair of keys joins with nothing
 * at Unicode (`↑↓`) and `/` in text names (`Up/Down`), one rule for every pair.
 */
const hint = (keys: readonly Binding["key"][], does: string, caps: TerminalCapabilities): string => {
  const unicode = caps.unicode !== "ascii";
  return `${keys.map((k) => chordText(k, unicode)).join(unicode ? "" : "/")} ${does}`;
};

/**
 * `shedToWidth`'s way out, found by its spelling (C16 I58). The one key this
 * file still names, and it names it to recognise a chip rather than to draw one.
 */
const ESC = { name: "escape" } as const;

/**
 * The default keymap's answer, for a line drawn with no session behind it
 * (C22 I133): the first row for the action on a terminal with no protocol
 * reported, which is what `createKeymap(defaultKeymap).entries()` holds there.
 */
const DEFAULT_HINTS: OwnerHints = Object.freeze({
  chord: (target: FocusTarget, action: KeyAction) =>
    defaultKeymap.find((b) => b.target === target && b.action === action && b.profile !== "enhanced-terminal")?.key,
});

/**
 * One chip for one or two actions at a target, **or none** (C22 I133): the keys
 * are the keymap's, so an action nobody binds is a chip nobody can press, and it
 * is not drawn. A pair draws the half that is bound.
 */
const keyed = (
  hints: OwnerHints,
  target: FocusTarget,
  actions: readonly KeyAction[],
  does: string,
  caps: TerminalCapabilities,
): Chip[] => {
  const keys = actions.flatMap((a) => hints.chord(target, a) ?? []);
  return keys.length === 0 ? [] : [{ label: hint(keys, does, caps), tone: "muted" }];
};

/**
 * The gap `pills` puts between chips, so the shed measures what will be drawn
 * rather than the sum of the labels (`simple.ts` `CHIP_GAP`).
 */
const OWNER_GAP = 2;

/**
 * §103's narrow ladder for the owner line: **every rung retains owner plus its
 * highest-ranked reachable safe action.**
 *
 * **It sheds rather than wraps, and the golden frames are why the distinction
 * is not academic.** `pills` wraps — it has no shed step, unlike the four kinds
 * on C09 I81's ladder — so at 60 columns the ASCII line became two rows and the
 * frame grew by one. A footer that takes a second row on a narrow terminal
 * spends transcript to say what the keys do, which inverts what the line is for.
 *
 * The order is §103's, read literally: the **owner** (chip 0) is kept first, the
 * **way out** is kept second, and the rest shed from the right — so what goes is
 * always the lowest-ranked thing still there. `scope` has no owner word and no
 * escape, so it keeps its primary action, which is the same rule with the same
 * two survivors identified by the same test.
 *
 * Adding a shed step to `pills` itself would be the general answer and is a C09
 * change affecting every consumer, the header included. §103 legislates this
 * line, so this line is where the ladder lands until something else asks.
 */
export function shedToWidth(
  line: readonly Chip[],
  columns: number,
  caps: TerminalCapabilities,
): readonly Chip[] {
  // **The convention is an input, not a default** (C02 I9, A03 SS50), and this
  // line is the case that makes it matter: `←→` and `↑↓` are
  // `East_Asian_Width=Ambiguous`, so the `inside` and `copy` rungs measure four
  // cells wider under `wide` than under `narrow`. Shedding on the narrow reading
  // would under-measure and wrap on exactly the terminals that need the ladder.
  const width = (chips: readonly Chip[]): number =>
    chips.reduce((n, c, i) => n + cells(c.label, caps.ambiguousWidth) + (i > 0 ? OWNER_GAP : 0), 0);
  if (line.length <= 1 || width(line) <= columns) return line;

  // **The way out is found by the spelling `hint` gave it** (C16 I58): a literal
  // `"esc"` matched the Unicode rung alone, so at ASCII — where the chip reads
  // `Esc out` — the ladder found no exit and shed it like any other chip.
  const esc = `${chordText(ESC, caps.unicode !== "ascii")} `;
  const exit = line.findIndex((c) => c.label.startsWith(esc) || c.label.includes("host escape"));
  // The two §103 names. When there is no escape on the line the second survivor
  // is the primary action, which is the chip that follows the owner.
  const keep = new Set([0, exit === -1 ? 1 : exit]);
  const kept = [...line];
  for (let i = kept.length - 1; i >= 0 && width(kept) > columns; i -= 1) {
    if (!keep.has(i)) kept.splice(i, 1);
  }
  return kept;
}

/** The bar's cells in a watch chip — the ruling's `█████░` (ruling 50, §085). */
const WATCH_BAR_CELLS = 6;

/**
 * One watch's chip text (C22 I137): the `current` mark on the selected one, the
 * name, and — where its entry holds a `progress` block — the bar and C09's
 * percentage. The percentage is the block's own readout, unclamped, as C09's
 * `progress` prints it (C09 I28): a bar that stops at its end draws a busy
 * thing like a finished one, and the number is what says which.
 */
function watchChip(
  item: WatchRowState["items"][number],
  mark: string | null,
  name: string,
  bars: boolean,
  caps: TerminalCapabilities,
): string {
  const lead = mark === null ? "" : `${mark} `;
  const p = item.progress;
  if (p === undefined) return `${lead}${name}`;
  const fraction = p.total > 0 ? Math.max(0, p.current / p.total) : 0;
  const share = `${String(Math.round(fraction * 100))}%`;
  if (!bars) return `${lead}${name} ${share}`;
  const glyph = barStyle(caps);
  const filled = Math.round(Math.min(1, fraction) * WATCH_BAR_CELLS);
  return `${lead}${name} ${glyph.on.repeat(filled)}${glyph.off.repeat(WATCH_BAR_CELLS - filled)} ${share}`;
}

/**
 * The footer's watch row (C22 I137, I138, §6p, ruling 50): `⋯ › a3f9b21 █████░ 43%`.
 *
 * **One row at every width, and the order it gives things up is the ruling's**
 * (I138): every bar at once — the percentage already says what the bar draws —
 * then watches from the right behind a `+N`, never the one the row is on, then
 * the kept name, cut to what is left. Measured as the owner line is measured,
 * because the two are drawn by the same kind in the same footer and a second
 * measure is a second answer to one question.
 */
export function watchRowChips(
  state: WatchRowState,
  columns: number,
  caps: TerminalCapabilities,
): readonly Chip[] {
  const lead: Chip = { label: glyphs(caps).residue, tone: "muted" };
  if (state.items.length === 0) return [lead, { label: "nothing watched", tone: "muted" }];
  const width = (chips: readonly Chip[]): number =>
    chips.reduce((n, c, i) => n + cells(c.label, caps.ambiguousWidth) + (i > 0 ? OWNER_GAP : 0), 0);
  const current = glyphFor("current", caps);
  // The selection's mark and tone only while the row has the keys (I137).
  const chipOf = (i: number, bars: boolean, name?: string): Chip => {
    const item = state.items[i]!;
    const on = state.selected === i;
    return {
      label: watchChip(item, on ? current : null, name ?? stripControl(item.name), bars, caps),
      tone: on ? "accent" : "muted",
    };
  };
  const all = (bars: boolean): Chip[] => [lead, ...state.items.map((_, i) => chipOf(i, bars))];

  const full = all(true);
  if (width(full) <= columns) return full;
  const bare = all(false);
  if (width(bare) <= columns) return bare;

  // Watches from the right, never the one the row is on — or, with no
  // selection, the first, which is the oldest and the one `⇧⇥` lands on.
  const keep = state.selected ?? 0;
  const kept = state.items.map((_, i) => i);
  let shed = 0;
  const line = (): Chip[] => [
    lead,
    ...kept.map((i) => chipOf(i, false)),
    ...(shed > 0 ? [{ label: `+${String(shed)}`, tone: "muted" as const }] : []),
  ];
  for (let at = kept.length - 1; at >= 0 && width(line()) > columns; at -= 1) {
    if (kept[at] === keep) continue;
    kept.splice(at, 1);
    shed += 1;
  }
  const shedLine = line();
  if (width(shedLine) <= columns) return shedLine;

  // Last, the kept name: cut to the cells the rest of the line leaves it.
  const name = stripControl(state.items[keep]!.name);
  const without = width([lead, chipOf(keep, false, ""), ...(shed > 0 ? [{ label: `+${String(shed)}`, tone: "muted" as const }] : [])]);
  const room = Math.max(1, columns - without);
  return [
    lead,
    chipOf(keep, false, truncate(name, room, caps)),
    ...(shed > 0 ? [{ label: `+${String(shed)}`, tone: "muted" as const }] : []),
  ];
}

/**
 * The captured child's border legend (C22 I110, R-BLK-312, R-BLK-844).
 *
 * **The second carrier, and neither is optional.** The footer's owner line says
 * `attached · keys → child · ⌃] host escape` and this says the same thing on the
 * block itself — because a reader who has scrolled the transcript has the entry
 * and not the footer in front of them, and *an owner you cannot see is an owner
 * you will fight*. Written here rather than in the composition root so the two
 * spellings of the chord are one line apart and move together.
 *
 * It is a string rather than chips because a `panel`'s `footer` is border text
 * (C04 §3) — so the separator is this line's to draw, which is the one place
 * C09 I49's rule does not reach.
 */
export function childBorderLegend(caps: TerminalCapabilities): string {
  // **The separator is resolved, not typed** (C09 I49, F828). A literal `\u00b7`
  // in a source string is the unresolved join T2.116 refuses across `src/shell`,
  // and it is wrong for the reason the gate exists: at the ASCII rung the glyph
  // table answers `:`, and a hard-coded middle dot would be a cell the terminal
  // draws as a question mark between two chords a reader is trying to read.
  const sep = ` ${glyphs(caps).separator} `;
  return [
    hint([{ name: "]", ctrl: true }], "host escape", caps),
    hint([{ name: "escape", meta: true }], "enhanced detach", caps),
    hint([{ name: "c", ctrl: true }], "interrupts child", caps),
  ].join(sep);
}

/**
 * C16 I70's sentence: the chord a guarded question refused, and the way out on
 * this terminal — its release where releases are reported, a pause where they
 * are not. The owner line's chip and the linear cue both say this, so it is
 * spelled once.
 *
 * **Words, not a dash**, because the ASCII rung has no dash to draw.
 */
export function guardRefusal(refused: GuardRefusal, caps: TerminalCapabilities): string {
  const chord = chordText(refused.key, caps.unicode !== "ascii");
  return refused.untilRelease ? `release ${chord} to answer` : `${chord} refused: pause, then press ${chord}`;
}

export function ownerLine(
  rung: OwnerRung | null,
  caps: TerminalCapabilities,
  armed = false,
  buffered = 0,
  copy?: CopyState,
  field = false,
  hints: OwnerHints = DEFAULT_HINTS,
  refused?: GuardRefusal,
): readonly Chip[] {
  const chips = ownerChips(rung, caps, buffered, copy, field, hints);
  // **The armed mark, and it is a chip rather than a decoration** (C16 I44,
  // I70, C22 §6, R-INT-008). A newly raised question refuses activations so a
  // key already in flight cannot answer it, and a rejected command has to
  // explain. This is the explanation: `ready in a moment` while nothing has
  // been refused, and from the first refusal the refused key and the way out —
  // so the refused key changes the frame, which is the whole difference between
  // refused and swallowed. **Once**: a second refusal draws the same chip.
  //
  // It used to be the mark *going* at the refusal, and under ruling 52 a
  // refusal extends the guard rather than ending it, so the mark stayed and the
  // refusal changed nothing (C16 §3c S7).
  //
  // `ownerLine(null)` stays the empty line. No owner raised is no row, and an
  // arm with no owner is not a state the router can reach.
  if (!armed || chips.length === 0) return chips;
  return [
    ...chips,
    refused === undefined
      ? { label: "ready in a moment", tone: "muted" }
      : { label: guardRefusal(refused, caps), tone: "warn" },
  ];
}

/** `1 row`, `9 rows` — the count's three nouns (C14 I55). */
const counted = (n: number, one: string, many: string): string => `${String(n)} ${n === 1 ? one : many}`;

function ownerChips(
  rung: OwnerRung | null,
  caps: TerminalCapabilities,
  buffered: number,
  copy: CopyState | undefined,
  field: boolean,
  hints: OwnerHints,
): readonly Chip[] {
  // **Every chord below is an action looked up, never a key spelled** (C22
  // I133, C16 I19). The words are this line's; the keys are the keymap's.
  const one = (target: FocusTarget, action: KeyAction, does: string): Chip[] =>
    keyed(hints, target, [action], does, caps);
  switch (rung) {
    case "child":
      return [
        { label: "attached", tone: "warn" },
        { label: mark(["keys → child", "keys -> child"], caps), tone: "muted" },
        ...one("child", "hostDetach", "host escape"),
      ];
    case "copy": {
      // **Native handoff** (C14 I55, fixture 044): the terminal owns the mouse,
      // so no key of the semantic mode's reaches anything and none is named.
      if (copy?.mode === "native") {
        return [
          { label: "native", tone: "warn" },
          { label: "mouse tracking off", tone: "muted" },
          { label: "the terminal owns the mouse", tone: "muted" },
          ...one("nativeSelection", "exitNativeSelection", "out"),
          { label: "the screen is frozen", tone: "muted" },
        ];
      }
      const size = copy?.mode === "semantic" ? copy.size : null;
      // The frozen screen is the fact, not a hint: it is why nothing responds.
      return [
        { label: "copy", tone: "warn" },
        // **The refused interrupt, once** (C16 I62, ruling 60). `⌃c` is refused
        // in the mode and the frame is otherwise still, so without this the key
        // is swallowed rather than refused. Drawn on the frame after the refusal
        // and gone on the next key; native selection has no frame to draw it on,
        // which is the stated limit.
        ...(hints.refused === true
          ? [{ label: `${glyphFor("warn", caps)} interrupt refused`, tone: "warn" as const }]
          : []),
        // **Vertical only** (C14 §6c): at block granularity there is no
        // horizontal extent. **And the shifted pair** — the bare arrows move the
        // caret and `⇧↑⇧↓` extend (`extendSemanticSelection*`), which the line
        // spelled as bare `↑↓` for as long as it spelled its own keys.
        ...keyed(hints, "semanticSelection", ["extendSemanticSelectionUp", "extendSemanticSelectionDown"], "extend", caps),
        ...keyed(hints, "semanticSelection", ["copySelectedEntries"], "copy", caps),
        // **Two chips, not one label with a `·` in it.** The separator is the
        // cluster's to draw (C09 I49) — a literal one in a string is the head's
        // unresolved join F828 found, and T2.116 is right to refuse it here too.
        // **Which press is next** (`R-SEL-005`, C16 I51): over a selection the
        // first `esc` clears it, and a footer saying `out` labels that press as
        // the leaving one.
        ...one("semanticSelection", "escapeSemanticSelection", size === null ? "out" : "clear"),
        // **The count, over the copy text** (C14 I38, I55, `R-SEL-015`): what
        // `⏎` would put on the clipboard now, as question 35 ruled it —
        // `418 chars · 9 rows · 2 entries`. **One chip**, because the pill's gap
        // is two spaces and would draw three facts where the ruling draws one;
        // the separator is resolved per rung (C09 I49), as `childBorderLegend`'s is.
        ...(size === null
          ? []
          : [
              {
                label: [
                  counted(size.chars, "char", "chars"),
                  counted(size.rows, "row", "rows"),
                  counted(size.entries, "entry", "entries"),
                ].join(` ${glyphs(caps).separator} `),
                tone: "default" as const,
              },
            ]),
        { label: "the screen is frozen", tone: "muted" },
        // **`R-SEL-010`'s half of the freeze** (C14 I34): the rule says the
        // footer says so *while it is still frozen*, so the chip is on the line
        // that is already saying the screen does not move. Absent at zero — a
        // `0 waiting` chip is a row that says nothing on the frames that are
        // most of them.
        ...(buffered > 0
          ? [{ label: `${String(buffered)} waiting`, tone: "muted" as const }]
          : []),
      ];
    }
    case "question": {
      // **The question's own words** (C22 I133, ruling 63, fixture 061). It is
      // not an ordinary rung and its keys are not keymap rows, so they come from
      // the vocabulary `classify` reads — and `esc` says where it resolves,
      // which is the default's label rather than the phrase *safe path*.
      const q = hints.question;
      const k = QUESTION_KEYS.shown;
      const key = (name: string): Binding["key"] => ({ name });
      if (q?.state === "inspection") {
        return [
          { label: "question", tone: "warn" },
          { label: hint([key(k.leave)], "back", caps), tone: "muted" },
        ];
      }
      return [
        { label: "question", tone: "warn" },
        // A reply owns the editor's arrows (C16 I54), so nothing moves.
        ...(q?.state === "reply" ? [] : [{ label: hint(k.move.map(key), "move", caps), tone: "muted" as const }]),
        { label: hint([key(k.answer)], "answer", caps), tone: "muted" },
        // With no question in hand — a line drawn from the rung alone — the
        // target is still the default, and saying so is true of every question.
        { label: `${hint([key(k.leave)], mark(["→", "->"], caps), caps)} ${q?.resolvesTo ?? "default"}`, tone: "muted" },
      ];
    }
    case "substate":
      // **The substate names itself** (C15 I29, ruling 61): it was always
      // `find`, over a completion menu and a chip preview alike.
      switch (hints.substate) {
        case "complete":
          return [
            { label: "complete", tone: "accent" },
            ...keyed(hints, "panel", ["menuPrev", "menuNext"], "move", caps),
            ...keyed(hints, "panel", ["menuAccept"], "accept", caps),
            ...one("panel", "dismiss", "close"),
          ];
        case "preview":
          // The preview composes nothing and the prompt keeps its keys
          // (`promptUnderMenu`), so the only key the layer owns is its way out.
          return [{ label: "preview", tone: "accent" }, ...one("panel", "dismiss", "close")];
        default:
          // §103's specimen, word for word; the keys are the panel's rows.
          return [
            { label: "find", tone: "accent" },
            ...keyed(hints, "panel", ["menuPrev", "menuNext"], "hits", caps),
            ...keyed(hints, "panel", ["menuAccept"], "open", caps),
            ...one("panel", "dismiss", "close"),
          ];
      }
    case "inside":
      // **A field is an inside with two keys** (C22 I118, C16 I60): `⏎` keeps
      // what was typed and `esc` does not. A plot's orbit named over a text
      // field is an owner line naming someone else.
      if (field) {
        return [
          { label: "field", tone: "accent" },
          ...one("interaction", "keepField", "keep"),
          ...one("interaction", "exitInside", "discard"),
        ];
      }
      return [
        { label: "inside", tone: "accent" },
        ...keyed(hints, "interaction", ["insideLeft", "insideRight"], "orbit", caps),
        ...keyed(hints, "interaction", ["insideUp", "insideDown"], "tilt", caps),
        ...one("interaction", "exitInside", "out"),
      ];
    case "scope":
      // **At the watch row, the row's own keys** (C22 I139, C16 I76): the
      // prompt's `send` and `newline` name keys that reach nothing from there.
      if (hints.watchRow === "focused") {
        return [
          ...keyed(hints, "watchRow", ["watchPrev", "watchNext"], "move", caps),
          ...keyed(hints, "watchRow", ["watchOpen"], "open", caps),
          ...keyed(hints, "watchRow", ["focusPrompt"], "prompt", caps),
        ];
      }
      // No owner word: the scope is the rung a reader is on when nothing has
      // been raised, so naming it would put a label on the absence of one.
      // **`⇧⇥` says where it goes** (C22 I139): the row while a watch stands,
      // the transcript otherwise — `focusPrevious`'s two answers, one chip.
      return [
        ...keyed(hints, "prompt", ["submit"], "send", caps),
        ...keyed(hints, "prompt", ["insertNewline"], "newline", caps),
        ...keyed(hints, "prompt", ["complete"], "complete", caps),
        ...keyed(hints, "prompt", ["focusPrevious"], hints.watchRow === "present" ? "watches" : "transcript", caps),
      ];
    default:
      return [];
  }
}

const footer = (ctx: ChromeContext): readonly Block[] => [
  clusters(
    "chrome.footer",
    [
      { label: "/help", tone: "muted" },
      ...(ctx.session.stopping ? [{ label: "stopping", tone: "warn" as const }] : []),
      // **C24 I32 — present only while something is measuring.** An application
      // that did not ask to be profiled has no figure and gets no cell, so this
      // moves no frame that was not already profiling. The label carries `last`
      // rather than the bare number: a frame's own cost is unknowable while it
      // composes, and an unqualified `12.4ms` beside a live clock reads as the
      // frame you are looking at.
      ...(ctx.lastFrame === undefined
        ? []
        : [{ label: formatFrameCost(ctx.lastFrame), tone: "muted" as const }]),
    ],
    // **The toast replaces the tail for its lifetime** (C22 I116, §012): the
    // working directory is what it displaces, and it returns unchanged. `ok`
    // tone and `ok`'s mark, so the mark carries it where tone cannot (K3).
    ctx.toast === undefined
      ? [{ label: foldHome(ctx.session.cwd, ctx.session.env["HOME"]), tone: "muted" }]
      : [
          {
            label:
              ctx.capabilities === undefined ? ctx.toast : `${glyphFor("ok", ctx.capabilities)} ${ctx.toast}`,
            tone: "ok",
          },
        ],
  ),
  // **The watch row, above the owner line** (C22 I137, §6p.4 ruling 4). §085's
  // specimen draws it last and §103 puts the owner line last; the second is a
  // current rule and the first a specimen, so the rule decides. **Its own
  // block**, as the owner line is, and for the owner line's reason: a cluster
  // pair reserves a right-hand cell and wraps on the width where it fits.
  ...(ctx.watches === undefined || ctx.capabilities === undefined
    ? []
    : [
        block<Block>({
          kind: "pills",
          id: "chrome.watches",
          chips: watchRowChips(ctx.watches, ctx.columns, ctx.capabilities),
        }),
      ]),
  // **Last**, which is the whole of where §103 puts it: *in the footer's last
  // line*. A row above the working directory is a row a reader scans past.
  // **Both or neither** — there is no owner before there is a terminal, so the
  // two conditions are one fact and the second arm is unreachable in a session.
  ...(ctx.owner === null || ctx.capabilities === undefined
    ? []
    : [
        // **One row, not a cluster pair.** `clusters` reserves a right-hand cell
        // and `clusterCells([])` floors at 1, so an owner line built that way
        // gets `columns - 1` and wraps on the width where it exactly fits — which
        // is what the 60-column ASCII golden showed before this line was read.
        // The owner line has no right-hand half: it is a ladder, read left to
        // right, and it sheds from the right rather than aligning to it.
        block<Block>({
          kind: "pills",
          id: "chrome.owner",
          chips: shedToWidth(
            ownerLine(
              ctx.owner,
              ctx.capabilities,
              ctx.ownerArmed === true,
              ctx.bufferedEntries ?? 0,
              ctx.copy,
              ctx.editingField === true,
              ctx.hints,
              ctx.ownerRefused,
            ),
            ctx.columns,
            ctx.capabilities,
          ),
        }),
      ]),
];

/**
 * A function of config, not a constant — the default header names the app, so
 * it cannot exist until `name` and `binary` are validated.
 */
export function makeDefaultChrome(
  name: string,
  binary: string,
): Readonly<{ header: ChromeFn; footer: ChromeFn }> {
  return Object.freeze({ header: header(name, binary), footer });
}
