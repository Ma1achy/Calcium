// C14 I61 — where a copy goes, and what it says about it (ruling 72).
//
// The routing is C21's W1–W4 read from L4's side, and the copier is §6e's
// *Where the copy goes* trace, rows 4–10: the rows where a copy meets something
// that happens after it.
import { describe, expect, it } from "vitest";

import {
  COPY_DEADLINE_MS,
  copyFilePath,
  copyToast,
  createCopier,
  offerFact,
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
      kind: "none",
      why: "too-large",
    });
    expect(routeCopy("two words", "none", PBCOPY), "a terminal that does not take it").toEqual({ kind: "tool", tool: PBCOPY });
    expect(routeCopy("two words", "none", null)).toEqual({ kind: "none", why: "no-clipboard" });
    // A large text with no OSC 52 is not *too large* — nothing had a cap.
    expect(routeCopy(LARGE, "none", null)).toEqual({ kind: "none", why: "no-clipboard" });

    // **The words, every outcome** — the ruling's substance is which one says
    // *copied*, and the correction's is which one says *saved*.
    const path = "/work/.calcium/copy.txt";
    const outcomes: readonly [CopyOutcome, string][] = [
      [{ kind: "sent" }, "sent to the terminal's clipboard"],
      [{ kind: "pending", tool: "pbcopy" }, "copying with pbcopy"],
      [{ kind: "copied", tool: "pbcopy" }, "copied via pbcopy"],
      [{ kind: "unrouted", why: { kind: "no-clipboard" } }, "no clipboard here — the kill buffer holds it"],
      [{ kind: "unrouted", why: { kind: "too-large" } }, "too large for the terminal's clipboard — the kill buffer holds it"],
      [
        { kind: "unrouted", why: { kind: "failed", tool: "xclip", reason: "exited with code 1" } },
        "xclip failed (exited with code 1) — the kill buffer holds it",
      ],
      [{ kind: "unrouted", why: { kind: "silent", tool: "pbcopy" } }, "pbcopy did not answer — the kill buffer holds it"],
      [{ kind: "saved", path, written: true }, `saved to ${path}`],
      [{ kind: "saved", path, written: false }, `${path} could not be written — the kill buffer holds it`],
    ];
    for (const [outcome, text] of outcomes) expect(copyToast(outcome), outcome.kind).toBe(text);
    const copied = outcomes.filter(([, text]) => /\bcopied\b/u.test(text)).map(([o]) => o.kind);
    expect(copied, "only a tool's exit 0 says copied").toEqual(["copied"]);
    const saved = outcomes.filter(([, text]) => /\bsaved\b/u.test(text)).map(([o]) => o.kind);
    expect(saved, "only the offer taken says saved — no outcome of a copy does").toEqual(["saved"]);
  });

  it("T1.82 (C14 I61, §6e K1–K3, K7, K8, K10, K13, K16): fileOffer over the table's at-rest cells, and copyFilePath resolves a relative stateDir", async () => {
    const small = (): string => "two words";
    const large = (): string => LARGE;
    // **K1, K2 — OSC 52 within the cap is a route**, a tool or not.
    expect(harness({ clipboard: "osc52", tool: null }).copier.fileOffer(small), "K1").toBeNull();
    expect(harness({ clipboard: "osc52" }).copier.fileOffer(small), "K2").toBeNull();
    // **K3 — the offer is a property of the text**: the same session offers
    // for a payload past the cap and not for one within it.
    const o = harness({ clipboard: "osc52", tool: null });
    expect(o.copier.fileOffer(large), "K3: past the cap, no tool").toEqual({ kind: "too-large" });
    expect(o.copier.fileOffer(() => ""), "the empty text is I59's, never too large").toBeNull();
    expect(harness({ clipboard: "osc52" }).copier.fileOffer(large), "past the cap, the tool is the route").toBeNull();
    // **K13 — no route at all**, whatever the text.
    expect(harness({ tool: null }).copier.fileOffer(small), "K13").toEqual({ kind: "no-clipboard" });
    expect(harness({ tool: null }).copier.fileOffer(large)).toEqual({ kind: "no-clipboard" });
    // **K5, K6 — a tool is a route**, pending included.
    const t = harness();
    expect(t.copier.fileOffer(small), "K5: a tool").toBeNull();
    t.copier.copy("two words");
    expect(t.copier.fileOffer(small), "K6: pending has not failed").toBeNull();
    // **K7 — failed, for that copy**; K10 — not for another text.
    t.answers[0]?.({ ok: false, tool: "pbcopy", reason: "exited with code 1" });
    await t.flush();
    expect(t.copier.fileOffer(small), "K7").toEqual({ kind: "failed", tool: "pbcopy", reason: "exited with code 1" });
    expect(t.copier.fileOffer(() => "other words"), "K10").toBeNull();
    expect(offerFact({ kind: "failed", tool: "pbcopy", reason: "exited with code 1" }), "the footer's fact").toBe("pbcopy failed");
    // **K11 — a later copy withdraws it**, before its own answer is in.
    t.copier.copy("two words");
    expect(t.copier.fileOffer(small), "K11").toBeNull();
    // **K8 — silent, for that copy.**
    t.fire();
    await t.flush();
    expect(t.copier.fileOffer(small), "K8").toEqual({ kind: "silent", tool: "pbcopy" });
    expect(offerFact({ kind: "silent", tool: "pbcopy" })).toBe("pbcopy did not answer");
    expect(offerFact({ kind: "no-clipboard" })).toBe("no clipboard");
    expect(offerFact({ kind: "too-large" })).toBe("too large for the terminal");
    // **K1 again, after a copy** — OSC 52 counts as done, never as failed.
    const s = harness({ clipboard: "osc52", tool: null });
    s.copier.copy("two words");
    expect(s.copier.fileOffer(small), "a sent copy is not offered").toBeNull();

    // **K16 — the full path.** The default `stateDir` is relative.
    expect(copyFilePath(".calcium", "/work")).toBe("/work/.calcium/copy.txt");
    expect(copyFilePath("/state", "/work"), "an absolute stateDir as it is").toBe("/state/copy.txt");
  });

  it("T3.26 (C14 I61, §6e trace rows 7–10): a tool that never answers meets the deadline, a late answer is dropped, a second copy supersedes the first", async () => {
    // **Row 7** — the tool never answers.
    const h = harness();
    h.copier.copy("first");
    expect(h.said, "row 4: pending at once").toEqual(["copying with pbcopy"]);
    expect(h.timers.map((t) => t.ms), "one deadline, at the constant").toEqual([COPY_DEADLINE_MS]);
    h.fire();
    await h.flush();
    expect(h.files.size, "the deadline writes nothing").toBe(0);
    expect(h.said.at(-1)).toBe("pbcopy did not answer — the kill buffer holds it");
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
    expect(g.files.size, "row 6: the second's failure writes nothing").toBe(0);
    expect(g.said.at(-1)).toBe("pbcopy failed (exited with code 1) — the kill buffer holds it");
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
  });

  it("T3.27 (C14 I61, §6e K4, K7–K9, K11, K13–K15, trace rows 6, 11a, 13): no copy writes a file; save writes and says the path", async () => {
    // **Every way a copy can miss a route**, and the file system after each.
    const fail = harness();
    fail.copier.copy("failed");
    fail.answers[0]?.({ ok: false, tool: "pbcopy", reason: "exited with code 1" });
    await fail.flush();
    const silent = harness();
    silent.copier.copy("silent");
    silent.fire();
    await silent.flush();
    const none = harness({ tool: null });
    none.copier.copy("none");
    await none.flush();
    const large = harness({ clipboard: "osc52", tool: null });
    large.copier.copy(LARGE);
    await large.flush();
    for (const [name, h, said] of [
      ["K7, row 6", fail, "pbcopy failed (exited with code 1) — the kill buffer holds it"],
      ["K8, row 7", silent, "pbcopy did not answer — the kill buffer holds it"],
      ["K13, row 11a", none, "no clipboard here — the kill buffer holds it"],
      ["row 13", large, "too large for the terminal's clipboard — the kill buffer holds it"],
    ] as const) {
      expect(h.files.size, `${name}: nothing written`).toBe(0);
      expect(h.said.at(-1), name).toBe(said);
    }

    // **K9 — the offer taken** writes that text and names the path.
    fail.copier.save("failed");
    await fail.flush();
    expect(fail.files.get("/state/copy.txt")).toBe("failed");
    expect(fail.said.at(-1)).toBe("saved to /state/copy.txt");
    expect(fail.copier.fileOffer(() => "failed"), "the save is a new action, and the offer is spent").toBeNull();
    // **K14** — no route, the offer taken.
    none.copier.save("none");
    await none.flush();
    expect(none.files.get("/state/copy.txt")).toBe("none");
    // **K15** — the write rejects, and the sentence says where the text is.
    const f = harness({ tool: null, writeFile: () => Promise.reject(new Error("EACCES")) });
    f.copier.save("first");
    await f.flush();
    expect(f.said).toEqual(["/state/copy.txt could not be written — the kill buffer holds it"]);
  });
});
