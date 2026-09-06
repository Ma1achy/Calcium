// C27 — terminal emulator (docs/components/C27_terminal_emulator.md §9). Spec-first rows:
// every one lands as a real test with the emulator (SP9 meets spec-alone at each new
// invariant, and the not-deferred marker is the ruled route — F814).
import { describe, it } from "vitest";

describe("C27 terminal emulator — tier 1", () => {
  it.todo("T1.1 (C27 I3): `write(\"hi\")` then `snapshot` → one line `hi`; the snapshot taken before the promise resolved may be empty and the one after is not. — not deferred on a component: lands with C27's emulator");
  it.todo("T1.2 (C27 I5): `\\x1b[38;2;10;200;30mrgb\\x1b[38;5;208m256\\x1b[31m16\\x1b[0m` → three runs: `rgb` `{kind:\"rgb\", hex:\"#0ac81e\"}`, `ansi256` 208, `ansi16` 1; the text is `rgb25616`. — not deferred on a component: lands with C27's emulator");
  it.todo("T1.3 (C27 I5): `\\x1b[1;3;4;7;9;2m` → one run with all six booleans true; `\\x1b[5m` (blink) and `\\x1b[8m` (invisible) produce no run. — not deferred on a component: lands with C27's emulator");
  it.todo("T1.4 (C27 I6): `wide 漢字 x` → text is that string, `cells(text)` is 10, and no line contains U+0000 or an empty filler. — not deferred on a component: lands with C27's emulator");
  it.todo("T1.5 (C27 I4): `?1049h` → `screen` is `\"grid\"` and `lines.length === rows`; `?1049l` → `\"lines\"` and the earlier lines are intact. — not deferred on a component: lands with C27's emulator");
  it.todo("T1.6 (C27 I7): `scrollback: 20, rows: 4`, 30 `\\r\\n`-terminated lines → `lines.length === 24`, `dropped === 6`; the first line kept is `line 7`. The two figures are asserted separately — a conservation total is satisfied by redistribution. — not deferred on a component: lands with C27's emulator");
  it.todo("T1.7 (C27 I10): 40 columns, seven lines including a 60-character one → `resize(20, 4)` → nine lines, the same characters in order when the texts are concatenated. — not deferred on a component: lands with C27's emulator");
  it.todo("T1.8 (C27 I4): `\\r` overwrite — `...\\x1b[K.....` → one line `.....`, five dots. — not deferred on a component: lands with C27's emulator");
  it.todo("T1.9 (C27 I3): a snapshot taken, then `write(\"more\")` → the first snapshot is unchanged and `Object.isFrozen(first)`. — not deferred on a component: lands with C27's emulator");
  it.todo("T1.10 (C27 I12): `dispose(); dispose()` → no throw. — not deferred on a component: lands with C27's emulator");
  it.todo("T1.11 (C27 I4): `cursor` after `abc` is `{ line: 0, col: 3 }`; after `\\r\\n` it is `{ line: 1, col: 0 }`; in `grid` mode after `\\x1b[3;5H` it is `{ line: 2, col: 4 }`. — not deferred on a component: lands with C27's emulator");
  it.todo("T1.12 (C27 I6): a line ending in `\\x1b[41m   \\x1b[0m` keeps its three background blanks with a run; a line ending in three plain blanks is trimmed. — not deferred on a component: lands with C27's emulator");
});
