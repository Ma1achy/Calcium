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
  it("T5.1: typing, correcting with word motions, and submitting a long flagged command", async () => {
    // **This row is what found that `defaultKeymap` bound no editing key at
    // all** — backspace did nothing at a real prompt, while C17 implemented
    // word motion, kill, yank and undo in full and every mechanism in the chain
    // passed. C16 I21 made C17's surface the vocabulary; this is the first row
    // to press one of the results.
    const pty = session();
    try {
      await pty.waitFor(PROMPT, 15_000);

      pty.type("/ps --status=running --limit=20 --mine");
      await pty.waitFor(/--mine/, 15_000);

      // A word motion, not a run of backspaces: `⌃w` reaches C17's
      // `killTo("wordLeft")` through the decoder rather than through a method
      // call, which is the half a unit test of the editor cannot see.
      // **`waitForFrame`, not `waitFor`.** The stream already holds every
      // pattern this row could wait on, so a stream match resolves before the
      // frame it is about has been written — which is how the first draft
      // concluded `⌃w` was broken when it was not.
      pty.type("\u0017");
      await pty.waitForFrame((f) => !f.join("").includes("--mine"), 15_000);
      expect(pty.frame.join("\n"), "the word is gone from the screen").toContain("--limit=20");

      // And put back by hand, then submitted — so the row ends where it began
      // and the correction is the thing under test rather than the typing.
      pty.type("--mine\r");
      await pty.waitFor(/--mine/, 15_000);
    } finally {
      pty.kill();
    }
  }, 40_000);


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
    // **Parked with its evidence, deliberately, rather than made green.**
    //
    // *The property*: a command containing CJK and emoji puts the cursor where
    // the user sees it — two cells per glyph, so the caret after
    // `/ps --search=日本語` sits at cell 21 and the frame writes column 22.
    //
    // *Where it is asserted*: the cell arithmetic is C17's `cursorCell` over
    // C09's `cells()`, covered at tiers 1 to 3 for CJK, ZWJ sequences,
    // variation selectors and combining marks; the frame's half — that the
    // drawer emits that column at all — is C22 T1.20 and C01 T1.17. Driving it
    // through a terminal adds the agreement of those two, and nothing else.
    //
    // *What remains unexplained*: written live, the prompt shows `日本`
    // followed by two replacement characters and stays that way. It is not the
    // decoder, which holds a partial sequence across chunks (C16 T3.14), and it
    // is no longer node-pty decoding each read independently — that was real
    // and is fixed with `encoding: null` plus one streaming decoder for the
    // terminal's life. What is left is timing: an isolated probe typing the
    // identical string into an identical session, one glyph at a time or all at
    // once, gets all three every time, and this row does not.
    //
    // A row made green by a sleep is worth less than one parked with what is
    // known, and chasing a timing artefact in how a row drives the PTY closes
    // nothing about C17.
    "T5.3: editing a command containing CJK and emoji → the cursor lands where the user sees it at every position — the property is asserted at tiers 1 to 3 and its frame half at C22 T1.20; blocked on a harness-side UTF-8 corruption an isolated probe of the same session cannot reproduce",
  );


  it("T5.4: an undo/redo sequence interleaved with paste and history navigation returns to the expected text", async () => {
    // **This row went green once while asserting nothing**, because `⌃_`
    // reached no handler and the assertions either side of it were about
    // history navigation, which was bound. It is live now that `⌃z` and `⌥z`
    // are — and every step below changes the buffer, so a keystroke that
    // reached nothing would leave the next assertion holding the previous
    // state.
    const pty = session();
    try {
      await pty.waitFor(PROMPT, 15_000);

      // A command in history to navigate to, submitted first. **Waited on its
      // result rather than on its text**: the transcript carries results and
      // not the lines that produced them, and this row previously matched
      // `--mine` only because no fixture answered that argv — so it was waiting
      // on the failure message. A fixture reply changed and the row broke,
      // which is the coupling worth not having.
      pty.type("/ps --mine\r");
      await pty.waitForFrame((f) => f.join("").includes("a3f9b21"), 15_000);

      // **A paste is one undo unit** (C17 I5), which is the property this row
      // exists for: undoing it must return the whole block rather than
      // unpicking it a character at a time.
      pty.type("\u001b[200~/logs digit-42\u001b[201~");
      await pty.waitForFrame((f) => f.join("").includes("digit-42"), 15_000);

      pty.type("\u001a");
      await pty.waitForFrame((f) => !f.join("").includes("digit-42"), 15_000);

      pty.type("\u001bz");
      await pty.waitForFrame((f) => f.join("").includes("digit-42"), 15_000);

      // Interleaved with history: `↑` replaces the buffer with the stored
      // command, and the redone paste is what it replaced.
      pty.type("\u001b[A");
      await pty.waitForFrame(
        (f) => (f.find((r) => r.startsWith("❯")) ?? "").includes("--mine"),
        15_000,
      );

      // And back down to the buffer the navigation left, which is C20's own
      // round trip seen from outside.
      pty.type("\u001b[B");
      await pty.waitForFrame(
        (f) => !(f.find((r) => r.startsWith("❯")) ?? "").includes("--mine"),
        15_000,
      );
    } finally {
      pty.kill();
    }
  }, 40_000);


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
