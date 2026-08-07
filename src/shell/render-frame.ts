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
import { CURSOR_HOME as HOME } from "../terminal/escapes.js";
import { cursorFor, paint, FrameError, type PaintDeps } from "./paint.js";
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
    write: `${hide}${HOME}${lines.join("\r\n")}${deps.cursorSequence(cursor)}`,
  };
}
