/**
 * `ctx.ask` — a question a local handler awaits (C23 I36, C16 I25).
 *
 * L4's, because it is a sequence across three components and nothing below may
 * hold it: C15 owns the layer, C16 routes the keys, C23 suspends the handler.
 * That is A02 Seam 4's shape and the reason this file is here rather than in any
 * of them.
 *
 * **The layer is pushed `dismissable: false` and the user can still escape it**,
 * which is not the contradiction it reads as. C15's flag says *the router may not
 * discard this layer without telling its owner* — and it may not, because
 * discarding it silently leaves the awaiting handler pending forever. `Esc` is
 * the escape the **owner** performs, resolving with the default choice (C23
 * I36). `⌃c` is not an escape here: C16 refuses it at a question before any rung
 * runs (C16 I62, ruling 59), and the question says so (C23 I82). The word means two things and the layer needs opposite answers to
 * them; the flag only ever answered the second. See DOCKER_TUI_COMPLETION.md
 * Ruling A, where the two were one word.
 *
 * **Placement is `centred`** — C15 §`Placed` carries `left` precisely so a
 * centred confirm's horizontal extent is recoverable for hit-testing, so the
 * shape was anticipated there before anything raised one.
 */

import { block } from "../data/viewmodel/construct.js";
import type { Block } from "../data/viewmodel/types.js";
import type { InputEvent, Verdict } from "../interaction/router/types.js";
import type { Layer, OverlayManager, Placement } from "../viewport/overlay/index.js";
import type { AskAnswer, AskOptions, Choice, QuestionOutcome } from "./local/registry.js";
import { questionNotice, warnNotice } from "./documents.js";
import { questionConsumer, routingFor } from "./question-routing.js";
import { cells } from "../presentation/text.js";
import { createChoiceSelection, defaultStart } from "./choice-selection.js";
import { chordText } from "../interaction/router/keymap.js";
import type { FocusState } from "../presentation/blocks/types.js";

export const CONFIRM_LAYER_ID = "confirm";

/**
 * A question's own key vocabulary — what `classify` reads, and what the owner
 * line names (C23 I36, I82, C22 I133, ruling 63).
 *
 * **A record rather than four literals in `classify`**, because what a question
 * does not classify is exactly what it refuses (C23 I82), and the set has to be
 * readable as a set to say so. **And one record for both readers**: the footer's
 * question line was the literal `declared actions · esc safe path`, which named
 * no key at all, and a line spelling the keys itself would be a second record of
 * what this file decides. `shown` is the subset the line draws — fixture 061
 * draws `←→ move`, and `↑↓` and `⇥` move too without being named.
 */
export const QUESTION_KEYS = Object.freeze({
  previous: Object.freeze(["up", "left"]),
  next: Object.freeze(["down", "right", "tab"]),
  answer: Object.freeze(["return", "enter"]),
  leave: Object.freeze(["escape"]),
  /**
   * An inspection's own keys (C23 I88): a row each way, a page each way. Bare
   * only — `⌥↑`/`⌥↓` are C16's page-scroll intercept and never arrive here.
   */
  scroll: Object.freeze({ up: "up", down: "down", pageUp: "pageup", pageDown: "pagedown" }),
  shown: Object.freeze({ move: Object.freeze(["left", "right"]), answer: "enter", leave: "escape" }),
});

/** What the owner line reads of an open question (C22 I133). */
export type QuestionVocabulary = Readonly<{
  /** Which of the question's three states it is in — each owns a different set of keys. */
  state: "choice" | "reply" | "inspection";
  /** The label `esc` resolves with, so the line can say where the safe path goes. */
  resolvesTo: string;
}>;

/** The refusal's words (C23 I82, ruling 60). */
const REFUSED_TEXT = "answer this first";


/**
 * How wide the question asks to be.
 *
 * A request rather than a measurement: C15 clamps it to the region, and a
 * producer that measured its own content would need the block registry, which
 * this file deliberately does not have.
 *
 * **72 rather than 56, and the frame decided it.** A destructive confirm carries
 * a table of what it will remove (Ruling C), and at 56 the second column
 * truncated to `Exited …` — losing when the container stopped and whether it had
 * failed, which is exactly the information a reader is being asked to weigh. The
 * question fitted; the evidence did not.
 */
export const CONFIRM_WIDTH = 72;

