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

// `PROMPT` and `promptRow` are the harness's (`test/support/pty.ts`). They were
// declared here, and the second half of the pair was fixed here and nowhere
// else — theme T5.4 kept its own `find` for a further commit and could no longer
// fail. A helper that has gone wrong in two files belongs in neither.
import { interactivePty, PROMPT, promptRow, type InteractivePty } from "../support/pty.js";

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
      // **The prompt row, not the whole frame**, and the difference arrived
      // with C19 §6a. Killing back to `--` leaves a flag prefix, so the
      // as-you-type menu opens on it and `--mine` is on the screen again — as a
      // candidate, which is the menu doing its job. What this row is about is
      // the buffer, and the buffer is the row the prompt is on.
      await pty.waitForFrame((f) => !promptRow(f).includes("--mine"), 15_000);
      expect(promptRow(pty.frame), "the word is gone from the line").toContain("--limit=20");

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

      // **A paste of five lines or more is a chip** (roadmap 30), so what is on
      // the screen is the chip's label and not two hundred rows of text. This
      // row asserted `/line-199/` and had done since before chips existed —
      // **it went red the day the chip landed and nothing ran it**, because
      // `make test` is tiers 1-4 and tier 5 is its own target.
      //
      // The ruling is unchanged and only the assertion moves: the prompt is
      // capped at half the terminal (S01 §3), so a two-hundred-line paste does
      // not consume the frame. The chip makes that stronger rather than weaker —
      // one row instead of twelve — and the property worth asserting is that the
      // **content survives**, which the submission below is what proves.
      await pty.waitFor(/#1 pasted · 200 lines/, 15_000);
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
      // **And the chip expands on submission**, which is the half a label on the
      // screen cannot show: the editor holds one sentinel grapheme per chip and
      // resolves it to the content when the buffer is read. If it did not, the
      // frame above would look identical and two hundred lines would be gone.
      pty.type("\r");
      // `line-199` as **output**, with no `echo` before it: the far side ran the
      // two hundredth command, which is only possible if the sentinel resolved.
      // The old row waited for `echo line-199` — the command *echoed into the
      // transcript* — and the transcript now shows the chip's label there, which
      // is the pair this asserts from the other end.
      await pty.waitFor(/line-199/, 15_000);
      expect(pty.frame, "the frame is still whole after a 200-line submission").toHaveLength(24);
      // The prompt emptying is Seam 4's property and is asserted against the
      // store at tier 1 (C23 T1.20). What this row adds is that the transcript
      // holds the block as **one** entry: two hundred submissions would put two
      // hundred command rows on the screen, and the bottom of the frame is a
      // run of the pasted lines rather than a run of prompts.
      const tail = pty.frame.slice(-6).map((r) => r.trimEnd());
      // **`line-` and not `echo line-`**: what fills the tail is the far side's
      // *output*, because the chip resolved to two hundred commands and they
      // ran. The old form looked for the echoed command text, which the chip
      // replaced with its label — one grapheme in the buffer, one row in the
      // transcript, two hundred lines through the seam.
      expect(tail.filter((r) => r.includes("line-")).length).toBeGreaterThan(1);
      expect(tail.filter((r) => r.startsWith("❯")).length, "one prompt, not many").toBeLessThan(2);
    } finally {
      pty.kill();
    }
  }, 60_000);

  it("T5.3: editing a command containing CJK and emoji → the cursor lands where the user sees it", async () => {
    const pty = session();
    try {
      await pty.waitFor(PROMPT, 15_000);

      // Two cells each, and the frame has to agree with the editor about that
      // or the cursor drifts by one per glyph. **The cursor is read from the
      // escape the frame writes**, which is observable at all only because C01
      // yields the sequence and the drawer embeds it (C01 I19).
      pty.type("/ps --search=日本語");
      await pty.waitForFrame((f) => f.join("").includes("日本語"), 15_000);

      const at = (): number => {
        const m = [...pty.output.matchAll(/\u001b\[(\d+);(\d+)H/g)].at(-1);
        return Number(m?.[2] ?? 0);
      };
      // `❯ ` is 2 cells, `/ps --search=` is 13, three CJK glyphs are 6 — cell
      // 21, which is column 22 on the wire.
      expect(at(), "2 + 13 + 6 cells, 1-based").toBe(22);

      // A backspace removes one **cluster**, and the caret moves two cells
      // rather than one — the property that fails by a cell per glyph if the
      // frame and the editor disagree about width.
      pty.type("\u007f");
      await pty.waitForFrame((f) => !f.join("").includes("日本語"), 15_000);
      expect(pty.frame.join(""), "one glyph, not one code unit").toContain("日本");
      expect(at(), "two cells back").toBe(20);
    } finally {
      pty.kill();
    }
  }, 40_000);


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
        (f) => promptRow(f).includes("--mine"),
        15_000,
      );

      // And back down to the buffer the navigation left, which is C20's own
      // round trip seen from outside.
      pty.type("\u001b[B");
      await pty.waitForFrame(
        (f) => !promptRow(f).includes("--mine"),
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
