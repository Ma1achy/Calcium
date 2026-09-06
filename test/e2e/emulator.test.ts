// C27 — terminal emulator (docs/components/C27_terminal_emulator.md §9). Spec-first rows:
// every one lands as a real test with the emulator (SP9 meets spec-alone at each new
// invariant, and the not-deferred marker is the ruled route — F814).
import { describe, it } from "vitest";

describe("C27 terminal emulator — tier 5", () => {
  it.todo("T5.1: under the devcontainer's `node-pty`, `sh -c 'printf \"a\\\\r\\\\033[Kb\\\\n\"; printf \"\\\\033[32mok\\\\033[0m\\\\n\"'` piped into `write` → two lines, `b` and `ok`, the second with an `ansi16` 2 run. Real bytes from a real tty, not a string constant. — not deferred on a component: lands with C27's emulator");
  it.todo("T5.2: `sh -c 'seq 1 30'` at `scrollback: 20, rows: 4` → `dropped === 6`, matching T1.6 from a real child. — not deferred on a component: lands with C27's emulator");
});
