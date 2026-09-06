// C27 — terminal emulator (docs/components/C27_terminal_emulator.md §9), tier 5.
//
// **Real bytes from a real terminal**, not a string constant: a probe rebuilt
// from intent agrees with the intent, so these rows capture what a child
// actually wrote through a pty.
import { spawn } from "node-pty";
import { describe, expect, it } from "vitest";

import { createEmulator } from "../../src/data/emulator/emulator.js";

/** Run a command under a pty, feeding every chunk into the emulator. */
const through = async (
  command: string,
  opts: Readonly<{ cols: number; rows: number; scrollback?: number }>,
): Promise<ReturnType<typeof createEmulator>> => {
  const term = createEmulator(opts);
  const child = spawn("/bin/sh", ["-c", command], {
    name: "xterm-256color",
    cols: opts.cols,
    rows: opts.rows,
    cwd: process.cwd(),
    env: { ...process.env, TERM: "xterm-256color" },
  });
  const writes: Promise<void>[] = [];
  child.onData((chunk) => {
    writes.push(term.write(chunk));
  });
  await new Promise<void>((resolve) => {
    child.onExit(() => {
      resolve();
    });
  });
  await Promise.all(writes);
  return term;
};

describe("C27 terminal emulator — tier 5", () => {
  it("T5.1 (C27 I4, C27 I5): a real child's carriage return and SGR arrive as one screen", async () => {
    const term = await through(
      String.raw`printf 'a\r\033[Kb\n'; printf '\033[32mok\033[0m\n'`,
      { cols: 20, rows: 4 },
    );
    const lines = term.snapshot("t").lines;
    expect(lines[0]?.text).toBe("b");
    expect(lines[1]?.text).toBe("ok");
    expect(lines[1]?.runs).toEqual([{ from: 0, to: 2, fg: { kind: "ansi16", index: 2 } }]);
    term.dispose();
  }, 20_000);

  it("T5.2 (C27 I7): a real child overruns the cap by the same figure the unit row measured", async () => {
    const term = await through("seq 1 30", { cols: 20, rows: 4, scrollback: 20 });
    const snap = term.snapshot("t");
    expect(snap.lines).toHaveLength(24);
    expect(term.dropped).toBe(7);
    expect(snap.lines[0]?.text).toBe("8");
    term.dispose();
  }, 20_000);
});

describe("C21 — the PTY port, spec-first rows", () => {
  it.todo("T5.6 (C21 I15, C21 I17): under the devcontainer's node-pty, a child reports a device path from tty and keeps the SGR it would drop on a pipe — the row asserts the tty's own name, a fact a fake cannot have — not deferred on a component: lands with spawnPty");
  it.todo("T5.7 (C21 I17): a PTY child signalled by group dies with its pipeline, matching T3.1 on the PTY arm — not deferred on a component: lands with spawnPty");
});

describe("C23 — the shell route as a live screen, spec-first rows", () => {
  it.todo("T5.21 (C23 I64, C23 I66): a real 200-line child under the devcontainer — frames arrive while it runs, far fewer than 200, and a cancel at the halfway point settles the card with the lines so far — not deferred on a component: lands with the route");
});
