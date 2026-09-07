/**
 * One frame, as a value (C22 §4a, I54 · C24 I25 · FINDINGS F126).
 *
 * **Nothing in the tree composed a frame as a value.** The sequence existed only
 * inside `session.ts`'s `#render()`, a private method returning `void`, and the
 * rows it produced were a local — never returned, never yielded, never handed to
 * anything. So a consumer wanting to read the frame its own app draws had
 * nothing to call, and four attempts at it hit four different unexported
 * symbols, which read as four missing exports and was one missing unit.
 *
 * **The class is one level up from the one every rule here can see.** Every
 * prior instance of *a complete mechanism unreachable across a seam* is **a
 * member nobody could call**; this was **a sequence nobody named**. MG24 counts
 * consumers of exported members, MG25 and MG27 compare declared shapes against
 * builders, and all three are satisfied by a tree in which every member is
 * consumed and the only thing missing is the order they go in. A private method
 * is the perfect hiding place, because the composition *is* consumed — sixty
 * times a second — by the one caller inside the class.
 *
 * **Here rather than in `frame.ts`, and the reason is a cycle.** `paint.ts`
 * imports `frame.ts` for `Composed`, so a unit in `frame.ts` calling `paint`
 * would close a cycle inside L4 — which A02 §1 forbids and MG2 catches. The
 * division that falls out is the honest one: `frame.ts` composes the *layout*,
 * this composes the *frame*.
 *
 * **What it does not decide.** Where the seam falls between *compose a frame*
 * and *put it on a terminal* is a separate question and is not answered here.
 * The write is C01's writer and the fallback is a side effect, so both stay with
 * the caller and this returns which of the two is owed. The unit is the
 * composition; the boundary is where it was.
 */
import { CURSOR_HOME as HOME, SGR_RESET, cursorTo } from "../terminal/escapes.js";
import { cursorFor, paint, type PaintDeps } from "./paint.js";
import { FrameError } from "./frame-error.js";
import type { Composed } from "./frame.js";
import type { TerminalSize } from "../terminal/lifecycle.js";

export type FrameDeps = Readonly<{
  /** The layout, composed once (`frame.ts`). */
  composed: () => Composed;
  /** Everything `paint` and `cursorFor` need, per frame. */
  paintDeps: (frame: Composed) => PaintDeps;
  /**
   * C22 I34 — the viewport is as tall as the region, and this is where the
   * region's height is known.
   */
  resizeViewport: (size: Readonly<{ width: number; height: number }>) => void;
  /** C01 I19's — the owner yields the bytes and the frame embeds them. */
  cursorSequence: (cursor: ReturnType<typeof cursorFor>) => string;
  /**
   * The cursor's shape, as bytes, **empty when it has not changed** (C22 I63).
   *
   * Read here rather than passed as a value, for `cursorSequence`'s reason: the
   * bytes are C01's to produce and must land inside the frame's one `write`.
   * The emptiness is the point — a shape re-asserted with every frame is
   * asserted at frame cadence.
   */
  cursorShape: () => string;
  /**
   * The last frame this session put on **this** screen, or `null` when nothing
   * describes it (I55).
   *
   * A function rather than a value for the reason `transcriptRows` is one: it is
   * answered when the frame is assembled, not when the deps were built. The
   * caller owns the record because the caller owns the write — this unit
   * composes and does not put anything on a terminal (§4a), so it cannot know
   * whether the bytes it returned ever landed.
   */
  previous: () => readonly string[] | null;
}>;

export type FrameResult =
  /** The single write, cursor sequences embedded. */
  | Readonly<{ kind: "frame"; lines: readonly string[]; write: string }>
  /** `paint` refused; the caller draws the fallback at this size. */
  | Readonly<{ kind: "fallback"; size: TerminalSize }>;

/**
 * Compose, paint, assemble — and hand back what to write.
 *
 * **Every comment that used to sit in `#render()` came with it**, because they
 * are the most careful in that file and each names a defect that has happened:
 * the size read once by `compose`, the viewport resized from the composed frame
 * before its rows are read, the fallback rather than a short frame, and the
 * cursor sequence inside the one write.
 */
