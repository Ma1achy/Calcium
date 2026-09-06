// C27 — terminal emulator (docs/components/C27_terminal_emulator.md §9). Spec-first rows:
// every one lands as a real test with the emulator (SP9 meets spec-alone at each new
// invariant, and the not-deferred marker is the ruled route — F814).
import { describe, it } from "vitest";

describe("C27 terminal emulator — tier 2", () => {
  it.todo("T2.1 (C27 I11): the module graph shows `src/data/emulator/` importing nothing from `src/terminal/`, and `@xterm/headless` imported by `emulator.ts` alone (MG rule, lands with the code). — not deferred on a component: lands with C27's emulator");
  it.todo("T2.2 (C27 I1): a source scan of `src/data/emulator/` finds no `process.stdout`, `process.stdin`, `console.`, `onData` or `process.env`. — not deferred on a component: lands with C27's emulator");
  it.todo("T2.3 (C27 I8): a snapshot after `\\x07\\x1b]0;renamed\\x07text` equals the snapshot after `text`, deep. — not deferred on a component: lands with C27's emulator");
  it.todo("T2.4 (C27 I2): every character of every line of a snapshot taken after a corpus of 1,000 random byte strings is outside U+0000–U+001F, U+007F–U+009F. The corpus is seeded and the seed is in the failure message. — not deferred on a component: lands with C27's emulator");
  it.todo("T2.5 (C27 I5): a snapshot round-trips through `JSON.parse(JSON.stringify(...))` deep-equal, and `validateDocument` (C04) admits a document holding it. — not deferred on a component: lands with C27's emulator");
  it.todo("T2.6 (C27 I7): `dropped` is absent from the snapshot when `dropped === 0` and present otherwise — a `Terminal` never carries `dropped: 0`. — not deferred on a component: lands with C27's emulator");
});

describe("C04 — the terminal kind, spec-first rows", () => {
  it.todo("T2.118 (C04 I110, §5a): a terminal carrying every run field and both modes round-trips through JSON deep-equal, and TERMINAL_KEYS refuses a seventh block key and an eleventh run key by name — not deferred on a component: lands with the Terminal type");
});

describe("C09 · C10 — the terminal block and a literal colour, spec-first rows", () => {
  it.todo("T2.121 (C09 I55, C09 §6b): terminalDefinition declares window, and a window of six rows of a 2,000-line block renders exactly those rows with the whole-block bytes — not deferred on a component: lands with the terminal definition");
  it.todo("T2.122 (C09 I57): RAMP_EXTENT.terminal is none, ANIMATES.terminal is false, and tickIntervalOf a terminal returns null whatever its runs carry — not deferred on a component: lands with the terminal definition");
  it.todo("T2.36 (C10 I38): degradeColour's signature takes no theme, at compile time, and a source scan finds no theme reference in its module — not deferred on a component: lands with degradeColour");
});
