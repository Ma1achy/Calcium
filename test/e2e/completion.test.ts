// C19 tier 5 — e2e. Completing at a real prompt in a real terminal.
//
// Every one of these needs a running shell: a frame to type into, a prompt at a
// real screen position for the menu to anchor against, and a terminal to show
// the spinner in. That is L4, and `LAYER_SOURCES` maps it to
// `src/shell/session.ts`, so these expire on the commit that makes it real
// rather than waiting for someone to remember them.
//
// **The properties themselves are not deferred**, and that is the reason this
// file is a list of blockers rather than a gap. Each one is asserted at tiers 1
// to 4 against the engine; what waits here is the half that can only be seen
// from outside.
//
//   - T5.1's enum values and their insertion are T1.6 and T1.15b.
//   - T5.2's discard-the-late-result is §8a trace 1, T3.10 and T6.1b, and the
//     spinner threshold is T3.9b — the part that needs a terminal is that the
//     spinner is *visible* in the prompt while typing stays responsive.
//   - T5.3's flip is T4.4, against a real C15 in a twenty-row region. What is
//     missing is a prompt actually near the bottom of a real screen.
//   - T5.4's filesystem candidates are the `pathSource` cases in tier 3, over
//     the injected reader (I17). Tier 5 is where the reader is the real one.
//   - T5.5's one-invocation-then-two is T3.8 on a fake clock.
import { describe, it } from "vitest";

import { interactivePty, type InteractivePty } from "../support/pty.js";

/** The prompt glyph reaching the PTY: the shell composed and painted a frame. */
const PROMPT = /❯/;

const session = (): InteractivePty =>
  interactivePty("node test/support/fixture.mjs session", { cols: 100, rows: 24 });

describe("C19 tier 5 — at a real prompt", () => {
  it("T5.1: typing `/ps --status=` and pressing Tab → the statuses appear, arrow-selectable, Enter inserts", async () => {
    // **The first row in this project to see an overlay on a screen**, and it
    // found the last two things standing between C15 and one. Every piece
    // passed its own suite for weeks: C19 produced the candidates, C15 placed
    // the layer, C16 routed the keys — and nothing composited a `Placed`, so
    // the menu existed everywhere except the terminal. Then, with the drawer
    // built, it still took a second keystroke to appear: the continuation that
    // pushes the layer runs after its batch has committed (C22 I31).
    const pty = session();
    try {
      await pty.waitFor(PROMPT, 15_000);
      pty.type("/ps --status=");
      pty.type("\t");

      // The enum's values, from the manifest rather than from a source that
      // guesses: `status` is declared `enum` with exactly these three.
      await pty.waitFor(/running/, 15_000);
      await pty.waitFor(/failed/, 15_000);
      await pty.waitFor(/queued/, 15_000);

      // **Selectable, then inserted.** `↓` moves the selection and Enter
      // accepts it, so the prompt ends up carrying a value the user never
      // typed — which is what a menu is for, and the half a row asserting only
      // that candidates appeared would miss.
      pty.type("\u001b[B");
      pty.type("\r");
      await pty.waitFor(/--status=failed/, 15_000);
    } finally {
      pty.kill();
    }
  }, 40_000);
  it.todo(
    "T5.2: a dynamic source with a 2-second delay → the spinner appears at 500 ms, typing continues freely, and the late result never touches the buffer — waits on L4",
  );
  it("T5.3: Tab near the bottom of the terminal → the menu flips above the prompt and shows every candidate", async () => {
    // **"Near the bottom" is every frame, and that is a finding about the row.**
    // It was written for a shell whose prompt moves with the content; in this
    // frame the prompt is always the last row but one (S01 §3), so a menu
    // preferring `above` has nowhere below to go and the flip is unconditional.
    // What is left worth asserting is the case where the *region* is smallest —
    // the minimum supported height, where a menu has the fewest rows to fit in
    // and is likeliest to be clamped to one.
    //
    // 12 rows would have been below the size gate (C22 §8b, 60×16) and the
    // session draws the fallback instead of a prompt, which is what the first
    // draft of this row did and what its timeout said.
    const pty = interactivePty("node test/support/fixture.mjs session", {
      cols: 60,
      rows: 16,
    });
    try {
      await pty.waitFor(PROMPT, 15_000);
      pty.type("/ps --status=");
      pty.type("\t");

      await pty.waitFor(/running/, 15_000);

      // **Every candidate, not just the first.** A menu clamped to one row by a
      // short region shows `running` and satisfies a test that stopped there.
      await pty.waitFor(/queued/, 15_000);

      // And above the prompt rather than over it: the prompt still carries what
      // was typed, so the layer did not take its rows.
      await pty.waitFor(/--status=/, 15_000);
    } finally {
      pty.kill();
    }
  }, 40_000);
  it("T5.4: completing a path with `ls ` and Tab \u2192 filesystem candidates from the real reader, not verbs", async () => {
    // The `pathSource` cases are tier 3 over an injected reader. Here the
    // reader is the real one, reading the real working directory \u2014 which is the
    // repository, so `package.json` is a candidate no fake supplied.
    const pty = session();
    try {
      await pty.waitFor(PROMPT, 15_000);
      pty.type("ls pack");
      pty.type("\t");

      await pty.waitFor(/package\.json/, 15_000);
    } finally {
      pty.kill();
    }
  }, 40_000);
  it.todo(
    "T5.5: sixty seconds of repeated Tab on one dynamic slot → one source invocation, then a second after expiry — waits on L4",
  );
});
