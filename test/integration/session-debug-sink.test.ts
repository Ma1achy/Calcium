// F1001 (for F864) — the debug sink, from the writer's side.
//
// **The chain was complete in every direction but the one nothing checks.**
// `ConstructDeps.debug?: (line: string) => void` is declared in `construct.ts`,
// forwarded into C01's lifecycle and C06's process runner, and called from seven
// real sites — C01's stdout redirect, `beforeRelease threw`, `release: N
// sequence(s) failed`, `acquire failed midway`, the `SHELL=…` fallback and two
// `handoff failed to spawn` arms. Every member was named, every function was
// called, and `Session.start()` passed six deps without this one, so both
// forwards took their `=== undefined` branch and all seven defaulted to a no-op
// in every real session.
//
// **A seam-level row cannot see that.** A test that hands `constructGraph` its
// own `debug` spy passes on the day nothing in `src/` supplies one — which is
// how the sink shipped complete and unfed. So the row is driven from the public
// entry and the assertion is on what a *consumer* sees after `stop()`.
//
// The site under test is the one that costs something: output written to the
// stream while the shell holds the terminal is caught by C01's redirect (C01
// I9), and before this it was caught and dropped.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";

const LEAVE_ALT = "\u001b[?1049l";
const settle = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};

describe("F1001 (for F864) — a line handed to the debug sink reaches the reader", () => {
  it("foreign output is caught by C01, kept, and drained after the release", async () => {
    const stdin = fakeStdin();
    const { stdout, tui } = await buildSession({ stdin: stdin as never });
    await settle();

    // The control, and it is C01 I9 rather than decoration: with the terminal
    // held, a write that does not go through `lifecycle.writer` must not reach
    // the stream. If this were false the line below would be on screen already
    // and the drain assertion would pass without the sink existing.
    const before = stdout.chunks.length;
    (stdout as unknown as NodeJS.WriteStream).write("a foreign line\n");
    expect(
      stdout.chunks.slice(before).join(""),
      "C01's redirect swallowed it — this is the write that would corrupt the frame",
    ).not.toContain("a foreign line");

    const at = stdout.chunks.length;
    await tui.stop("exit");
    const after = stdout.chunks.slice(at).join("");

    // **After the release, and the ordering is the assertion** (C01 I4, C22 I6).
    // A diagnostic written onto the alternate screen is discarded with it, so
    // "it appears somewhere after stop() began" is satisfied by the broken
    // order too.
    expect(after, "the terminal was released on this path").toContain(LEAVE_ALT);
    expect(
      after.indexOf("debug: a foreign line"),
      "the captured line is drained, marked, and after the release",
    ).toBeGreaterThan(after.indexOf(LEAVE_ALT));
  });

  it("a session that captured nothing writes nothing", async () => {
    // The other half, because a drain that always emits a header would satisfy
    // the row above while telling every clean session it had a diagnostic.
    const stdin = fakeStdin();
    const { stdout, tui } = await buildSession({ stdin: stdin as never });
    await settle();

    const at = stdout.chunks.length;
    await tui.stop("exit");
    const after = stdout.chunks.slice(at).join("");

    expect(after, "the terminal was released on this path").toContain(LEAVE_ALT);
    expect(after, "nothing was captured, so nothing is said").not.toContain("debug: ");
  });

  it("a call is split into lines, and the cap counts lines rather than calls", async () => {
    const stdin = fakeStdin();
    const { stdout, tui } = await buildSession({ stdin: stdin as never });
    await settle();

    // **One call, three lines, and a trailing newline.** This is the shape C01's
    // redirect hands over for two `console.log`s in a row — the six narration
    // sites hand over one sentence with no newline, so a splitter tested only on
    // them would look correct and the cap would count calls.
    (stdout as unknown as NodeJS.WriteStream).write("one\ntwo\nthree\n");

    const at = stdout.chunks.length;
    await tui.stop("exit");
    const after = stdout.chunks.slice(at).join("");

    for (const word of ["one", "two", "three"]) {
      expect(after, `${word} is its own drained line`).toContain(`debug: ${word}\n`);
    }
    // The trailing newline's empty tail is dropped rather than drained as a
    // marked blank — one wasted line per captured `console.log` otherwise.
    expect(after, "no bare marker with nothing after it").not.toContain("debug: \n");
  });

  it("the cap drops from the tail and says how many", async () => {
    const stdin = fakeStdin();
    const { stdout, tui } = await buildSession({ stdin: stdin as never });
    await settle();

    // The cap is read from the source rather than restated — a fixture holding
    // its own copy of a limit agrees with itself for ever.
    const cap = Number(
      /const DEBUG_LINES = (\d+);/u.exec(readFileSync("src/shell/session.ts", "utf8"))?.[1],
    );
    expect(cap, "DEBUG_LINES is declared and readable").toBeGreaterThan(0);

    const over = 5;
    (stdout as unknown as NodeJS.WriteStream).write(
      Array.from({ length: cap + over }, (_v, i) => `line-${String(i)}`).join("\n"),
    );

    const at = stdout.chunks.length;
    await tui.stop("exit");
    const after = stdout.chunks.slice(at).join("");

    // **The first N, not the last N.** Every narration site fires once, at the
    // moment of the failure; a ring keeping the most recent lines discards the
    // one that started the trouble and keeps a repeated symptom.
    expect(after, "the first line survives").toContain("debug: line-0\n");
    expect(after, `line ${String(cap - 1)} is the last one kept`).toContain(
      `debug: line-${String(cap - 1)}\n`,
    );
    expect(after, "the line past the cap is not kept").not.toContain(`debug: line-${String(cap)}\n`);
    expect(after, "and what was dropped is counted").toContain(
      `debug: ${String(over)} further line(s) dropped at the ${String(cap)}-line cap\n`,
    );
  });
});