export type ConfirmDeps = Readonly<{
  overlays: OverlayManager;
  /**
   * **`1`–`9` answer choices in order** (C22 I122, §107: *choice questions use
   * numbered choices*). The linear route's, where a question is a line of text
   * with its choices numbered and no picture to point at. A choice's own key is
   * asked first, so a question whose choices are keyed by digit keeps them.
   */
  numbered?: boolean;
  /**
   * Told when a question is asked and when it is answered (C22 I122) — the
   * linear stream's events, which an overlay change cannot give: it carries an
   * id and nothing of what was asked.
   */
  announce?: Readonly<{ asked: (opts: AskOptions) => void; answered: (label: string) => void }>;
  /**
   * The prompt's own span, for an anchored question (`AskOptions.placement`).
   *
   * The same seam C19's menu takes, and for its reason: `rows` is the prompt's
   * extent rather than 1, because a two-row prompt has no single row that
   * places an overlay correctly and both wrong answers produce a placement
   * whose every number is self-consistent (C15 I17).
   *
   * Read at `ask` time and not held: it is a fact about the frame, and the
   * frame moves.
   */
  anchor: () => Readonly<{ row: number; rows: number }>;
  /**
   * The prompt's line, and the clearing of it — for a typed reply (I73, §101).
   *
   * **The whole of the question's key rules stay in this file**, which is the
   * argument C16's rung 4 already makes for `answerHandler`: `⏎` under a
   * floating reply means *answer with what I typed*, and a submit path that
   * knew that would hold half a rule whose other half lives here.
   *
   * `holdDraft` and `restoreDraft` are the borrow (C17 I28, C23 I28). The
   * reader's line is taken whole on entering the reply state and given back
   * exactly on settling, whichever way the question was answered — it was
   * never submitted, so C23 I28's *the prompt clears whatever becomes of the
   * line* does not reach it. What that rule does reach is the reply's own
   * line, which **became** the line and clears like a submitted one; the
   * restore does both at once, because putting the held state back is what
   * removes the reply.
   */
  draft: () => string;
  /**
   * The reply's line **as the prompt draws it** (C23 I90) — a chip as its
   * label — for the linear stream's `answered`. `draft` is what the owner is
   * handed, which is the line resolved; the two differ exactly where a chip
   * is. Absent, `draft` stands in.
   */
  drawn?: () => string;
  holdDraft: () => void;
  restoreDraft: () => void;
  /**
   * The reply's line, taken as it stands (C23 I89): `esc` in a reply goes back
   * to the choices and keeps what was composed, so a second `reply…` puts it
   * back. Opaque here — the line is the editor's, and a copy of its text would
   * lose a chip's content. Absent, nothing is kept.
   */
  keepReply?: () => unknown;
  /** Put a kept reply back in the borrowed line (C23 I89). */
  resumeReply?: (kept: unknown) => void;
  /**
   * The injected timer, for `expiresAfterMs` (C23 I92, §7g ruling 7): expiry
   * reads no clock. Absent, a question never expires.
   */
  schedule?: (fn: () => void, ms: number) => Disposable;
  /** A question expired — say so (C23 I92, `R-BLK-881`). The figure is `ms` itself. */
  expired?: (opts: AskOptions, ms: number) => void;
  /**
   * The region C15 places against, for the truncation pass (entry 16 R2).
   *
   * The same seam C19's menu takes. How much fits is a fact about the frame and
   * C15 answers it only once the layer is on the stack, so this is a second
   * pass rather than an argument to the first.
   */
  overlayRegion: () => Readonly<{ width: number; height: number }>;
  /** The frame is L4's to commit; C15 never paints (A02 Seam 4). */
  invalidate: () => void;
  /**
   * The inspection's box, moved in `ScrollOffsets` under the layer's namespace
   * (C23 I88, C22 I141). `by` clamps against the box's ceiling at the width it
   * is drawn at, which only L4 can measure; `reset` drops the namespace, so an
   * entry into the inspection opens at its top. Absent in a harness with no
   * store: the keys are then consumed and nothing moves.
   */
  inspectionBox?: Readonly<{ by: (boxId: string, rows: number) => void; reset: () => void }>;
  /**
   * The rows of the slot a replacing question is drawn in (C22 I142, S01 §3's
   * cap) — what the inspection's box is sized to, less the panel's chrome
   * (C23 I88). Absent, the region's height stands in.
   */
  slotRows?: () => number;
  /**
   * The separator slot at this terminal's rung (C09 I49, F828), for the
   * title's count (C23 I91). A slot and not a literal `·`: the composer
   * resolves it where the capability is. Absent is `-`.
   */
  separator?: () => string;
  /** Whether the terminal draws Unicode — the rung the key row is spelled at (C16 I58). Absent is Unicode. */
  unicode?: () => boolean;
}>;

export interface ConfirmHost {
  /** C23 I36 — resolves with a choice on every path, never null. */
  ask(opts: AskOptions): Promise<AskAnswer>;
  /**
   * C16 I25 — the top layer's answer handler, or null.
   *
   * **Read from the top only, never searched down the stack**, for the reason
   * C15 `pop()` gives: a question raised over a completion menu must not be
   * answered by the menu.
   */
  answerHandler(): ((e: InputEvent) => boolean | Verdict) | null;
  /**
   * Would this key **resolve** the open question (C16 I44, R-BLK-788)?
   *
   * The activation guard's predicate, and it is here rather than in C16 for
   * I25's reason: what a key means to a question is the question's business.
   * `null` when no question is on top. Pure — it settles nothing, which is the
   * whole point of asking before answering.
   */
  resolvesHandler(): ((e: InputEvent) => boolean) | null;
  /**
   * The open question refused an input — say so, once (C23 I82, C16 I62).
   *
   * Called by the question's own handler for a key it does not classify, and by
   * L4 for a refusal the router made at `question` — the interrupt, or an event
   * that reached a blocking top. **The first puts `answer this first` on the
   * question's row and every later one does nothing**: no `update`, no
   * `invalidate`. The inspection and the reply state never draw it — one is the
   * reader reading, the other composing.
   */
  refuse(): void;
  /** What the owner line reads of the open question, or `null` (C22 I133). */
  vocabulary(): QuestionVocabulary | null;
  /**
   * The box layer `id`'s keys move, as a render focus, or `null` (C23 I88,
   * C22 I141) — the inspection's box while the question is suspended, so its
   * thumb is `accent` as a focused container's is (`R-BLK-160`).
   */
  focusedBox(id: string): FocusState | null;
  /** Whether a question is open — C22 refuses a submission while one is. */
  readonly open: boolean;
  /**
   * How many questions wait behind the open one (C23 I91). A panel the first
   * question displaced is restored only when no question remains, open or
   * waiting (C15 I32), so keys' restore reads this as well as the stack.
   */
  readonly waiting: number;
  /**
   * Resolve every open and waiting question `cancelled` (C23 I92) — the
   * session stopping, before teardown.
   */
  cancelAll(): void;
  /**
   * Whether the open question is composing a typed reply (C16 I54, §052).
   *
   * **Read off the question's own state, never off a layer id** — it is what
   * `reply…` moved (I73). The shell forwards the editor's keys to the borrowed
   * line while this holds, and nothing else at the prompt.
   */
  readonly composing: boolean;
  /**
   * The open question's layer while it **replaces** the prompt, else `null`
   * (C23 I73, I74, §7f, §101).
   *
   * **A getter and not a field on `Layer`.** C15 I14 says `blocking` and
   * `dismissal` never change, for a reason that holds: a layer whose ownership
   * moved mid-life makes C16's ladder depend on when it looked. Replacing is
   * the opposite — it is exactly what changes when `reply…` is chosen, on the
   * same question with the same id and the same handler awaiting — so it is
   * derived here, per frame, from the question's state rather than declared
   * once on the layer.
   *
   * The layer stays on the stack while it replaces: C16's ownership ladder
   * reads the stack, and a question that left it to be drawn elsewhere would
   * be a question nothing routed keys to. What changes is where it is *drawn*.
   */
  readonly replacing: Layer | null;
}

