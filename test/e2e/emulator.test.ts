// C27 — terminal emulator (docs/components/C27_terminal_emulator.md §9). Spec-first rows:
// every one lands as a real test with the emulator (SP9 meets spec-alone at each new
// invariant, and the not-deferred marker is the ruled route — F814).
import { describe, it } from "vitest";

describe("C27 terminal emulator — tier 5", () => {
  it.todo("T5.1: under the devcontainer's `node-pty`, `sh -c 'printf \"a\\\\r\\\\033[Kb\\\\n\"; printf \"\\\\033[32mok\\\\033[0m\\\\n\"'` piped into `write` → two lines, `b` and `ok`, the second with an `ansi16` 2 run. Real bytes from a real tty, not a string constant. — not deferred on a component: lands with C27's emulator");
  it.todo("T5.2: `sh -c 'seq 1 30'` at `scrollback: 20, rows: 4` → `dropped === 6`, matching T1.6 from a real child. — not deferred on a component: lands with C27's emulator");
});

describe("C21 — the PTY port, spec-first rows", () => {
  it.todo("T5.6 (C21 I15, C21 I17): under the devcontainer's node-pty, a child reports a device path from tty and keeps the SGR it would drop on a pipe — the row asserts the tty's own name, a fact a fake cannot have — not deferred on a component: lands with spawnPty");
  it.todo("T5.7 (C21 I17): a PTY child signalled by group dies with its pipeline, matching T3.1 on the PTY arm — not deferred on a component: lands with spawnPty");
});

describe("C23 — the shell route as a live screen, spec-first rows", () => {
  it.todo("T5.21 (C23 I64, C23 I66): a real 200-line child under the devcontainer — frames arrive while it runs, far fewer than 200, and a cancel at the halfway point settles the card with the lines so far — not deferred on a component: lands with the route");
});
