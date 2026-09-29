// C14 §6a, §6e — the copy mode's keys in a real session (review batch 4, M10
// items 2, 5, 6 and 7).
import { describe, it } from "vitest";

describe("C14 §6a — the keys in a real session", () => {
  it.todo(
    "T3.14 (C14 I37, §6a): ↓ and ⇧↓ keep the view still while the caret is on screen, the press past the last row scrolls it by one, ↑ back scrolls it back, and ↑ at the first row scrolls nothing — not deferred on a component: the code lands in the next commit of this round",
  );
  it.todo(
    "T3.15 (C14 I59): y and ⏎ with nothing selected leave the kill buffer untouched, keep the mode up and toast nothing selected; a rule alone toasts the selection copies no text — not deferred on a component: the code lands in the next commit of this round",
  );
  it.todo(
    "T4.40 (C14 I59, C14 I47, R-BLK-838): a then ⏎ copies and leaves with a toast naming the destination; a then y copies and stays; ⏎ with nothing selected stays — not deferred on a component: the code lands in the next commit of this round",
  );
  it.todo(
    "T4.41 (C14 I60, C14 I43, C14 I55): ⌃V, ⇧→ ×3, ⇧↓ draws RECT 4×2 and cells, not source, washes four cells on two rows with the rail on the first; y copies the eight cells with no escape; ⌃V restores block mode — not deferred on a component: the code lands in the next commit of this round",
  );
});
