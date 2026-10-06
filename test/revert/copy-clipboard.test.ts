// C14 I61, C17 I31 — tier 6.
//
// Each row names the change that makes it fail and shows the defect it would
// ship; the mutation pass (`c14-clipboard`) checks the named row mechanically.
import { describe, expect, it } from "vitest";

import { copyToast, createCopier } from "../../src/shell/clipboard.js";
import type { ClipboardWrite } from "../../src/data/process/clipboard.js";

describe("C14 §6e — where the copy goes, tier 6", () => {
  it("T6.36 (C14 I61): OSC 52's toast worded copied → T1.81 fails", () => {
    // **The defect, as the two sentences**: OSC 52 has no reply, so a terminal
    // that dropped the sequence and one that took it look the same from here —
    // and *copied* would claim the second over both.
    expect(copyToast({ kind: "sent" })).not.toMatch(/copied/u);
    expect(copyToast({ kind: "copied", tool: "pbcopy" }), "the one outcome a process reported").toMatch(/copied/u);
  });

  it("T6.37 (C14 I61): the pending copy's deadline removed → T3.26 fails", async () => {
    // **The defect, as a copier with no deadline**: a tool that never exits
    // leaves `copying with pbcopy` as the last word, and the toast expires to
    // nothing — silent, which R-SEL-011 calls the worst outcome available.
    const said: string[] = [];
    const copier = createCopier({
      clipboard: "none",
      tool: { name: "pbcopy", path: "/usr/bin/pbcopy", args: [], encoding: "utf-8" },
      send: () => undefined,
      write: () => new Promise<ClipboardWrite>(() => undefined),
      writeFile: () => Promise.resolve(),
      path: "/state/copy.txt",
      schedule: () => ({ [Symbol.dispose]: () => undefined }),
      say: (t) => void said.push(t),
    });
    copier.copy("text");
    await new Promise((r) => setImmediate(r));
    expect(said, "with the deadline never firing, pending is all it says").toEqual(["copying with pbcopy"]);
  });

  it("C14 T6.38 (C17 I31): the kill buffer skipped when a clipboard took the text → T4.43 fails", () => {
    // **The defect, as two paste targets and one paste key**: the clipboard
    // holds the copy, the kill buffer holds the previous kill, and `⌃y` pastes
    // the second. The session writes the buffer before it hands the copier
    // the text, which T4.43 and C17's T4.8 read at `⌃y`; a copier that never
    // reached the buffer is not a thing this module can show, because the
    // buffer is not its to write.
    expect(copyToast({ kind: "saved", path: "/p", written: false })).toMatch(/kill buffer holds it/u);
  });

  /** A copier whose tool answers as the row says, and whose file system is a map. */
  function copier(clipboard: "none" | "osc52", answer: ClipboardWrite | null) {
    const files = new Map<string, string>();
    const said: string[] = [];
    const c = createCopier({
      clipboard,
      tool: answer === null ? null : { name: "pbcopy", path: "/usr/bin/pbcopy", args: [], encoding: "utf-8" },
      send: () => undefined,
      write: () => Promise.resolve(answer ?? { ok: true, tool: "pbcopy" }),
      writeFile: (path, text) => {
        files.set(path, text);
        return Promise.resolve();
      },
      path: "/state/copy.txt",
      schedule: () => ({ [Symbol.dispose]: () => undefined }),
      say: (t) => void said.push(t),
    });
    return { c, files, said };
  }

  it("T6.39 (C14 I61, the person's correction 2026-09-29): the automatic write on a failed tool restored → T3.27 fails", async () => {
    // **The defect, as a file nobody asked for**: the tool fails, and a
    // `copy.txt` appears in the state directory — replacing whatever the reader
    // saved there last. Restoring the write in `unrouted` is what T3.27's
    // `nothing written` rows catch; here, the tree's copier writes nothing.
    const h = copier("none", { ok: false, tool: "pbcopy", reason: "exited with code 1" });
    h.c.copy("text");
    await new Promise((r) => setImmediate(r));
    expect(h.said.at(-1)).toBe("pbcopy failed (exited with code 1) — the kill buffer holds it");
    expect([...h.files.keys()], "no file until the reader takes the offer").toEqual([]);
  });

  it("T6.40 (C14 I61, K5, K6): the offer drawn while a route exists → T1.82 fails", async () => {
    // **The defect, as a footer that offers a file over a copy that worked**:
    // `⏎ to file` beside a tool that just said `copied via pbcopy`, and the
    // press writing a file the reader did not need.
    const h = copier("none", { ok: true, tool: "pbcopy" });
    expect(h.c.fileOffer(() => "text"), "a route, before any copy").toBeNull();
    h.c.copy("text");
    await new Promise((r) => setImmediate(r));
    expect(h.said.at(-1)).toBe("copied via pbcopy");
    expect(h.c.fileOffer(() => "text"), "and after one that worked").toBeNull();
  });

  it("T6.41 (C14 I61, K1): OSC 52 treated as failed → T1.82 fails", () => {
    // **The defect, as an offer for the text just sent**: OSC 52 has no reply,
    // so an implementation that records it as the failed copy offers a file for
    // every OSC 52 copy — the person's ruling is that it counts as done.
    const h = copier("osc52", null);
    h.c.copy("text");
    expect(h.said).toEqual(["sent to the terminal's clipboard"]);
    expect(h.c.fileOffer(() => "text")).toBeNull();
  });
});
