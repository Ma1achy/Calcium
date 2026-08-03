// C20 tier 5 — e2e. Whole sessions: open, work, exit, reopen.
//
// The store is the only thing under test that is not the real implementation of
// its own concern, and the filesystem double is the seam C22 will fill. Each of
// these is a sequence a person performs, asserted at the far end rather than at
// each step.
import { describe, expect, it } from "vitest";

import { COMMANDS, META, openWith } from "../support/history.js";

/** What a session leaves behind, for the next one to open. */
const carried = (files: Map<string, string>): Record<string, string> => ({
  [COMMANDS]: files.get(COMMANDS) ?? "",
  [META]: files.get(META) ?? "",
});

describe("C20 e2e", () => {
  it("T5.1: 200 commands across two sessions — order preserved, cap respected", async () => {
    const first = await openWith({}, { cap: 150 });
    for (let i = 0; i < 120; i += 1) first.store.append(`/ps ${String(i)}`, 0);
    first.store.drain();

    const second = await openWith(carried(first.fs.files), { cap: 150 });
    expect(second.store.entries).toHaveLength(120);
    for (let i = 120; i < 200; i += 1) second.store.append(`/ps ${String(i)}`, 0);
    await second.store.flush();

    const third = await openWith(carried(second.fs.files), { cap: 150 });
    expect(third.store.entries).toHaveLength(150);
    expect(third.store.entries[0]?.command).toBe("/ps 50");
    expect(third.store.entries[149]?.command).toBe("/ps 199");
    expect(third.store.warnings).toEqual([]);
  });

  it("T5.2: half a command, ↑ three times, ↓ four — the half-command comes back", async () => {
    const { store } = await openWith();
    for (const c of ["/ps", "/logs", "/deploy"]) store.append(c, 0);

    expect(store.previous("/pro")).toBe("/deploy");
    expect(store.previous("/pro")).toBe("/logs");
    expect(store.previous("/pro")).toBe("/ps");
    expect(store.next()).toBe("/logs");
    expect(store.next()).toBe("/deploy");
    expect(store.next()).toBe("/pro");
    expect(store.next()).toBeNull();
  });

  it("T5.3: ⌃r, narrow, ⌃r again, Enter — the older match runs", async () => {
    const { store } = await openWith();
    for (const c of ["/ps --family=digit", "/logs digit-42", "/ps --family=digit-classifier"]) {
      store.append(c, 0);
    }

    store.searchOpen("");
    store.searchType("digit");
    expect(store.searchState?.hit?.command).toBe("/ps --family=digit-classifier");
    store.searchOlder();
    expect(store.searchState?.hit?.command).toBe("/logs digit-42");
    expect(store.searchEnd("submit")).toBe("/logs digit-42");
    expect(store.searchState).toBeNull();
  });

  it("T5.4: a token pasted in a session leaves no fragment on disk", async () => {
    const secret = "ghp_16C7e42F292c6912E7710c838347Ae178B4a";
    const { store, fs } = await openWith();
    store.append(`/deploy --token=${secret}`, 0);
    store.append(`GITLAB_PASSWORD=hunter2 /deploy`, 0);
    store.append(`sh -c "curl -H 'PRIVATE-TOKEN: ${secret}' https://host"`, 0);
    await store.flush();

    const disk = fs.files.get(COMMANDS) ?? "";
    expect(disk).not.toContain(secret);
    expect(disk).not.toContain("ghp_");
    expect(disk).not.toContain("hunter2");
    // And the session still has all three, so `↑` works after a paste (I6).
    expect(store.entries[0]?.command).toContain(secret);
  });

  it("T5.5: a multi-line command survives a restart and returns on ↑", async () => {
    const command = "/deploy \\\n  --target=prod \\\n  --wait";
    const first = await openWith();
    first.store.append(command, 0);
    await first.store.flush();

    const second = await openWith(carried(first.fs.files));
    expect(second.store.previous("")).toBe(command);
    expect(second.store.entries[0]?.command.split("\n")).toHaveLength(3);
  });

  it("T5.6: a deliberately corrupted file — the session opens, warns once, works", async () => {
    const { store, fs } = await openWith({ [COMMANDS]: "/ps\n\\qbroken\n", [META]: "x\n" });

    expect(store.entries).toEqual([]);
    expect(store.warnings).toHaveLength(1);

    store.append("/logs", 0);
    await store.flush();
    expect(store.entries.map((e) => e.command)).toEqual(["/logs"]);

    const next = await openWith(carried(fs.files));
    expect(next.store.entries.map((e) => e.command)).toEqual(["/logs"]);
    expect(next.store.warnings).toEqual([]);
  });

  it("T5.7 (I18): a command submitted and the session ended without awaiting", async () => {
    const { store, fs } = await openWith();
    fs.jitter(true);
    store.append("/ps", 0);
    store.append("/deploy --target=prod", 0);

    // `beforeRelease`, which is synchronous and cannot await (C01 I5). Nothing
    // after this line runs in a real exit.
    store.drain();

    const next = await openWith(carried(fs.files));
    expect(next.store.entries.map((e) => e.command)).toEqual(["/ps", "/deploy --target=prod"]);
  });
});