/**
 * The choice a bare `Enter` takes, and the one `Esc` resolves with (`⌃c` is
 * refused, not resolved — C16 I62).
 *
 * **Falls back to the last choice rather than the first when none is marked.**
 * For a destructive verb the safe option is conventionally last (`yes`, `no`),
 * and a default that silently means *the first thing offered* is the wrong way
 * for this to fail. Callers in this repository always mark one; the fallback is
 * for a caller that forgets, and it should forget safely.
 */
function defaultChoice(choices: readonly Choice[]): Choice {
  // **Through `defaultStart`, because it is the same rule.** *The marked one,
  // else the last* was written twice — once for where the selection opens and
  // once for what `Esc` resolves with — and two records of one fact disagree
  // eventually. They must agree by construction: a question that opens on `no`
  // and escapes to `yes` is the worst possible pair.
  return choices[defaultStart(choices)]!;
}

/**
 * The choices, as a table rather than as written text (entry 16 A5).
 *
 * **Three columns, and the first holds nothing but the marker.** A glyph is part
 * of a cell's width rather than an addition to it (`table/cells.ts:123`), so a
 * marker sharing the key's cell would shift the selected row two columns left of
 * the others — the alignment the `raw` form got by padding with a space.
 *
 * **The marker is `bullet` and it used to be `expand`, which is a collision the
 * `raw` form concealed.** C11 renders `expand`/`collapse` for a row that can be
 * opened (`table/cells.ts:91`), so `▸` inside a table row already means
 * *expandable* to the same renderer. While the choices were text nothing could
 * notice; as blocks the two meanings arrive in one place. `bullet` is what the
 * completion menu marks a selected row with, and one marker across the popups is
 * the drift this entry exists to close.
 *
 * And the capability is gone from this file with the written character: a `raw`
 * block carries text where a cell carries a slot, so L1 substitutes and L4 never
 * spells the glyph (C09 I22, F122).
 */
function choiceBlock(choices: readonly Choice[], selected: number): Block {
  return block({
    kind: "table",
    id: "confirm-choices",
    padding: { t: 1 },
    columns: [
      { key: "mark", label: "", align: "left", priority: 3, minWidth: 1, sortable: false },
      { key: "key", label: "", align: "left", priority: 2, minWidth: keyWidth(choices), sortable: false },
      { key: "label", label: "", align: "left", priority: 1, minWidth: 1, flex: true, sortable: false },
    ],
    rows: choices.map((c, i) => ({
      id: `confirm-choice-${c.key}`,
      cells: {
        mark: { text: "", ...(i === selected ? { glyph: "bullet" as const } : {}) },
        key: { text: `[${c.key}]` },
        label: { text: c.label },
      },
    })),
    showHeader: false,
  });
}

/** The widest `[k]`, so the labels line up whatever the accelerators are. */
function keyWidth(choices: readonly Choice[]): number {
  let widest = 1;
  // narrow-ok — a choice's `key` is the keyboard key that selects it, so it
  // is one ASCII character by construction (C15's confirm builder refuses
  // anything a keystroke cannot produce).
  for (const c of choices) widest = Math.max(widest, cells(c.key) + 2); // narrow-ok
  return widest;
}

/**
 * Whether the placement could not hold the question (C15 I8).
 *
 * `Placed.truncated` and nothing more, which is the whole of what is portable:
 * the menu can say *how many* because it holds its own candidates, and this
 * file holds a caller's block and no registry — `CONFIRM_WIDTH` is a request
 * rather than a measurement for exactly that reason.
 */
function truncated(deps: ConfirmDeps): boolean {
  const placed = deps.overlays
    .layout(deps.overlayRegion())
    .find((p) => p.layer.id === CONFIRM_LAYER_ID);
  return placed?.truncated ?? false;
}

/**
 * The question, its payload and its choices — or the question, `…` and its
 * choices when the region cannot hold them all.
 *
 * **The payload is dropped rather than marked, and a frame is what decided
 * it.** `composite.ts` writes `lines[0 … height)`, so a box that does not fit
 * loses its *tail* — and this box's tail is the choices. Measured on an
 * ordinary 24-row terminal with a twenty-row detail: the reader was shown the
 * question and ten rows of payload, and **no `[y]`, no `[n]` and no bottom
 * border.** A question with its answers cut off, with the keys still working
 * and nothing on screen saying so.
 *
 * So an appended indicator was never the shape: an extra row at the end is the
 * first thing lost. Replacing the payload is what fits, and it costs the reader
 * only what they could not read anyway — the alternative, shrinking the detail,
 * needs a measurement this file cannot make.
 */
/**
 * The question **suspended**, showing its payload bounded (I75, §051).
 *
 * **The same panel, with the evidence where the question was.** The layer
 * keeps its id and its owner keeps waiting, so what changes is only what is
 * drawn — which is what *suspends* means and why an inspection cannot be a
 * second layer: two layers would be two questions to `answerHandler`, and the
 * one underneath would be answering keys meant for the one on top.
 *
 * **A `scroll` box rather than the payload bare**, because the payload is here
 * precisely because it did not fit. The box bounds it and C04 I49 puts the
 * residue row on it, so the reader can see there is more rather than finding
 * the tail cut off — which is the failure `render`'s cut arm exists to avoid
 * one level up.
 */
