// C27 — terminal emulator (docs/components/C27_terminal_emulator.md §9). Spec-first rows:
// every one lands as a real test with the emulator (SP9 meets spec-alone at each new
// invariant, and the not-deferred marker is the ruled route — F814).
import { describe, it } from "vitest";

describe("C27 terminal emulator — tier 6", () => {
  it.todo("T6.1 (C27 I2): removing the U+FFFD replacement from the walk → T2.4 fails on the first corpus string carrying a C1. — not deferred on a component: lands with C27's emulator");
  it.todo("T6.2 (C27 I3): resolving `write`'s promise before the parser callback → T1.1's second snapshot is empty on a slow parse. — not deferred on a component: lands with C27's emulator");
  it.todo("T6.3 (C27 I5): emitting a run for default-styled cells → T1.2's run count is four, not three. — not deferred on a component: lands with C27's emulator");
  it.todo("T6.4 (C27 I6): including the wide cluster's filler cell as an empty character → T1.4's no-empty-character assertion fails; `cells(text)` alone would still read 10, which is why T1.4 asserts both. — not deferred on a component: lands with C27's emulator");
  it.todo("T6.5 (C27 I7): counting `dropped` from `onLineFeed` instead of from scrolls at the cap → T1.6 reads 30, not 6. — not deferred on a component: lands with C27's emulator");
  it.todo("T6.6 (C27 I4): returning `rows` lines in `lines` mode → T1.1 has six lines for one write. — not deferred on a component: lands with C27's emulator");
  it.todo("T6.7 (C27 I8): subscribing `onTitleChange` and storing the title on the block → T2.3's deep-equal fails. — not deferred on a component: lands with C27's emulator");
  it.todo("T6.8 (C27 I12): `snapshot` after `dispose` returning the last value → T3.7 fails. — not deferred on a component: lands with C27's emulator");
  it.todo("T6.9 (C27 I11): importing `@xterm/headless` from `snapshot.ts` → T2.1 fails. — not deferred on a component: lands with C27's emulator");
  it.todo("T6.10 (C27 I10): applying the cap before the reflow → T1.7 loses a line when the reflow lands over the cap at `scrollback: 8`. — not deferred on a component: lands with C27's emulator");
});
