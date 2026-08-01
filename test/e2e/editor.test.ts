// C17 tier 5 — e2e. Typing at a real prompt in a real terminal.
//
// Every one of these needs a running shell: a frame to type into, a viewport
// whose height responds to the prompt's, and a terminal to place the cursor
// in. That is L4, and `LAYER_SOURCES` maps it to `src/shell/session.ts`, so
// these expire on the commit that makes it real rather than waiting for
// someone to remember them.
//
// **The properties themselves are not deferred.** T5.2's paste-is-one-command
// and T5.3's cursor-lands-where-the-user-sees-it are asserted at tiers 1 to 4
// against the editor; what waits here is the half that can only be seen from
// outside — that the frame agrees.
//
// **This is the group step 0 governs.** The frame composed its prompt's height
// from one record and painted it from another, so a wrapped prompt drew as a
// lone `⋯` — internally consistent at every width, and describing a different
// prompt than the editor held. T5.2 and T5.5 are the two rows that would have
// found it, and both are here.
import { describe, expect, it } from "vitest";

import { interactivePty, type InteractivePty } from "../support/pty.js";

const PROMPT = /❯/;

const session = (cols = 100, rows = 24): InteractivePty =>
  interactivePty("node test/support/fixture.mjs session", { cols, rows });

describe("C17 tier 5 — at a real prompt", () => {
  it.todo(
    // **`defaultKeymap` binds no editing key at all**, and this row is what
    // found it. The prompt target has eight bindings — three newlines, Tab,
    // right-for-ghost, history up and down, and reverse search — and not one of
    // them edits. C17 implements word motion, kill, undo and redo in full, C22
    // step 11's table is total over C16's action union, and the union simply
    // has no editing action in it: the anti-drift mechanism is satisfied and
    // the vocabulary it is total over is incomplete. A03 §2's vacuity class one
    // level up.
    //
    // **Backspace does nothing at a real prompt**, which is the plainest
    // statement of it. Typing works, Enter works, and a typo cannot be
    // corrected.
    //
    // Which keys bind to which motions is a decision — a readline subset is the
    // obvious answer and "obvious" is what put fourteen unexecuted bindings in
    // this file once already — so the row waits on that ruling rather than
    // inventing one.
    "T5.1: typing, correcting with word motions, and submitting a long flagged command — needs an editing keymap: `defaultKeymap` binds no editing key, so backspace and the word motions are unreachable from the keyboard",
  );

  it("T5.2: pasting a 200-line block → the prompt grows, the viewport shrinks, and submission sends one command", async () => {
    const pty = session();
    try {
      await pty.waitFor(PROMPT, 15_000);

      // Bracketed paste, which is what a terminal actually sends — and one
      // `paste` event rather than two hundred key events, which is the whole
      // reason C16 buffers between the markers (C16 §2).
      const lines = Array.from({ length: 200 }, (_, i) => `echo line-${String(i)}`).join("\n");
      pty.type(`[200~${lines}[201~`);

      // **The prompt is capped at half the terminal** (S01 §3), so two hundred
      // lines do not consume the frame: at 24 rows the cap is 12, and the row
      // that matters is that the typed text is *on the screen* rather than
      // windowed to a marker with the command nowhere.
      await pty.waitFor(/line-199/, 15_000);
      const screen = pty.frame;
      expect(screen, "still exactly the terminal's rows").toHaveLength(24);
      expect(
        screen.filter((r) => r.trim() === "⋯").length,
        "an elision that elides everything annotates nothing (S01 §3, commitment 14)",
      ).toBe(0);

      // **One command, not two hundred**, asserted as the prompt emptying: a
      // submission clears the buffer (A02 Seam 4), so two hundred submissions
      // would leave two hundred prompts' worth of clearing and this frame shows
      // one empty one. The command's own output is the shell's business and not
      // this row's.
      pty.type("\r");
      await pty.waitFor(/echo line-199/, 15_000);
      expect(pty.frame, "the frame is still whole after a 200-line submission").toHaveLength(24);
      // The prompt emptying is Seam 4's property and is asserted against the
      // store at tier 1 (C23 T1.20). What this row adds is that the transcript
      // holds the block as **one** entry: two hundred submissions would put two
      // hundred command rows on the screen, and the bottom of the frame is a
      // run of the pasted lines rather than a run of prompts.
      const tail = pty.frame.slice(-6).map((r) => r.trimEnd());
      expect(tail.filter((r) => r.includes("echo line-")).length).toBeGreaterThan(1);
      expect(tail.filter((r) => r.startsWith("❯")).length, "one prompt, not many").toBeLessThan(2);
    } finally {
      pty.kill();
    }
  }, 60_000);

  it.todo(
    // Half of this is verified and the half that is not shares T5.1's blocker.
    // **The cursor half passes**: typing `/ps --search=日本語` puts the caret at
    // cell 21 — two for the prompt, thirteen for the flag, six for three
    // double-width glyphs — and the frame writes it, which is observable at all
    // only because C01 now yields the cursor sequence and the drawer embeds it
    // (C01 I19). What cannot be driven is the *editing*: a backspace must
    // remove one cluster and move the caret two cells, and no key reaches C17
    // to do it.
    "T5.3: editing a command containing CJK and emoji → the cursor lands where the user sees it at every position — the cursor half is verified; the editing half needs the editing keymap T5.1 names",
  );

  it.todo(
    // **This one passed, and that was the finding.** Written as a live row it
    // went green while asserting nothing about undo: `Ctrl-_` reaches no
    // handler, so the keystroke did nothing, and the two assertions either side
    // of it were about history navigation, which is bound. A row whose subject
    // is unreachable and whose neighbours are reachable is the most expensive
    // kind of green.
    //
    // The navigation half is asserted in test/integration/editor.test.ts T4.6.
    // What waits here is the same blocker as T5.1: no key binds to undo.
    "T5.4: an undo/redo sequence interleaved with paste and history navigation returns to the expected text — needs the editing keymap T5.1 names; written live it passed while `Ctrl-_` reached nothing",
  );

  it("T5.5: resizing with a wrapped multi-line command in the buffer → the prompt reflows and the frame stays whole", async () => {
    const pty = session(100, 24);
    try {
      await pty.waitFor(PROMPT, 15_000);

      // Long enough to wrap at 60 and not at 100, so the resize changes the
      // prompt's height and therefore the viewport's — the arithmetic step 0's
      // defect got wrong in both directions at once.
      pty.type(`/ps --search=${"x".repeat(80)}`);
      await pty.waitFor(/xxxx/, 15_000);

      pty.resize(60, 24);
      await pty.waitFor(/xxxx/, 15_000);

      const screen = pty.frame;
      expect(screen, "no row was added by a wrap nobody counted").toHaveLength(24);
      expect(
        screen.filter((r) => r.trim() === "⋯").length,
        "the wrapped prompt is drawn, not elided to a marker",
      ).toBe(0);

      // **And the session is still live**, which a snapshot of the reflowed
      // frame cannot tell you: a frame refused for incoherent heights draws the
      // fallback and takes no further input.
      pty.type(" --mine\r");
      await pty.waitFor(/--mine/, 15_000);
    } finally {
      pty.kill();
    }
  }, 40_000);
});
