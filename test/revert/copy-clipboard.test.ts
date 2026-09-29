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

  it("T6.38 (C17 I31): the kill buffer skipped when a clipboard took the text → T4.43 fails", () => {
    // **The defect, as two paste targets and one paste key**: the clipboard
    // holds the copy, the kill buffer holds the previous kill, and `⌃y` pastes
    // the second. The session writes the buffer before it hands the copier
    // the text, which T4.43 and C17's T4.8 read at `⌃y`; a copier that never
    // reached the buffer is not a thing this module can show, because the
    // buffer is not its to write.
    expect(copyToast({ kind: "file", path: "/p", why: { kind: "no-clipboard" }, written: false })).toMatch(/kill buffer holds it/u);
  });
});

describe("C14 §6e — the correction's tier 6, owed at the spec commit", () => {
  it.todo("T6.39 (C14 I61): the automatic write on a failed tool restored → T3.27 fails — owed at the spec commit (the person's correction 2026-09-29, C14 §6e's classification table); not deferred on a component: `fileOffer` and `save` land with the code commit that follows");
  it.todo("T6.40 (C14 I61): the offer drawn while a route exists → T1.82 fails — owed at the spec commit (the person's correction 2026-09-29, C14 §6e's classification table); not deferred on a component: `fileOffer` and `save` land with the code commit that follows");
  it.todo("T6.41 (C14 I61): OSC 52 treated as failed → T1.82 fails — owed at the spec commit (the person's correction 2026-09-29, C14 §6e's classification table); not deferred on a component: `fileOffer` and `save` land with the code commit that follows");
});
