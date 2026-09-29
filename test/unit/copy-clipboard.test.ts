// C14 I61 — where a copy goes, and what it says about it (ruling 72).
//
// The routing is C21's W1–W4 read from L4's side, and the copier is §6e's
// *Where the copy goes* trace, rows 4–10: the rows where a copy meets something
// that happens after it.
import { describe, expect, it } from "vitest";

import {
  COPY_DEADLINE_MS,
  copyToast,
  createCopier,
  routeCopy,
  type CopierDeps,
  type CopyOutcome,
} from "../../src/shell/clipboard.js";
import { CLIPBOARD_LIMIT, clipboardWrite } from "../../src/terminal/escapes.js";
import type { ClipboardTool, ClipboardWrite } from "../../src/data/process/clipboard.js";

const PBCOPY: ClipboardTool = Object.freeze({ name: "pbcopy", path: "/usr/bin/pbcopy", args: [], encoding: "utf-8" });
/** Past the cap once base64 has grown it by a third. */
const LARGE = "x".repeat(CLIPBOARD_LIMIT);

/** A copier whose tool, file and clock are the row's to drive. */
function harness(over: Partial<CopierDeps> = {}) {
  const said: string[] = [];
  const sent: string[] = [];
  const files = new Map<string, string>();
  const timers: { fn: () => void; ms: number; disposed: boolean }[] = [];
  const answers: ((w: ClipboardWrite) => void)[] = [];
  const copier = createCopier({
    clipboard: "none",
    tool: PBCOPY,
    send: (bytes) => void sent.push(bytes),
    write: () => new Promise<ClipboardWrite>((resolve) => void answers.push(resolve)),
    writeFile: (path, text) => {
      files.set(path, text);
      return Promise.resolve();
    },
    path: "/state/copy.txt",
    schedule: (fn, ms) => {
      const t = { fn, ms, disposed: false };
      timers.push(t);
      return { [Symbol.dispose]: () => void (t.disposed = true) };
    },
    say: (text) => void said.push(text),
    ...over,
  });
  const fire = (): void => {
    for (const t of timers) if (!t.disposed) t.fn();
  };
  const flush = (): Promise<void> => new Promise((r) => setImmediate(r));
  return { copier, said, sent, files, timers, answers, fire, flush };
}

