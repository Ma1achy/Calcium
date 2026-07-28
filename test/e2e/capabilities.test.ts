// C02 tier 5 — e2e, PTY harness with a controlled environment.
//
// The harness itself is C01's to build (node-pty, acquisition and restoration),
// so every test here waits on C01. See the tier 4 file for the grep convention.
import { describe, it } from "vitest";

describe("C02 e2e", () => {
  it.todo(
    "T5.1: launched under TERM=dumb → no escape sequence reaches the PTY at all; help text on the primary screen; exit 0 — waits on C01",
  );
  it.todo(
    "T5.2: launched under TERM=xterm → the frame renders, is readable, and contains no 24-bit colour sequence — waits on C01",
  );
  it.todo(
    "T5.3: launched under LANG=C → the frame contains only ASCII; no mojibake, no replacement characters — waits on C01",
  );
  it.todo(
    "T5.4: launched inside tmux → no mouse sequences emitted; keyboard navigation of a table still works end to end — waits on C01",
  );
  it.todo(
    "T5.5: a config override forcing colour_depth = 24 under TERM=xterm → truecolour sequences appear, proving the override reaches the renderer and not just the record — waits on C01",
  );
});
