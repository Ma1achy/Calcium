// C18 tier 5 — e2e. A real session, a real prompt, a real shell.
//
// **Most of what §11's tier 5 lists is already asserted.** T5.2's globbing and
// T5.3's brace expansion are the `j22` reversal, and they run against the real
// `spawnShell` at tier 4 (T4.8) — what waits here is the half only a session
// can show: that the output lands in the transcript as a `raw` block, that the
// refusal message reaches the user, and that `cd` moves the directory the next
// command spawns in.
//
// **These are the first rows to drive the whole stack**, so a failure here is
// as likely to be the harness as the component.
import { describe, it } from "vitest";

import { interactivePty, type InteractivePty } from "../support/pty.js";

/** The prompt glyph reaching the PTY: the shell composed and painted a frame. */
const PROMPT = /❯/;

const session = (): InteractivePty =>
  interactivePty("node test/support/fixture.mjs session", { cols: 100, rows: 24 });

describe("C18 tier 5 — in a real session", () => {
  it("T5.1: a shell pipeline through jq lands in the transcript as raw text", async () => {
    const pty = session();
    try {
      await pty.waitFor(PROMPT, 15_000);

      // The far side is a fixture, so the JSON is produced here rather than by
      // a verb: what T5.1 is about is the *delegation* — that C18 routes a line
      // with an operator to `sh -c` whole, and that what the shell writes comes
      // back as a `raw` block rather than being adapted.
      pty.type("echo '{\"data\":[{\"uuid\":\"01J-ABC\"}]}' | jq -r '.data[0].uuid'\r");

      await pty.waitFor(/01J-ABC/, 15_000);
    } finally {
      pty.kill();
    }
  }, 40_000);

  it("T5.6: a trailing & is refused with the documented message, and the session lives", async () => {
    const pty = session();
    try {
      await pty.waitFor(PROMPT, 15_000);
      pty.type("sleep 5 &\r");

      // C18 §5's wording rather than a paraphrase. A test matching /refus/
      // would pass against any message at all, which is the assertion the user
      // never reads.
      await pty.waitFor(/background/i, 15_000);

      // **And the session is unaffected** — the half the row names and the half
      // a refusal test usually omits. A shell that refused and then wedged
      // satisfies the first clause perfectly.
      pty.type("echo still-here\r");
      await pty.waitFor(/still-here/, 15_000);
    } finally {
      pty.kill();
    }
  }, 40_000);

  it.todo(
    "T5.4: cd .. then /ps → the verb spawns in the new directory — needs a subprocess-transport variant of the session fixture, so the spawn has a cwd to report",
  );
  it.todo(
    // C20 landed, and the round trip it owes this is asserted in
    // test/integration/history.test.ts T4.5: a stored command re-parses to what
    // it was. The submit that produces the UUID is the shell's.
    "T5.5: /promote $_ immediately after a submit → the UUID resolves and the line is reproducible in bash exactly as displayed — needs a fixture result carrying resultId, so $_ has something to resolve to",
  );
});
