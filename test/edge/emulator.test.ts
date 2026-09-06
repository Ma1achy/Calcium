// C27 — terminal emulator (docs/components/C27_terminal_emulator.md §9). Spec-first rows:
// every one lands as a real test with the emulator (SP9 meets spec-alone at each new
// invariant, and the not-deferred marker is the ruled route — F814).
import { describe, it } from "vitest";

describe("C27 terminal emulator — tier 3", () => {
  it.todo("T3.1 (C27 I6): `漢` written at column 39 of 40 → it begins the next line; no line has `cells(text) > 40`. — not deferred on a component: lands with C27's emulator");
  it.todo("T3.2 (C27 I9): `\\x1bPunknown\\x1b\\\\` and `\\x1b[?9999z` between two words → the text is the two words. — not deferred on a component: lands with C27's emulator");
  it.todo("T3.3 (C27 I4): a chunk split inside an escape — `\\x1b[3` then `1mred` — → one run, `ansi16` 1, over `red`. — not deferred on a component: lands with C27's emulator");
  it.todo("T3.4 (C27 I4): a chunk split inside a wide cluster's bytes (UTF-8 `Uint8Array` halves) → one `漢`, not two replacement marks. — not deferred on a component: lands with C27's emulator");
  it.todo("T3.5 (C27 I7): `scrollback: 0` → `lines.length ≤ rows` always and `dropped` counts everything scrolled out. — not deferred on a component: lands with C27's emulator");
  it.todo("T3.6 (C27 I12): `write` after `dispose` throws and the message names `dispose`. — not deferred on a component: lands with C27's emulator");
  it.todo("T3.7 (C27 I12): `snapshot` after `dispose` throws; it does not return the last value. — not deferred on a component: lands with C27's emulator");
  it.todo("T3.8 (C27 I4): `grid` mode with nothing drawn → `rows` lines, each `text === \"\"`, no runs. — not deferred on a component: lands with C27's emulator");
  it.todo("T3.9 (C27 I10): `resize` to the same size → a deep-equal snapshot. — not deferred on a component: lands with C27's emulator");
  it.todo("T3.10 (C27 I3): 100 `write` calls without awaiting, then `await` the last → the snapshot holds all 100 lines in order. — not deferred on a component: lands with C27's emulator");
});
