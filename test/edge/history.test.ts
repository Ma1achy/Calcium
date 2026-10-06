// C20 tier 3 — edge cases. A damaged file, a full disk, an exit mid-write.
//
// This is the first component since C08 to persist anything, so a whole class of
// failure is reachable here for the first time in this layer: a partial write, a
// de-aligned sidecar, a read-only home. None of them may end a session (I8, I9).
import { describe, expect, it } from "vitest";

import { COMMANDS, META, openWith, seedFiles, entry } from "../support/history.js";

describe("C20 §2 — a file that is not what we wrote", () => {
  it("T3.1 (I9): an invalid escape → empty history, one warning, the session opens", async () => {
    const { store } = await openWith({ [COMMANDS]: "/ps\nbad\\qescape\n", [META]: "1 0\n2 0\n" });

    expect(store.entries).toEqual([]);
    expect(store.warnings).toHaveLength(1);
    expect(store.warnings[0]).toMatch(/malformed/);
  });

  it("T3.1b (I9): a final line with no terminator is dropped, and the rest survive", async () => {
    // The distinction §2 spends a paragraph on: every entry is written with its
    // terminator, so this is an interrupted append rather than a corrupt file,
    // and discarding the other two would be the remedy doing more damage.
    const { store } = await openWith({
      [COMMANDS]: "/ps\n/logs\n/deplo",
      [META]: "1 0\n2 0\n",
    });

    expect(store.entries.map((e) => e.command)).toEqual(["/ps", "/logs"]);
    expect(store.warnings[0]).toMatch(/mid-entry/);
  });

  it("T3.2 (I9): a short sidecar → commands kept, metadata reset", async () => {
    const { store } = await openWith({ [COMMANDS]: "/ps\n/logs\n", [META]: "1 0\n" });

    expect(store.entries.map((e) => e.command)).toEqual(["/ps", "/logs"]);
    expect(store.entries.map((e) => e.ts)).toEqual([0, 0]);
    expect(store.warnings[0]).toMatch(/metadata/);
  });

  it("T3.3 (I9): a non-numeric sidecar → the same, and never a refusal", async () => {
    const { store } = await openWith({ [COMMANDS]: "/ps\n/logs\n", [META]: "1 0\nwhen 0\n" });

    expect(store.entries).toHaveLength(2);
    expect(store.warnings).toHaveLength(1);
  });

  it("T3.17, T3.10, T3.23 (I20): a null byte is stripped; whitespace alone is not stored", async () => {
    const { store } = await openWith();
    store.append("/ps\u0000 --status=running", 0);
    store.append("   \t  ", 0);
    store.append("", 0);

    expect(store.entries.map((e) => e.command)).toEqual(["/ps --status=running"]);
  });

  it("T3.9, T3.18: a megabyte paste and CJK both round-trip", async () => {
    const { store, fs } = await openWith();
    const huge = `/deploy ${"x".repeat(1_000_000)}`;
    store.append(huge, 0);
    store.append("/ps --名前=デジタル分類器 🙂", 0);
    await store.flush();

    const reopened = await openWith({
      [COMMANDS]: fs.files.get(COMMANDS) ?? "",
      [META]: fs.files.get(META) ?? "",
    });
    expect(reopened.store.entries.map((e) => e.command)).toEqual([
      huge,
      "/ps --名前=デジタル分類器 🙂",
    ]);
  });
});