/** The inspection's box — the one its keys and the wheel move (C23 I88). */
export const INSPECTION_BOX_ID = "confirm-source";

/**
 * The panel's title, and the count of what waits behind it (C23 I91).
 *
 * A queued question is invisible except as this count — a question the reader
 * cannot answer yet is not yet theirs, and counted it is not hidden.
 */
function titleOf(more: number, separator: string): string {
  return more > 0 ? `Confirm ${separator} ${String(more)} more` : "Confirm";
}

/**
 * What `ask` refuses before anything is queued or pushed (C23 I93, ruling 6).
 *
 * A second default makes `esc` and the opening selection disagree about which
 * is safe, and a default on `reply…` or an inspection is a safe answer that
 * answers nothing — `esc` would open a line or suspend.
 */
function invalidChoices(choices: readonly Choice[]): string | null {
  if (choices.length === 0) {
    // A question with nothing to answer it cannot resolve, and resolving it
    // with an invented key would put a value in the handler's hands that no
    // caller wrote. Construction error, C23 I27's standard.
    return "ask() needs at least one choice";
  }
  const defaults = choices.filter((c) => c.default === true);
  if (defaults.length > 1) {
    return `ask() takes at most one default choice, and ${String(defaults.length)} are marked (C23 I93)`;
  }
  const d = defaults[0];
  if (d !== undefined && (d.reply === true || d.inspect === true)) {
    return `ask(): the default choice "${d.key}" ${d.reply === true ? "opens a reply" : "opens an inspection"} and answers nothing (C23 I93)`;
  }
  return null;
}

function inspection(opts: AskOptions, rows: number, unicode: boolean, more = 0, separator = "-"): readonly Block[] {
  const k = QUESTION_KEYS.scroll;
  // **Spelled at the terminal's rung** (C16 I58, C23 I88): `↑↓` at Unicode and
  // `Up/Down` in text names — `chordText`'s pair rule, the owner line's own.
  const move = [k.up, k.down].map((name) => chordText({ name }, unicode)).join(unicode ? "" : "/");
  const leave = chordText({ name: QUESTION_KEYS.leave[0]! }, unicode);
  const children: Block[] = [
    questionNotice(opts.question, "confirm-question"),
    block({
      kind: "scroll",
      id: INSPECTION_BOX_ID,
      // At least one row: a region too small to hold anything still has to
      // draw a box, and a height of 0 is a box C04 refuses.
      height: Math.max(1, rows), // cells-ok — a row count
      children: opts.detail === undefined ? [] : [opts.detail],
    }),
    block({ kind: "raw", id: "confirm-leave", text: `${move} scroll  ${leave} back to the question` }),
  ];
  return [block({ kind: "panel", id: "confirm-panel", title: titleOf(more, separator), children })];
}

/**
 * The question's row — the question, and beside it the refusal once there has
 * been one (C23 I82, ruling 60).
 *
 * **On the question's own row, not a row of its own.** A question that does not
 * fit drops its payload for `…` and keeps its choices (`render`'s cut arm), and
 * a notice below the question would be one more row competing with the answers
 * for a height the region may not have. Beside it, the right cell is exactly the
 * notice's width and the question takes the rest — `clusters`' shape in the
 * footer.
 */
function questionRow(opts: AskOptions, refused: boolean): Block {
  const question = questionNotice(opts.question, "confirm-question");
  if (!refused) return question;
  return block<Block>({
    kind: "group",
    id: "confirm-question-row",
    direction: "row",
    children: [question, warnNotice(REFUSED_TEXT, "confirm-refused")],
    // The glyph and its gap are two cells at both rungs (`▲ `, `! `).
    // narrow-ok — REFUSED_TEXT is ASCII written here, so no ambiguous-width cell.
    flex: [1, { cells: cells(REFUSED_TEXT) + 2 }], // narrow-ok
  });
}

function render(
  opts: AskOptions,
  selected: number,
  cut = false,
  refused = false,
  more = 0,
  separator = "-",
): readonly Block[] {
  const children: Block[] = [questionRow(opts, refused)];
  // Ruling C's payload — what the answer will affect, shown with the question
  // rather than in the entry that follows it.
  if (opts.detail !== undefined) {
    children.push(
      cut
        ? // ASCII, because this text is authored where the capability is not
          // (C09 I22, F122) — the same reason C19 writes its indicator flat.
          block({ kind: "raw", id: "confirm-elided", text: "..." })
        : opts.detail,
    );
  }

  children.push(choiceBlock(opts.choices, selected));

  return [block({ kind: "panel", id: "confirm-panel", title: titleOf(more, separator), children })];
}

/**
 * The layer's placement and width together, because for this owner they are one
 * decision (entry 16 A3, C15 I20).
 *
 * **Centred declares `CONFIRM_WIDTH`, and C15 I20 now refuses anything else.**
 * Without it C15 gives a centred layer the region's width, so `Placed.left` is
 * always 0 and the box reads as `fill` however it was placed — which is the
 * appearance that made *the question covers its region* a tempting reading. The
 * rule used to live in a comment here; it lives in `push` now, and this is the
 * caller that stopped needing to remember it.
 *
 * **Anchored declares none, which is the menu's argument and not an omission**
 * (C19 §"the menu spans the region"): a layer narrower than the region leaves
 * whatever is behind it visible on the same rows, so a reader sees two
 * unrelated things on one line. A question anchored to the prompt is chrome for
 * the prompt, and the prompt spans the frame.
 *
 * `prefer: "above"` for C19's reason — the prompt is near the bottom by
 * definition, and C15 flips when there is no room.
 */
