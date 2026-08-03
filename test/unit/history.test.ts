// C20 tier 1 — unit. §4's navigation, §5's search, and the round trip.
//
// §7a's traces are here rather than in the contract tier because each is a
// sequence over one store and the whole state is asserted after every step —
// the cells where the two machines meet, which is the only place any of them
// went wrong.
import { describe, expect, it } from "vitest";

import { escape, load, unescape } from "../../src/interaction/history/index.js";
import { COMMANDS, META, openWith, seedFiles, entry } from "../support/history.js";

const three = seedFiles([
  entry("/ps --status=running", 10),
  entry("/logs digit-42", 20),
  entry("/ps 7f3a2c14-9b4e-4d2a-a3f9-b21a8e0d5c12", 30),
]);

describe("C20 §2 — entries and the round trip", () => {
  it("T1.1: append stores command, timestamp and exit code", async () => {
    const { store } = await openWith();
    store.append("/ps", 0);
    store.append("/logs", 2);

    expect(store.entries.map((e) => [e.command, e.ts, e.exitCode])).toEqual([
      ["/ps", 1_700_000_000_000, 0],
      ["/logs", 1_700_000_001_000, 2],
    ]);
  });

  it("T1.2 (I4): consecutive duplicates collapse; interleaved they do not", async () => {
    const { store } = await openWith();
    store.append("/ps", 0);
    store.append("/ps", 0);
    expect(store.entries).toHaveLength(1);

    store.append("/logs", 0);
    store.append("/ps", 0);
    expect(store.entries.map((e) => e.command)).toEqual(["/ps", "/logs", "/ps"]);
  });

  it("T1.3 (I10): the cap holds and both files stay the same length", async () => {
    const { store, fs } = await openWith({}, { cap: 10 });
    for (let i = 0; i < 11; i += 1) store.append(`/ps ${String(i)}`, 0);
    await store.flush();

    expect(store.entries).toHaveLength(10);
    expect(store.entries[0]?.command).toBe("/ps 1");

    const commands = (fs.files.get(COMMANDS) ?? "").split("\n").filter((l) => l !== "");
    const meta = (fs.files.get(META) ?? "").split("\n").filter((l) => l !== "");
    expect(commands).toHaveLength(meta.length);
  });

  it("T1.4, T1.5 (I7): a newline and a literal backslash both round-trip", async () => {
    const { store, fs } = await openWith();
    store.append("/ps \\\n  --status=running", 0);
    await store.flush();

    // One line on disk, two in the command.
    expect((fs.files.get(COMMANDS) ?? "").split("\n").filter((l) => l !== "")).toHaveLength(1);

    const reopened = await openWith({
      [COMMANDS]: fs.files.get(COMMANDS) ?? "",
      [META]: fs.files.get(META) ?? "",
    });
    expect(reopened.store.entries[0]?.command).toBe("/ps \\\n  --status=running");
  });

  it("escape and unescape are inverse, and an invalid escape is refused", () => {
    for (const s of ["a\nb", "a\\nb", "\\", "\n\n", "a\\\\n"]) {
      expect(unescape(escape(s))).toBe(s);
    }
    expect(unescape("a\\qb")).toBeNull();
  });

  it("T1.20 (I4): duplicates collapse on load, not only on append", () => {
    const seeded = seedFiles([entry("/ps", 1), entry("/ps", 2), entry("/logs", 3)]);
    const loaded = load(seeded[COMMANDS] ?? "", seeded[META] ?? "");

    expect(loaded.entries.map((e) => e.command)).toEqual(["/ps", "/logs"]);
    // The newest of the pair survives, so the file does not describe an older
    // run of a command the session has since repeated.
    expect(loaded.entries[0]?.ts).toBe(2);
  });
});

describe("C20 §4 — navigation", () => {
  it("T1.6, T1.7 (I2): the draft is stashed, and the walk stops at the oldest", async () => {
    const { store } = await openWith(three);

    expect(store.previous("half typed")).toBe("/ps 7f3a2c14-9b4e-4d2a-a3f9-b21a8e0d5c12");
    expect(store.navigating).toBe(true);
    expect(store.previous("ignored")).toBe("/logs digit-42");
    expect(store.previous("ignored")).toBe("/ps --status=running");
    expect(store.previous("ignored")).toBe("/ps --status=running");
  });

  it("T1.8 (I2): next past the newest returns the draft and goes idle", async () => {
    const { store } = await openWith(three);

    store.previous("half typed");
    store.previous("half typed");
    expect(store.next()).toBe("/ps 7f3a2c14-9b4e-4d2a-a3f9-b21a8e0d5c12");
    expect(store.next()).toBe("half typed");
    expect(store.navigating).toBe(false);
  });

  it("T1.9 (I3): an append during navigation resets it", async () => {
    const { store } = await openWith(three);

    store.previous("half typed");
    store.append("/deploy", 0);

    expect(store.navigating).toBe(false);
    expect(store.next()).toBeNull();
  });

  it("T1.10: resetNavigation starts the next walk from the newest", async () => {
    const { store } = await openWith(three);

    store.previous("");
    store.previous("");
    store.resetNavigation();

    expect(store.previous("")).toBe("/ps 7f3a2c14-9b4e-4d2a-a3f9-b21a8e0d5c12");
  });
});

