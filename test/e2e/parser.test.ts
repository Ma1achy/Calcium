// C18 tier 5 — e2e. A real session, a real prompt, a real shell.
//
// **Most of what §11's tier 5 lists is already asserted.** T5.2's globbing and
// T5.3's brace expansion are the `j22` reversal, and they run against the real
// `spawnShell` at tier 4 (T4.8) — what waits here is the half only a session
// can show: that the output lands in the transcript as a `raw` block, that the
// refusal message reaches the user, and that `cd` moves the directory the next
// command spawns in.
import { describe, it } from "vitest";

describe("C18 tier 5 — in a real session", () => {
  it.todo(
    "T5.1: /ps --json | jq '.data[0].uuid' in a real session → jq's output appears as raw text — waits on L4",
  );
  it.todo(
    "T5.4: cd .. then /ps → the verb spawns in the new directory — waits on L4",
  );
  it.todo(
    // C20 landed, and the round trip it owes this is asserted in
    // test/integration/history.test.ts T4.5: a stored command re-parses to what
    // it was. The submit that produces the UUID is the shell's.
    "T5.5: /promote $_ immediately after a submit → the UUID resolves and the line is reproducible in bash exactly as displayed — waits on L4",
  );
  it.todo(
    "T5.6: sleep 5 & → refused with the documented message, and the session is unaffected — waits on L4",
  );
});
