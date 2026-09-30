// C23 I85–I87 — the away ledger, alone (ruling 51).
//
// **Stepped, and the whole state asserted after each step.** The ledger is a
// sequence machine with two kinds of mark that overlap, so the row walks one
// history end to end rather than asserting each rule against itself — the
// defects this component could have live where two of its rules meet (the
// walk's rows L5–L7, L11).
import { describe, expect, it } from "vitest";

import { createLedger, summaryOf } from "../../src/shell/away.js";
import { compose, settledDoc } from "../../src/shell/documents.js";
import type { LinearEntry } from "../../src/shell/linear.js";

let seq = 0;
const entry = (id: string, command: string, opts: { failed?: boolean; streaming?: boolean } = {}): LinearEntry => {
  seq += 1;
  return {
    id,
    seq,
    streaming: opts.streaming ?? false,
    doc: compose({
      command,
      blocks: [],
      ...(opts.failed === true ? { status: "error" as const, error: { message: "boom" } } : {}),
    }),
  };
};

describe("C23 I85–I87 — the away ledger, alone (ruling 51)", () => {
  it("T1.97 (C23 I85, I86, I87): the ledger stepped by hand — one record per settlement inside a mark, nothing for an empty close, exclusions, first close wins, a gone entry still named, failures first, and the notice it closes to", () => {
    const ledger = createLedger();

    // **Before any mark** a settlement is nobody's.
    ledger.settled(entry("e0", "/before"));
    ledger.open("attached");
    expect(ledger.close("attached"), "a mark opened after a settlement does not see it").toEqual([]);

    // **L2** — open, close: nothing.
    ledger.open("away");
    expect(ledger.close("away")).toEqual([]);
    expect(ledger.close("away"), "a mark that is not open closes to nothing").toEqual([]);

    // **L1** — one command entry inside one mark: one record, its line taken now.
    ledger.open("attached");
    const x = entry("x", "/pytest");
    ledger.settled(x);
    // The same entry reported twice (an append then a settle, or a second
    // settle C13 refuses anyway) is one settlement.
    ledger.settled(x);
    expect(ledger.close("attached")).toEqual([{ id: "x", line: `entry ${String(x.seq)}: /pytest — succeeded`, failed: false }]);

    // **L6, L7, L11** — the exclusions. A still-streaming entry has not settled;
    // a shell-origin notice has no command line; an excluded id — the child's
    // entry — is counted by a mark open before it was excluded, too.
    ledger.open("away");
    ledger.settled(entry("s", "/stream", { streaming: true }));
    ledger.settled(entry("n", ""));
    ledger.exclude("child");
    ledger.settled(entry("child", "child game"));
    // **And in the order a session delivers them**: C13's append change reaches
    // the ledger inside `append`, before the id is back to exclude it with.
    ledger.settled(entry("child2", "child other"));
    ledger.exclude("child2");
    expect(ledger.close("away")).toEqual([]);

    // **L5** — overlap. `attached` then `away`; X settles under both, `away`
    // closes first and reports it; Y settles under `attached` alone.
    ledger.open("attached");
    ledger.open("away");
    const a = entry("a", "/a");
    ledger.settled(a);
    // A second `ESC [ O` is not a second absence — so it keeps what the first
    // has recorded, and the settlement between the two is still reported.
    ledger.open("away");
    expect(ledger.close("away").map((s) => s.id), "the first close reports it").toEqual(["a"]);
    const b = entry("b", "/b");
    ledger.settled(b);
    expect(ledger.close("attached").map((s) => s.id), "and the second does not repeat it").toEqual(["b"]);

    // **L3 and L8** — several, failures first, otherwise in settle order; the
    // line is the one read at the settle, so an entry gone before the close is
    // still named — the ledger holds no reference to ask again with.
    ledger.open("attached");
    const ok1 = entry("ok1", "/first");
    const bad = entry("bad", "/second", { failed: true });
    const ok2 = entry("ok2", "/third");
    for (const e of [ok1, bad, ok2]) ledger.settled(e);
    const closed = ledger.close("attached");
    expect(closed.map((s) => s.id)).toEqual(["bad", "ok1", "ok2"]);
    expect(closed[0]).toEqual({ id: "bad", line: `entry ${String(bad.seq)}: /second — failed`, failed: true });

    // **The notice (C23 I86)** — nothing for nothing, a count and one line
    // each, and the chord only on a return.
    const words = { separator: "·", bottom: "⌃end" };
    expect(summaryOf("attached", [], words), "zero settlements append nothing").toBeNull();
    const one = summaryOf("attached", [{ id: "x", line: "entry 3: /pytest — failed", failed: true }], words);
    expect(one).toEqual({ head: "1 entry settled while attached", lines: ["entry 3: /pytest — failed"] });
    const away = summaryOf(
      "away",
      [
        { id: "a", line: "entry 1: /a — succeeded", failed: false },
        { id: "b", line: "entry 2: /b — succeeded", failed: false },
      ],
      words,
    );
    expect(away?.head).toBe("2 entries settled while you were away · ⌃end to the bottom");
    // No binding for the bottom: the head says what settled and names no key.
    const unbound = summaryOf("away", [{ id: "a", line: "entry 1: /a — succeeded", failed: false }], { separator: "·", bottom: null });
    expect(unbound?.head).toBe("1 entry settled while you were away");

    // **And the entry `documents.ts` composes from them**: shell-origin, so no
    // mark counts it, under the `work-unit` head and `continuation` lines.
    const doc = settledDoc(one?.head ?? "", one?.lines ?? [], { origin: "refresh" });
    expect(doc.command).toBe("");
    expect(doc.blocks.map((b) => [(b as { glyph?: string }).glyph, (b as { text?: string }).text])).toEqual([
      ["work-unit", "1 entry settled while attached"],
      ["continuation", "entry 3: /pytest — failed"],
    ]);
  });
});
