// C21 tier 5 — e2e, inside a real pseudo-terminal.
//
// **What these prove and what they do not.** They prove the runner's behaviour
// against a real terminal and real process groups: a glob reaching the user's
// shell, a pipeline dying whole on Ctrl-C, `vi` taking and returning the
// terminal, a stream running for a minute without accumulating. They do *not*
// prove that an application wires `suspend` to `handoff` or `killAll` to exit —
// C22 does not exist, and the fixture is standing where it will. C21's T5.5
// (session exit with three children running) waits on it for that reason.
//
// The same bound C02's tier 5 states, for the same reason: a fixture composing
// the sequence itself can only show that the pieces work when composed, never
// that the application composes them.
import { describe, expect, it } from "vitest";
import { interactivePty, quitVi, runInPty } from "../support/pty.js";

const FIXTURE = "node test/support/fixture.mjs";

describe("C21 e2e", () => {
  it(
    "T5.1: `ls *.md` through spawnShell globs, because the shell expanded it",
    async () => {
      const run = await runInPty(`${FIXTURE} process-glob`);
      const matched = /GLOB (\[.*\])/.exec(run.bytes);

      expect(matched, run.bytes).not.toBeNull();
      const files = JSON.parse(matched![1]!) as string[];

      // The repository root has these. An argv spawn would pass `*.md` to `ls`
      // literally and it would find nothing, which is the difference the two
      // methods exist to keep visible.
      expect(files).toContain("README.md");
      expect(files).toContain("CLAUDE.md");
      expect(files.every((f) => f.endsWith(".md"))).toBe(true);
    },
    30_000,
  );

  it(
    "T5.3: Ctrl-C during `sleep 30 | cat` kills both, and the prompt returns",
    async () => {
      // The headline claim at tier 5. Ctrl-C reaches the *fixture* — the
      // children are detached and lead their own group, which is exactly why
      // group signalling has to be the runner's job rather than the terminal's.
      const pty = interactivePty(`${FIXTURE} process-cancel`);

      try {
        await pty.waitFor(/READY/, 20_000);
        const pgid = /PGID (\d+)/.exec(pty.output)?.[1];
        expect(pgid, pty.output).toBeDefined();

        pty.type(""); // Ctrl-C, through the terminal as a user sends it

        const survivors = await pty.waitFor(/SURVIVORS (".*")/, 20_000);
        expect(JSON.parse(survivors[1]!)).toBe("");

        // And the session is still usable afterwards, which is the half a
        // process-group test can pass while failing the user.
        await pty.waitFor(/PROMPT/, 20_000);
        expect(await pty.done()).toBe(0);
      } finally {
        pty.kill();
      }
    },
    60_000,
  );

  it(
    "T5.2: vi through handoff is usable, and quitting it leaves the terminal clean",
    async () => {
      const pty = interactivePty(`${FIXTURE} process-handoff`);

      try {
        // `vi` on the alternate screen — the second nested user of it, after the
        // lifecycle's own. If `suspend` had not released it, this is where a
        // raw-mode terminal would show: no line editing and no obvious cause.
        await pty.waitFor(/\[\?1049h/, 20_000);
        // Editable, then quit. `quitVi` sends ESC alone and pauses after it: a
        // terminal tells the ESC key from the start of an escape sequence only
        // by what follows, so ESC and `:q!` in one write are read as a key
        // sequence and land in the buffer instead of leaving insert mode.
        await quitVi(pty);

        const done = await pty.waitFor(/HANDOFF (\{.*\})/, 20_000);
        expect(JSON.parse(done[1]!)).toEqual({ code: 0, signal: null });

        expect(await pty.done()).toBe(0);
      } finally {
        pty.kill();
      }
    },
    60_000,
  );

  it(
    "T5.2 (I6): handing off without suspending first is refused, naming the missing call",
    async () => {
      // The guard end to end, against a terminal genuinely in raw mode rather
      // than an injected `{ isRaw: true }`. Tier 3 asserts the logic; this
      // asserts that the thing it reads is the thing acquisition sets.
      const run = await runInPty(`${FIXTURE} process-handoff-raw`);
      const refused = /REFUSED (".*")/.exec(run.bytes);

      expect(refused, run.bytes).not.toBeNull();
      expect(JSON.parse(refused![1]!)).toMatch(/lifecycle\.suspend/);
    },
    30_000,
  );

  // T5.4 — a real streaming far side at 1,000 lines/s for sixty seconds — is
  // asserted in `test/e2e/transport.test.ts`. It is C06's T5.2 as well, that is
  // where the expired deferral was, and the claim runs through the transport;
  // one sixty-second test rather than two.
  it.todo(
    "T5.5: quitting the session with three children running reaps all of them before the terminal is released — waits on C22",
  );
});
