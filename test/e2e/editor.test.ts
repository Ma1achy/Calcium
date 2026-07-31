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
import { describe, it } from "vitest";

describe("C17 tier 5 — at a real prompt", () => {
  it.todo(
    "T5.1: typing, correcting with word motions, and submitting a long flagged command — waits on L4",
  );
  it.todo(
    "T5.2: pasting a 200-line block → the prompt grows, the viewport shrinks correspondingly, and submission sends one command — waits on L4",
  );
  it.todo(
    "T5.3: editing a command containing CJK and emoji → the cursor lands where the user sees it at every position — waits on L4",
  );
  it.todo(
    // C20 landed; the navigation half of this is asserted in
    // test/integration/editor.test.ts T4.6. What remains is a real session
    // driving both, which is the shell's.
    "T5.4: an undo/redo sequence interleaved with paste and history navigation returns to the expected text — waits on L4",
  );
  it.todo(
    "T5.5: resizing while a wrapped multi-line command is in the buffer → the prompt reflows and the viewport height stays correct — waits on L4",
  );
});
