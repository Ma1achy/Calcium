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
import type { TuiConfig } from "../../src/shell/types.js";

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
    "T3.5b: non-TTY stdout with a `oneShot` verb → one frame to stdout, exit 0, no session — unwritable: `oneShot` has no subject. `parse.ts` produces the field and `types.ts` documents it as bypassing this gate; nothing outside the parser reads it, because `createTui(config)` takes no argv and §4 step 1's parse does not happen at all. It resolves by `oneShot` arriving through `config` with the app parsing argv — C06 I18 settled that pattern for `PRISM_TUI_TRANSPORT`, and C22 §12a's theme persistence is the same shape",
  );
});
