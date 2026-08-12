// C22 §4 step 1 — gate 1, the TTY gate (C22 I36, C22 I37).
//
// **The gate was specified when C22 was drafted and built two stretches later.**
// `grep -rn isTTY src/` returned one hit for that whole time and it was a
// comment, so piping the shell to `cat` wrote the alternate-screen sequence,
// mouse tracking and a full frame into a pipe. A correctness defect, not a
// missing feature: the caller gets bytes it cannot read and the terminal that
// invoked it is left in a mode nobody set.
import { describe, expect, it, vi } from "vitest";

import { createTui } from "../../src/shell/session.js";
import { usageText } from "../../src/shell/usage.js";
import * as construct from "../../src/shell/construct.js";
import { MANIFEST, fakeFs } from "../support/session.js";
import { fakeStdin, fakeStdout } from "../support/fake-terminal.js";
import { defaultTheme } from "../../src/presentation/theme/index.js";
import { trackDecset } from "../support/pty.js";
import { UnusableTerminalError, type TuiConfig } from "../../src/shell/types.js";

function config(overrides: Partial<TuiConfig> = {}): TuiConfig {
  return {
    name: "prism",
    binary: "widget",
    manifest: MANIFEST,
    theme: defaultTheme,
    stateDir: "/state",
    env: { TERM: "xterm-256color", LANG: "en_GB.UTF-8" },
    cwd: "/work",
    clock: () => 1_700_000_000_000,
    fs: fakeFs(),
    stdin: fakeStdin() as never,
    ...overrides,
  } as TuiConfig;
}

describe("C22 §4 step 1 — the TTY gate", () => {
  it("T3.5 (C22 I36, C22 I37): a non-TTY stdout gets usage and not one escape byte", async () => {
    const stdout = fakeStdout({ columns: 80, rows: 24 }, { tty: false });
    await createTui(config({ stdout: stdout as never })).start();

    const written = stdout.chunks.join("");

    // **Non-empty, and that is not pedantry** (C22 I37). A gate that exits 0 having
    // printed nothing is indistinguishable from a hang to the script that
    // invoked it, and indistinguishable from a working gate to a test that only
    // asserts the exit code.
    expect(written.length, "something was printed").toBeGreaterThan(0);
    expect(written).toBe(usageText("prism", "widget"));

    // **The register** (C22 I37). `/help` renders keybindings from the keymap
    // (C23 I26), which is the right answer at a prompt and nonsense to a caller
    // with no keyboard. Naming two of them, because "does not contain the word
    // help" would pass against an empty string.
    for (const keymapish of ["drill in", "esc prompt", "↑↓"]) {
      expect(written, `keybindings have no business here: ${keymapish}`).not.toContain(keymapish);
    }
    expect(written, "and it says what to do instead").toContain("widget");

    // **Folded over every byte, not matched against a prefix.** The failure this
    // prevents is one escape anywhere in the stream — an alternate screen left
    // on, a mouse mode set — and a `startsWith` check sees only the first.
    expect(trackDecset(written), "no mode was touched").toEqual({
      altScreen: false,
      cursorVisible: true,
      bracketedPaste: false,
      mouse1002: false,
      mouse1006: false,
      scrollRegion: false,
    });
    // eslint-disable-next-line no-control-regex
    expect(written, "no escape sequence at all").not.toMatch(/\u001b/);
  });

  it("T3.5c (C22 I36): nothing is constructed — a spy, not an ordering", async () => {
    // **On T3.8's precedent.** The claim is what did *not* happen, and an
    // ordering assertion cannot make it: a gate that ran first and then built
    // the graph anyway would open a history file and start an identity loop for
    // a process about to exit, with T3.5 passing throughout.
    const spy = vi.spyOn(construct, "constructGraph");
    try {
      const stdout = fakeStdout({ columns: 80, rows: 24 }, { tty: false });
      await createTui(config({ stdout: stdout as never })).start();
      expect(spy, "the graph was not built").not.toHaveBeenCalled();

      // The control: the same call with a TTY does build one, so the assertion
      // above is about the gate and not about a spy that never fires.
      const tty = fakeStdout({ columns: 80, rows: 24 });
      const session = createTui(config({ stdout: tty as never }));
      await session.start();
      expect(spy, "the control: a TTY constructs").toHaveBeenCalled();
      await session.stop("exit");
    } finally {
      spy.mockRestore();
    }
  });

  // **A deferral, not an `expect(true)`.** A row that asserts nothing passes
  // exactly like one that is satisfied (A03 §2), and the first draft of this was
  // `expect(true).toBe(true)` under an honest comment — which is the vacuity
  // class arriving in the test written to record a vacuity.
  it.todo(
    "T3.5b: non-TTY stdout with a `oneShot` verb → one frame to stdout, exit 0, no session — unwritable, and not deferred on a component: `oneShot` has no subject. `parse.ts` produces the field and `types.ts` documents it as bypassing this gate; nothing outside the parser reads it, because `createTui(config)` takes no argv and §4 step 1's parse does not happen at all. It resolves by `oneShot` arriving through `config` with the app parsing argv — C06 I18 settled that pattern for `PRISM_TUI_TRANSPORT`, and C22 §12a's theme persistence is the same shape",
  );
});

