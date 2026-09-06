// C27 — terminal emulator (docs/components/C27_terminal_emulator.md §9). Spec-first rows:
// every one lands as a real test with the emulator (SP9 meets spec-alone at each new
// invariant, and the not-deferred marker is the ruled route — F814).
import { describe, it } from "vitest";

describe("C27 terminal emulator — tier 4", () => {
  it.todo("T4.1 (with C04, C09): a snapshot inside `scroll({ height: 6, follow: true, children: [terminal] })` renders six rows of the tail at 24-bit with the run's colours as `38;2;…` SGR, and the residue row reads `⋯ N above`. — not deferred on a component: lands with C27's emulator");
  it.todo("T4.2 (with C09): the same document at 4-bit carries the `rgb` run as `nearestAnsi16`'s index, and at 1-bit carries no colour and keeps `inverse`. — not deferred on a component: lands with C27's emulator");
  it.todo("T4.3 (with C04): a hand-built `Terminal` whose text carries `\\x1b[31m` is refused by `validateDocument` naming the line — the second gate, independent of I2's first. — not deferred on a component: lands with C27's emulator");
});

describe("C04 · C09 · C10 — the terminal block in a scroll, spec-first rows", () => {
  it.todo("T4.56 (C04 I110, C09, C10): a terminal in a scroll of height 6 with 40 lines renders the tail six rows and the residue reads 34 above; with dropped present the marker is content row 0 and both counts are asserted separately — not deferred on a component: lands with the terminal definition");
});

describe("C09 · C10 — the terminal block at the arms, spec-first rows", () => {
  it.todo("T4.57 (C09 I55, with C04, C27): a real pytest-shaped byte script inside a scroll of height 6 renders the tail at five arms, read as pictures, with the child's colours — not deferred on a component: lands with the terminal definition");
  it.todo("T4.37 (C10 I38, with C04, C09): one terminal document at five arms yields identical text and SGR differing exactly by the ladder, the block byte-identical across them — not deferred on a component: lands with degradeColour");
});

describe("C23 — the shell route as a live screen, spec-first rows", () => {
  it.todo("T4.64 (C23 I65, with C27): a width change mid-run resizes the child before the emulator, asserted by call order on one spy, and the next frame matches the reflow — not deferred on a component: lands with the route's resize");
  it.todo("T4.65 (C23 I63, C23 I67, with C21, C27): one byte script on both arms — the PTY arm carries the child's colours, the pipe arm does not, and both settle with the same text — not deferred on a component: lands with the route's arms");
});
