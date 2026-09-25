// C22 §6n — the notification earning table (ruling 27, `R-NTF-001`).
//
// **The rows are §6n.2's, worked by hand**: each cell where two earning rules
// could both claim a settle, and the one word it gives. A row governed by one
// rule restates it, so the table is indexed by the overlaps.
import { describe, expect, it } from "vitest";

import type { ViewDocument } from "../../src/data/viewmodel/index.js";
import type { LinearEntry } from "../../src/shell/linear.js";
import { createNotifier, earns, LONG_TURN_MS } from "../../src/shell/notify.js";
import { systemNotification } from "../../src/terminal/escapes.js";

const LONG = LONG_TURN_MS;
const SHORT = LONG_TURN_MS - 1;

const docOf = (status: "ok" | "error", durationMs: number): ViewDocument =>
  ({
    schema: "tui.view/1",
    command: "pytest",
    status,
    blocks: [],
    meta: {
      verb: "pytest",
      adapter: "raw",
      exitCode: status === "ok" ? 0 : 1,
      durationMs,
      truncated: false,
      argv: [],
      stderr: "",
      transport: "subprocess",
      origin: "user",
    },
  }) as ViewDocument;

describe("C22 §6n — what earns a notification", () => {
  it("T1.76 (C22 I126): §6n.2's seven rows, each its row's word or nothing", () => {
    const rows: [watched: boolean, failed: boolean, ms: number, word: string | null][] = [
      [false, false, SHORT, null], // a tool call ended — never
      [false, false, LONG, "done"], // a turn ended, past 30 s
      [false, true, SHORT, "failed"], // the model failed — always
      [false, true, LONG, "failed"], // one, the failure
      [true, false, SHORT, "done"], // a watched run ended — always
      [true, false, LONG, "done"], // one, the watched row
      [true, true, SHORT, "failed"], // a watched run failed — one
    ];
    for (const [watched, failed, durationMs, word] of rows) {
      expect(earns({ watched, failed, durationMs }), JSON.stringify({ watched, failed, durationMs })).toBe(word);
    }
    // The boundary is inclusive: §014's *over ~30s* read at 30 000 ms.
    expect(earns({ watched: false, failed: false, durationMs: LONG_TURN_MS })).toBe("done");
  });

  it("T1.76 (cont., C22 I127, C22 I130): a fact once, never while focused, and a watch that drops at settle", () => {
    const entries = new Map<string, LinearEntry>();
    const put = (id: string, seq: number, streaming: boolean, doc: ViewDocument): void =>
      void entries.set(id, { id, seq, streaming, doc });
    const wrote: string[] = [];
    const n = createNotifier({
      rungs: ["bell", "system", "title"],
      system: true,
      binary: "prism",
      mark: "•",
      separator: "·",
      entryOf: (id) => entries.get(id),
      bell: () => wrote.push("bell"),
      notify: (text) => wrote.push(`system ${text}`),
      title: (text) => wrote.push(`title ${text}`),
      restoreTitle: () => wrote.push("restore"),
    });

    // Never reported is focused (C22 I127): a long settle says nothing.
    put("e1", 1, false, docOf("ok", LONG));
    n.settled("e1");
    expect(wrote).toEqual([]);

    // A watch on a streaming entry holds; on a settled or unknown one it is refused.
    put("e2", 2, true, docOf("ok", 2_000));
    expect(n.watch("e2")).toBe(true);
    expect(n.watch("e1"), "settled").toBe(false);
    expect(n.watch("nope"), "unknown").toBe(false);

    n.focus(false);
    n.settled("e2"); // still streaming — nothing to say yet
    expect(wrote).toEqual([]);
    put("e2", 2, false, docOf("ok", 2_000));
    n.settled("e2");
    // Every opted rung, bell then system then title, in linear's words.
    expect(wrote).toEqual(["bell", "system prism: entry 2: pytest — succeeded, 2s", "title • prism · done"]);

    // A second settle of one id says nothing, and the watch is gone with it:
    // a short end of the same entry cannot earn by the watched row again.
    wrote.length = 0;
    n.settled("e2");
    expect(wrote).toEqual([]);

    // A question while away is `waiting`.
    n.asked("question: which branch? 1 main");
    expect(wrote).toEqual(["bell", "system prism: question: which branch? 1 main", "title • prism · waiting"]);

    // **A long settle twice is one fact** (C22 I126): the short one above
    // earns nothing either way, so only a long one can see the dedup.
    wrote.length = 0;
    put("e4", 4, false, docOf("ok", LONG));
    n.settled("e4");
    n.settled("e4");
    expect(wrote.filter((w) => w === "bell"), "once, not twice").toHaveLength(1);

    // The reader returns: the title comes back, and a long settle says nothing.
    wrote.length = 0;
    n.focus(true);
    put("e3", 3, false, docOf("error", LONG));
    n.settled("e3");
    expect(wrote).toEqual(["restore"]);
  });

  it("T1.76 (cont., C22 I128): a rung not opted in is silent, and system needs OSC 9", () => {
    const wrote: string[] = [];
    const n = createNotifier({
      rungs: ["system", "title"],
      system: false,
      binary: "prism",
      mark: "-",
      separator: "·",
      entryOf: () => ({ id: "e", seq: 1, streaming: false, doc: docOf("error", 10) }),
      bell: () => wrote.push("bell"),
      notify: () => wrote.push("system"),
      title: (text) => wrote.push(`title ${text}`),
      restoreTitle: () => undefined,
    });
    n.focus(false);
    n.settled("e");
    expect(wrote, "and the mark is the one resolved for it").toEqual(["title - prism · failed"]);
  });

  it("T1.76 (cont., C22 I128): the system body is control-stripped and never opens with a number and a semicolon", () => {
    // Ghostty reserves `OSC 9 ; <n> ;` for ConEmu's sub-commands, so a binary
    // named `42` would be read as a command rather than shown — and `7zip`,
    // which opens with a number and not a number then a semicolon, is left alone.
    expect(systemNotification("42;entry 1: x")).toBe("\u001b]9;42 ;entry 1: x\u0007");
    expect(systemNotification("7zip;entry 1: x")).toBe("\u001b]9;7zip;entry 1: x\u0007");
    expect(systemNotification("prism: a\u0007b\u001b]2;c")).toBe("\u001b]9;prism: ab]2;c\u0007");
  });
});