describe("C22 §4 step 3b — the usability gate (C22 I61)", () => {
  // F8. `env` is optional, `{}` is what an app gets for saying nothing, and the
  // field's own documentation called that *"the safe direction"*. C02 derives
  // `bracketedPaste`, `mouse` and `altScreen` from one `usable` flag that is
  // false without `TERM`, so two of the three consequences degrade and the
  // third is the one hard requirement (C02 I7).
  //
  // **Every row stops its session, including the four that refuse**, and that is
  // F140 arriving inside the suite rather than tidiness: a refusal throws after
  // `constructGraph` has run, so the graph outlives it and nothing calls
  // `stop()`.
  //
  // **It is not why C17 T3.15 moved**, and that is recorded here because the
  // first version of this comment said it was. That row is a wall-clock budget
  // in another file; it read 2362 ms, then 2612 ms, then **3684 ms with these
  // stops in place**, on a host at load average 20.81. Monotonic in the wrong
  // direction for a fixed cause, with the remedy landing mid-sequence — and with
  // this whole change stashed, that row run **alone** on the pre-change tree
  // fails at 2099 ms. The cleanup is right on its own terms and cured nothing.

  it("T3.20 (C22 I61): an omitted `env` refuses, and the refusal names `env`", async () => {
    const stdout = fakeStdout({ columns: 80, rows: 24 });
    const session = createTui(config({ env: {}, stdout: stdout as never }));

    const err = await session.start().then(
      () => null,
      (e: unknown) => e,
    );

    // **The class, so a plain `Error` from C01 cannot satisfy this row.** That
    // is the whole point: C01 refuses at acquire and is entitled to nothing but
    // the capability record, so its message could only ever name the
    // consequence. Asserting the message alone would pass against it.
    expect(err, "gate 3b refused, not C01").toBeInstanceOf(UnusableTerminalError);

    // **The cause, not the consequence** — what the reader has to go and edit.
    // Asserted as the config field rather than as the whole sentence, so
    // rewording the message does not fail the row and dropping the subject does.
    expect((err as UnusableTerminalError).message, "names the field").toContain("env");

    // **And it refuses ahead of C01**, which is the half an assertion about the
    // error would miss: the gate exists to say something C01 cannot, so a gate
    // that let C01 throw first and re-wrapped it would satisfy everything above
    // while emitting the alternate-screen sequence on the way.
    expect(trackDecset(stdout.chunks.join("")).altScreen, "nothing was acquired").toBe(false);
    await session.stop("exit");
  });

  it("T3.20b (C22 I61, → C02 I4): a valid `altScreen` override opens with the same empty `env`", async () => {
    // **The structural interaction, and the reason the gate sits after
    // construction** (C22 §4). Two rules both hold at rest here with no event
    // between them — gate 3b refuses an unusable record, and C02 I4 makes a
    // valid override win unconditionally *including for `altScreen`* — and the
    // override resolves inside `detectCapabilities`, during step 3.
    //
    // A gate reading `config.env` ahead of construction passes T3.20 and fails
    // exactly here: it would refuse the one app that had said what to do.
    const stdout = fakeStdout({ columns: 80, rows: 24 });
    const session = createTui(
      config({ env: {}, capabilities: { altScreen: true }, stdout: stdout as never }),
    );

    await expect(session.start(), "the override wins").resolves.toBeUndefined();

    // **Asserted positively rather than as the absence of a throw.** "It did
    // not refuse" is also true of a gate that refused into a swallowed promise;
    // the alternate screen being entered is the state the app was entitled to.
    expect(trackDecset(stdout.chunks.join("")).altScreen, "it opened").toBe(true);
    await session.stop("exit");
  });

  it("T3.20c (C22 I61): `TERM=dumb` names `TERM`, and an omitted `env` does not", async () => {
    // The arms are ordered from the omission outwards, and the row that keeps
    // them apart is this one: a constant string satisfies T3.20 completely.
    const dumbSession = createTui(config({ env: { TERM: "dumb" }, stdout: fakeStdout() as never }));
    const dumb = await dumbSession
      .start()
      .then(() => null, (e: unknown) => e as UnusableTerminalError);

    expect(dumb, "still refused").toBeInstanceOf(UnusableTerminalError);
    expect(dumb?.message, "names the variable").toContain("TERM");
    expect(dumb?.message, "and not the field, which is set").not.toContain("TuiConfig.env");

    // **The half the mutation pass added.** The two assertions above are
    // satisfied by a function that answers *"`TERM` is not set"* to everything,
    // because that sentence also contains `TERM` and not `TuiConfig.env` — so
    // the row claimed to separate three arms and separated two. Measured by
    // pinning `term` to `undefined`, which survived.
    expect(dumb?.message, "and says which value").toContain("dumb");

    const absentSession = createTui(config({ env: { HOME: "/h" }, stdout: fakeStdout() as never }));
    const absent = await absentSession
      .start()
      .then(() => null, (e: unknown) => e as UnusableTerminalError);

    expect(absent?.message, "a set-but-useless TERM and a missing one differ").not.toContain(
      "dumb",
    );
    await Promise.all([dumbSession.stop("exit"), absentSession.stop("exit")]);
  });

  it("T3.20d (C22 I8, C22 I61): a terminal both too small and unusable refuses — it does not defer", async () => {
    // **The ordering interaction, and the implementation falsified the walk.**
    // The ruling this row was first written from put gate 3b *after* gate 4, on
    // the reasoning that both read the same terminal and gate 4 was already
    // there. The diff is what disproved it.
    //
    // Deferring waits for a resize that cannot cure an absent `TERM`, and when
    // the resize arrives `#open()` reaches C01's fatal from inside `onResize` —
    // which nothing guards, so the throw leaves the SIGWINCH handler with
    // `start()` long since resolved. The author's `catch` cannot see it, gate 3b
    // never runs, and the message is C01's unnamed one. That is F8's silence
    // restored by the fix for F8.
    //
    // So the incurable condition is answered before the curable one. Asserted
    // with **both** conditions true, because either alone is a restatement of
    // the gate that owns it.
    const stdout = fakeStdout({ columns: 40, rows: 10 });
    const session = createTui(config({ env: {}, stdout: stdout as never }));

    const err = await session.start().then(() => null, (e: unknown) => e);

    expect(err, "refused rather than deferred").toBeInstanceOf(UnusableTerminalError);
    expect(stdout.chunks.join(""), "and no fallback was drawn").toBe("");
    await session.stop("exit");
  });

  it("T3.20e (C22 I8): a small terminal that *can* open still defers", async () => {
    // The control for the row above. Without it, T3.20d is satisfied by a tree
    // that refuses every small terminal, which is what gate 4 exists not to do.
    const stdout = fakeStdout({ columns: 40, rows: 10 });
    const session = createTui(config({ stdout: stdout as never }));

    await expect(session.start(), "deferred").resolves.toBeUndefined();
    expect(stdout.chunks.join("").length, "the fallback was drawn").toBeGreaterThan(0);
    await session.stop("exit");
  });
});