describe("C20 §2 — writing, and failing to", () => {
  it("T3.8 (I8): the disk fills, then clears, and the backlog catches up", async () => {
    const { store, fs } = await openWith();
    store.append("/ps", 0);
    await store.flush();

    fs.fail("full");
    store.append("/logs", 0);
    store.append("/deploy", 0);
    await store.flush();
    expect(fs.files.get(COMMANDS)).toBe("/ps\n");

    // "The next successful write catches up" — both rows, not just the newest,
    // which is what rewinding rather than dropping buys.
    fs.fail("none");
    store.append("/build", 0);
    await store.flush();
    expect(fs.files.get(COMMANDS)).toBe("/ps\n/logs\n/deploy\n/build\n");
    expect(store.warnings).toHaveLength(1);
  });

  it("T3.19 (I16): a hundred appends keep the two files aligned", async () => {
    const { store, fs } = await openWith();
    fs.jitter(true);
    for (let i = 0; i < 100; i += 1) store.append(`/ps ${String(i)}`, 0);
    await store.flush();

    const commands = (fs.files.get(COMMANDS) ?? "").split("\n").filter((l) => l !== "");
    const meta = (fs.files.get(META) ?? "").split("\n").filter((l) => l !== "");
    expect(commands).toHaveLength(100);
    expect(meta).toHaveLength(100);
    // Index alignment is the only thing the sidecar promises, and the clock
    // never repeats — so a shuffled write shows up as a timestamp naming the
    // wrong command rather than as a length mismatch.
    commands.forEach((command, i) => {
      const ts = Number((meta[i] ?? "").split(" ")[0]);
      expect([command, ts]).toEqual([`/ps ${String(i)}`, 1_700_000_000_000 + i * 1_000]);
    });
  });

  it("T3.20, T3.24 (I18, I27): drain writes what the chain has not, and the overlap collapses", async () => {
    const { store, fs } = await openWith();
    fs.jitter(true);
    store.append("/ps", 0);
    // One turn, so the asynchronous write is genuinely dispatched and waiting —
    // which is the state the exit path finds and the only one where the choice
    // between the last *issued* and the last *confirmed* write is visible.
    await Promise.resolve();
    // No further `await`: this is `beforeRelease`, where there is nothing to
    // await with.
    store.drain();
    expect(fs.files.get(COMMANDS)).toBe("/ps\n");

    // The in-flight asynchronous write lands too, so the entry is on disk twice
    // — the trade §7a Trace 6 took, against losing the command just typed.
    await store.flush();
    expect(fs.files.get(COMMANDS)).toBe("/ps\n/ps\n");

    const reopened = await openWith({
      [COMMANDS]: fs.files.get(COMMANDS) ?? "",
      [META]: fs.files.get(META) ?? "",
    });
    expect(reopened.store.entries.map((e) => e.command)).toEqual(["/ps"]);
  });

  it("T3.21 (I10): compaction happens once, not once per append", async () => {
    const { store, fs } = await openWith({}, { cap: 10 });
    for (let i = 0; i < 300; i += 1) store.append(`/ps ${String(i)}`, 0);
    await store.flush();

    const rewrites = fs.writes.filter((p) => p === COMMANDS).length;
    const lines = (fs.files.get(COMMANDS) ?? "").split("\n").filter((l) => l !== "");
    expect(lines).toHaveLength(10);
    expect(lines[9]).toBe("/ps 299");
    expect(store.entries).toHaveLength(10);
    // 300 appends against a cap of 10 would be 300 full rewrites under the
    // obvious reading of I10; the slack makes it one.
    expect(rewrites).toBeLessThan(20);
  });

  it("T3.16: two sessions writing the same file — last writer wins, neither file corrupts", async () => {
    const first = await openWith();
    first.store.append("/ps", 0);
    await first.store.flush();

    const second = await openWith({
      [COMMANDS]: first.fs.files.get(COMMANDS) ?? "",
      [META]: first.fs.files.get(META) ?? "",
    });
    second.store.append("/logs", 0);
    await second.store.flush();

    // Entries may be lost — the `j22` limitation, documented and tested — but a
    // load of either file yields a usable history and no warning.
    const reopened = await openWith({
      [COMMANDS]: second.fs.files.get(COMMANDS) ?? "",
      [META]: second.fs.files.get(META) ?? "",
    });
    expect(reopened.store.entries.map((e) => e.command)).toEqual(["/ps", "/logs"]);
    expect(reopened.store.warnings).toEqual([]);
  });
});

describe("C20 §4, §5 — the edges of the two machines", () => {
  it("T3.4, T3.5, T3.6: next without previous, previous on empty, an empty draft", async () => {
    const { store } = await openWith();
    expect(store.next()).toBeNull();
    expect(store.previous("typed")).toBeNull();
    // Nothing was stashed, so nothing comes back — a draft with no walk to
    // return from would be restored by a `next` that should answer null.
    expect(store.next()).toBeNull();

    const seeded = await openWith(seedFiles([entry("/ps", 1)]));
    expect(seeded.store.previous("")).toBe("/ps");
    expect(seeded.store.next()).toBe("");
    expect(seeded.store.navigating).toBe(false);
  });

  it("T3.11, T3.12: an empty query shows nothing; a failed one keeps the query", async () => {
    const { store } = await openWith(seedFiles([entry("/ps", 1), entry("/logs", 2)]));

    expect(store.search("")).toBeNull();
    store.searchOpen("");
    store.searchType("zzz");
    expect(store.searchState).toEqual({ query: "zzz", hit: null, failed: true, total: 0, rank: 0, older: [] });
  });

  it("T3.13: 500 matches walk oldest-ward without repeating", async () => {
    const many = Array.from({ length: 500 }, (_, i) => entry(`/ps ${String(i)}`, i + 1));
    const { store } = await openWith(seedFiles(many), { cap: 1_000 });

    store.searchOpen("");
    store.searchType("/ps");
    const seen: number[] = [];
    for (;;) {
      const hit = store.searchState?.hit;
      if (hit === undefined || hit === null) break;
      seen.push(hit.index);
      store.searchOlder();
      if (store.searchState?.failed === true) break;
    }

    expect(seen).toHaveLength(500);
    expect(new Set(seen).size).toBe(500);
    expect(seen[0]).toBe(499);
    expect(seen[499]).toBe(0);
  });

  it("T3.14: `/history <N>` out of range is an answer, not a crash", async () => {
    const { store } = await openWith(seedFiles([entry("/ps", 1)]));

    expect(store.rerun(0)).toBe("/ps");
    expect(store.rerun(9)).toBeNull();
    expect(store.rerun(-1)).toBeNull();
  });
});
