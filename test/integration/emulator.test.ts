// C27 — terminal emulator (docs/components/C27_terminal_emulator.md §9). Spec-first rows:
// every one lands as a real test with the emulator (SP9 meets spec-alone at each new
// invariant, and the not-deferred marker is the ruled route — F814).
import { describe, it } from "vitest";

describe("C27 terminal emulator — tier 4", () => {
  it.todo("T4.1 (with C04, C09): a snapshot inside `scroll({ height: 6, follow: true, children: [terminal] })` renders six rows of the tail at 24-bit with the run's colours as `38;2;…` SGR, and the residue row reads `⋯ N above`. — not deferred on a component: lands with C27's emulator");
  it.todo("T4.2 (with C09): the same document at 4-bit carries the `rgb` run as `nearestAnsi16`'s index, and at 1-bit carries no colour and keeps `inverse`. — not deferred on a component: lands with C27's emulator");
  it.todo("T4.3 (with C04): a hand-built `Terminal` whose text carries `\\x1b[31m` is refused by `validateDocument` naming the line — the second gate, independent of I2's first. — not deferred on a component: lands with C27's emulator");
});