function placementOf(
  opts: AskOptions,
  deps: ConfirmDeps,
): Readonly<{ placement: Placement; width?: number }> {
  if (opts.placement !== "anchored") {
    return { placement: { kind: "centred" }, width: CONFIRM_WIDTH };
  }
  const at = deps.anchor();
  return { placement: { kind: "anchored", row: at.row, rows: at.rows, prefer: "above" } };
}

/**
 * What one key means to an open question — written once and read twice
 * (C16 I44, R-BLK-788).
 *
 * **The second reader is the activation guard, and it must not answer to ask.**
 * A newly presented question refuses an *ambiguous activation* — a key that
 * would resolve it — and lets a neutral one through, so something has to say
 * which a key is without settling it. C16 cannot: what a key means to a question
 * is the question's business (I25), and a router holding half of that rule would
 * hold it two layers from the other half. So the classification is one function
 * here, and `handler` and the predicate both read it rather than each carrying a
 * copy of the same four cases.
 */
type Meaning = "resolve" | "move" | "compose" | "leave" | "back" | "scroll" | "none";

/**
 * One asked question, open or waiting (C23 I91, I92).
 *
 * `end` is set while it is the open one: how its owner withdraws it — the
 * signal, the timer, the session stopping — which restores a borrowed line
 * before it resolves (I92). `repaint` redraws it in whatever state it is in,
 * for the count in its title.
 */
type Asked = {
  readonly opts: AskOptions;
  readonly resolve: (answer: AskAnswer) => void;
  end: ((outcome: Exclude<QuestionOutcome, "answered">) => void) | null;
  repaint: (() => void) | null;
  detach: () => void;
};