describe("C20 §5 — reverse search", () => {
  it("T1.11, T1.13: opening is empty, and typing narrows", async () => {
    const { store } = await openWith(three);

    store.searchOpen("");
    expect(store.searchState).toEqual({ query: "", hit: null, failed: false });

    store.searchType("logs");
    expect(store.searchState?.hit).toEqual({ command: "/logs digit-42", index: 1 });
  });

  it("T1.12: a second ⌃r steps to the next older match", async () => {
    const { store } = await openWith(three);

    store.searchOpen("");
    store.searchType("/ps");
    expect(store.searchState?.hit?.index).toBe(2);

    store.searchOlder();
    expect(store.searchState?.hit?.index).toBe(0);

    // Nothing older, so the hit stays and the label says the last action found
    // nothing — the same word for the same fact as a query that matches nothing.
    store.searchOlder();
    expect(store.searchState?.hit?.index).toBe(0);
    expect(store.searchState?.failed).toBe(true);
  });

  it("T1.14, T1.15, T1.16: submit, cancel and accept", async () => {
    const { store } = await openWith(three);

    store.searchOpen("");
    store.searchType("logs");
    expect(store.searchEnd("submit")).toBe("/logs digit-42");
    expect(store.searchState).toBeNull();

    store.searchOpen("");
    store.searchType("logs");
    expect(store.searchEnd("cancel")).toBeNull();

    store.searchOpen("");
    store.searchType("logs");
    expect(store.searchEnd("accept")).toBe("/logs digit-42");
  });

  it("T1.19 (I23): the hit's captured command is returned after the indices shift", async () => {
    // **At the cap, so the appends genuinely renumber.** The first version of
    // this test appended to an uncapped store, where an append only ever adds
    // at the end and `entries[1]` still names the same command — so the two
    // readings agreed and the mutation that re-reads by index survived the
    // whole suite. The mutation pass is what said so; nothing in a green run
    // did.
    const { store } = await openWith(three, { cap: 3 });

    store.searchOpen("");
    store.searchType("logs");
    expect(store.searchState?.hit?.index).toBe(1);

    store.append("/deploy", 0);
    store.append("/build", 0);
    // Index 1 now names `/deploy`; the hit carries the string, so the answer
    // cannot drift with the list.
    expect(store.entries[1]?.command).toBe("/deploy");
    expect(store.searchEnd("submit")).toBe("/logs digit-42");
  });
});

describe("C20 §7a — where the two machines meet", () => {
  it("T1.17 (I21): accept moves the cursor to the hit and keeps the draft", async () => {
    const { store } = await openWith(three);

    expect(store.previous("gi")).toBe("/ps 7f3a2c14-9b4e-4d2a-a3f9-b21a8e0d5c12");
    store.searchOpen("gi");
    store.searchType("logs");
    expect(store.searchEnd("accept")).toBe("/logs digit-42");

    // The buffer now holds entry 1, so `↓` walks from *there* — not from where
    // navigation happened to have left the cursor, and not from nowhere.
    expect(store.next()).toBe("/ps 7f3a2c14-9b4e-4d2a-a3f9-b21a8e0d5c12");
    expect(store.next()).toBe("gi");
    expect(store.navigating).toBe(false);
  });

  it("T1.17 (I21): searching from idle stashes the buffer too", async () => {
    const { store } = await openWith(three);

    store.searchOpen("gi");
    store.searchType("ps --status");
    store.searchEnd("accept");

    expect(store.next()).toBe("/logs digit-42");
    expect(store.next()).toBe("/ps 7f3a2c14-9b4e-4d2a-a3f9-b21a8e0d5c12");
    expect(store.next()).toBe("gi");
  });

  it("T1.18 (I22): a keystroke that matches nothing keeps the walk and says so", async () => {
    const { store } = await openWith(three);

    store.searchOpen("");
    store.searchType("ps");
    store.searchOlder();
    expect(store.searchState?.hit?.index).toBe(0);

    store.searchType("x");
    expect(store.searchState).toEqual({
      query: "psx",
      hit: { command: "/ps --status=running", index: 0 },
      failed: true,
    });

    // And the backspace resumes from the retained hit rather than jumping back
    // to the newest match, which is the walk being undone by one typo.
    store.searchBackspace();
    expect(store.searchState).toEqual({
      query: "ps",
      hit: { command: "/ps --status=running", index: 0 },
      failed: false,
    });
  });

  it("T3.25 (I21): clear leaves neither machine holding an index", async () => {
    const { store } = await openWith(three);

    store.previous("gi");
    store.searchOpen("gi");
    store.searchType("ps");
    store.clear();

    expect(store.entries).toEqual([]);
    expect(store.navigating).toBe(false);
    expect(store.searchState).toBeNull();
    expect(store.previous("gi")).toBeNull();
  });
});
