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
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";

import { interactivePty, PROMPT, type InteractivePty } from "../support/pty.js";

/** The prompt glyph reaching the PTY: the shell composed and painted a frame. */

/** The identifier `farside.mjs` reports on `meta.resultId`, for `$_` (C18 §7). */
const UUID = "018f2a7c-4d3e-7c1a-9b52-0e5a1f9c3d7b";

const session = (): InteractivePty =>
  interactivePty("node test/support/fixture.mjs session", { cols: 100, rows: 24 });

/**
 * The subprocess arm, for the two rows whose claims are about a **spawn**.
 *
 * A `cwd` only exists if something was spawned, and a `resultId` only arrives if
 * a far side reported one — so neither row can be written against the fixture
 * corpus, which answers without either. The arm is asserted to take effect in
 * `harness.test.ts`.
 */
const farSideSession = (): InteractivePty =>
  interactivePty("node test/support/fixture.mjs session subprocess", { cols: 100, rows: 24 });

/** Every directory the far side reported, in the order the frame shows them. */
const cwdsIn = (frame: readonly string[]): string[] =>
  [...frame.join("\n").matchAll(/cwd=(\S+)/g)].map((m) => m[1] ?? "");

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

  it("T5.4: cd .. then /ps → the verb spawns in the new directory", async () => {
    // **Nothing in the shell had to change for this**, and that is the finding
    // rather than an aside. C06 commitment 14 says the transport reads `cwd` at
    // spawn instead of capturing it, C22 I12 threads `session.cwd` as a function
    // for the same reason, and `construct.ts`'s `defaultTransport` already wired
    // the two together. What was missing was a far side that could *report*
    // where it had been spawned — the property was live and unobservable.
    //
    // **What this row does not cover, learned from a mutation that failed
    // nothing.** Making `farside.mjs` capture its own `cwd` at module load
    // changes nothing here: it is a fresh process per invocation, so module load
    // and answer time are the same instant, and no far side can hold a stale
    // directory. The property is the *transport's*, and the mutation that fails
    // this row is capturing `cwd` as a value in `defaultTransport` — which does
    // fail it, at the second `/ps`.
    const pty = farSideSession();
    try {
      await pty.waitFor(PROMPT, 15_000);

      // A control first: the directory before the `cd`, so the assertion below
      // is about the move rather than about whatever directory the test runner
      // happened to start in.
      pty.type("/ps\r");
      await pty.waitForFrame((f) => f.join("").includes(`cwd=${process.cwd()}`), 20_000);

      pty.type("cd ..\r");
      // C18 §8 — `cd` is a built-in, applied to session state.
      await pty.waitForFrame((f) => !f.join("").includes("did not"), 15_000);

      pty.type("/ps\r");
      const parent = dirname(process.cwd());
      await pty.waitForFrame((f) => cwdsIn(f).at(-1) === parent, 20_000);

      // **The most recent report, matched whole.** Two weaker readings both pass
      // against a captured `cwd`: the first entry is still on screen, so "the
      // parent appears somewhere" is true from the start, and `/workspaces` is a
      // prefix of `/workspaces/tui-kit`, so a substring test is true of the
      // original path as well. Taking the last `cwd=` and comparing it exactly
      // is the only reading neither can satisfy.
      const seen = cwdsIn(pty.frame);
      expect(seen.at(-1), "the second spawn").toBe(parent);
      expect(seen.at(0), "and the first one is still where it was").toBe(process.cwd());
    } finally {
      pty.kill();
    }
  }, 60_000);

  it("T5.5: /ps --search=$_ --open-mr → the UUID resolves and the line is reproducible in bash exactly as displayed", async () => {
    // **The spec row named `/promote $_ --open-mr` and could not be written**:
    // the fixture manifest gives `promote` no flags and an argument pattern of
    // `^[\w.]+:[\w]+$`, which a UUID cannot satisfy, so C05 refused the line
    // before `$_` could be shown to have resolved. C18 §11 T5.5 records the
    // change. `ps` declares both parts, and `--search=$_` is the `--flag=$_`
    // form — the reading §7's correction turned on, and the one a user is
    // likeliest to type after a result.
    const pty = farSideSession();
    try {
      await pty.waitFor(PROMPT, 15_000);

      // The submit that produces the identifier. `farside.mjs`'s `ps` carries
      // `meta.resultId`, which C07 I13 passes through as one of its three
      // carried fields and C23 stores as the session's last UUID.
      pty.type("/ps\r");
      await pty.waitForFrame((f) => f.join("").includes("far side pid="), 20_000);

      pty.type("/ps --search=$_ --open-mr\r");
      // **Waited on the far side's reply, not on the UUID.** The UUID now
      // appears in the *displayed command* one row before the spawn answers, so
      // a predicate matching it resolves on a frame that has the first half and
      // not the second — which is this row asserting against a screen that is
      // still being drawn. The reply's own marker is the honest signal.
      await pty.waitForFrame((f) => f.join("").includes("argv=ps --search="), 20_000);
      const frame = pty.frame.join("\n");

      // **Both halves of D24's correspondence, which is now checkable.** The
      // transcript draws the command (C22 I33) and the far side reports the argv
      // it was spawned with, so the one-token mapping is visible in one frame:
      // the displayed line wears the `/` the user typed and carries neither the
      // binary nor `--json`; the spawned argv carries both.
      expect(frame, "displayed, with $_ resolved").toContain(
        `❯ /ps --search=${UUID} --open-mr`,
      );
      // **Read from the rejoined rows, because the notice wraps** — and where it
      // wraps depends on the pid's digit count, so a newline-joined frame splits
      // this token on some runs and not others. Concatenating the rows
      // reconstructs the logical line the far side wrote.
      const unwrapped = pty.frame.map((l) => l.trimEnd()).join("");
      expect(unwrapped, "spawned, with the flag D16 appends").toContain(
        `argv=ps --search=${UUID}`,
      );
      expect(unwrapped, "and the binary and --json are the spawned half only").toContain("--json");

      // **Reproducible in bash means the literal is gone.** A transcript showing
      // `$_` is not reproducible — `$_` is a real variable in bash and means the
      // previous command's last argument, so a pasted line would run something
      // else. This is the assertion that distinguishes displaying the *typed*
      // text from displaying the *submitted* command.
      expect(frame, "no unexpanded literal anywhere on the screen").not.toContain("$_");
    } finally {
      pty.kill();
    }
  }, 60_000);
});