export function createConfirmHost(deps: ConfirmDeps): ConfirmHost {
  let handler: ((e: InputEvent) => boolean | Verdict) | null = null;
  /** The open question's refusal, or `null` when none is open (C23 I82). */
  let refuseOpen: (() => void) | null = null;
  /** The open question's vocabulary, or `null` (C22 I133). */
  let vocabularyOpen: (() => QuestionVocabulary) | null = null;
  let meaning: ((e: InputEvent) => Meaning) | null = null;
  // **The question's state, which is what the routing is derived from** (I73).
  // `null` when nothing is open; the consumer otherwise, so the table is asked
  // rather than a boolean being kept beside it.
  let consumer: ReturnType<typeof questionConsumer> | null = null;
  /** The `reply…` choice the reader picked, or `null` — §101's third row. */
  let replying: Choice | null = null;
  /**
   * Whether the open question is **suspended** in an inspection (I75).
   *
   * A boolean rather than the chosen `Choice`, because nothing downstream
   * needs to know *which* inspection: `R-QST-004` gives a question one, and a
   * field holding the choice would be a record of something the design says
   * is singular.
   */
  let suspended = false;
  /** The inspection box's interior, for a page (C23 I88); set on each suspend. */
  let interior = 1;
  /** The open question, or `null` (C23 I91). */
  let current: Asked | null = null;
  /** The questions asked while one was open, in the order they were asked (C23 I91). */
  const waiting: Asked[] = [];
  /** The open question's title carries the count behind it (C23 I91). */
  const retitle = (): void => {
    current?.repaint?.();
    deps.invalidate();
  };
  /**
   * An owner withdrew a question, or the timer or the session did (C23 I92).
   *
   * **A waiting one is removed without ever being drawn** and resolves with
   * its default's key; the open one ends through its own `end`, which gives a
   * borrowed line back before it resolves.
   */
  const withdraw = (q: Asked, outcome: Exclude<QuestionOutcome, "answered">): void => {
    if (q === current) {
      q.end?.(outcome);
      return;
    }
    const i = waiting.indexOf(q);
    if (i < 0) return;
    waiting.splice(i, 1);
    q.detach();
    q.resolve({ key: defaultChoice(q.opts.choices).key, outcome });
    retitle();
  };

  /**
   * Put a question to the reader (C23 I91): push it, announce it, arm its
   * expiry. Reached from `ask` when nothing is open, and from the settle of the
   * one before it otherwise — so a question waiting behind another is announced
   * and notified when it is shown, never when it was asked.
   */
  const show = (q: Asked): void => {
    const opts = q.opts;
    const resolve = q.resolve;
    current = q;
    /** `render`, with the count of what waits behind this question (C23 I91). */
    const draw = (sel: number, cut = false, refused = false): readonly Block[] =>
      render(opts, sel, cut, refused, waiting.length, deps.separator?.());

    // The shared store, with this caller's start (entry 16). The cycling is
    // the menu's; the start is what differs, and it is supplied.
    const selection = createChoiceSelection(opts.choices.length, defaultStart(opts.choices));
    const selected = (): number => selection.at ?? 0;
    /** The choice a digit names on the linear route (C22 I122), or none. */
    const numberedPick = (name: string): Choice | undefined =>
      deps.numbered === true && /^[1-9]$/u.test(name) ? opts.choices[Number(name) - 1] : undefined;

    // **§101's table, asked rather than restated** (I73, §7f). Both fields
    // were literals here and both are the table's answer for a question that
    // is not yet taking a typed reply; writing them out again is how the two
    // records come to disagree the day the third state lands.
    consumer = questionConsumer(opts.choices, false);
    let routing = routingFor(consumer);

    const layer: Layer = {
      id: CONFIRM_LAYER_ID,
      kind: "overlay",
      ...placementOf(opts, deps),
      content: draw(selected()),
      blocking: routing.blocking,
      dismissal: routing.dismissal,
      // **Declared, not inferred** (C15 I29, C16 I63, R-QST-001): *a question
      // declares blocking and owner explicitly*.
      owner: { rung: "question" },
      // **A question is not an advisory overlay, so the default fraction is
      // the wrong one** (C15 I18). Half the region is right for a peek, which
      // a reader dismisses; a confirm that does not fit loses its *answers*,
      // and the reader is asked something with no visible way to reply.
      //
      // It reduces the case and cannot remove it: a fraction caps a
      // proportion where this wants a minimum, and below about nine rows even
      // the collapsed form is taller than any fraction of the region. C15
      // floors at one row and draws it truncated rather than absent (I18),
      // which is the right end to fail at — see C23 T4.28's residue.
      maxHeightFraction: 0.8,
    };

    const disposable = deps.overlays.push(layer);
    deps.announce?.asked(opts);
    /**
     * Whether the payload was dropped for `…` — **held, because every later
     * draw has to keep it.** It was a local of the second pass below, and
     * `redraw` and `toReply` called `render` without it, so a question that
     * had collapsed to keep its choices un-collapsed on the first arrow and
     * lost them again.
     */
    let cut = false;
    /** The one-shot of C23 I82: whether this question has explained a refusal. */
    let refused = false;
    // **The second pass, and it drops the payload rather than marking it**
    // (entry 16 R2). See `collapsed`.
    if (truncated(deps)) {
      cut = true;
      deps.overlays.update(CONFIRM_LAYER_ID, { content: draw(selected(), true) });
    }
    /** A reply the reader left with `esc`, kept for the next `reply…` (C23 I89). */
    let kept: unknown = null;
    /**
     * The expiry (C23 I92, ruling 7): the injected timer, armed when the
     * question is **shown** — a question waiting behind another has not been
     * put to the reader — and disposed by whatever settles it first.
     */
    const ms = opts.expiresAfterMs;
    const timer =
      ms === undefined || deps.schedule === undefined
        ? null
        : deps.schedule(() => {
            deps.expired?.(opts, ms);
            end("expired");
          }, ms);

    /**
     * Resolve, exactly once, and put the next question up (C23 I91, I92).
     *
     * `said` is what the linear stream is told: the choice's label, the reply
     * as drawn (I90), or the outcome's word when nobody answered.
     */
    const settle = (
      key: string,
      text?: string,
      outcome: QuestionOutcome = "answered",
      said?: string,
    ): boolean => {
      timer?.[Symbol.dispose]();
      q.detach();
      deps.announce?.answered(said ?? (outcome !== "answered" ? outcome : undefined) ?? opts.choices.find((c) => c.key === key)?.label ?? key);
      handler = null;
      refuseOpen = null;
      vocabularyOpen = null;
      meaning = null;
      consumer = null;
      replying = null;
      suspended = false;
      current = null;
      // **Disposed, then the next pushed** (C23 I91): C15 throws on a second
      // layer under one id, and keys' restore of a displaced panel reads the
      // queue at this dispose — so the queue still holds the next one here.
      disposable[Symbol.dispose]();
      resolve(text === undefined ? { key, outcome } : { key, text, outcome });
      // **Pushed within the keystroke that answered** — a second key in the
      // same batch meets the next question and C16 I44's guard, which re-arms
      // on the push's generation (C15 I33), rather than the prompt.
      const next = waiting.shift();
      if (next !== undefined) show(next);
      deps.invalidate();
      return true;
    };

    /**
     * Withdrawn — the signal, the timer, the session stopping (C23 I92). The
     * default's key and no text, and a borrowed line given back first.
     */
    const end = (outcome: Exclude<QuestionOutcome, "answered">): void => {
      if (replying !== null) deps.restoreDraft();
      settle(defaultChoice(opts.choices).key, undefined, outcome);
    };
    q.end = end;

    /**
     * Move this question to §101's third row (I73, §7f).
     *
     * **The same layer, updated** — not popped and pushed. The id is what
     * `answerHandler` and C16's rung 4 resolve against, and the promise
     * this closure resolves is the one the handler is awaiting: a second
     * layer would draw identically and leave the first one's owner waiting
     * for ever. That is why T1.69's discriminator is the identity and not
     * the picture.
     *
     * The placement moves with the state, because the question is now
     * chrome for a prompt that is live beneath it (C15 I20's argument for
     * an anchored layer declaring no width: a layer narrower than the
     * region leaves two unrelated things on one row).
     */
    const toReply = (choice: Choice): boolean => {
      replying = choice;
      consumer = questionConsumer(opts.choices, true);
      routing = routingFor(consumer);
      // **Taken before the prompt comes live**, so the reader composes
      // into an empty line rather than on top of whatever they had typed
      // when the question arrived.
      deps.holdDraft();
      // **What the reader composed before `esc` comes back** (C23 I89).
      if (kept !== null) {
        deps.resumeReply?.(kept);
        kept = null;
      }
      const at = deps.anchor();
      deps.overlays.update(CONFIRM_LAYER_ID, {
        content: draw(selected(), cut, refused),
        placement: { kind: "anchored", row: at.row, rows: at.rows, prefer: "above" },
      });
      deps.invalidate();
      return true;
    };

    /**
     * Suspend, and come back (I75, `R-QST-002`).
     *
     * **Neither of these settles**, which is the whole invariant. The
     * promise this closure resolves is untouched by both, so the owner is
     * still awaiting and a second question behind this one still waits —
     * suspended is *unresolved*, which is what the word is for.
     */
    const suspend = (): boolean => {
      suspended = true;
      // **Every entry is an arrival** (C23 I88): the box opens at its top,
      // and a content update keeps the namespace (C22 I141), so the reset
      // is this owner's to make.
      deps.inspectionBox?.reset();
      // Bounded by the room rather than by a constant: the payload is
      // here because it did not fit, so the figure that matters is how
      // much room there is. **The room is the prompt's slot** (C22 I142):
      // a replacing question is drawn there, and a box sized to the region
      // made a panel taller than the slot, whose cut took the key row and
      // the bottom border — a finding recorded with this lane.
      interior = Math.max(1, (deps.slotRows?.() ?? deps.overlayRegion().height) - 6); // cells-ok — the panel's own chrome
      deps.overlays.update(CONFIRM_LAYER_ID, {
        content: inspection(opts, interior, deps.unicode?.() ?? true, waiting.length, deps.separator?.()),
      });
      deps.invalidate();
      return true;
    };

    /** `↑`/`↓` a row, `PgUp`/`PgDn` the interior less one, floored at 1 (C23 I88). */
    const scrollInspection = (name: string): boolean => {
      const k = QUESTION_KEYS.scroll;
      const page = Math.max(1, interior - 1);
      const rows = name === k.up ? -1 : name === k.down ? 1 : name === k.pageUp ? -page : page;
      deps.inspectionBox?.by(INSPECTION_BOX_ID, rows);
      deps.invalidate();
      return true;
    };

    /**
     * `esc` in a reply: back to the choices, not an answer (C23 I89, ruling 1).
     *
     * The line goes back to its owner and what was composed stays on the
     * question; the question replaces the prompt again (I73), at the placement
     * it opened with.
     */
    const backToChoices = (): boolean => {
      kept = deps.keepReply?.() ?? null;
      deps.restoreDraft();
      replying = null;
      consumer = questionConsumer(opts.choices, false);
      routing = routingFor(consumer);
      const placed = placementOf(opts, deps);
      deps.overlays.update(CONFIRM_LAYER_ID, {
        content: draw(selected(), cut, refused),
        placement: placed.placement,
        ...(placed.width === undefined ? {} : { width: placed.width }),
      });
      deps.invalidate();
      return true;
    };

    const leaveInspection = (): boolean => {
      suspended = false;
      return redraw();
    };

    const redraw = (): boolean => {
      deps.overlays.update(CONFIRM_LAYER_ID, { content: draw(selected(), cut, refused) });
      deps.invalidate();
      return true;
    };

    /**
     * Explain a refusal, once (C23 I82, R-HON-004, R-INT-008, ruling 60).
     *
     * **The first changes the frame and every later one changes nothing.**
     * A refused key that draws nothing is indistinguishable from a key that
     * was swallowed, which is the whole of R-HON-004's complaint — and a
     * refusal that redrew on every key would be the notice flickering on a
     * held key. So one `update` and one `invalidate`, and a second refusal
     * performs neither.
     *
     * **Silent in the inspection and while composing.** The inspection's
     * only key is `esc`, and a reader reading is not being refused; the reply
     * state's keys are the prompt's, and composition is never a refusal.
     */
    const refuse = (): void => {
      if (refused || suspended || replying !== null) return;
      refused = true;
      deps.overlays.update(CONFIRM_LAYER_ID, { content: draw(selected(), cut, true) });
      // **The notice can take the row the choices needed** — a long question
      // beside it wraps once more. The same second pass as at `ask`, and the
      // only case this spends a second update on.
      if (!cut && truncated(deps)) {
        cut = true;
        deps.overlays.update(CONFIRM_LAYER_ID, { content: draw(selected(), true, true) });
      }
      deps.invalidate();
    };
    refuseOpen = refuse;
    // The count in the title moved (C23 I91): redrawn in whichever state it is.
    q.repaint = () => {
      deps.overlays.update(CONFIRM_LAYER_ID, {
        content: suspended
          ? inspection(opts, interior, deps.unicode?.() ?? true, waiting.length, deps.separator?.())
          : draw(selected(), cut, refused),
      });
    };
    vocabularyOpen = () => ({
      state: suspended ? "inspection" : replying !== null ? "reply" : "choice",
      // **`esc` in a reply goes back to the choices** (C23 I89), so the line
      // names where it goes rather than an answer it no longer gives.
      resolvesTo: replying !== null ? "choices" : defaultChoice(opts.choices).label,
    });

    // `Esc` resolves with the default (C23 I36). It is classified here
    // rather than special-cased in C16 because what it means is the
    // question's business, and a router that knew it would hold half of a
    // rule whose other half lives two layers away (C16 I25). **`⌃c` is not
    // here** (C16 I62, ruling 59): the router refuses it at a question
    // before this is asked, and it read `escape || ⌃c` until then.
    //
    // Accelerators are checked last, and bare only: `⌥y` is not `y`, and
    // `⌃c` is not a choice keyed `c`.
    const classify = (e: InputEvent): Meaning => {
      if (e.kind !== "key") return "none";
      const { name, ctrl } = e.key;
      const is = (set: readonly string[]): boolean => set.includes(name);
      // **An inspection owns escape and nothing else** (I75). `Esc` inside
      // it leaves the inspection and not the request, so it cannot be a
      // `resolve` here — and no accelerator answers, because the reader is
      // reading the evidence rather than choosing between answers.
      if (suspended) {
        if (is(QUESTION_KEYS.leave)) return "leave";
        // **And its payload's scrolling** (C23 I88, `R-BLK-840`). Bare keys
        // only: a modified arrow is someone else's chord.
        const bareKey = !ctrl && !e.key.meta && !e.key.shift;
        return bareKey && (Object.values(QUESTION_KEYS.scroll) as readonly string[]).includes(name) ? "scroll" : "none";
      }
      // **`esc` in a reply is back one level** (C23 I89): the choices, not an
      // answer. At the choices it still resolves with the default (I36).
      if (is(QUESTION_KEYS.leave)) return replying !== null ? "back" : "resolve";
      // **A bare `⏎` answers a reply; a modified one is the line's** (§052:
      // *⏎ submit   ⇧⏎ newline*, C16 I54). Before `reply…` there is no line,
      // so every `enter` still answers.
      const bare = !e.key.shift && !e.key.meta && !ctrl;
      if (is(QUESTION_KEYS.answer) && (bare || replying === null)) return "resolve";
      // **A floating reply owns two keys and no others** (I73). The reader
      // is composing text, so `y` is a letter and `↓` is a motion in the
      // line — an accelerator arm here would make a question whose choices
      // spell a word unanswerable by typing it.
      if (replying !== null) return "compose";
      if (is(QUESTION_KEYS.previous) || is(QUESTION_KEYS.next)) return "move";
      if (!ctrl && !e.key.meta && opts.choices.some((c) => c.key === name)) return "resolve";
      if (!ctrl && !e.key.meta && numberedPick(name) !== undefined) return "resolve";
      return "none";
    };
    meaning = classify;

    const chosen = (key: string): Choice | undefined =>
      opts.choices.find((c) => c.key === key) ?? numberedPick(key);

    handler = (e) => {
      if (e.kind !== "key") return false;
      const { name } = e.key;
      switch (classify(e)) {
        case "resolve":
          if (QUESTION_KEYS.leave.includes(name)) {
            // **The default's key and no text** (I36). Only at the choices:
            // `esc` in a reply is `back` (I89), which is where the borrowed
            // line is given back (C17 I28) and the composed text kept.
            return settle(defaultChoice(opts.choices).key);
          }
          if (replying !== null) {
            // **The answer carries both facts** (I36): which choice opened
            // the reply, and what was composed under it. The text is read
            // at the keystroke rather than held, because the prompt is the
            // record and a copy taken earlier is a second one.
            //
            // **Resolved, and announced as drawn** (C23 I90): `draft` is the
            // line with a chip's content, `drawn` with its label.
            const text = deps.draft();
            const said = deps.drawn?.() ?? text;
            const key = replying.key;
            deps.restoreDraft();
            return settle(key, text, "answered", said);
          }
          {
            const pick =
              name === "return" || name === "enter" ? opts.choices[selected()] : chosen(name);
            // **`reply…` does not resolve; it moves the question** (I73).
            // The caller is still awaiting, the layer keeps its id, and the
            // prompt comes live beneath — §101's *the question moves UP*.
            if (pick?.reply === true && replying === null) return toReply(pick);
            // **And an inspection does not resolve either; it suspends**
            // (I75). The reader is going to look at what they are being
            // asked about, which is not an answer to it.
            if (pick?.inspect === true) return suspend();
            return settle(pick?.key ?? name);
          }
        case "leave":
          return leaveInspection();
        case "back":
          return backToChoices();
        case "scroll":
          return scrollInspection(name);
        case "compose":
          // **Not consumed, and passed to the shell's forward** (C16 I54).
          // This comment said C16 handed the `false` down the ladder to the
          // prompt; dispatch never falls between rungs, so for as long as
          // that was believed every letter met the modal reject. What makes
          // the layer *float* is `construct.ts` registering a second handler
          // on this rung that forwards to the prompt's keys while
          // `composing` holds.
          return false;
        case "move":
          if (QUESTION_KEYS.previous.includes(name)) selection.prev();
          else selection.next();
          return redraw();
        default:
          // **Refused, and it says so** (C23 I82, R-HON-004). An unbound key
          // at an open question must not fall through — C16 I8 blocks the
          // surface beneath — and it used to be consumed with nothing on
          // screen changing, which is a key swallowed rather than refused.
          // `reject` rather than `true`: the router reports a handler's
          // reject no second time (C16 I62), and the stage says what it was.
          // In the inspection it is consumed silently (ruling 60).
          if (suspended) return true;
          refuse();
          return "reject";
      }
    };

    deps.invalidate();
  };

  return {
    focusedBox(id) {
      return suspended && handler !== null && id === CONFIRM_LAYER_ID
        ? { blockId: INSPECTION_BOX_ID, rowId: null }
        : null;
    },

    get open() {
      return handler !== null;
    },

    get waiting() {
      return waiting.length;
    },

    cancelAll() {
      // The waiting first, so the open one's settle has nothing to promote.
      for (const q of waiting.splice(0)) {
        q.detach();
        q.resolve({ key: defaultChoice(q.opts.choices).key, outcome: "cancelled" });
      }
      if (current !== null) withdraw(current, "cancelled");
    },

    get composing() {
      return handler !== null && replying !== null;
    },

    get replacing() {
      if (consumer === null || !routingFor(consumer).replaces) return null;
      return deps.overlays.stack.find((l) => l.id === CONFIRM_LAYER_ID) ?? null;
    },

    answerHandler() {
      // The guard is the top layer's identity rather than a stored flag: a
      // second record of "is the question on top" is one that can disagree with
      // C15's stack, and C16 asks this on every keystroke.
      return deps.overlays.top?.id === CONFIRM_LAYER_ID ? handler : null;
    },

    refuse() {
      refuseOpen?.();
    },

    vocabulary() {
      return vocabularyOpen?.() ?? null;
    },

    resolvesHandler() {
      const classify = meaning;
      if (classify === null || deps.overlays.top?.id !== CONFIRM_LAYER_ID) return null;
      return (e: InputEvent): boolean => classify(e) === "resolve";
    },

    ask(opts) {
      // **Checked before anything is queued, pushed or held** (C23 I93).
      const invalid = invalidChoices(opts.choices);
      if (invalid !== null) return Promise.reject(new Error(invalid));
      // **Already withdrawn: resolved at once, nothing pushed** (C23 I92).
      if (opts.signal?.aborted === true) {
        return Promise.resolve({ key: defaultChoice(opts.choices).key, outcome: "cancelled" });
      }
      return new Promise<AskAnswer>((resolve) => {
        const q: Asked = { opts, resolve, end: null, repaint: null, detach: () => undefined };
        const signal = opts.signal;
        if (signal !== undefined) {
          const onAbort = (): void => withdraw(q, "cancelled");
          signal.addEventListener("abort", onAbort, { once: true });
          q.detach = () => signal.removeEventListener("abort", onAbort);
        }
        // **One question on screen at a time; the rest wait in order** (C23
        // I91, `R-BLK-877`). Open means answering, replying or suspended — a
        // suspension is unresolved. A second push under the one id is what C15
        // threw on.
        if (current === null) show(q);
        else {
          waiting.push(q);
          retitle();
        }
      });
    },
  };
}