export function composeFrame(deps: FrameDeps): FrameResult {
  const frame = deps.composed();

  // **C22 I34 — the viewport is as tall as the region, and this is where the
  // region's height is known.** It is `rows − header − footer − promptRows`,
  // and the prompt's height changes with what is typed rather than with the
  // terminal, so no handler on a terminal event can compute it. Set from the
  // composed frame, before the visible rows are read from it.
  //
  // Per frame, and cheap because C14 refuses a resize to the size it holds
  // (C14 I21) — the guard is what makes one owner affordable.
  //
  // It was `size.rows` in the resize handler: three rows too tall from the
  // first frame, so `#maxTop()` stopped short by exactly the chrome and the
  // last rows of a tall entry were unreachable by `End`, `PageDown` or `↓`.
  // Nothing could see it, because the surplus rows were discarded below.
  deps.resizeViewport({ width: frame.size.columns, height: frame.region.height });

  let lines: readonly string[];
  try {
    lines = paint(frame, deps.paintDeps(frame));
  } catch (err) {
    // A frame that cannot be composed coherently draws the fallback rather than
    // a short frame: one row too few leaves the previous frame showing through
    // while one too many scrolls the alternate screen.
    if (!(err instanceof FrameError)) throw err;
    return { kind: "fallback", size: frame.size };
  }

  // **Hide, move, show — and the order is not made moot by the sync window**
  // (C15 I19). `synchronisedUpdate` is a capability, so the unwrapped path is
  // real: on a terminal without DECSET 2026 a visible cursor is dragged
  // across the frame by `HOME` and every row after it, which is a cursor
  // racing over the screen sixty times a second. So the hide leads the write
  // and the position and show close it, all inside one `write` — one string,
  // so it cannot straddle the scheduler's window either.
  // **The sequence is C01's** (C01 I19, MG20). The cursor's visibility is a
  // mode C01 holds and restores at release, so this file may not write it —
  // and the bytes still have to land inside the one `write`, because a
  // separate call cannot be kept inside C03's synchronised-update window. The
  // owner yields them; the frame embeds them.
  const cursor = cursorFor(frame, deps.paintDeps(frame));
  const hide = deps.cursorSequence(null);
  return {
    kind: "frame",
    lines,
    // **The shape leads the frame and the position closes it.** Both are C01's
    // bytes inside one write (I19, I20); the shape goes first because it is
    // usually empty — emitted only on change — and putting it beside the hide
    // keeps the two cursor writes at the two ends rather than interleaved with
    // the rows.
    write: `${deps.cursorShape()}${hide}${body(lines, deps)}${deps.cursorSequence(cursor)}`,
  };
}

/**
 * The rows, as a full frame or as a difference (I55, §6b).
 *
 * `HOME` plus every row joined is the whole-frame form and it is what every
 * no-record case falls back to: the first frame, a contaminated one, one whose
 * predecessor was a different size, and one following a refusal or a throw.
 *
 * **One concept, not two.** `contaminated` is not read here and does not need to
 * be: C03 answers a contaminated write by calling `repaint` rather than `render`,
 * and `repaint` drops the record — so *the screen's contents are unknown* has a
 * single expression, which is `previous() === null`. Reading C03's flag as well
 * would be a second record of the same fact, coupled to when C03 clears it.
 *
 * The difference addresses each changed row and writes it. **Every row is
 * already `exact()`-padded to the frame's width**, so a rewrite covers the row
 * it replaces cell for cell and no erase sequence is needed — the padding that
 * exists to stop the previous frame showing through is what makes this
 * affordable.
 *
 * **`SGR_RESET` leads every row and the reason is asymmetry** (I57). Measured
 * when this was written, no composed row ends with a live attribute, so the
 * prefix is currently inert — four bytes a row against a colour that would bleed
 * down every row below it and survive the frame, on the day a renderer stops
 * closing its own styling. A diff writes rows out of order; nothing else asserts
 * the property that would make this unnecessary.
 */
function body(lines: readonly string[], deps: FrameDeps): string {
  const held = deps.previous();
  if (held === null || held.length !== lines.length) {
    return `${HOME}${lines.join("\r\n")}`;
  }

  let out = "";
  for (let i = 0; i < lines.length; i += 1) {
    const row = lines[i];
    if (row === undefined || row === held[i]) continue;
    // **0-based, both axes.** `cursorTo` owns the conversion to CUP's 1-based
    // wire form and says so — *"one place to be off by one, and it is the place
    // with the test"*. Converting here as well put every row one down and one
    // right, and the frame it produced was self-consistent: T4.12 saw a screen
    // lagging its input by exactly one frame, because the prompt's new rows were
    // landing below the prompt.
    out += `${cursorTo(i, 0)}${SGR_RESET}${row}`;
  }
  return out;
}