describe("C14 §6e — where the copy goes", () => {
  it("T1.81 (C14 I61, C21 W1–W4): routeCopy over each capability × tool × payload cell, and only a tool's ok says copied", () => {
    // **The route, cell by cell.**
    expect(routeCopy("two words", "osc52", PBCOPY), "W4: OSC 52 first, a tool or not").toEqual({
      kind: "osc52",
      bytes: clipboardWrite("two words"),
    });
    expect(routeCopy("two words", "osc52", null)).toEqual({ kind: "osc52", bytes: clipboardWrite("two words") });
    expect(clipboardWrite(LARGE), "the fixture is past the cap").toBeNull();
    expect(routeCopy(LARGE, "osc52", PBCOPY), "W2: the null declines one mechanism, and the order goes on").toEqual({
      kind: "tool",
      tool: PBCOPY,
    });
    expect(routeCopy(LARGE, "osc52", null), "W3: too large, which is not no clipboard").toEqual({
      kind: "file",
      why: "too-large",
    });
    expect(routeCopy("two words", "none", PBCOPY), "a terminal that does not take it").toEqual({ kind: "tool", tool: PBCOPY });
    expect(routeCopy("two words", "none", null)).toEqual({ kind: "file", why: "no-clipboard" });
    // A large text with no OSC 52 is not *too large* — nothing had a cap.
    expect(routeCopy(LARGE, "none", null)).toEqual({ kind: "file", why: "no-clipboard" });

    // **The words, every outcome** — the ruling's substance is which one says
    // *copied*.
    const path = "/state/copy.txt";
    const outcomes: readonly [CopyOutcome, string][] = [
      [{ kind: "sent" }, "sent to the terminal's clipboard"],
      [{ kind: "pending", tool: "pbcopy" }, "copying with pbcopy"],
      [{ kind: "copied", tool: "pbcopy" }, "copied to the clipboard by pbcopy"],
      [{ kind: "file", path, why: { kind: "no-clipboard" }, written: true }, `no clipboard here — saved to ${path}`],
      [{ kind: "file", path, why: { kind: "too-large" }, written: true }, `too large for the terminal's clipboard — saved to ${path}`],
      [
        { kind: "file", path, why: { kind: "failed", tool: "xclip", reason: "exited with code 1" }, written: true },
        `xclip failed (exited with code 1) — saved to ${path}`,
      ],
      [{ kind: "file", path, why: { kind: "silent", tool: "pbcopy" }, written: true }, `pbcopy did not answer — saved to ${path}`],
      [
        { kind: "file", path, why: { kind: "no-clipboard" }, written: false },
        `no clipboard, and ${path} could not be written — the kill buffer holds it`,
      ],
    ];
    for (const [outcome, text] of outcomes) expect(copyToast(outcome), outcome.kind).toBe(text);
    const copied = outcomes.filter(([, text]) => /\bcopied\b/u.test(text)).map(([o]) => o.kind);
    expect(copied, "only a tool's exit 0 says copied").toEqual(["copied"]);
  });

  it("T3.26 (C14 I61, §6e trace rows 7–10): a tool that never answers meets the deadline, a late answer is dropped, a second copy supersedes the first", async () => {
    // **Row 7** — the tool never answers.
    const h = harness();
    h.copier.copy("first");
    expect(h.said, "row 4: pending at once").toEqual(["copying with pbcopy"]);
    expect(h.timers.map((t) => t.ms), "one deadline, at the constant").toEqual([COPY_DEADLINE_MS]);
    h.fire();
    await h.flush();
    expect(h.files.get("/state/copy.txt"), "the file holds the text").toBe("first");
    expect(h.said.at(-1)).toBe("pbcopy did not answer — saved to /state/copy.txt");
    // **Row 8** — its late exit 0 says nothing.
    h.answers[0]?.({ ok: true, tool: "pbcopy" });
    await h.flush();
    expect(h.said, "one copy, one sentence after pending").toHaveLength(2);

    // **Row 9** — a second copy while the first is pending.
    const g = harness();
    g.copier.copy("first");
    g.copier.copy("second");
    expect(g.timers[0]?.disposed, "the first's deadline is disposed").toBe(true);
    g.answers[0]?.({ ok: true, tool: "pbcopy" });
    await g.flush();
    expect(g.said, "the first's answer is dropped").toEqual(["copying with pbcopy", "copying with pbcopy"]);
    g.answers[1]?.({ ok: false, tool: "pbcopy", reason: "exited with code 1" });
    await g.flush();
    expect(g.files.get("/state/copy.txt"), "row 6: the second's failure writes the second's text").toBe("second");
    expect(g.said.at(-1)).toBe("pbcopy failed (exited with code 1) — saved to /state/copy.txt");
    g.fire();
    await g.flush();
    expect(g.said, "a settled copy's deadline is disarmed").toHaveLength(3);

    // **Row 10** — disposed with the session.
    const d = harness();
    d.copier.copy("first");
    d.copier[Symbol.dispose]();
    expect(d.timers[0]?.disposed).toBe(true);
    d.answers[0]?.({ ok: true, tool: "pbcopy" });
    await d.flush();
    expect(d.said, "nothing after the session stops").toEqual(["copying with pbcopy"]);

    // **Row 12** — the file cannot be written, and the sentence says where the text is.
    const f = harness({ tool: null, writeFile: () => Promise.reject(new Error("EACCES")) });
    f.copier.copy("first");
    await f.flush();
    expect(f.said).toEqual(["no clipboard, and /state/copy.txt could not be written — the kill buffer holds it"]);
    expect(f.copier.hasClipboard, "no tool and no OSC 52 is the footer's no clipboard").toBe(false);
    expect(h.copier.hasClipboard).toBe(true);
  });
});

describe("C14 §6e — the classification table, owed at the spec commit", () => {
  it.todo("T1.82 (C14 I61, K1–K3, K7, K8, K10, K13, K16): fileOffer over the table's at-rest cells, and copyFilePath resolves a relative stateDir — owed at the spec commit (the person's correction 2026-09-29, C14 §6e's classification table); not deferred on a component: `fileOffer` and `save` land with the code commit that follows");
  it.todo("T3.27 (C14 I61, K4, K7–K9, K11, K13–K15): no copy writes a file; save writes and says the path — owed at the spec commit (the person's correction 2026-09-29, C14 §6e's classification table); not deferred on a component: `fileOffer` and `save` land with the code commit that follows");
});
