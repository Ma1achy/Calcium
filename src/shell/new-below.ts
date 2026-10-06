/**
 * The new-messages count (C22 I154, §067, `R-BLK-494`, `R-BLK-495`).
 *
 * **Entries that settled while the transcript was not following the tail** — *which
 * is exactly the set you would have to scroll back to read.* A number held by L4
 * from C13's change stream and C14's `followTail`: neither component learns a
 * count (A02 Seam 4).
 *
 * | arrival | counts |
 * |---|---|
 * | `settle` of a streaming entry | yes |
 * | `append` of an entry born settled | yes |
 * | `append` of a streaming entry (*the running entry has not arrived yet*) | no |
 * | `patch` (*the entry was already counted*), `evict` | no |
 * | either arrival of an entry the reader initiated (*you just sent it*) | no |
 *
 * **The reader's own is read from the document, not from a scope** (§6u.2 ruling
 * c): `meta.origin` is `user` for a submitted command and `action` for a gesture
 * (C04 I13). A scope wrapped round `submit` was tried first and counted the
 * reader's own `/say` — a local verb's entry is appended after an await, outside
 * the synchronous call the scope wrapped.
 *
 * **Reset by `followTail`, never by an event of its own.** Every way back to the tail
 * — the wheel, `End`, the button, a bar press — lands on the viewport's own
 * derived flag (C14 I5), so there is one reset and no path that could forget it.
 */

import type { TranscriptView } from "../viewport/transcript/index.js";
import type { Viewport } from "../viewport/viewport/index.js";

export interface NewBelow {
  /** Settled entries since the reader last had the tail in view; 0 draws nothing. */
  count(): number;
  dispose(): void;
}

export function createNewBelow(deps: {
  transcript: Pick<TranscriptView, "subscribe" | "entries">;
  viewport: Pick<Viewport, "scroll" | "subscribe">;
}): NewBelow {
  let n = 0;

  const following = (): boolean => deps.viewport.scroll.followTail;

  const transcript = deps.transcript.subscribe((change) => {
    if (change.kind === "clear") {
      n = 0;
      return;
    }
    if (change.kind !== "append" && change.kind !== "settle") return;
    if (following()) return;
    const entry = deps.transcript.entries.find((e) => e.id === change.id);
    if (entry === undefined) return;
    // A streaming append is the running entry, which has not arrived.
    if (change.kind === "append" && entry.streaming) return;
    const origin = entry.doc.meta.origin;
    if (origin === "user" || origin === "action") return;
    n += 1;
  });

  // The reset, from the viewport's own flag.
  const viewport = deps.viewport.subscribe(() => {
    if (following()) n = 0;
  });

  return {
    count: () => n,
    dispose() {
      transcript[Symbol.dispose]();
      viewport[Symbol.dispose]();
    },
  };
}
